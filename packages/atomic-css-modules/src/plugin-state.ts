/**
 * Bundler-agnostic plugin state shared by the Vite and webpack adapters.
 *
 * Owns include/exclude matching, the per-file scan cache, the current
 * registry snapshot, and the per-module rewrite. Adapters only wire these
 * into their own lifecycle hooks.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { cacheVersion, packageVersion } from './cache-version.js'
import { scanFilesInPool } from './scan-pool.js'
import { FileScanCache, type FileScanCacheOptions } from './file-scan-cache.js'
import { isOverrideConflictError } from './override-conflicts.js'
import { formatAtomizationReport } from './report.js'
import { rewriteFiles } from './rewrite.js'
import type {
  AtomizationFailure,
  AtomizationReport,
  AtomicCustomAtRules,
  ConflictMode,
  LocalIdentOptions,
  SourceFile,
} from './types.js'

export interface AtomicCssModulesPluginOptions {
  /** Glob(s), relative to the project root, matching CSS Modules files to atomize. */
  include?: string | string[]
  /** Glob(s), relative to the project root, to exclude. */
  exclude?: string | string[]
  /**
   * Readable atom names (`color-red-a1b2c3`) instead of production hashes.
   * The trailing key hash keeps different at-rule conditions from colliding.
   * Defaults to true for `vite serve` and webpack/Rspack development mode.
   */
  debugNames?: boolean
  /**
   * `"verbose"` also lists each skipped selector after the initial summary.
   * Defaults to `"summary"`.
   */
  report?: 'summary' | 'verbose'
  /**
   * Rewrite CSS before scan/atomize (e.g. expand design-token at-rules or
   * compile LESS the same way the bundler does). Runs for disk sync and for
   * rewrite when the bundler has not already compiled the file. Must
   * reproduce the bundler's aliases, global variables, and plugins.
   */
  preprocess?: (code: string, filePath: string) => string | Promise<string>
  conflicts?: ConflictMode
  /** Defaults to 2 for bundler plugins. */
  minOccurrences?: number
  localIdents?: LocalIdentOptions
  customAtRules?: AtomicCustomAtRules
  /** When true, one file's scan or rewrite error fails the build. */
  strict?: boolean
  /** Merge adjacent registry atoms that share an at-rule condition. */
  groupConditions?: boolean
}

export interface RewrittenModule {
  code: string
  map?: string
}

export interface AtomicPluginState {
  readonly includePatterns: readonly string[]
  readonly root: string
  readonly registryCss: string
  readonly registryHash: string
  configure(settings: {
    root: string
    debugNames: boolean
    sourceMap: boolean
  }): boolean
  isMatchingCssModule(filePath: string): boolean
  cssModulePaths(): readonly string[]
  syncFromDisk(): Promise<AtomizationReport>
  applyFileChange(filePath: string): Promise<void>
  /**
   * Update the cache from a bundler watcher's file sets.
   * Returns false when no matching CSS module changed.
   */
  applyWatchChanges(
    modified: ReadonlySet<string>,
    removed: ReadonlySet<string>
  ): Promise<boolean>
  takeRemappedFiles(): string[]
  rememberBuiltModule(filePath: string, module: object): void
  builtModule(filePath: string): object | undefined
  noteEmittedRegistryHash(hash: string): void
  emittedRegistryHash(): string
  rewriteCssModule(
    filePath: string,
    code: string,
    compiled?: boolean
  ): Promise<RewrittenModule | null>
  formatReport(report: AtomizationReport): string
  readonly moduleSuffixes: readonly string[]
  readonly cacheVersion: string
  useCompilationFiles(filePaths: readonly string[]): void
  registryDependencies(): readonly string[]
  noteLoaderRegistry(css: string): void
  loaderRegistry(): string | undefined
  clearLoaderRegistry(): void
}

const DEFAULT_INCLUDE = ['**/*.module.css']
const DEFAULT_EXCLUDE = ['**/node_modules/**']

export function isJsModule(filePath: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(filePath)
}

function matchesAny(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => path.matchesGlob(filePath, pattern))
}

