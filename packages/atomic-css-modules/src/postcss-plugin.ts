/**
 * PostCSS adapter for the atomic CSS Modules pipeline.
 *
 * Next.js runs this config before Lightning CSS scopes `.module.css`, under
 * both Turbopack and webpack. There is no Turbopack plugin API to target.
 * The registry is emitted by replacing `@atomic-css-modules` in the global
 * stylesheet the root layout imports. App Router will not load that CSS from
 * a component, so this adapter does not inject an import the way Vite and
 * webpack do.
 */
import path from 'node:path'
import type { AtRule, PluginCreator, Root } from 'postcss'
import {
  createAtomicPluginState,
  type AtomicCssModulesPluginOptions,
  type AtomicPluginState,
} from './plugin-state.js'

export interface AtomicCssModulesPostcssOptions extends AtomicCssModulesPluginOptions {
  /** Project root for include/exclude globs. Defaults to `process.cwd()`. */
  root?: string
}

const PLUGIN_NAME = 'atomic-css-modules'
const DIRECTIVE = 'atomic-css-modules'

interface PostcssParser {
  parse(css: string, opts?: { from?: string }): Root
}

interface PostcssResult {
  opts: { from?: string }
  messages: {
    type: string
    plugin?: string
    file?: string
    parent?: string
    dir?: string
    glob?: string
  }[]
}

export const atomicCssModulesPostcss: PluginCreator<
  AtomicCssModulesPostcssOptions
> = (options = {}) => {
  const state = createAtomicPluginState(options)
  const rootDir = options.root ?? process.cwd()
  state.configure({
    root: rootDir,
    debugNames: options.debugNames ?? process.env.NODE_ENV !== 'production',
    sourceMap: false,
  })
  let reported = false

  return {
    postcssPlugin: PLUGIN_NAME,
    async Once(root, helper) {
      const { result, postcss } = helper
      const from = result.opts.from
      if (!from) return
      const filePath = path.resolve(from)
      const directives = findDirectives(root)
      const matching = state.isMatchingCssModule(filePath)
      if (directives.length === 0 && !matching) return

      const report = await state.syncFromDisk()
      if (!reported) {
        reported = true
        console.info(state.formatReport(report))
      }

      if (directives.length > 0) {
        replaceDirective(directives, postcss, state.registryCss, from)
        pushDependencies(result, state, from)
        return
      }

      const input = root.source?.input.css
      if (input === undefined) return
      const rewritten = state.rewriteCssModule(filePath, input)
      if (!rewritten) return
      replaceRoot(root, postcss, rewritten.code, from)
    },
  }
}

atomicCssModulesPostcss.postcss = true

export default atomicCssModulesPostcss

function findDirectives(root: Root): AtRule[] {
  const found: AtRule[] = []
  root.walkAtRules(DIRECTIVE, (atRule) => {
    found.push(atRule)
  })
  return found
}

function replaceDirective(
  directives: readonly AtRule[],
  postcss: PostcssParser,
  css: string,
  from: string
): void {
  const [first, ...rest] = directives
  if (!first) return
  for (const extra of rest) extra.remove()
  const nodes = parsedNodes(postcss, css, from)
  if (nodes.length === 0) {
    first.remove()
    return
  }
  first.replaceWith(...nodes)
}

function replaceRoot(
  root: Root,
  postcss: PostcssParser,
  css: string,
  from: string
): void {
  const nodes = parsedNodes(postcss, css, from)
  root.removeAll()
  if (nodes.length > 0) root.append(...nodes)
}

function parsedNodes(
  postcss: PostcssParser,
  css: string,
  from: string
): Root['nodes'] {
  const parsed = postcss.parse(css, { from })
  return parsed.nodes === undefined ? [] : [...parsed.nodes]
}

function pushDependencies(
  result: PostcssResult,
  state: AtomicPluginState,
  from: string
): void {
  for (const filePath of state.cssModulePaths()) {
    result.messages.push({
      type: 'dependency',
      plugin: PLUGIN_NAME,
      file: filePath,
      parent: from,
    })
  }
  for (const pattern of state.includePatterns) {
    result.messages.push({
      type: 'dir-dependency',
      plugin: PLUGIN_NAME,
      dir: state.root,
      glob: pattern,
      parent: from,
    })
  }
}
