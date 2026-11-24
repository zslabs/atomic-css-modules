/**
 * webpack 5 / Rspack plugin wrapper around the core atomic CSS Modules
 * pipeline, for setups that process CSS with css-loader.
 *
 * The registry is a stub CSS file shipped with the package. A loader fills
 * it from the shared scan cache on every compilation, and a JS loader imports
 * it from any module that loads a CSS module. Because its name is not
 * `*.module.css`, css-loader treats it as global CSS, so atom class names
 * stay unscoped.
 */
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import {
  createAtomicPluginState,
  isJsModule,
  type AtomicCssModulesPluginOptions,
  type AtomicPluginState,
} from './plugin-state.js'
import {
  INJECT_LOADER_PATH,
  REGISTRY_LOADER_PATH,
  REGISTRY_STUB_PATH,
  REWRITE_LOADER_PATH,
} from './webpack/paths.js'
import { registerState, type LoaderOptions } from './webpack/state-registry.js'

export type { AtomicCssModulesPluginOptions } from './plugin-state.js'
export { REGISTRY_STUB_PATH } from './webpack/paths.js'

interface AsyncHook {
  tapPromise(name: string, fn: () => Promise<void>): void
}

interface CompilationLike {
  modules: Iterable<unknown>
  rebuildModule(module: unknown, callback: (error?: Error | null) => void): void
}

/** The subset of the webpack/Rspack compiler the plugin uses. */
export interface CompilerLike {
  context: string
  modifiedFiles?: ReadonlySet<string>
  removedFiles?: ReadonlySet<string>
  options: {
    mode?: string
    devtool?: false | string
    entry?: unknown
    module: { rules: unknown[] }
  }
  hooks: {
    beforeRun: AsyncHook
    watchRun: AsyncHook
    finishMake: {
      tapPromise(
        name: string,
        fn: (compilation: unknown) => Promise<void>
      ): void
    }
    thisCompilation?: {
      tap(name: string, fn: (compilation: unknown) => void): void
    }
  }
  getInfrastructureLogger(name: string): { info(message: string): void }
}

const PLUGIN_NAME = 'atomic-css-modules'

export class AtomicCssModulesWebpackPlugin {
  private readonly options: AtomicCssModulesPluginOptions
  private readonly state: AtomicPluginState

  constructor(options: AtomicCssModulesPluginOptions = {}) {
    this.options = options
    this.state = createAtomicPluginState(options)
  }

  apply(compiler: CompilerLike): void {
    const state = this.state
    const debugNames =
      this.options.debugNames ?? compiler.options.mode === 'development'
    const cacheKey = loaderCacheKey(this.options, debugNames)
    const loaderOptions = registerState(
      state,
      stableStateId(compiler, cacheKey),
      cacheKey
    )
    let reported = false
    let ready = false
    let rebuilding = false

    splicePreprocessorRewrite(compiler.options.module.rules, loaderOptions)
    compiler.options.module.rules.push(
      {
        enforce: 'pre',
        test: (filePath: string) =>
          state.isMatchingCssModule(filePath) &&
          !isPreprocessorSource(filePath),
        use: [{ loader: REWRITE_LOADER_PATH, options: loaderOptions }],
      },
      {
        enforce: 'pre',
        test: (filePath: string) => filePath === REGISTRY_STUB_PATH,
        use: [{ loader: REGISTRY_LOADER_PATH, options: loaderOptions }],
      },
      {
        enforce: 'pre',
        test: isJsModule,
        exclude: /node_modules/,
        use: [{ loader: INJECT_LOADER_PATH, options: loaderOptions }],
      }
    )

    const sync = async (): Promise<void> => {
      state.clearLoaderRegistry()
      const cacheCleared = state.configure({
        // Resolved module paths are realpaths; a symlinked context would not match.
        root: await realpath(compiler.context),
        debugNames:
          this.options.debugNames ?? compiler.options.mode === 'development',
        sourceMap: Boolean(compiler.options.devtool),
      })
      const modified = compiler.modifiedFiles
      const removed = compiler.removedFiles
      const canPatch = ready && !cacheCleared && modified && removed
      if (canPatch) {
        await state.applyWatchChanges(modified, removed)
      } else {
        const report = await state.syncFromDisk()
        ready = true
        if (!reported) {
          reported = true
          compiler
            .getInfrastructureLogger(PLUGIN_NAME)
            .info(state.formatReport(report))
        }
      }
      for (const filePath of state.takeRemappedFiles()) {
        const mod = state.builtModule(filePath)
        if (mod) invalidateBuild(mod)
      }
    }

    tapAssetSync(compiler, state)
    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, sync)
    compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, sync)
    compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, async (compilation) => {
      if (rebuilding || !isCompilation(compilation)) return
      const paths = compilationModulePaths(compilation)
      if (paths.length > 0) state.useCompilationFiles(paths)
      if (state.emittedRegistryHash() === state.registryHash) return
      const patched = patchRegistryCss(compilation, state.registryCss)
      const registryModules = modulesForRegistry(compilation)
      if (!patched && registryModules.length === 0) return
      rebuilding = true
      try {
        // Record the hash before rebuilding. A native rebuild re-enters this
        // hook from the loader, and the content patch does not.
        state.noteEmittedRegistryHash(state.registryHash)
        await Promise.all(
          registryModules.map((mod) => rebuild(compilation, mod))
        )
      } finally {
        rebuilding = false
      }
    })
  }
}

