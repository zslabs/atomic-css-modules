import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function sibling(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url))
}

/**
 * Stub stylesheet shipped with the package. Realpathed so it matches
 * webpack's `resourcePath`, which is a realpath even when the package
 * is installed through a symlink.
 */
export const REGISTRY_STUB_PATH = realpathSync(sibling('../../registry.css'))
export const REWRITE_LOADER_PATH = sibling('./rewrite-loader.js')
export const REGISTRY_LOADER_PATH = sibling('./registry-loader.js')
export const INJECT_LOADER_PATH = sibling('./inject-loader.js')
