import { describe, expect, it } from 'vitest'
import {
  classifyEligibleGroup,
  classifySelector,
  parseSelectorList,
  printSelectorList,
  resolveNesting,
  skipReasonForSelector,
  skipReasonForSelectors,
} from '../src/selector-utils.js'

describe('parseSelectorList', () => {
  it('parses a single local class', () => {
    const list = parseSelectorList('.card')
    expect(list).toHaveLength(1)
    expect(classifySelector(list[0] ?? []).eligible).toBe(true)
    expect(printSelectorList(list)).toBe('.card')
  })

  it('parses a trailing simple pseudo', () => {
    const list = parseSelectorList('.card:hover')
    expect(classifySelector(list[0] ?? []).eligible).toBe(true)
    expect(classifySelector(list[0] ?? []).pseudo).not.toBeNull()
  })

  it('parses combinators and reports the skip reason', () => {
    const list = parseSelectorList('.a .b')
    expect(classifySelector(list[0] ?? []).eligible).toBe(false)
    expect(skipReasonForSelector(list[0] ?? [])).toBe('combinator')
  })

  it('parses grouped selectors', () => {
    const list = parseSelectorList('.a, .b')
    expect(list).toHaveLength(2)
    expect(classifyEligibleGroup(list)).not.toBeNull()
  })

  it('parses nesting selectors', () => {
    const list = parseSelectorList('&:hover')
    expect(list[0]?.some((component) => component.type === 'nesting')).toBe(
      true
    )
  })

  it('returns an empty list for blank input', () => {
    expect(parseSelectorList('   ')).toEqual([])
  })
})

describe('resolveNesting + skip reasons', () => {
  it('treats nested descendants as combinators', () => {
    const parent = parseSelectorList('.a')[0] ?? []
    const nested = parseSelectorList('.b')[0] ?? []
    const resolved = resolveNesting(parent, nested)
    expect(skipReasonForSelector(resolved)).toBe('combinator')
  })

  it('keeps nested simple pseudos eligible', () => {
    const parent = parseSelectorList('.a')[0] ?? []
    const nested = parseSelectorList('&:hover')[0] ?? []
    const resolved = resolveNesting(parent, nested)
    expect(classifySelector(resolved).eligible).toBe(true)
  })

  it('labels mixed groups', () => {
    const list = parseSelectorList('.a, div')
    expect(classifyEligibleGroup(list)).toBeNull()
    expect(skipReasonForSelectors(list)).toBe('mixed-group')
  })
})
