/**
 * The subset of the webpack/Rspack loader context the loaders use, so the
 * package does not depend on either bundler's types.
 */
import type { LoaderOptions } from './state-registry.js'

export interface LoaderContext {
  resourcePath: string
  getOptions(): LoaderOptions
  cacheable(flag?: boolean): void
  addDependency(file: string): void
  callback(error: Error | null, content: string, sourceMap?: unknown): void
  _module?: object
}
