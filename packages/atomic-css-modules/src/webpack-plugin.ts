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
import { registerState } from './webpack/state-registry.js'

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
    const loaderOptions = registerState(state)
    loaderOptions.cacheRegistry = !('rspack' in compiler)
    let reported = false
    let ready = false
    let rebuilding = false

    compiler.options.module.rules.push(
      {
        enforce: 'pre',
        test: (filePath: string) => state.isMatchingCssModule(filePath),
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
        use: [{ loader: INJECT_LOADER_PATH }],
      }
    )

    const sync = async (): Promise<void> => {
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

    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, sync)
    compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, sync)
    compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, async (compilation) => {
      if (rebuilding || !isCompilation(compilation)) return
      if (state.emittedRegistryHash() === state.registryHash) return
      const patched = patchRegistryCss(compilation, state.registryCss)
      const nativeModules = nativeRegistryModules(compilation)
      if (!patched && nativeModules.length === 0) return
      rebuilding = true
      try {
        // Record the hash before rebuilding. A native rebuild re-enters this
        // hook from the loader, and the content patch does not.
        state.noteEmittedRegistryHash(state.registryHash)
        await Promise.all(nativeModules.map((mod) => rebuild(compilation, mod)))
      } finally {
        rebuilding = false
      }
    })
  }
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

function nativeRegistryModules(compilation: CompilationLike): unknown[] {
  const modules: unknown[] = []
  for (const mod of compilation.modules) {
    const id = moduleIdentifier(mod)
    if (id?.startsWith('css/auto|') && id.includes('registry.css')) {
      modules.push(mod)
    }
  }
  return modules
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

function invalidateBuild(mod: object): void {
  if (!('invalidateBuild' in mod)) return
  const method: unknown = Reflect.get(mod, 'invalidateBuild')
  if (typeof method !== 'function') return
  Reflect.apply(method, mod, [])
}
