/**
 * A declaration used by one class saves no CSS and still adds a class name
 * to the JS exports. Those stay on the local class.
 */
import { rebuildAtomLists } from './override-conflicts.js'
import { selectorKey } from './selector-utils.js'
import type { Atom, ScanFileResult } from './types.js'

export function applyMinOccurrences(
  files: readonly ScanFileResult[],
  atoms: Map<string, Atom>,
  minOccurrences: number
): void {
  if (minOccurrences <= 1) return
  const users = new Map<string, Set<string>>()
  for (const file of files) {
    for (const rule of file.rules) {
      const classId = `${file.filePath}\0${selectorKey(rule.selector)}`
      for (const decision of rule.decisions) {
        if (decision.action !== 'hoist') continue
        const set = users.get(decision.atomKey) ?? new Set<string>()
        set.add(classId)
        users.set(decision.atomKey, set)
      }
    }
  }

  const blocked = new Set<string>()
  for (const [key, set] of users) {
    if (set.size < minOccurrences) blocked.add(key)
  }
  if (blocked.size === 0) return

  for (const file of files) {
    for (const rule of file.rules) {
      let changed = false
      for (const [index, decision] of rule.decisions.entries()) {
        if (decision.action !== 'hoist' || !blocked.has(decision.atomKey)) {
          continue
        }
        const atom = atoms.get(decision.atomKey)
        rule.decisions[index] = {
          action: 'keep',
          important: atom?.key.important ?? false,
        }
        changed = true
      }
      if (changed) rebuildAtomLists(rule, atoms)
    }
  }
}

export function pruneUnreferencedAtoms(
  atoms: Map<string, Atom>,
  files: readonly ScanFileResult[]
): void {
  const used = new Set<string>()
  for (const file of files) {
    for (const rule of file.rules) {
      for (const decision of rule.decisions) {
        if (decision.action === 'hoist') used.add(decision.atomKey)
      }
    }
  }
  for (const key of [...atoms.keys()]) {
    if (!used.has(key)) atoms.delete(key)
  }
}
