/**
 * Replaces the empty registry stub with the current registry CSS. Not
 * cacheable: its output depends on every CSS module, not just the stub.
 */
import type { LoaderContext } from './loader-context.js'
import { resolveState } from './state-registry.js'

export default function registryLoader(this: LoaderContext): void {
  this.cacheable(false)
  this.callback(null, resolveState(this.getOptions()).registryCss)
}
