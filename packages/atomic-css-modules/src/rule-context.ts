/**
 * Tracks which at-rule wrappers a style rule is nested in while walking a
 * lightningcss visitor in document order, and resolves nested selectors
 * (`&:hover`) against their parent style rule.
 */
import type { Rule, Selector } from 'lightningcss'
import { resolveNesting } from './selector-utils.js'
import type { AtomCondition, AtomWrapper } from './types.js'

export interface RuleVisitContext {
  condition: AtomCondition
  /**
   * Resolved selectors for this style rule (every member of a grouped list),
   * or the single nesting parent for nested-declarations.
   */
  selectors: Selector[]
  /** First resolved selector; same as `selectors[0]` when present. */
  selector: Selector
  /** True when this rule is nested inside another style rule. */
  nested: boolean
  /** Resolve a selector against the first nesting parent (if any). */
  resolve(selector: Selector): Selector
  /** Resolve a selector against every nesting parent. */
  resolveAll(selector: Selector): Selector[]
}

function wrapperFor(rule: Rule): AtomWrapper | null {
  if (rule.type === 'media') return { kind: 'media', query: rule.value.query }
  if (rule.type === 'container') {
    return {
      kind: 'container',
      name: rule.value.name ?? null,
      condition: rule.value.condition ?? null,
    }
  }
  if (rule.type === 'supports') {
    return { kind: 'supports', condition: rule.value.condition }
  }
  if (rule.type === 'layer-block') {
    return { kind: 'layer', name: rule.value.name ?? null }
  }
  if (rule.type === 'scope') {
    return {
      kind: 'scope',
      scopeStart: rule.value.scopeStart ?? null,
      scopeEnd: rule.value.scopeEnd ?? null,
    }
  }
  if (rule.type === 'starting-style') return { kind: 'starting-style' }
  return null
}

export class RuleContextTracker {
  private readonly wrappers: AtomWrapper[] = []
  /** Stack of parent selector groups (one entry per enclosing style rule). */
  private readonly selectorGroups: Selector[][] = []

  /**
   * Call when entering any rule. Returns context for style rules and
   * nested-declarations, or null for every other rule type.
   */
  enter(rule: Rule): RuleVisitContext | null {
    const wrapper = wrapperFor(rule)
    if (wrapper) {
      this.wrappers.push(wrapper)
      return null
    }

    const condition = [...this.wrappers]
    const parents = this.selectorGroups[this.selectorGroups.length - 1]
    const resolveAll = (selector: Selector): Selector[] => {
      if (!parents || parents.length === 0) return [selector]
      return parents.map((parent) => resolveNesting(parent, selector))
    }
    const resolve = (selector: Selector): Selector =>
      resolveAll(selector)[0] ?? selector

    if (rule.type === 'nested-declarations') {
      if (!parents || parents.length === 0) return null
      return {
        condition,
        selectors: parents,
        selector: parents[0] ?? [],
        nested: true,
        resolve,
        resolveAll,
      }
    }

    if (rule.type !== 'style') return null

    const resolved = rule.value.selectors.flatMap((selector) =>
      resolveAll(selector)
    )
    this.selectorGroups.push(resolved)
    return {
      condition,
      selectors: resolved,
      selector: resolved[0] ?? [],
      nested: parents !== undefined,
      resolve,
      resolveAll,
    }
  }

  /** Call when exiting any rule (from a `RuleExit` visitor). */
  exit(rule: Rule): void {
    if (wrapperFor(rule)) {
      this.wrappers.pop()
      return
    }
    if (rule.type === 'style') this.selectorGroups.pop()
  }
}
