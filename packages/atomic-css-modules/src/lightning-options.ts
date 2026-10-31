/**
 * Shared lightningcss transform settings. `customMedia` has to be on or
 * `@custom-media` is parsed as an unknown at-rule. Prelude strings are what
 * the JS API accepts; the published types describe the parsed AST instead.
 */
import type { CustomAtRules, TransformOptions } from 'lightningcss'
import type { AtomicCustomAtRules } from './types.js'

export function userStylesheetOptions(
  customAtRules?: AtomicCustomAtRules
): Pick<TransformOptions<CustomAtRules>, 'drafts' | 'customAtRules'> {
  return {
    drafts: { customMedia: true },
    ...(customAtRules !== undefined && isLightningCustomAtRules(customAtRules)
      ? { customAtRules }
      : {}),
  }
}

function isLightningCustomAtRules(
  value: AtomicCustomAtRules
): value is CustomAtRules {
  return typeof value === 'object'
}
