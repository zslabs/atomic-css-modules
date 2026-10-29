/**
 * Bundler-agnostic plugin state shared by the Vite and webpack adapters.
 *
 * Owns include/exclude matching, the per-file scan cache, the current
 * registry snapshot, and the per-module rewrite. Adapters only wire these
 * into their own lifecycle hooks.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FileScanCache } from './file-scan-cache.js'
import { formatAtomizationReport } from './report.js'
import { rewriteFiles } from './rewrite.js'
import type { AtomizationReport, SourceFile } from './types.js'

export interface AtomicCssModulesPluginOptions {
  /** Glob(s), relative to the project root, matching CSS Modules files to atomize. */
  include?: string | string[]
  /** Glob(s), relative to the project root, to exclude. */
  exclude?: string | string[]
  /**
   * Readable atom names (`color-red-a1b2c3`) instead of production hashes.
   * The trailing key hash keeps different at-rule conditions from colliding.
   * Defaults to true in dev/watch and false in production builds.
   */
  debugNames?: boolean
  /**
   * `"verbose"` also lists each skipped selector after the initial summary.
   * Defaults to `"summary"`.
   */
  report?: 'summary' | 'verbose'
  /**
   * Rewrite CSS before scan/atomize (e.g. expand design-token at-rules).
   * Runs for disk sync, HMR, and transform so the registry and rewrites see
   * the same expanded source.
   */
  preprocess?: (code: string, filePath: string) => string
}

export interface RewrittenModule {
  code: string
  map?: string
}

export interface AtomicPluginState {
  readonly includePatterns: readonly string[]
  readonly root: string
  readonly registryCss: string
  configure(settings: { root: string; debugNames: boolean }): void
  isMatchingCssModule(filePath: string): boolean
  syncFromDisk(): Promise<AtomizationReport>
  applyFileChange(filePath: string): Promise<void>
  rewriteCssModule(filePath: string, code: string): RewrittenModule | null
  formatReport(report: AtomizationReport): string
}

const DEFAULT_INCLUDE = ['**/*.module.css']
const DEFAULT_EXCLUDE = ['**/node_modules/**']

export function isJsModule(filePath: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(filePath)
}

function matchesAny(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => path.matchesGlob(filePath, pattern))
}

/** True for JS/TS modules that reference a CSS module but not the registry yet. */
export function needsRegistryImport(
  filePath: string,
  code: string,
  registryId: string
): boolean {
  return (
    isJsModule(filePath) &&
    code.includes('.module.css') &&
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

  let root = process.cwd()
  let debugNames = false
  let registryCss = ''
  const cache = new FileScanCache()

  function prepareSource(filePath: string, code: string): SourceFile {
    return {
      filePath,
      code: preprocess === undefined ? code : preprocess(code, filePath),
    }
  }

  function publishSnapshot(): AtomizationReport {
    const snap = cache.snapshot()
    registryCss = snap.registryCss
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
    await Promise.all(
      filePaths.map(async (filePath) => {
        const code = await fs.readFile(filePath, 'utf8')
        cache.update(prepareSource(filePath, code))
      })
    )
    return publishSnapshot()
  }

  async function applyFileChange(filePath: string): Promise<void> {
    try {
      const code = await fs.readFile(filePath, 'utf8')
      cache.update(prepareSource(filePath, code))
    } catch (error) {
      if (!isEnoent(error)) throw error
      cache.remove(filePath)
    }
    publishSnapshot()
  }

  function rewriteCssModule(
    filePath: string,
    code: string
  ): RewrittenModule | null {
    if (!isMatchingCssModule(filePath)) return null

    const source = prepareSource(filePath, code)
    if (cache.update(source)) publishSnapshot()
    const scan = cache.getScan(filePath)
    if (!scan) return null
    const [file] = rewriteFiles(
      [source],
      [scan],
      {
        registryImportPath: '',
        composeFrom: 'global',
        sourceMap: true,
        debugNames,
      },
      cache.getAtoms()
    )
    if (!file || !file.changed) return null
    return { code: file.code, map: file.map }
  }

  return {
    includePatterns,
    get root() {
      return root
    },
    get registryCss() {
      return registryCss
    },
    configure(settings) {
      root = settings.root
      debugNames = settings.debugNames
      cache.setDebugNames(debugNames)
    },
    isMatchingCssModule,
    syncFromDisk,
    applyFileChange,
    rewriteCssModule,
    formatReport(report) {
      return formatAtomizationReport(report, {
        verbose: options.report === 'verbose',
        root,
      })
    },
  }
}
