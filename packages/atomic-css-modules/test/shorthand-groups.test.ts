import { describe, expect, it } from 'vitest'
import { findShorthandConflicts } from '../src/shorthand-groups.js'

function sorted(values: Set<string>): string[] {
  return [...values].sort()
}

describe('findShorthandConflicts', () => {
  it('flags a shorthand with one of its longhands', () => {
    expect(sorted(findShorthandConflicts(['margin', 'margin-left']))).toEqual([
      'margin',
      'margin-left',
    ])
  })

  it('does not flag sibling longhands', () => {
    expect(findShorthandConflicts(['font-size', 'font-family']).size).toBe(0)
  })

  it('flags overlapping shorthands that share a longhand', () => {
    expect(
      sorted(findShorthandConflicts(['border-width', 'border-top']))
    ).toEqual(['border-top', 'border-width'])
  })

  it('leaves unrelated properties alone when a pair conflicts', () => {
    const conflicts = findShorthandConflicts(['margin', 'margin-left', 'color'])
    expect(conflicts.has('color')).toBe(false)
    expect(conflicts.has('margin')).toBe(true)
  })
})
