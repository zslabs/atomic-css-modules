import type { LoaderContext } from './loader-context.js'
import { resolveState } from './state-registry.js'

export default function rewriteLoader(
  this: LoaderContext,
  source: string
): void {
  const state = resolveState(this.getOptions())
  if (this._module) state.rememberBuiltModule(this.resourcePath, this._module)
  const rewritten = state.rewriteCssModule(this.resourcePath, source)
  if (!rewritten) {
    this.callback(null, source)
    return
  }
  const map: unknown = rewritten.map ? JSON.parse(rewritten.map) : undefined
  this.callback(null, rewritten.code, map)
}
