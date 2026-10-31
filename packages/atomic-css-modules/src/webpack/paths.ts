import { existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function sibling(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url))
}

/**
 * The ESM build emits loaders next to `paths.js`. The CommonJS bundle lives
 * in `dist/cjs/` and has to point at those same files.
 */
function loader(name: string): string {
  const beside = sibling(`./${name}`)
  if (existsSync(beside)) return beside
  return sibling(`../webpack/${name}`)
}

/**
 * Stub stylesheet shipped with the package. Realpathed so it matches
 * webpack's `resourcePath`, which is a realpath even when the package
 * is installed through a symlink.
 */
export const REGISTRY_STUB_PATH = realpathSync(sibling('../../registry.css'))
export const REWRITE_LOADER_PATH = loader('rewrite-loader.js')
export const REGISTRY_LOADER_PATH = loader('registry-loader.js')
export const INJECT_LOADER_PATH = loader('inject-loader.js')
