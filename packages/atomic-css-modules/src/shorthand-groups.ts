/**
 * Shorthand/longhand property groupings, derived from MDN's `mdn-data`
 * dataset (the same data browsers and MDN docs are generated from) rather
 * than a hand-maintained list. If a rule declares a shorthand alongside one
 * of its own longhands, neither is safe to atomize (see GUIDE.md "Shorthand
 * and longhand").
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface MdnCssProperty {
  /** Either a single value description or a list of constituent longhand properties. */
  initial?: string | string[]
  computed?: string | string[]
}

type MdnCssPropertiesData = Record<string, MdnCssProperty>

const cssProperties: MdnCssPropertiesData = require('mdn-data/css/properties.json')

function listedLonghands(info: MdnCssProperty): string[] {
  const names = new Set<string>()
  for (const field of [info.initial, info.computed]) {
    if (!Array.isArray(field)) continue
    for (const longhand of field) names.add(longhand)
  }
  return [...names]
}

/** Direct + nested longhands for every MDN shorthand. */
const shorthandLonghands = new Map<string, Set<string>>()

function collectLonghands(property: string, seen: Set<string>): Set<string> {
  const cached = shorthandLonghands.get(property)
  if (cached && seen.size === 0) return cached

  const info = cssProperties[property]
  if (!info) return new Set()
  const children = listedLonghands(info)
  if (children.length === 0) return new Set()

  const longhands = new Set<string>()
  for (const child of children) {
    if (seen.has(child)) continue
    seen.add(child)
    longhands.add(child)
    for (const nested of collectLonghands(child, seen)) longhands.add(nested)
  }
  return longhands
}

for (const property of Object.keys(cssProperties)) {
  const longhands = collectLonghands(property, new Set())
  if (longhands.size > 0) shorthandLonghands.set(property, longhands)
}

/** Longhands a property sets: itself if it is a longhand, else its expansion. */
function coverage(property: string): Set<string> {
  return shorthandLonghands.get(property) ?? new Set([property])
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true
  }
  return false
}

function isProperSuperset(left: Set<string>, right: Set<string>): boolean {
  if (left.size <= right.size) return false
  for (const value of right) {
    if (!left.has(value)) return false
  }
  return true
}

/**
 * Cascade-oriented property order for the atomic registry: shorthands before
 * their longhands so a later longhand atom can override when both classes are
 * on the same element. Non-nested / non-overlapping pairs compare equal (0);
 * callers should break ties (e.g. by property name).
 */
export function comparePropertyCascadeOrder(
  left: string,
  right: string
): number {
  if (left === right) return 0
  const leftCoverage = coverage(left)
  const rightCoverage = coverage(right)
  if (isProperSuperset(leftCoverage, rightCoverage)) return -1
  if (isProperSuperset(rightCoverage, leftCoverage)) return 1
  return 0
}

/**
 * Properties in one rule that are unsafe to atomize because they write the
 * same longhand: a shorthand plus one of its longhands, or two shorthands
 * that overlap (e.g. `border-width` + `border-top`). Sibling longhands
 * (`font-size` + `font-family`) do not overlap and are safe.
 */
export function findShorthandConflicts(
  properties: readonly string[]
): Set<string> {
  const conflicts = new Set<string>()

  for (let i = 0; i < properties.length; i++) {
    const left = properties[i]
    if (left === undefined) continue
    const leftCoverage = coverage(left)
    for (let j = i + 1; j < properties.length; j++) {
      const right = properties[j]
      if (right === undefined) continue
      if (!setsOverlap(leftCoverage, coverage(right))) continue
      conflicts.add(left)
      conflicts.add(right)
    }
  }

  return conflicts
}