interface CssAsset {
  name: string
  source: { source(): string | Buffer }
}

interface AssetCompilation {
  getAssets(): CssAsset[]
  updateAsset(name: string, source: { source(): string; size(): number }): void
  hooks: {
    processAssets: {
      tap(options: { name: string; stage: number }, fn: () => void): void
    }
  }
}

function tapAssetSync(compiler: CompilerLike, state: AtomicPluginState): void {
  const hook = compiler.hooks.thisCompilation
  if (!hook) return
  hook.tap(PLUGIN_NAME, (compilation) => {
    if (!isAssetCompilation(compilation)) return
    compilation.hooks.processAssets.tap({ name: PLUGIN_NAME, stage: 0 }, () => {
      reconcileRegistryAssets(compilation, state)
    })
  })
}

function isAssetCompilation(value: unknown): value is AssetCompilation {
  if (typeof value !== 'object' || value === null) return false
  if (!('getAssets' in value) || typeof value.getAssets !== 'function') {
    return false
  }
  if (!('updateAsset' in value) || typeof value.updateAsset !== 'function') {
    return false
  }
  if (
    !('hooks' in value) ||
    typeof value.hooks !== 'object' ||
    value.hooks === null
  ) {
    return false
  }
  return (
    'processAssets' in value.hooks &&
    typeof value.hooks.processAssets === 'object' &&
    value.hooks.processAssets !== null &&
    'tap' in value.hooks.processAssets &&
    typeof value.hooks.processAssets.tap === 'function'
  )
}

function reconcileRegistryAssets(
  compilation: AssetCompilation,
  state: AtomicPluginState
): void {
  const captured = state.loaderRegistry()
  const current = state.registryCss
  if (captured === undefined || captured === current) return
  const remove = classSelectors(captured)
  for (const name of classSelectors(current)) remove.delete(name)
  for (const asset of compilation.getAssets()) {
    if (!asset.name.endsWith('.css')) continue
    const original = sourceText(asset.source.source())
    let next = stripClassRules(original, remove)
    if (!includesRegistry(next, current)) next = `${current}\n${next}`
    if (next === original) continue
    compilation.updateAsset(asset.name, {
      source: () => next,
      size: () => Buffer.byteLength(next),
    })
  }
}

function sourceText(source: string | Buffer): string {
  return typeof source === 'string' ? source : source.toString('utf8')
}

function classSelectors(css: string): Set<string> {
  const names = new Set<string>()
  for (const match of css.matchAll(/\.([A-Za-z0-9_-]+)\s*\{/g)) {
    const name = match[1]
    if (name) names.add(name)
  }
  return names
}

function includesRegistry(asset: string, registry: string): boolean {
  for (const name of classSelectors(registry)) {
    if (!asset.includes(`.${name}`)) return false
  }
  return true
}

function stripClassRules(css: string, names: ReadonlySet<string>): string {
  let next = css
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    next = next.replace(
      new RegExp(`\\.${escaped}\\s*\\{[^{}]*\\}\\n?`, 'g'),
      ''
    )
  }
  return next
}

function stableStateId(compiler: CompilerLike, version: string): string {
  let entry = ''
  try {
    entry = JSON.stringify(compiler.options.entry) ?? ''
  } catch {
    entry = ''
  }
  return createHash('sha256')
    .update(compiler.context)
    .update('\0')
    .update(entry)
    .update('\0')
    .update(version)
    .digest('hex')
    .slice(0, 16)
}

const PREPROCESSOR_LOADER =
  /(?:^|[\\/])(?:less-loader|sass-loader|stylus-loader)(?:[\\/]|$)/

function isPreprocessorSource(filePath: string): boolean {
  return /\.(?:less|scss|sass|styl)$/i.test(filePath)
}

interface LooseRule {
  oneOf?: unknown
  rules?: unknown
  use?: unknown
  loader?: unknown
  options?: unknown
}

interface LoaderUse {
  loader: string
  options?: unknown
  [field: string]: unknown
}

function splicePreprocessorRewrite(
  rules: unknown[],
  loaderOptions: LoaderOptions
): void {
  for (const rule of rules) {
    if (!isLooseRule(rule)) continue
    if (Array.isArray(rule.oneOf)) {
      splicePreprocessorRewrite(rule.oneOf, loaderOptions)
    }
    if (Array.isArray(rule.rules)) {
      splicePreprocessorRewrite(rule.rules, loaderOptions)
    }
    const use = normalizeUse(rule)
    if (!use) continue
    const index = lastPreprocessor(use)
    if (index < 0) continue
    if (use.some((entry) => entry.loader === REWRITE_LOADER_PATH)) continue
    use.splice(index, 0, {
      loader: REWRITE_LOADER_PATH,
      options: { ...loaderOptions, compiled: true },
    })
    rule.use = use
    delete rule.loader
    delete rule.options
  }
}

