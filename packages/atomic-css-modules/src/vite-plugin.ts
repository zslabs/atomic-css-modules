/**
 * Vite plugin wrapper around the core atomic CSS Modules pipeline.
 *
 * Each matching file is scanned into a content-hash cache, then rewritten
 * independently. The shared registry is rematerialized from that cache as
 * `virtual:atomic-registry.css` so it is not written to disk or cloned
 * into every CSS module.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { FileScanCache } from './file-scan-cache.js'
import { formatAtomizationReport } from './report.js'
import { rewriteFiles } from './rewrite.js'
import type { SourceFile } from './types.js'

export const ATOMIC_REGISTRY_ID = 'virtual:atomic-registry.css'
export const RESOLVED_ATOMIC_REGISTRY_ID = `\0${ATOMIC_REGISTRY_ID}`

export interface AtomicCssModulesPluginOptions {
  /** Glob(s), relative to the Vite project root, matching CSS Modules files to atomize. */
  include?: string | string[]
  /** Glob(s), relative to the Vite project root, to exclude. */
  exclude?: string | string[]
  /**
   * Readable atom names (`color-red-a1b2c3`) instead of production hashes.
   * The trailing key hash keeps different at-rule conditions from colliding.
   * Defaults to true in `vite serve` and false in `vite build`.
   */
  debugNames?: boolean
  /**
   * `"verbose"` also lists each skipped selector after the buildStart summary.
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

const DEFAULT_INCLUDE = ['**/*.module.css']
const DEFAULT_EXCLUDE = ['**/node_modules/**']

function isJsModule(filePath: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(filePath)
}

function matchesAny(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => path.matchesGlob(filePath, pattern))
}

function isVirtualRegistry(filename: string): boolean {
  return filename.replace(/\\/g, '/').includes(ATOMIC_REGISTRY_ID)
}

function cssContentHash(css: string): number {
  let hash = 5381
  for (let i = css.length - 1; i >= 0; i--) {
    hash = Math.imul(hash, 33) ^ css.charCodeAt(i)
  }
  return hash >>> 0
}

/** Same shape as Vite's default `_[local]_[hash]_[line]` generator. */
function defaultScopedName(
  name: string,
  _filename: string,
  css: string
): string {
  const index = css.indexOf(`.${name}`)
  const lineNumber = css
    .slice(0, index === -1 ? 0 : index)
    .split(/\r?\n/).length
  return `_${name}_${cssContentHash(css).toString(36).slice(0, 5)}_${lineNumber}`
}

/**
 * Applies a postcss-modules / Vite string pattern such as `[name]__[local]`.
 * Unknown placeholders are left intact.
 */
function interpolateScopedName(
  pattern: string,
  local: string,
  filename: string,
  css: string
): string {
  const parsed = path.parse(filename)
  const hash = cssContentHash(css)
  return pattern.replace(/\[([^\]]+)\]/g, (original, token: string) => {
    if (token === 'local') return local
    if (token === 'name') return parsed.name
    if (token === 'folder') return path.basename(parsed.dir)
    if (token === 'path') return parsed.dir
    if (token === 'file') return parsed.base
    if (token === 'ext') return parsed.ext.replace(/^\./, '')
    const hashMatch = /^hash(?::([a-z0-9]+))?(?::(\d+))?$/.exec(token)
    if (!hashMatch) return original
    const encoding = hashMatch[1] ?? 'base64'
    const encoded = encoding === 'hex' ? hash.toString(16) : hash.toString(36)
    return hashMatch[2] ? encoded.slice(0, Number(hashMatch[2])) : encoded
  })
}

const VIRTUAL_REGISTRY_IDS = [
  RESOLVED_ATOMIC_REGISTRY_ID,
  `${RESOLVED_ATOMIC_REGISTRY_ID}?raw`,
]

