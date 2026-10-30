import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rspack } from '@rspack/core'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { afterEach, describe, expect, it } from 'vitest'
import webpack from 'webpack'
import {
  AtomicCssModulesWebpackPlugin,
  type AtomicCssModulesPluginOptions,
} from '../dist/webpack-plugin.js'

const require = createRequire(import.meta.url)
const CSS_LOADER = require.resolve('css-loader')
const CSS_LOADER_OPTIONS = {
  modules: { auto: true, namedExport: false, exportLocalsConvention: 'as-is' },
}

const temps: string[] = []

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

type Mode = 'development' | 'production'

interface BuildSettings {
  dir: string
  mode: Mode
  plugin: AtomicCssModulesPluginOptions
}

interface Watcher {
  nextBuild(): Promise<void>
  close(): Promise<void>
}

interface StatsLike {
  hasErrors(): boolean
  toString(options: 'errors-only'): string
}

interface CompilerLike {
  run(callback: (error: Error | null, stats?: StatsLike) => void): void
  watch(
    options: { aggregateTimeout: number; poll: number; ignored: RegExp },
    callback: (error: Error | null, stats?: StatsLike) => void
  ): { close(callback: () => void): void } | undefined
}

interface Bundler {
  name: string
  createCompiler(settings: BuildSettings): CompilerLike
}

interface BaseConfig {
  mode: Mode
  context: string
  entry: string
  devtool: false
  output: { path: string; library: { type: 'commonjs2' } }
  optimization: { minimize: false }
  infrastructureLogging: { level: 'none' }
}

function baseConfig(settings: BuildSettings): BaseConfig {
  return {
    mode: settings.mode,
    context: settings.dir,
    entry: './src/index.js',
    devtool: false,
    output: {
      path: path.join(settings.dir, 'dist'),
      library: { type: 'commonjs2' },
    },
    optimization: { minimize: false },
    infrastructureLogging: { level: 'none' },
  }
}

const bundlers: Bundler[] = [
  {
    name: 'webpack',
    createCompiler(settings) {
      return webpack({
        ...baseConfig(settings),
        module: {
          rules: [
            {
              test: /\.css$/,
              use: [
                MiniCssExtractPlugin.loader,
                { loader: CSS_LOADER, options: CSS_LOADER_OPTIONS },
              ],
            },
          ],
        },
        plugins: [
          new MiniCssExtractPlugin(),
          new AtomicCssModulesWebpackPlugin(settings.plugin),
        ],
      })
    },
  },
  {
    name: 'rspack',
    createCompiler(settings) {
      return rspack({
        ...baseConfig(settings),
        module: {
          rules: [
            {
              test: /\.css$/,
              use: [
                rspack.CssExtractRspackPlugin.loader,
                { loader: CSS_LOADER, options: CSS_LOADER_OPTIONS },
              ],
            },
          ],
        },
        plugins: [
          new rspack.CssExtractRspackPlugin(),
          new AtomicCssModulesWebpackPlugin(settings.plugin),
        ],
      })
    },
  },
  {
    name: 'rspack native CSS',
    createCompiler(settings) {
      return rspack({
        ...baseConfig(settings),
        experiments: { css: true },
        module: {
          parser: { 'css/auto': { namedExports: false } },
          rules: [{ test: /\.css$/, type: 'css/auto' }],
        },
        plugins: [new AtomicCssModulesWebpackPlugin(settings.plugin)],
      })
    },
  },
]

function assertStats(error: Error | null, stats?: StatsLike): void {
  if (error) throw error
  if (stats?.hasErrors()) throw new Error(stats.toString('errors-only'))
}

function runOnce(compiler: CompilerLike): Promise<void> {
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      try {
        assertStats(error, stats)
        resolve()
      } catch (failure) {
        reject(failure)
      }
    })
  })
}

function startWatching(compiler: CompilerLike): Watcher {
  const results: Array<Promise<void>> = []
  const waiters: Array<{
    resolve: () => void
    reject: (error: unknown) => void
  }> = []
  const watchOptions = {
    aggregateTimeout: 20,
    poll: 50,
    ignored: /node_modules/,
  }
  const watching = compiler.watch(watchOptions, (error, stats) => {
    const settle = (resolve: () => void, reject: (e: unknown) => void) => {
      try {
        assertStats(error, stats)
        resolve()
      } catch (failure) {
        reject(failure)
      }
    }
    const waiter = waiters.shift()
    if (waiter) settle(waiter.resolve, waiter.reject)
    else results.push(new Promise(settle))
  })
  return {
    nextBuild() {
      const ready = results.shift()
      if (ready) return ready
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
    },
    close() {
      return new Promise((resolve) => {
        if (watching) watching.close(() => resolve())
        else resolve()
      })
    },
  }
}

