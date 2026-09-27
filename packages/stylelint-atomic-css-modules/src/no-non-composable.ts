import {
  SKIP_REASON_LEGEND,
  classifyEligibleGroup,
  findShorthandConflicts,
  parseSelectorList,
  resolveNesting,
  skipReasonForSelectors,
  type SkipReason,
} from '@zslabs/atomic-css-modules'
import type { AtRule, Comment, Container, Node, Rule } from 'postcss'
import stylelint from 'stylelint'

const { createPlugin, utils } = stylelint
const { report, ruleMessages, validateOptions } = utils

type ParsedSelector = ReturnType<typeof parseSelectorList>[number]

export const ruleName = 'atomic-css-modules/no-non-composable'

export const messages = ruleMessages(ruleName, {
  rejectedSelector: (selector: string, reason: SkipReason) =>
    `Selector "${selector}" cannot be composed (${reason}: ${SKIP_REASON_LEGEND[reason]})`,
  rejectedDeclaration: (property: string) =>
    `Declaration "${property}" cannot be composed (shorthand-conflict: ${SKIP_REASON_LEGEND['shorthand-conflict']})`,
})

export const meta = {
  url: 'https://github.com/zslabs/atomic-css-modules/tree/main/packages/stylelint-atomic-css-modules#readme',
}

export interface NoNonComposableOptions {
  selectors?: boolean
  declarations?: boolean
}

const SKIP_BODY = /^atomic:\s*skip$/i

function isSkipComment(node: Comment): boolean {
  return SKIP_BODY.test(node.text.trim())
}

function hasAtomicSkipComment(rule: Rule): boolean {
  const previous = rule.prev()
  if (previous?.type === 'comment' && isSkipComment(previous)) return true

  const first = rule.nodes?.[0]
  if (first?.type === 'comment' && isSkipComment(first)) return true

  return false
}

function isAtRule(node: Node): node is AtRule {
  return node.type === 'atrule'
}

function isInsideKeyframes(node: Node): boolean {
  let current: Node | undefined | null = node.parent
  while (current) {
    if (isAtRule(current) && /keyframes$/i.test(current.name)) {
      return true
    }
    current = current.parent
  }
  return false
}

function resolveAgainstParents(
  selectors: readonly ParsedSelector[],
  parents: readonly ParsedSelector[]
): ParsedSelector[] {
  if (parents.length === 0) return [...selectors]
  return selectors.flatMap((selector) =>
    parents.map((parent) => resolveNesting(parent, selector))
  )
}

function directDeclarationProps(rule: Rule): string[] {
  const properties: string[] = []
  for (const child of rule.nodes ?? []) {
    if (child.type === 'decl') properties.push(child.prop)
  }
  return properties
}

function walkContainer(
  container: Container,
  parents: readonly ParsedSelector[],
  visit: (rule: Rule, resolved: readonly ParsedSelector[]) => void
): void {
  container.each((node) => {
    if (node.type === 'rule') {
      const raw = parseSelectorList(node.selector)
      const resolved = resolveAgainstParents(raw, parents)
      visit(node, resolved)
      walkContainer(node, resolved, visit)
      return
    }
    if (node.type === 'atrule') {
      walkContainer(node, parents, visit)
    }
  })
}

const ruleFunction = (
  primary: unknown,
  secondaryOptions?: NoNonComposableOptions
) => {
  return (root: Container, result: stylelint.PostcssResult) => {
    const validOptions = validateOptions(
      result,
      ruleName,
      {
        actual: primary,
        possible: [true],
      },
      {
        actual: secondaryOptions,
        possible: {
          selectors: [true, false],
          declarations: [true, false],
        },
        optional: true,
      }
    )
    if (!validOptions) return
    if (primary !== true) return

    const checkSelectors = secondaryOptions?.selectors !== false
    const checkDeclarations = secondaryOptions?.declarations !== false

    walkContainer(root, [], (rule, resolved) => {
      if (isInsideKeyframes(rule)) return
      if (hasAtomicSkipComment(rule)) return

      const resolvedList = [...resolved]
      const classifications = classifyEligibleGroup(resolvedList)

      if (checkSelectors && !classifications) {
        const reason = skipReasonForSelectors(resolvedList)
        report({
          result,
          ruleName,
          message: messages.rejectedSelector(rule.selector, reason),
          node: rule,
          word: rule.selector,
        })
      }

      if (!checkDeclarations) return

      const properties = directDeclarationProps(rule)
      if (properties.length === 0) return

      const conflicts = findShorthandConflicts(properties)
      if (conflicts.size === 0) return

      for (const child of rule.nodes ?? []) {
        if (child.type !== 'decl') continue
        if (!conflicts.has(child.prop)) continue
        report({
          result,
          ruleName,
          message: messages.rejectedDeclaration(child.prop),
          node: child,
          word: child.prop,
        })
      }
    })
  }
}

ruleFunction.ruleName = ruleName
ruleFunction.messages = messages
ruleFunction.meta = meta

export default createPlugin(ruleName, ruleFunction)
