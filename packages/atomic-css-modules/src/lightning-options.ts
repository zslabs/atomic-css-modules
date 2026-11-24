/**
 * Shared lightningcss transform settings. `customMedia` has to be on or
 * `@custom-media` is parsed as an unknown at-rule. Prelude strings are what
 * the JS API accepts; the published types describe the parsed AST instead.
 *
 * Statement at-rules (no body) are left unknown. lightningcss prints a
 * custom statement at-rule without its trailing semicolon, so the next
 * at-rule is read as part of the prelude. Unknown at-rules keep the
 * semicolon and stay ineligible.
 */
import type { CustomAtRules, TransformOptions } from 'lightningcss'
import type { AtomicCustomAtRule, AtomicCustomAtRules } from './types.js'

export function userStylesheetOptions(
  customAtRules?: AtomicCustomAtRules
): Pick<TransformOptions<CustomAtRules>, 'drafts' | 'customAtRules'> {
  const printable = printableCustomAtRules(customAtRules)
  return {
    drafts: { customMedia: true },
    ...(printable ? { customAtRules: printable } : {}),
  }
}

function printableCustomAtRules(
  customAtRules?: AtomicCustomAtRules
): CustomAtRules | undefined {
  if (customAtRules === undefined) return
  const kept: AtomicCustomAtRules = {}
  for (const [name, rule] of Object.entries(customAtRules)) {
    if (!hasPrintedBody(rule)) continue
    kept[name] = rule
  }
  if (Object.keys(kept).length === 0) return
  if (!isLightningCustomAtRules(kept)) return
  return kept
}

function hasPrintedBody(rule: AtomicCustomAtRule): boolean {
  return (
    rule.body === 'declaration-list' ||
    rule.body === 'rule-list' ||
    rule.body === 'style-block'
  )
}

function isLightningCustomAtRules(
  value: AtomicCustomAtRules
): value is CustomAtRules {
  return typeof value === 'object'
}
