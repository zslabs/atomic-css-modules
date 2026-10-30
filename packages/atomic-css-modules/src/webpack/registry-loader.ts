/**
 * Fills the registry stub from the shared scan cache. On webpack the result
 * is cached against the CSS module files. Rspack does not expose the
 * extracted CSS, so that loader runs on every compilation and the watch
 * scan has to pick up new imports before it does.
 */
import type { LoaderContext } from './loader-context.js'
import { resolveState } from './state-registry.js'

export default function registryLoader(this: LoaderContext): void {
  const options = this.getOptions()
  const state = resolveState(options)
  const cacheRegistry = options.cacheRegistry !== false
  this.cacheable(cacheRegistry)
  if (cacheRegistry) {
    for (const filePath of state.cssModulePaths()) this.addDependency(filePath)
  }
  state.noteEmittedRegistryHash(state.registryHash)
  this.callback(null, state.registryCss)
}
