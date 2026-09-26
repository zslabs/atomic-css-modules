/**
 * Rules for deciding whether a StyleRule's selector is eligible for
 * atomization, per GUIDE.md "What selectors are supported".
 */
import type { Selector, SelectorComponent, SelectorList } from 'lightningcss'
import { transform } from 'lightningcss'
import type { AtomPseudo, SkipReason } from './types.js'

/**
 * Fields on a pseudo-class/element component that indicate it takes an
 * argument (a nested selector, an nth-child formula, a language tag, etc).
 * Anything with one of these is a "functional" pseudo and can't be safely
 * hoisted onto a shared atomic class - see GUIDE.md "What selectors are supported".
 * Rather than hand-listing which pseudo kinds are "simple", this is derived
 * structurally from whatever lightningcss actually parsed: a pseudo with none
 * of these argument fields is simple, regardless of its kind name.
 */
/**
 * Fields that are always present on a parsed pseudo (or harmless extras
 * like a vendor prefix / custom name) and do not mean the pseudo takes
 * arguments. Anything else — `selectors`, `a`/`b`, `arguments`, etc. —
 * makes it functional and ineligible to hoist.
 *
 * Do not treat `type` as an argument field: every LightningCSS selector
 * component has `type: "pseudo-class" | "pseudo-element"`.
 */
const SIMPLE_PSEUDO_KEYS = new Set(['type', 'kind', 'vendorPrefix', 'name'])

function isPseudoComponent(
  component: SelectorComponent
): component is SelectorComponent & {
  type: 'pseudo-class' | 'pseudo-element'
  kind: string
} {
  return (
    component.type === 'pseudo-class' || component.type === 'pseudo-element'
  )
}

/** True for a pseudo-class/element with no functional arguments, e.g. `:hover` or `::before`, but not `:not(...)` or `:nth-child(...)`. */
function isSimplePseudo(
  component: SelectorComponent & {
    type: 'pseudo-class' | 'pseudo-element'
    kind: string
  }
): boolean {
  return Object.keys(component).every((key) => SIMPLE_PSEUDO_KEYS.has(key))
}

export interface SelectorClassification {
  eligible: boolean
  /** The simple trailing pseudo carried by this selector, if any. */
  pseudo: AtomPseudo | null
  /** The selector with any trailing simple pseudo removed. */
  strippedSelector: Selector
}

const NOT_ELIGIBLE: SelectorClassification = {
  eligible: false,
  pseudo: null,
  strippedSelector: [],
}

/**
 * Classifies a single (non-grouped) selector. CSS Modules only allows
 * `composes` on a single local class, so combinators, extra classes,
 * elements, and attributes are rejected. A trailing simple pseudo
 * (`.button:hover`) is still eligible; the pseudo is hoisted onto the atom.
 */
export function classifySelector(selector: Selector): SelectorClassification {
  if (selector.length === 0) return NOT_ELIGIBLE

  let classCount = 0
  let trailingPseudo: AtomPseudo | null = null

  for (let index = 0; index < selector.length; index++) {
    const component = selector[index]
    if (!component) return NOT_ELIGIBLE

    if (component.type === 'class') {
      classCount += 1
      continue
    }

    const isTrailing = index === selector.length - 1
    if (
      isTrailing &&
      isPseudoComponent(component) &&
      isSimplePseudo(component)
    ) {
      trailingPseudo = component
      continue
    }

    return NOT_ELIGIBLE
  }

  if (classCount !== 1) return NOT_ELIGIBLE

  return {
    eligible: true,
    pseudo: trailingPseudo,
    strippedSelector: trailingPseudo ? selector.slice(0, -1) : selector,
  }
}

/**
 * Resolves a nested selector against its parent. `&` is replaced with the
 * parent selector; a nested selector with no `&` is treated as a descendant.
 */
export function resolveNesting(parent: Selector, nested: Selector): Selector {
  if (nested.some((component) => component.type === 'nesting')) {
    return nested.flatMap((component) =>
      component.type === 'nesting' ? parent : [component]
    )
  }
  return [...parent, { type: 'combinator', value: 'descendant' }, ...nested]
}

/** Comma-separated selector groups (`.a, .b { ... }`) can be split when every selector is eligible. */
export function isGroupedSelectorList(selectorList: SelectorList): boolean {
  return selectorList.length > 1
}

/** Classifies every selector in a list. Returns null if any selector is ineligible. */
export function classifyEligibleGroup(
  selectors: SelectorList
): SelectorClassification[] | null {
  const items = selectors.map((selector) => classifySelector(selector))
  if (items.length === 0 || items.some((item) => !item.eligible)) return null
  return items
}

export function skipReasonForSelector(selector: Selector): SkipReason {
  let classCount = 0
  let simplePseudoCount = 0
  let hasCombinator = false
  let hasFunctionalPseudo = false

  for (const component of selector) {
    if (component.type === 'combinator') {
      hasCombinator = true
      continue
    }
    if (component.type === 'class') {
      classCount += 1
      continue
    }
    if (component.type === 'nesting') continue
    if (isPseudoComponent(component)) {
      if (isSimplePseudo(component)) simplePseudoCount += 1
      else hasFunctionalPseudo = true
    }
  }

  if (hasCombinator) return 'combinator'
  if (hasFunctionalPseudo) return 'functional-pseudo'
  if (simplePseudoCount > 1) return 'chained-pseudo'
  if (classCount > 1) return 'compound'
  return 'element'
}

export function skipReasonForSelectors(selectors: SelectorList): SkipReason {
  if (selectors.length > 1) return 'mixed-group'
  return skipReasonForSelector(selectors[0] ?? [])
}

export function printSelectorList(selectors: SelectorList): string {
  if (selectors.length === 0) return ''
  const result = transform({
    filename: 'selector.css',
    code: Buffer.from('._{color:red}'),
    visitor: {
      StyleSheetExit(sheet) {
        const rule = sheet.rules[0]
        if (rule?.type === 'style') rule.value.selectors = selectors
        return sheet
      },
    },
  })
  const css = Buffer.from(result.code).toString('utf8')
  const match = /^([^{]+)\{/.exec(css)
  return (match?.[1] ?? '')
    .trim()
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
}

export function selectorKey(selector: Selector): string {
  return JSON.stringify(selector)
}

export function selectorsEqual(a: Selector, b: Selector): boolean {
  return selectorKey(a) === selectorKey(b)
}
