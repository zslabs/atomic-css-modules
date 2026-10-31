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
import { userStylesheetOptions } from './lightning-options.js'
import {
  emptyLocalNames,
  referencesLocalName,
  type LocalNames,
} from './local-names.js'
import { pruneUnreferencedAtoms } from './min-occurrences.js'
import {
  applyOverrideConflicts,
  isOverrideConflictError,
} from './override-conflicts.js'
import { RuleContextTracker, type RuleVisitContext } from './rule-context.js'
import {
  classifyEligibleGroup,
  classifySelector,
  printSelectorList,
  skipReasonForSelector,
  skipReasonForSelectors,
} from './selector-utils.js'
import { findShorthandConflicts } from './shorthand-groups.js'
import { inspectSheet, ruleHasForeignAtRule } from './sheet-info.js'
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

export type ScanOptions = Pick<
  ProcessOptions,
  'debugNames' | 'conflicts' | 'localIdents' | 'customAtRules' | 'strict'
>

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
  debugNames: boolean,
  names: LocalNames,
  skips: AtomizationSkip[],
  filePath: string,
  selectorLabel: string
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
    if (referencesLocalName(declaration, context.condition, names)) {
      decisions.push({ action: 'keep', important })
      skips.push({
        filePath,
        selector: selectorLabel,
        reason: 'local-reference',
      })
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
  debugNames: boolean,
  names: LocalNames
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
      const selectorLabel = printSelectorList([classification.strippedSelector])
      const collected = collectAtoms(
        rule.value.declarations,
        context,
        classification,
        atoms,
        taken,
        debugNames,
        names,
        skips,
        file.filePath,
        selectorLabel
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

  if (ruleHasForeignAtRule(rule)) {
    const selectors = rule.value.selectors.flatMap((selector) =>
      context.resolveAll(selector)
    )
    rules.push(ineligibleRuleInfo(context))
    skips.push({
      filePath: file.filePath,
      selector: printSelectorList(selectors),
      reason: 'unknown-at-rule',
    })
    return
  }

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
    const selectorLabel = printSelectorList([classification.strippedSelector])
    const collected = collectAtoms(
      rule.value.declarations,
      context,
      classification,
      atoms,
      taken,
      debugNames,
      names,
      skips,
      file.filePath,
      selectorLabel
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

function failedScan(filePath: string, message: string): ScanFileResult {
  return { filePath, rules: [], definitions: [], failure: message }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function scanFile(
  file: SourceFile,
  atoms: Map<string, Atom>,
  taken: Set<string>,
  skips: AtomizationSkip[],
  options: ScanOptions
): ScanFileResult {
  const tracker = new RuleContextTracker()
  const rules: ScanRuleInfo[] = []
  const debugNames = options.debugNames === true
  let names = emptyLocalNames()
  let definitions: ScanFileResult['definitions'] = []

  try {
    transform({
      filename: file.filePath,
      code: Buffer.from(file.code, 'utf8'),
      ...userStylesheetOptions(options.customAtRules),
      visitor: {
        StyleSheet(sheet) {
          const info = inspectSheet(sheet.rules, file.filePath, options)
          names = info.names
          definitions = info.definitions
        },
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
            debugNames,
            names
          )
        },
        RuleExit(rule) {
          tracker.exit(rule)
        },
      },
    })
  } catch (error) {
    if (options.strict) throw error
    return failedScan(file.filePath, errorMessage(error))
  }

  const scanned = { filePath: file.filePath, rules, definitions }
  applyOverrideConflicts(scanned, atoms, skips, options.conflicts ?? 'skip')
  return scanned
}

export function scanFiles(
  files: readonly SourceFile[],
  options: ScanOptions = {}
): ScanResult {
  const atoms = new Map<string, Atom>()
  const taken = new Set<string>()
  const skips: AtomizationSkip[] = []
  const scannedFiles = files.map((file) => {
    try {
      return scanFile(file, atoms, taken, skips, options)
    } catch (error) {
      if (options.strict || isOverrideConflictError(error)) throw error
      return failedScan(file.filePath, errorMessage(error))
    }
  })
  pruneUnreferencedAtoms(atoms, scannedFiles)
  return { atoms, files: scannedFiles, skips }
}
