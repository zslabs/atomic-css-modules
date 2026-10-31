import type { LoaderContext } from './loader-context.js'
import { resolveState } from './state-registry.js'

export default function rewriteLoader(
  this: LoaderContext,
  source: string
): void {
  const callback = this.async()
  const options = this.getOptions()
  const state = resolveState(options)
  if (this._module) state.rememberBuiltModule(this.resourcePath, this._module)
  void state
    .rewriteCssModule(this.resourcePath, source, options.compiled === true)
    .then((rewritten) => {
      if (!rewritten) {
        callback(null, source)
        return
      }
      const map: unknown = rewritten.map ? JSON.parse(rewritten.map) : undefined
      callback(null, rewritten.code, map)
    })
    .catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)))
    })
}