export function moduleSuffixes(patterns: readonly string[]): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const pattern of patterns) {
    for (const match of pattern.matchAll(/\.module\.[a-z0-9]+/gi)) {
      const suffix = match[0].toLowerCase()
      if (seen.has(suffix)) continue
      seen.add(suffix)
      found.push(suffix)
    }
  }
  if (found.length === 0) found.push('.module.css')
  return found
}

/** True for JS/TS modules that reference a CSS module but not the registry yet. */
export function needsRegistryImport(
  filePath: string,
  code: string,
  registryId: string,
  suffixes: readonly string[]
): boolean {
  return (
    isJsModule(filePath) &&
    suffixes.some((suffix) => code.includes(suffix)) &&
    !code.includes(registryId)
  )
}

export function prependRegistryImport(
  code: string,
  registryId: string
): string {
  return `import ${JSON.stringify(registryId)}\n${code}`
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

export function createAtomicPluginState(
  options: AtomicCssModulesPluginOptions = {}
): AtomicPluginState {
  const includePatterns = options.include
    ? [options.include].flat()
    : DEFAULT_INCLUDE
  const excludePatterns = options.exclude
    ? [options.exclude].flat()
    : DEFAULT_EXCLUDE
  const preprocess = options.preprocess
  const strict = options.strict === true
  const suffixes = moduleSuffixes(includePatterns)
  const policy = policyKey(options)
  const version = cacheVersion(policy)

  let root = process.cwd()
  let debugNames = options.debugNames === true
  let sourceMap = false
  let registryCss = ''
  let registryHash = ''
  let remappedFiles: string[] = []
  let emittedRegistryHash = ''
  let activeFiles: readonly string[] | undefined
  let loaderRegistryCss: string | undefined
  const builtModules = new Map<string, object>()
  const rewriteFailures = new Map<string, string>()
  let cache = sharedCache(
    cacheIdentity(root, policy, debugNames),
    cacheOptions(options, root, debugNames)
  )

  async function prepareSource(
    filePath: string,
    code: string
  ): Promise<SourceFile> {
    return {
      filePath,
      code: preprocess === undefined ? code : await preprocess(code, filePath),
    }
  }

  function canScanFromDisk(filePath: string): boolean {
    if (preprocess) return true
    return /\.(?:css|pcss|postcss)$/i.test(filePath)
  }

  function fail(filePath: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    rewriteFailures.set(filePath, message)
    cache.noteFailure(filePath, '', message)
  }

  function publishSnapshot(): AtomizationReport {
    const snap = cache.snapshot()
    registryCss = snap.registryCss
    registryHash = snap.registryHash
    remappedFiles = snap.remappedFiles
    return snap.report
  }

  function isMatchingCssModule(filePath: string): boolean {
    const relativeId = path.relative(root, filePath)
    return (
      matchesAny(relativeId, includePatterns) &&
      !matchesAny(relativeId, excludePatterns)
    )
  }

  async function syncFromDisk(): Promise<AtomizationReport> {
    const matches = fs.glob(includePatterns, {
      cwd: root,
      exclude: excludePatterns,
    })
    const filePaths: string[] = []
    for await (const match of matches) filePaths.push(path.resolve(root, match))
    filePaths.sort((left, right) => left.localeCompare(right))
    cache.retain(filePaths)
    const misses: SourceFile[] = []
    await Promise.all(
      filePaths.map(async (filePath) => {
        if (!canScanFromDisk(filePath)) return
        try {
          const code = await fs.readFile(filePath, 'utf8')
          const source = await prepareSource(filePath, code)
          if (cache.reuse(source) === 'miss') misses.push(source)
        } catch (error) {
          if (isEnoent(error)) return
          if (strict || isOverrideConflictError(error)) throw error
          fail(filePath, error)
        }
      })
    )
    let pooled: Awaited<ReturnType<typeof scanFilesInPool>>
    try {
      pooled = await scanFilesInPool(misses, cache.scanSettings())
    } catch (error) {
      if (strict || isOverrideConflictError(error)) throw error
      pooled = undefined
    }
    const scanned = new Set(pooled?.map((result) => result.filePath) ?? [])
    if (pooled) {
      for (const result of pooled) {
        const source = misses.find((file) => file.filePath === result.filePath)
        if (!source) continue
        cache.remember(source, result.scan, new Map(result.atoms), result.skips)
      }
    }
    for (const source of misses) {
      if (scanned.has(source.filePath)) continue
      try {
        cache.update(source)
      } catch (error) {
        if (strict || isOverrideConflictError(error)) throw error
        fail(source.filePath, error)
      }
    }
    return publishSnapshot()
  }

  async function applyWatchChanges(
    modified: ReadonlySet<string>,
    removed: ReadonlySet<string>
  ): Promise<boolean> {
    let dirty = false
    for (const filePath of removed) {
      if (!cache.has(filePath)) continue
      cache.remove(filePath)
      dirty = true
    }

    const reads = await Promise.all(
      [...modified].map(async (filePath) => readIfCss(filePath))
    )
    const imported = await cssModulesImportedBy(modified, reads)
    for (const file of [...reads, ...imported]) {
      if (!file) continue
      if (file.code === undefined || !isMatchingCssModule(file.filePath)) {
        if (!cache.has(file.filePath)) continue
        cache.remove(file.filePath)
        dirty = true
        continue
      }
      try {
        if (cache.update(await prepareSource(file.filePath, file.code))) {
          dirty = true
        }
      } catch (error) {
        if (strict || isOverrideConflictError(error)) throw error
        fail(file.filePath, error)
        dirty = true
      }
    }

    if (!dirty) return false
    publishSnapshot()
    return true
  }

  async function readIfCss(
    filePath: string
  ): Promise<{ filePath: string; code?: string } | undefined> {
    if (!canScanFromDisk(filePath)) return
    if (!isMatchingCssModule(filePath) && !cache.has(filePath)) return
    try {
      return { filePath, code: await fs.readFile(filePath, 'utf8') }
    } catch (error) {
      if (!isEnoent(error)) throw error
      return { filePath }
    }
  }

  /** A new CSS module often arrives as an import in a changed JS file, and
   * the watcher does not list the CSS file itself. */
  async function cssModulesImportedBy(
    modified: ReadonlySet<string>,
    alreadyRead: Array<{ filePath: string } | undefined>
  ): Promise<Array<{ filePath: string; code?: string } | undefined>> {
    const seen = new Set(
      alreadyRead.flatMap((file) => (file ? [file.filePath] : []))
    )
    const extra = new Set<string>()
    await Promise.all(
      [...modified].filter(isJsModule).map(async (filePath) => {
        let code: string
        try {
          code = await fs.readFile(filePath, 'utf8')
        } catch (error) {
          if (!isEnoent(error)) throw error
          return
        }
        for (const spec of code.matchAll(importPattern(suffixes))) {
          const request = spec[1]
          if (!request) continue
          const resolved = path.isAbsolute(request)
            ? request
            : path.resolve(path.dirname(filePath), request)
          if (!isMatchingCssModule(resolved) || seen.has(resolved)) continue
          extra.add(resolved)
        }
      })
    )
    return Promise.all([...extra].map((filePath) => readIfCss(filePath)))
  }

  async function applyFileChange(filePath: string): Promise<void> {
    try {
      if (!canScanFromDisk(filePath)) return
      const code = await fs.readFile(filePath, 'utf8')
      cache.update(await prepareSource(filePath, code))
    } catch (error) {
      if (isEnoent(error)) {
        cache.remove(filePath)
      } else if (strict || isOverrideConflictError(error)) {
        throw error
      } else {
        fail(filePath, error)
      }
    }
    publishSnapshot()
  }

  async function rewriteCssModule(
    filePath: string,
    code: string,
    compiled = false
  ): Promise<RewrittenModule | null> {
    if (!isMatchingCssModule(filePath)) return null

    let source: SourceFile
    try {
      source =
        compiled || preprocess === undefined
          ? { filePath, code }
          : await prepareSource(filePath, code)
      if (cache.update(source)) publishSnapshot()
    } catch (error) {
      if (strict || isOverrideConflictError(error)) throw error
      fail(filePath, error)
      return null
    }

    const scan = cache.getScan(filePath)
    if (!scan || scan.failure) return null
    try {
      const [file] = rewriteFiles(
        [source],
        [scan],
        {
          registryImportPath: '',
          composeFrom: 'global',
          sourceMap,
          debugNames,
          conflicts: options.conflicts,
          customAtRules: options.customAtRules,
          strict: options.strict,
        },
        cache.getAtoms()
      )
      if (!file || file.failure || !file.changed) {
        if (file?.failure) rewriteFailures.set(filePath, file.failure)
        return null
      }
      rewriteFailures.delete(filePath)
      return { code: file.code, map: file.map }
    } catch (error) {
      if (strict || isOverrideConflictError(error)) throw error
      fail(filePath, error)
      return null
    }
  }

  function useCompilationFiles(filePaths: readonly string[]): void {
    activeFiles = filePaths
    const subset = cache.registryFor(new Set(filePaths))
    if (!subset) return
    registryCss = subset.css
    registryHash = subset.hash
  }

  return {
    includePatterns,
    get root() {
      return root
    },
    get registryCss() {
      return registryCss
    },
    get registryHash() {
      return registryHash
    },
    configure(settings) {
      root = settings.root
      debugNames = settings.debugNames
      sourceMap = settings.sourceMap
      cache = sharedCache(
        cacheIdentity(root, policy, debugNames),
        cacheOptions(options, root, debugNames)
      )
      return cache.setDebugNames(debugNames)
    },
    isMatchingCssModule,
    cssModulePaths() {
      return cache.filePaths()
    },
    syncFromDisk,
    applyFileChange,
    applyWatchChanges,
    takeRemappedFiles() {
      const files = remappedFiles
      remappedFiles = []
      return files
    },
    rememberBuiltModule(filePath, module) {
      builtModules.set(filePath, module)
    },
    builtModule(filePath) {
      return builtModules.get(filePath)
    },
    noteEmittedRegistryHash(hash) {
      emittedRegistryHash = hash
    },
    emittedRegistryHash() {
      return emittedRegistryHash
    },
    rewriteCssModule,
    formatReport(report) {
      const failures: AtomizationFailure[] = [...report.failures]
      for (const [filePath, message] of rewriteFailures) {
        if (failures.some((failure) => failure.filePath === filePath)) continue
        failures.push({ filePath, message })
      }
      return formatAtomizationReport(
        { ...report, failures },
        {
          verbose: options.report === 'verbose',
          root,
        }
      )
    },
    moduleSuffixes: suffixes,
    cacheVersion: version,
    useCompilationFiles,
    registryDependencies() {
      return activeFiles ?? cache.filePaths()
    },
    noteLoaderRegistry(css) {
      loaderRegistryCss ??= css
    },
    loaderRegistry() {
      return loaderRegistryCss
    },
    clearLoaderRegistry() {
      loaderRegistryCss = undefined
    },
  }
}

const sharedCaches = new Map<string, FileScanCache>()

function cacheIdentity(
  root: string,
  policy: string,
  debugNames: boolean
): string {
  return `${path.resolve(root)}\0${policy}\0${debugNames ? '1' : '0'}`
}

function sharedCache(
  key: string,
  options: FileScanCacheOptions
): FileScanCache {
  const existing = sharedCaches.get(key)
  if (existing) return existing
  const created = new FileScanCache(options)
  sharedCaches.set(key, created)
  return created
}

function policyKey(options: AtomicCssModulesPluginOptions): string {
  return JSON.stringify({
    version: packageVersion(),
    include: options.include ?? null,
    exclude: options.exclude ?? null,
    conflicts: options.conflicts ?? 'skip',
    minOccurrences: options.minOccurrences ?? 2,
    localIdents: options.localIdents ?? null,
    customAtRules: options.customAtRules ?? null,
    groupConditions: options.groupConditions === true,
    strict: options.strict === true,
  })
}

function cacheOptions(
  options: AtomicCssModulesPluginOptions,
  root: string,
  debugNames: boolean
): FileScanCacheOptions {
  return {
    debugNames,
    conflicts: options.conflicts,
    minOccurrences: options.minOccurrences ?? 2,
    localIdents: options.localIdents,
    customAtRules: options.customAtRules,
    groupConditions: options.groupConditions,
    strict: options.strict,
    cacheDir: path.join(root, 'node_modules/.cache/atomic-css-modules'),
    policyKey: policyKey(options),
  }
}

function importPattern(suffixes: readonly string[]): RegExp {
  const body = suffixes.map((suffix) => suffix.replace(/\./g, '\\.')).join('|')
  return new RegExp(`['"]([^'"]+(?:${body}))['"]`, 'g')
}
