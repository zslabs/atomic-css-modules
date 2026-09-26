/**
 * Phase 1: scan a set of CSS Modules files and collect every declaration
 * that's safe to atomize into a shared class, deduping identical
 * declarations (same property + value + !important + pseudo/at-rule
 * context) into a single {@link Atom}.
 */
import type { DeclarationBlock, Rule, Selector } from 'lightningcss'
import { transform } from 'lightningcss'
import { atomClassNameForKey, atomKeyString, buildAtomKey } from './atom-key.js'
import {
  declarationProperty,
  flattenDeclarations,
  isComposesDeclaration,
} from './declaration-utils.js'
import { allocateUniqueClassName } from './hash.js'
import { RuleContextTracker, type RuleVisitContext } from './rule-context.js'
import {
  classifyEligibleGroup,
  classifySelector,
  printSelectorList,
  skipReasonForSelector,
  skipReasonForSelectors,
} from './selector-utils.js'
import { findShorthandConflicts } from './shorthand-groups.js'
import { hasAtomicSkipComment } from './skip-comment.js'
import type {
  Atom,
  AtomizationSkip,
  DeclDecision,
  ProcessOptions,
  ScanFileResult,
  ScanResult,
  ScanRuleInfo,
  SourceFile,
} from './types.js'

function ineligibleRuleInfo(context: RuleVisitContext): ScanRuleInfo {
  return {
    eligible: false,
    condition: context.condition,
    nested: context.nested,
    pseudo: null,
    selector: [],
    atomKeys: [],
    atomHashes: [],
    decisions: [],
  }
}

function collectAtoms(
  block: DeclarationBlock | undefined,
  context: RuleVisitContext,
  classification: ReturnType<typeof classifySelector>,
  atoms: Map<string, Atom>,
  taken: Set<string>,
  debugNames: boolean
): {
  atomKeys: string[]
  atomHashes: string[]
  decisions: DeclDecision[]
  shorthandConflict: boolean
} {
  const flatDeclarations = flattenDeclarations(block)
  const shorthandConflicts = findShorthandConflicts(
    flatDeclarations
      .filter(({ declaration }) => !isComposesDeclaration(declaration))
      .map(({ declaration }) => declarationProperty(declaration))
  )

  const atomKeys: string[] = []
  const atomHashes: string[] = []
  const decisions: DeclDecision[] = []
  for (const { declaration, important } of flatDeclarations) {
    if (isComposesDeclaration(declaration)) {
      decisions.push({ action: 'composes' })
      continue
    }
    const property = declarationProperty(declaration)
    if (shorthandConflicts.has(property)) {
      decisions.push({ action: 'keep', important })
      continue
    }

    const key = buildAtomKey({
      property,
      declaration,
      important,
      pseudo: classification.pseudo,
      condition: context.condition,
    })
    const keyString = atomKeyString(key)

    let atom = atoms.get(keyString)
    if (!atom) {
      const desired = atomClassNameForKey(key, declaration, debugNames)
      const hash = allocateUniqueClassName(taken, desired)
      taken.add(hash)
      atom = { hash, className: hash, key, keyString, declaration }
      atoms.set(keyString, atom)
    }
    atomKeys.push(keyString)
    atomHashes.push(atom.hash)
    decisions.push({ action: 'hoist', atomKey: keyString })
  }
  return {
    atomKeys,
    atomHashes,
    decisions,
    shorthandConflict: shorthandConflicts.size > 0,
  }
}

function recordShorthandSkip(
  skips: AtomizationSkip[],
  filePath: string,
  selector: Selector,
  shorthandConflict: boolean
): void {
  if (!shorthandConflict) return
  skips.push({
    filePath,
    selector: printSelectorList([selector]),
    reason: 'shorthand-conflict',
  })
}

