import { needsRegistryImport, prependRegistryImport } from '../plugin-state.js'
import type { LoaderContext } from './loader-context.js'
import { REGISTRY_STUB_PATH } from './paths.js'
import { resolveState } from './state-registry.js'

export default function injectLoader(
  this: LoaderContext,
  source: string
): void {
  const state = resolveState(this.getOptions())
  if (
    !needsRegistryImport(
      this.resourcePath,
      source,
      REGISTRY_STUB_PATH,
      state.moduleSuffixes
    )
  ) {
    this.callback(null, source)
    return
  }
  this.callback(null, prependRegistryImport(source, REGISTRY_STUB_PATH))
}
