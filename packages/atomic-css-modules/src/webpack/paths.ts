import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function resolveSibling(relative: string): string {
  return realpathSync(fileURLToPath(new URL(relative, import.meta.url)))
}

/** Empty CSS file shipped with the package; the registry loader fills it in. */
export const REGISTRY_STUB_PATH = resolveSibling('../../registry.css')
export const REWRITE_LOADER_PATH = resolveSibling('./rewrite-loader.js')
export const REGISTRY_LOADER_PATH = resolveSibling('./registry-loader.js')
export const INJECT_LOADER_PATH = resolveSibling('./inject-loader.js')