function isLooseRule(value: unknown): value is LooseRule {
  return typeof value === 'object' && value !== null
}

function normalizeUse(rule: LooseRule): LoaderUse[] | undefined {
  if ('use' in rule && rule.use !== undefined) {
    if (typeof rule.use === 'function') return
    return toUseList(rule.use)
  }
  if (typeof rule.loader === 'string') {
    return [
      {
        loader: rule.loader,
        ...(rule.options !== undefined ? { options: rule.options } : {}),
      },
    ]
  }
  return
}

function toUseList(use: unknown): LoaderUse[] | undefined {
  if (typeof use === 'string') return [{ loader: use }]
  if (Array.isArray(use)) {
    const entries: LoaderUse[] = []
    for (const entry of use) {
      const normalized = toUseList(entry)
      if (!normalized) return
      entries.push(...normalized)
    }
    return entries
  }
  if (typeof use === 'object' && use !== null && isLoaderEntry(use)) {
    return [{ ...use, loader: use.loader }]
  }
  return
}

function isLoaderEntry(
  value: object
): value is Record<string, unknown> & { loader: string } {
  return 'loader' in value && typeof value.loader === 'string'
}

function lastPreprocessor(use: readonly LoaderUse[]): number {
  let found = -1
  for (const [index, entry] of use.entries()) {
    if (PREPROCESSOR_LOADER.test(entry.loader)) found = index
  }
  return found
}

function compilationModulePaths(compilation: CompilationLike): string[] {
  const found = new Set<string>()
  for (const mod of compilation.modules) {
    if (typeof mod !== 'object' || mod === null) continue
    for (const key of ['resource', 'userRequest', 'rawRequest'] as const) {
      if (!(key in mod)) continue
      const value: unknown = Reflect.get(mod, key)
      if (typeof value === 'string') collectModulePaths(found, value)
    }
    const id = moduleIdentifier(mod)
    if (id) collectModulePaths(found, id)
  }
  return [...found]
}

function collectModulePaths(found: Set<string>, value: string): void {
  for (const match of value.matchAll(/\/[^\s|!?]+\.module\.[a-z0-9]+/gi)) {
    const filePath = match[0]
    if (filePath) found.add(filePath)
  }
}

function modulesForRegistry(compilation: CompilationLike): unknown[] {
  const modules: unknown[] = []
  for (const mod of compilation.modules) {
    const id = moduleIdentifier(mod)
    if (!id) continue
    if (id.includes(REGISTRY_STUB_PATH) || id.includes('registry.css')) {
      modules.push(mod)
    }
  }
  return modules
}

function isCompilation(value: unknown): value is CompilationLike {
  if (typeof value !== 'object' || value === null) return false
  if (!('modules' in value) || !('rebuildModule' in value)) return false
  return (
    typeof value.rebuildModule === 'function' &&
    typeof value.modules === 'object' &&
    value.modules !== null &&
    Symbol.iterator in value.modules
  )
}

function moduleIdentifier(mod: unknown): string | undefined {
  if (typeof mod !== 'object' || mod === null) return undefined
  if (!('identifier' in mod) || typeof mod.identifier !== 'function') {
    return undefined
  }
  const id: unknown = Reflect.apply(mod.identifier, mod, [])
  return typeof id === 'string' ? id : undefined
}

/** webpack stores the registry CSS on the extract module, so a new file can
 * be written there after the loader has already run. */
function patchRegistryCss(compilation: CompilationLike, css: string): boolean {
  const next = Buffer.from(css)
  let patched = false
  for (const mod of compilation.modules) {
    if (typeof mod !== 'object' || mod === null) continue
    const id = moduleIdentifier(mod)
    if (!id?.startsWith('css|') || !id.includes('registry.css')) continue
    if (!isRegistryCssModule(mod)) continue
    mod.content = next
    mod._needBuild = true
    patched = true
  }
  return patched
}

interface RegistryCssModule {
  content: Buffer | Uint8Array | string
  _needBuild?: boolean
}

function isRegistryCssModule(mod: object): mod is RegistryCssModule {
  if (!('content' in mod)) return false
  const content = mod.content
  return (
    typeof content === 'string' ||
    Buffer.isBuffer(content) ||
    content instanceof Uint8Array
  )
}

function rebuild(compilation: CompilationLike, mod: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    compilation.rebuildModule(mod, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function loaderCacheKey(
  options: AtomicCssModulesPluginOptions,
  debugNames: boolean
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        conflicts: options.conflicts ?? 'skip',
        localIdents: options.localIdents ?? null,
        customAtRules: options.customAtRules ?? null,
        strict: options.strict === true,
        debugNames,
      })
    )
    .digest('hex')
    .slice(0, 16)
}

function invalidateBuild(mod: object): void {
  if (!('invalidateBuild' in mod)) return
  const method: unknown = Reflect.get(mod, 'invalidateBuild')
  if (typeof method !== 'function') return
  Reflect.apply(method, mod, [])
}
