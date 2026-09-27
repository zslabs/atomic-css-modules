import { describe, expect, it } from 'vitest'
import {
  comparePropertyCascadeOrder,
  findShorthandConflicts,
} from '../src/shorthand-groups.js'

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

describe('comparePropertyCascadeOrder', () => {
  it('orders a shorthand before its longhand', () => {
    expect(comparePropertyCascadeOrder('margin', 'margin-left')).toBeLessThan(0)
    expect(comparePropertyCascadeOrder('margin-left', 'margin')).toBeGreaterThan(
      0
    )
  })

  it('treats unrelated properties as equal on the cascade axis', () => {
    expect(comparePropertyCascadeOrder('color', 'display')).toBe(0)
  })

  it('treats sibling longhands as equal on the cascade axis', () => {
    expect(comparePropertyCascadeOrder('font-size', 'font-family')).toBe(0)
  })

  it('does not nest overlapping shorthands that are not parent/child', () => {
    expect(comparePropertyCascadeOrder('border-width', 'border-top')).toBe(0)
  })
})
