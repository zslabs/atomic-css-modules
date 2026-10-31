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
  /** Included so a persistent loader cache misses when atomization options change. */
  cacheVersion: string
  /** True when a preprocessor loader has already compiled this file. */
  compiled?: boolean
  /** @deprecated Registry loading is always cacheable. Kept so old options still parse. */
  cacheRegistry?: boolean
}

export function registerState(
  state: AtomicPluginState,
  stateId: string
): LoaderOptions {
  states().set(stateId, state)
  return { stateId, cacheVersion: state.cacheVersion }
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
