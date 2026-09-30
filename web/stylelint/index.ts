import type { AtRule, Node, Root } from 'postcss'
import valueParser from 'postcss-value-parser'
import stylelint from 'stylelint'
import {
  expandTokenTextCss,
  listTokenPaths,
  listTokenTextKeys,
  resolveTokenPath,
} from '../src/css/token-visitor.ts'
import { tokens } from '../src/css/tokens.ts'
import { suggestTokenPath } from './suggest-token.ts'

type ValueNode = ReturnType<typeof valueParser>['nodes'][number]
type FunctionNode = Extract<ValueNode, { type: 'function' }>

const tokenPaths = listTokenPaths(tokens).map((entry) => entry.path)
const tokenTextKeys = listTokenTextKeys(tokens)

const { createPlugin, utils } = stylelint
const { report, ruleMessages, validateOptions } = utils

export const ruleName = 'design-token/no-unknown'

export const messages = ruleMessages(ruleName, {
  unknownToken: (path: string) => `Unknown design token: "${path}"`,
  suggestedToken: (path: string, suggestion: string) =>
    `Unknown design token: "${path}". Did you mean "${suggestion}"?`,
  malformedToken: () =>
    "token() expects exactly one string argument, e.g. token('color.slate.1')",
  tokenText: (message: string) => message,
  malformedTokenText: () =>
    "@token-text expects an ident or string, e.g. @token-text base; or @token-text '4xl';",
})

const meta = {
  url: 'https://github.com/zslabs/atomic-css-modules/tree/main/web/stylelint',
}

function meaningfulNodes(nodes: ValueNode[]) {
  return nodes.filter(
    (node) => node.type !== 'space' && node.type !== 'comment'
  )
}

function stringArgument(fn: FunctionNode): string | undefined {
  const args = meaningfulNodes(fn.nodes)
  if (args.length !== 1) return undefined
  const arg = args[0]
  if (arg === undefined || arg.type !== 'string') return undefined
  return arg.value
}

function tokenTextKey(params: string): string | undefined {
  const nodes = meaningfulNodes(valueParser(params).nodes)
  if (nodes.length !== 1) return undefined
  const node = nodes[0]
  if (node === undefined) return undefined
  if (node.type === 'string') {
    return node.value.length > 0 ? node.value : undefined
  }
  if (node.type === 'word' && valueParser.unit(node.value) === false) {
    return node.value
  }
  return undefined
}

function reportOn(
  result: stylelint.PostcssResult,
  node: Node,
  message: string,
  word?: string
) {
  if (word === undefined || word.length === 0) {
    report({ result, ruleName, message, node })
    return
  }
  report({ result, ruleName, message, node, word })
}

function checkTokenCalls(
  value: string,
  node: Node,
  result: stylelint.PostcssResult
) {
  valueParser(value).walk((parsed) => {
    if (parsed.type !== 'function' || parsed.value !== 'token') return

    const word = value.slice(parsed.sourceIndex, parsed.sourceEndIndex)
    const path = stringArgument(parsed)
    if (path === undefined) {
      reportOn(result, node, messages.malformedToken(), word)
      return
    }
    if (resolveTokenPath(tokens, path) === undefined) {
      const suggestion = suggestTokenPath(path, tokenPaths)
      const message =
        suggestion === undefined
          ? messages.unknownToken(path)
          : messages.suggestedToken(path, suggestion)
      reportOn(result, node, message, word)
    }
  })
}

function checkTokenText(atRule: AtRule, result: stylelint.PostcssResult) {
  if (atRule.name.toLowerCase() !== 'token-text') return

  const word = atRule.params.trim()
  const key = tokenTextKey(atRule.params)
  if (key === undefined) {
    reportOn(result, atRule, messages.malformedTokenText(), word)
    return
  }

  try {
    expandTokenTextCss(tokens, key)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    const suggestion = suggestTokenPath(key, tokenTextKeys)
    const detail =
      suggestion === undefined
        ? error.message
        : `${error.message}. Did you mean "${suggestion}"?`
    reportOn(result, atRule, messages.tokenText(detail), word)
  }
}

const ruleFunction = (primary: unknown) => {
  return (root: Root, result: stylelint.PostcssResult) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    })
    if (!validOptions) return

    root.walkDecls((decl) => {
      checkTokenCalls(decl.value, decl, result)
    })
    root.walkAtRules((atRule) => {
      checkTokenText(atRule, result)
      checkTokenCalls(atRule.params, atRule, result)
    })
  }
}

ruleFunction.ruleName = ruleName
ruleFunction.messages = messages
ruleFunction.meta = meta

export default createPlugin(ruleName, ruleFunction)