function scanStyleLikeRule(
  rule: Rule,
  context: RuleVisitContext,
  atoms: Map<string, Atom>,
  taken: Set<string>,
  rules: ScanRuleInfo[],
  skips: AtomizationSkip[],
  file: SourceFile,
  debugNames: boolean
): void {
  const loc =
    rule.type === 'style' || rule.type === 'nested-declarations'
      ? rule.value.loc
      : null
  if (loc && hasAtomicSkipComment(file.code, loc)) {
    const selectors =
      rule.type === 'style'
        ? rule.value.selectors.flatMap((selector) =>
            context.resolveAll(selector)
          )
        : context.selectors
    rules.push(ineligibleRuleInfo(context))
    skips.push({
      filePath: file.filePath,
      selector: printSelectorList(selectors),
      reason: 'skip-comment',
    })
    return
  }

  if (rule.type === 'nested-declarations') {
    let anyEligible = false
    for (const parentSelector of context.selectors) {
      const classification = classifySelector(parentSelector)
      if (!classification.eligible) {
        skips.push({
          filePath: file.filePath,
          selector: printSelectorList([parentSelector]),
          reason: skipReasonForSelector(parentSelector),
        })
        continue
      }
      anyEligible = true
      const collected = collectAtoms(
        rule.value.declarations,
        context,
        classification,
        atoms,
        taken,
        debugNames
      )
      rules.push({
        eligible: true,
        condition: context.condition,
        nested: context.nested,
        pseudo: classification.pseudo,
        selector: classification.strippedSelector,
        atomKeys: collected.atomKeys,
        atomHashes: collected.atomHashes,
        decisions: collected.decisions,
      })
      recordShorthandSkip(
        skips,
        file.filePath,
        classification.strippedSelector,
        collected.shorthandConflict
      )
    }
    if (!anyEligible) rules.push(ineligibleRuleInfo(context))
    return
  }

  if (rule.type !== 'style') return

  const resolved = rule.value.selectors.flatMap((selector) =>
    context.resolveAll(selector)
  )
  const classifications = classifyEligibleGroup(resolved)
  if (!classifications) {
    rules.push(ineligibleRuleInfo(context))
    skips.push({
      filePath: file.filePath,
      selector: printSelectorList(resolved),
      reason: skipReasonForSelectors(resolved),
    })
    return
  }

  for (const classification of classifications) {
    const collected = collectAtoms(
      rule.value.declarations,
      context,
      classification,
      atoms,
      taken,
      debugNames
    )
    rules.push({
      eligible: true,
      condition: context.condition,
      nested: context.nested,
      pseudo: classification.pseudo,
      selector: classification.strippedSelector,
      atomKeys: collected.atomKeys,
      atomHashes: collected.atomHashes,
      decisions: collected.decisions,
    })
    recordShorthandSkip(
      skips,
      file.filePath,
      classification.strippedSelector,
      collected.shorthandConflict
    )
  }
}

function scanFile(
  file: SourceFile,
  atoms: Map<string, Atom>,
  taken: Set<string>,
  skips: AtomizationSkip[],
  debugNames: boolean
): ScanFileResult {
  const tracker = new RuleContextTracker()
  const rules: ScanRuleInfo[] = []

  transform({
    filename: file.filePath,
    code: Buffer.from(file.code, 'utf8'),
    visitor: {
      Rule(rule) {
        const context = tracker.enter(rule)
        if (!context) return
        scanStyleLikeRule(
          rule,
          context,
          atoms,
          taken,
          rules,
          skips,
          file,
          debugNames
        )
      },
      RuleExit(rule) {
        tracker.exit(rule)
      },
    },
  })

  return { filePath: file.filePath, rules }
}

export function scanFiles(
  files: readonly SourceFile[],
  options: Pick<ProcessOptions, 'debugNames'> = {}
): ScanResult {
  const atoms = new Map<string, Atom>()
  const taken = new Set<string>()
  const skips: AtomizationSkip[] = []
  const debugNames = options.debugNames === true
  const scannedFiles = files.map((file) =>
    scanFile(file, atoms, taken, skips, debugNames)
  )
  return { atoms, files: scannedFiles, skips }
}
