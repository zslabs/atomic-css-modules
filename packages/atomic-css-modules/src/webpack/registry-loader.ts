/**
 * Fills the registry stub from the shared scan cache.
 *
 * The result is not loader-cached. The text is chosen after the module graph
 * exists, and a cached result from earlier in the same compilation would be
 * the unfiltered registry. Scan results are cached separately. File
 * dependencies still invalidate the module when those files change.
 */
import type { LoaderContext } from './loader-context.js'
import { resolveState } from './state-registry.js'

export default function registryLoader(this: LoaderContext): void {
  const state = resolveState(this.getOptions())
  this.cacheable(false)
  for (const filePath of state.registryDependencies()) {
    this.addDependency(filePath)
  }
  state.noteEmittedRegistryHash(state.registryHash)
  state.noteLoaderRegistry(state.registryCss)
  this.callback(null, state.registryCss)
}