export function atomicCssModules(
  options: AtomicCssModulesPluginOptions = {}
): Plugin {
  const includePatterns = options.include
    ? [options.include].flat()
    : DEFAULT_INCLUDE
  const excludePatterns = options.exclude
    ? [options.exclude].flat()
    : DEFAULT_EXCLUDE

  let root = process.cwd()
  let debugNames = false
  let registryCss = ''
  const cache = new FileScanCache()
  const preprocess = options.preprocess

  function prepareSource(filePath: string, code: string): SourceFile {
    return {
      filePath,
      code: preprocess === undefined ? code : preprocess(code, filePath),
    }
  }

  function publishSnapshot(): ReturnType<FileScanCache['snapshot']> {
    const snap = cache.snapshot()
    registryCss = snap.registryCss
    return snap
  }

  async function syncFromDisk(): Promise<
    ReturnType<FileScanCache['snapshot']>
  > {
    const matches = fs.glob(includePatterns, {
      cwd: root,
      exclude: excludePatterns,
    })
    const filePaths: string[] = []
    for await (const match of matches) filePaths.push(path.resolve(root, match))
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
    } catch {
      cache.remove(filePath)
    }
    publishSnapshot()
  }

  function isMatchingCssModule(file: string): boolean {
    const relativeId = path.relative(root, file)
    return (
      matchesAny(relativeId, includePatterns) &&
      !matchesAny(relativeId, excludePatterns)
    )
  }

  return {
    name: 'atomic-css-modules',
    enforce: 'pre',
    config(userConfig) {
      const modules = userConfig.css?.modules
      if (modules === false) return
      const existingPaths = modules?.globalModulePaths ?? []
      const existingScoped = modules?.generateScopedName
      return {
        css: {
          modules: {
            globalModulePaths: [
              ...existingPaths,
              new RegExp(
                `${ATOMIC_REGISTRY_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
              ),
            ],
            generateScopedName(
              name: string,
              filename: string,
              css: string
            ): string {
              if (isVirtualRegistry(filename)) return name
              if (typeof existingScoped === 'function') {
                return existingScoped(name, filename, css)
              }
              if (typeof existingScoped === 'string') {
                return interpolateScopedName(
                  existingScoped,
                  name,
                  filename,
                  css
                )
              }
              return defaultScopedName(name, filename, css)
            },
          },
        },
      }
    },
    configResolved(config) {
      root = config.root
      debugNames = options.debugNames ?? config.command === 'serve'
      cache.setDebugNames(debugNames)
    },
    resolveId(id) {
      const clean = id.split('?')[0]
      if (clean !== ATOMIC_REGISTRY_ID) return undefined
      return id.includes('?') ? `\0${id}` : RESOLVED_ATOMIC_REGISTRY_ID
    },
    load(id) {
      if (!id.startsWith(RESOLVED_ATOMIC_REGISTRY_ID)) return undefined
      if (id.includes('?raw'))
        return `export default ${JSON.stringify(registryCss)}`
      return registryCss
    },
    async buildStart() {
      const { report } = await syncFromDisk()
      this.info(
        formatAtomizationReport(report, {
          verbose: options.report === 'verbose',
          root,
        })
      )
    },
    configureServer(server) {
      for (const pattern of includePatterns) {
        server.watcher.add(path.resolve(root, pattern))
      }
    },
    async hotUpdate(options) {
      if (!isMatchingCssModule(options.file)) return
      await applyFileChange(options.file)
      const extra = []
      for (const virtualId of VIRTUAL_REGISTRY_IDS) {
        const mod = this.environment.moduleGraph.getModuleById(virtualId)
        if (!mod) continue
        this.environment.moduleGraph.invalidateModule(mod)
        extra.push(mod)
      }
      return [...options.modules, ...extra]
    },
    transform(code, id) {
      const cleanId = id.split('?')[0] ?? id
      if (isJsModule(cleanId) && code.includes('.module.css')) {
        if (code.includes(ATOMIC_REGISTRY_ID)) return null
        return { code: `import ${JSON.stringify(ATOMIC_REGISTRY_ID)}\n${code}` }
      }

      const relativeId = path.relative(root, cleanId)
      if (
        !matchesAny(relativeId, includePatterns) ||
        matchesAny(relativeId, excludePatterns)
      )
        return null

      const source = prepareSource(cleanId, code)
      if (cache.update(source)) publishSnapshot()
      const scan = cache.getScan(cleanId)
      if (!scan) return null
      const [file] = rewriteFiles(
        [source],
        [scan],
        {
          registryImportPath: ATOMIC_REGISTRY_ID,
          composeFrom: 'global',
          sourceMap: true,
          debugNames,
        },
        cache.getAtoms()
      )
      if (!file || !file.changed) return null
      return { code: file.code, map: file.map }
    },
  }
}
