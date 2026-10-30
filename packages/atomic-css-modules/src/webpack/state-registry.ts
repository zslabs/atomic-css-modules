/**
 * Hands plugin state to loaders by id. Lives on `globalThis` because the
 * bundler may load loader files as separate module instances from the plugin.
 */
import type { AtomicPluginState } from '../plugin-state.js'

declare global {
  var __atomicCssModulesStates: Map<string, AtomicPluginState> | undefined
}

function states(): Map<string, AtomicPluginState> {
  globalThis.__atomicCssModulesStates ??= new Map()
  return globalThis.__atomicCssModulesStates
}

export interface LoaderOptions {
  stateId: string
  /** False on Rspack, which does not expose the extracted CSS for patching. */
  cacheRegistry?: boolean
}

export function registerState(state: AtomicPluginState): LoaderOptions {
  const stateId = `atomic-css-modules-${states().size}`
  states().set(stateId, state)
  return { stateId }
}

export function resolveState(options: LoaderOptions): AtomicPluginState {
  const state = states().get(options.stateId)
  if (!state) {
    throw new Error(
      'atomic-css-modules: loader used without AtomicCssModulesWebpackPlugin'
    )
  }
  return state
}
