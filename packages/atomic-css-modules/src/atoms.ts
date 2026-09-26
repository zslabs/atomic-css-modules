/**
 * Atom map helpers: global class-name uniqueness and keeping scan rule
 * hashes aligned with the map after remaps.
 */
import { allocateUniqueClassName } from './hash.js'
import type { Atom, ScanFileResult } from './types.js'

/**
 * Ensures every atom has a distinct class name. First-seen key keeps its
 * name; later keys that collide are reallocated (`-2`, `-3`, …).
 */
export function ensureUniqueAtomNames(atoms: Map<string, Atom>): void {
  const taken = new Set<string>()
  for (const atom of atoms.values()) {
    const unique = allocateUniqueClassName(taken, atom.className)
    taken.add(unique)
    atom.hash = unique
    atom.className = unique
  }
}

/** Rebuilds `atomHashes` from `atomKeys` using the (possibly remapped) atom map. */
export function syncScanAtomHashes(
  scanFiles: readonly ScanFileResult[],
  atoms: Map<string, Atom>
): void {
  for (const scanFile of scanFiles) {
    for (const rule of scanFile.rules) {
      rule.atomHashes = rule.atomKeys.map((keyString) => {
        const atom = atoms.get(keyString)
        if (!atom) {
          throw new Error(`Missing atom for key while syncing hashes`)
        }
        return atom.hash
      })
    }
  }
}
