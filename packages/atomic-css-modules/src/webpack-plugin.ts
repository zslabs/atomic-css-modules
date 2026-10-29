/**
 * webpack 5 / Rspack plugin wrapper around the core atomic CSS Modules
 * pipeline, for setups that process CSS with css-loader.
 *
 * The registry is a stub CSS file shipped with the package. A loader fills
 * it from the shared scan cache on every compilation, and a JS loader imports
 * it from any module that loads a CSS module. Because its name is not
 * `*.module.css`, css-loader treats it as global CSS, so atom class names
 * stay unscoped.
 */
import { realpath } from 'node:fs/promises'
import {
  createAtomicPluginState,
  isJsModule,
  type AtomicCssModulesPluginOptions,
  type AtomicPluginState,
} from './plugin-state.js'
import {
  INJECT_LOADER_PATH,
  REGISTRY_LOADER_PATH,
  REGISTRY_STUB_PATH,
  REWRITE_LOADER_PATH,
} from './webpack/paths.js'
import { registerState } from './webpack/state-registry.js'

export type { AtomicCssModulesPluginOptions } from './plugin-state.js'
export { REGISTRY_STUB_PATH } from './webpack/paths.js'

interface AsyncHook {
  tapPromise(name: string, fn: () => Promise<void>): void
}

/** The subset of the webpack/Rspack compiler the plugin uses. */
export interface CompilerLike {
  context: string
  watchMode?: boolean
  options: { mode?: string; module: { rules: unknown[] } }
  hooks: { beforeRun: AsyncHook; watchRun: AsyncHook }
  getInfrastructureLogger(name: string): { info(message: string): void }
}

const PLUGIN_NAME = 'atomic-css-modules'

export class AtomicCssModulesWebpackPlugin {
  private readonly options: AtomicCssModulesPluginOptions
  private readonly state: AtomicPluginState

  constructor(options: AtomicCssModulesPluginOptions = {}) {
    this.options = options
    this.state = createAtomicPluginState(options)
  }

  apply(compiler: CompilerLike): void {
    const state = this.state
    const loaderOptions = registerState(state)
    let reported = false

    compiler.options.module.rules.push(
      {
        enforce: 'pre',
        test: (filePath: string) => state.isMatchingCssModule(filePath),
        use: [{ loader: REWRITE_LOADER_PATH, options: loaderOptions }],
      },
      {
        enforce: 'pre',
        test: (filePath: string) => filePath === REGISTRY_STUB_PATH,
        use: [{ loader: REGISTRY_LOADER_PATH, options: loaderOptions }],
      },
      {
        enforce: 'pre',
        test: isJsModule,
        exclude: /node_modules/,
        use: [{ loader: INJECT_LOADER_PATH }],
      }
    )

    const sync = async (): Promise<void> => {
      state.configure({
        // Resolved module paths are realpaths; a symlinked context would not match.
        root: await realpath(compiler.context),
        debugNames:
          this.options.debugNames ??
          (compiler.options.mode === 'development' ||
            compiler.watchMode === true),
      })
      const report = await state.syncFromDisk()
      if (!reported) {
        reported = true
        compiler
          .getInfrastructureLogger(PLUGIN_NAME)
          .info(state.formatReport(report))
      }
    }

    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, sync)
    compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, sync)
  }
}
