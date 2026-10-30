/**
 * Vite plugin wrapper around the core atomic CSS Modules pipeline.
 *
 * Each matching file is scanned into a content-hash cache, then rewritten
 * independently. The shared registry is rematerialized from that cache as
 * `virtual:atomic-registry.css` so it is not written to disk or cloned
 * into every CSS module.
 */
import path from 'node:path'
import type { Plugin } from 'vite'
import {
  createAtomicPluginState,
  needsRegistryImport,
  prependRegistryImport,
  type AtomicCssModulesPluginOptions,
} from './plugin-state.js'

export type { AtomicCssModulesPluginOptions } from './plugin-state.js'

export const ATOMIC_REGISTRY_ID = 'virtual:atomic-registry.css'
export const RESOLVED_ATOMIC_REGISTRY_ID = `\0${ATOMIC_REGISTRY_ID}`

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
  const state = createAtomicPluginState(options)

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
      state.configure({
        root: config.root,
        debugNames: options.debugNames ?? config.command === 'serve',
      })
    },
    resolveId(id) {
      const clean = id.split('?')[0]
      if (clean !== ATOMIC_REGISTRY_ID) return undefined
      return id.includes('?') ? `\0${id}` : RESOLVED_ATOMIC_REGISTRY_ID
    },
    load(id) {
      if (!id.startsWith(RESOLVED_ATOMIC_REGISTRY_ID)) return undefined
      if (id.includes('?raw'))
        return `export default ${JSON.stringify(state.registryCss)}`
      return state.registryCss
    },
    async buildStart() {
      this.info(state.formatReport(await state.syncFromDisk()))
    },
    configureServer(server) {
      for (const pattern of state.includePatterns) {
        server.watcher.add(path.resolve(state.root, pattern))
      }
    },
    async hotUpdate(options) {
      if (!state.isMatchingCssModule(options.file)) return
      await state.applyFileChange(options.file)
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
      const [cleanId = id] = id.split('?')
      if (needsRegistryImport(cleanId, code, ATOMIC_REGISTRY_ID)) {
        return { code: prependRegistryImport(code, ATOMIC_REGISTRY_ID) }
      }
      return state.rewriteCssModule(cleanId, code)
    },
  }
}