async function setupProject(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'atomic-webpack-'))
  temps.push(dir)
  await mkdir(path.join(dir, 'src'))
  await Promise.all(
    Object.entries(files).map(([name, code]) =>
      writeFile(path.join(dir, 'src', name), code, 'utf8')
    )
  )
  return dir
}

function readOutput(dir: string, file: string): Promise<string> {
  return readFile(path.join(dir, 'dist', file), 'utf8')
}

/** Class lists exported by the fixture entry, split into individual names. */
function loadClasses(dir: string): string[][] {
  const bundlePath = path.join(dir, 'dist', 'main.js')
  delete require.cache[bundlePath]
  const bundle: unknown = require(bundlePath)
  if (
    typeof bundle !== 'object' ||
    bundle === null ||
    !('classes' in bundle) ||
    !Array.isArray(bundle.classes)
  ) {
    throw new Error('expected the bundle to export a classes array')
  }
  return bundle.classes.map((value: unknown) => String(value).split(' '))
}

const SHARED_FIXTURE = {
  'index.js': [
    'import a from "./a.module.css"',
    'import b from "./b.module.css"',
    'export const classes = [a.button, b.card]',
    '',
  ].join('\n'),
  'a.module.css': '.button { color: red; padding: 4px; }\n',
  'b.module.css': '.card { color: red; margin: 0; }\n',
}

describe.each(bundlers)('$name plugin', (bundler) => {
  it('extracts shared declarations into a single global registry', async () => {
    const dir = await setupProject(SHARED_FIXTURE)
    await runOnce(
      bundler.createCompiler({ dir, mode: 'production', plugin: {} })
    )

    const css = await readOutput(dir, 'main.css')
    expect(css.match(/color:\s*red/g)).toHaveLength(1)

    const [buttonClasses = [], cardClasses = []] = loadClasses(dir)
    const shared = buttonClasses.filter((name) => cardClasses.includes(name))
    expect(shared).toHaveLength(1)
    const [atom] = shared
    expect(css).toMatch(new RegExp(`^\\.${atom}\\s*\\{\\s*color:\\s*red`))
  })

  it('uses readable atom names in development', async () => {
    const dir = await setupProject(SHARED_FIXTURE)
    await runOnce(
      bundler.createCompiler({ dir, mode: 'development', plugin: {} })
    )
    expect(await readOutput(dir, 'main.css')).toMatch(
      /\.color-red-[a-z0-9]+\s*\{/
    )
  })

  it('honors exclude and preprocess', async () => {
    const dir = await setupProject({
      'index.js': [
        'import a from "./a.module.css"',
        'import skip from "./skip.module.css"',
        'export const classes = [a.button, skip.raw]',
        '',
      ].join('\n'),
      'a.module.css': '.button { color: TOKEN_RED; }\n',
      'skip.module.css': '.raw { font-size: 31px; }\n',
    })
    await runOnce(
      bundler.createCompiler({
        dir,
        mode: 'development',
        plugin: {
          exclude: ['**/skip.module.css'],
          preprocess: (code) => code.replace('TOKEN_RED', 'red'),
        },
      })
    )

    const css = await readOutput(dir, 'main.css')
    expect(css).toMatch(/\.color-red-[a-z0-9]+\s*\{/)
    expect(css).not.toContain('TOKEN_RED')
    expect(css).not.toMatch(/font-size-31px/)
    expect(css).toMatch(/font-size:\s*31px/)
  })

  it('rebuilds the registry in watch mode as modules change', async () => {
    const dir = await setupProject(SHARED_FIXTURE)
    const watcher = startWatching(
      bundler.createCompiler({ dir, mode: 'development', plugin: {} })
    )
    try {
      await watcher.nextBuild()
      expect(await readOutput(dir, 'main.css')).toMatch(/padding:\s*4px/)

      await writeFile(
        path.join(dir, 'src', 'a.module.css'),
        '.button { color: red; padding: 9px; }\n'
      )
      await watcher.nextBuild()
      const edited = await readOutput(dir, 'main.css')
      expect(edited).toMatch(/padding:\s*9px/)
      expect(edited).not.toMatch(/padding:\s*4px/)

      await writeFile(
        path.join(dir, 'src', 'c.module.css'),
        '.extra { font-size: 20px; }\n'
      )
      await writeFile(
        path.join(dir, 'src', 'index.js'),
        `${SHARED_FIXTURE['index.js']}import c from "./c.module.css"\nexport const extra = c.extra\n`
      )
      await watcher.nextBuild()
      expect(await readOutput(dir, 'main.css')).toMatch(
        /\.font-size-20px-[a-z0-9]+/
      )

      await writeFile(
        path.join(dir, 'src', 'index.js'),
        SHARED_FIXTURE['index.js']
      )
      await rm(path.join(dir, 'src', 'c.module.css'))
      await watcher.nextBuild()
      expect(await readOutput(dir, 'main.css')).not.toMatch(/font-size/)
    } finally {
      await watcher.close()
    }
  }, 20_000)
})
