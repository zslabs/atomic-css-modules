/**
 * Two classes in one file that write the same longhand must keep source
 * order. Registry sort would otherwise pick the winner.
 */
import { printSelectorList } from './selector-utils.js'
import { propertiesOverlap } from './shorthand-groups.js'
import type {
  Atom,
  AtomizationSkip,
  ConflictMode,
  ScanFileResult,
  ScanRuleInfo,
} from './types.js'

export class OverrideConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OverrideConflictError'
  }
}

export function isOverrideConflictError(error: unknown): boolean {
  return error instanceof Error && error.name === 'OverrideConflictError'
}

interface Candidate {
  ruleIndex: number
  decisionIndex: number
  atom: Atom
  selectorLabel: string
}

export function applyOverrideConflicts(
  file: ScanFileResult,
  atoms: Map<string, Atom>,
  skips: AtomizationSkip[],
  mode: ConflictMode
): void {
  if (mode === 'allow') return
  const candidates = collectCandidates(file, atoms)
  const conflicted = new Set<number>()
  let described = ''
  for (let left = 0; left < candidates.length; left++) {
    const a = candidates[left]
    if (!a) continue
    for (let right = left + 1; right < candidates.length; right++) {
      const b = candidates[right]
      if (!b || !isOverrideConflict(a.atom, b.atom)) continue
      conflicted.add(left)
      conflicted.add(right)
      if (described === '') {
        described = `${file.filePath}: ${a.selectorLabel} and ${b.selectorLabel} both set ${a.atom.key.property}`
      }
    }
  }
  if (conflicted.size === 0) return
  if (mode === 'error') throw new OverrideConflictError(described)

  for (const index of conflicted) {
    const candidate = candidates[index]
    const rule = file.rules[candidate?.ruleIndex ?? -1]
    if (!candidate || !rule) continue
    rule.decisions[candidate.decisionIndex] = {
      action: 'keep',
      important: candidate.atom.key.important,
    }
    skips.push({
      filePath: file.filePath,
      selector: candidate.selectorLabel,
      reason: 'override-conflict',
    })
  }
  for (const rule of file.rules) rebuildAtomLists(rule, atoms)
}

export function rebuildAtomLists(
  rule: ScanRuleInfo,
  atoms: Map<string, Atom>
): void {
  const atomKeys: string[] = []
  const atomHashes: string[] = []
  for (const decision of rule.decisions) {
    if (decision.action !== 'hoist') continue
    const atom = atoms.get(decision.atomKey)
    if (!atom) continue
    atomKeys.push(decision.atomKey)
    atomHashes.push(atom.hash)
  }
  rule.atomKeys = atomKeys
  rule.atomHashes = atomHashes
}

function collectCandidates(
  file: ScanFileResult,
  atoms: Map<string, Atom>
): Candidate[] {
  const candidates: Candidate[] = []
  for (const [ruleIndex, rule] of file.rules.entries()) {
    if (!rule.eligible) continue
    const selectorLabel = printSelectorList([rule.selector])
    for (const [decisionIndex, decision] of rule.decisions.entries()) {
      if (decision.action !== 'hoist') continue
      const atom = atoms.get(decision.atomKey)
      if (!atom) continue
      candidates.push({ ruleIndex, decisionIndex, atom, selectorLabel })
    }
  }
  return candidates
}

function isOverrideConflict(left: Atom, right: Atom): boolean {
  if (left.key.important !== right.key.important) return false
  if (JSON.stringify(left.key.pseudo) !== JSON.stringify(right.key.pseudo)) {
    return false
  }
  if (
    JSON.stringify(left.key.condition) !== JSON.stringify(right.key.condition)
  ) {
    return false
  }
  if (!propertiesOverlap(left.key.property, right.key.property)) return false
  return !(
    left.key.property === right.key.property &&
    left.key.valueFingerprint === right.key.valueFingerprint
  )
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
