/** Rewrites a matching CSS module to `composes` atoms from the global registry. */
import type { LoaderContext } from './loader-context.js'
import { resolveState } from './state-registry.js'

export default function rewriteLoader(
  this: LoaderContext,
  source: string
): void {
  const state = resolveState(this.getOptions())
  const rewritten = state.rewriteCssModule(this.resourcePath, source)
  if (!rewritten) {
    this.callback(null, source)
    return
  }
  const map: unknown = rewritten.map ? JSON.parse(rewritten.map) : undefined
  this.callback(null, rewritten.code, map)
}
