/**
 * Phase 2: rewrite each source file using the scan plan. Hoisted declarations
 * become `composes: ... from "<registry>"` (or `from global`); decisions and
 * class names come from the atom map produced during scan — rewrite does not
 * re-allocate names.
 */
import type { Declaration, Location2, Rule, Selector } from 'lightningcss'
import { transform } from 'lightningcss'
import {
  composesNames,
  composesOrigin,
  flattenDeclarations,
  isComposesDeclaration,
  stripNullsDeep,
} from './declaration-utils.js'
import { RuleContextTracker } from './rule-context.js'
import {
  classifyEligibleGroup,
  classifySelector,
  selectorKey,
} from './selector-utils.js'
import { hasAtomicSkipComment } from './skip-comment.js'
import {
  isBareCondition,
  type Atom,
  type AtomCondition,
  type DeclDecision,
  type ProcessOptions,
  type RewrittenFile,
  type ScanFileResult,
  type ScanRuleInfo,
  type SourceFile,
} from './types.js'

/**
 * Extra atom hashes that a bare rule should pick up because a rule with the
 * same (unstripped) selector, nested in @media/@container/@supports or
 * nested via `&`, also contributed atomizable declarations in this file.
 */
function buildCrossRuleAtoms(
  scanFile: ScanFileResult
): Map<string, { selector: Selector; hashes: string[] }> {
  const map = new Map<string, { selector: Selector; hashes: string[] }>()
  for (const rule of scanFile.rules) {
    if (!rule.eligible || rule.atomHashes.length === 0) continue
    if (isBareCondition(rule.condition) && !rule.nested) continue
    const key = selectorKey(rule.selector)
    const entry = map.get(key) ?? { selector: rule.selector, hashes: [] }
    entry.hashes.push(...rule.atomHashes)
    map.set(key, entry)
  }
  return map
}

function isRegistryComposes(
  declaration: Declaration,
  options: ProcessOptions
): boolean {
  const origin = composesOrigin(declaration)
  if (!origin) return false
  if (options.composeFrom === 'global') return origin.kind === 'global'
  return origin.kind === 'file' && origin.path === options.registryImportPath
}

function mergeRegistryComposes(
  keptNormal: Declaration[],
  hashes: readonly string[],
  options: ProcessOptions
): Declaration | null {
  if (hashes.length === 0) return null
  const existingNames: string[] = []
  for (let index = keptNormal.length - 1; index >= 0; index--) {
    const declaration = keptNormal[index]
    if (!declaration || !isRegistryComposes(declaration, options)) continue
    existingNames.unshift(...composesNames(declaration))
    keptNormal.splice(index, 1)
  }
  return composesDeclaration(
    [...new Set([...existingNames, ...hashes])],
    options
  )
}

function composesDeclaration(
  classNames: readonly string[],
  options: ProcessOptions
): Declaration {
  return {
    property: 'composes',
    value: {
      loc: { line: 1, column: 1 },
      names: [...classNames],
      from:
        options.composeFrom === 'global'
          ? { type: 'global' }
          : { type: 'file', value: options.registryImportPath },
    },
  }
}

function styleRule(
  loc: Location2,
  selectors: Selector[],
  declarations: {
    declarations?: Declaration[]
    importantDeclarations?: Declaration[]
  },
  rules?: Rule[]
): Rule {
  return {
    type: 'style',
    value: {
      loc,
      selectors,
      declarations,
      ...(rules && rules.length > 0 ? { rules } : {}),
    },
  }
}

function locationStub(): Location2 {
  return { source_index: 0, line: 0, column: 1 }
}

function applyDecisions(
  block: Parameters<typeof flattenDeclarations>[0],
  decisions: readonly DeclDecision[],
  atoms: Map<string, Atom>
): {
  keptNormal: Declaration[]
  keptImportant: Declaration[]
  ownHashes: string[]
} {
  const flatDeclarations = flattenDeclarations(block)
  if (decisions.length !== flatDeclarations.length) {
    throw new Error(
      `Scan plan length ${decisions.length} !== declaration count ${flatDeclarations.length}`
    )
  }

  const keptNormal: Declaration[] = []
  const keptImportant: Declaration[] = []
  const ownHashes: string[] = []

  for (const [index, flat] of flatDeclarations.entries()) {
    const decision = decisions[index]
    if (!decision) continue
    if (decision.action === 'composes') {
      keptNormal.push(flat.declaration)
      continue
    }
    if (decision.action === 'keep') {
      ;(decision.important ? keptImportant : keptNormal).push(flat.declaration)
      continue
    }
    const atom = atoms.get(decision.atomKey)
    if (!atom) {
      throw new Error('Rewrite missing scan atom for hoist decision')
    }
    ownHashes.push(atom.hash)
  }

  return { keptNormal, keptImportant, ownHashes }
}

function findPlan(
  scanFile: ScanFileResult,
  used: Set<number>,
  selector: Selector,
  condition: AtomCondition,
  nested: boolean
): ScanRuleInfo | undefined {
  const key = selectorKey(selector)
  const conditionKey = JSON.stringify(condition)
  const index = scanFile.rules.findIndex(
    (rule, ruleIndex) =>
      !used.has(ruleIndex) &&
      rule.eligible &&
      rule.nested === nested &&
      selectorKey(rule.selector) === key &&
      JSON.stringify(rule.condition) === conditionKey
  )
  if (index < 0) return undefined
  used.add(index)
  return scanFile.rules[index]
}

/** Drops @media/@container/@supports blocks whose style rules were fully consumed. */
function pruneEmptyAtRules(rules: Rule[]): Rule[] {
  const kept: Rule[] = []
  for (const rule of rules) {
    if (
      rule.type === 'media' ||
      rule.type === 'container' ||
      rule.type === 'supports' ||
      rule.type === 'layer-block' ||
      rule.type === 'scope' ||
      rule.type === 'starting-style'
    ) {
      rule.value.rules = pruneEmptyAtRules(rule.value.rules)
      if (rule.value.rules.length === 0) continue
    }
    if (rule.type === 'style' && rule.value.rules) {
      rule.value.rules = pruneEmptyAtRules(rule.value.rules)
      if (rule.value.rules.length === 0) delete rule.value.rules
    }
    kept.push(rule)
  }
  return kept
}

/** Clone nested rules onto every compose target so grouped parents share them. */
function attachNestedRules(composeRules: Rule[], nestedRules: Rule[]): void {
  for (const [index, composeRule] of composeRules.entries()) {
    if (composeRule.type !== 'style') continue
    composeRule.value.rules =
      index === 0 ? nestedRules : stripNullsDeep(nestedRules)
  }
}

/**
 * Collapse multiple registry `composes` declarations on one rule into a
 * single declaration (CSS Modules typically allows only one).
 */
function mergeComposesDeclarations(
  rules: Rule[],
  options: ProcessOptions
): void {
  for (const rule of rules) {
    if (
      rule.type === 'media' ||
      rule.type === 'container' ||
      rule.type === 'supports' ||
      rule.type === 'layer-block' ||
      rule.type === 'scope' ||
      rule.type === 'starting-style'
    ) {
      mergeComposesDeclarations(rule.value.rules, options)
      continue
    }
    if (rule.type !== 'style') continue
    if (rule.value.rules) mergeComposesDeclarations(rule.value.rules, options)

    const block = rule.value.declarations
    const declarations = block?.declarations
    if (!block || !declarations || declarations.length < 2) continue

    const registryIndexes: number[] = []
    const names: string[] = []
    for (const [index, declaration] of declarations.entries()) {
      if (!isRegistryComposes(declaration, options)) continue
      registryIndexes.push(index)
      names.push(...composesNames(declaration))
    }
    if (registryIndexes.length < 2) continue

    const merged = composesDeclaration([...new Set(names)], options)
    const next = declarations.filter(
      (_, index) => !registryIndexes.includes(index)
    )
    const insertAt = registryIndexes[0] ?? next.length
    next.splice(insertAt, 0, merged)
    block.declarations = next
  }
}

function rewriteFile(
  file: SourceFile,
  scanFile: ScanFileResult,
  options: ProcessOptions,
  atoms: Map<string, Atom>
): RewrittenFile {
  const crossRuleAtoms = buildCrossRuleAtoms(scanFile)
  const composedSelectors = new Set<string>()
  const tracker = new RuleContextTracker()
  const usedPlans = new Set<number>()
  let changed = false

  const result = transform({
    filename: file.filePath,
    code: Buffer.from(file.code, 'utf8'),
    sourceMap: options.sourceMap === true,
    visitor: {
      Rule(rule) {
        const context = tracker.enter(rule)
        if (!context) return undefined
        if (
          (rule.type === 'style' || rule.type === 'nested-declarations') &&
          hasAtomicSkipComment(file.code, rule.value.loc)
        ) {
          return undefined
        }

        if (rule.type === 'nested-declarations') {
          // Scan stores stripped selectors; classify before lookup so
          // `.card:hover` parents match plans keyed as `.card`.
          let plan: ScanRuleInfo | undefined
          for (const selector of context.selectors) {
            const classification = classifySelector(selector)
            if (!classification.eligible) continue
            plan = findPlan(
              scanFile,
              usedPlans,
              classification.strippedSelector,
              context.condition,
              context.nested
            )
            if (plan) break
          }
          if (!plan) return undefined

          const { keptNormal, keptImportant, ownHashes } = applyDecisions(
            rule.value.declarations,
            plan.decisions,
            atoms
          )
          const flatCount = flattenDeclarations(rule.value.declarations).length
          if (
            ownHashes.length === 0 &&
            keptNormal.length + keptImportant.length === flatCount
          ) {
            return undefined
          }

          changed = true
          if (keptNormal.length === 0 && keptImportant.length === 0) {
            tracker.exit(rule)
            return []
          }
          return {
            type: 'nested-declarations',
            value: {
              loc: rule.value.loc,
              declarations: {
                declarations: keptNormal,
                importantDeclarations: keptImportant,
              },
            },
          }
        }

        if (rule.type !== 'style') return undefined

        const selectors = rule.value.selectors
        const classifications = classifyEligibleGroup(
          selectors.flatMap((selector) => context.resolveAll(selector))
        )
        if (!classifications) return undefined

        let keptNormal: Declaration[] = []
        let keptImportant: Declaration[] = []
        const composeRules: Rule[] = []
        let anyHashes = false

        for (const [index, classification] of classifications.entries()) {
          const plan = findPlan(
            scanFile,
            usedPlans,
            classification.strippedSelector,
            context.condition,
            context.nested
          )
          if (!plan) continue
          const split = applyDecisions(
            rule.value.declarations,
            plan.decisions,
            atoms
          )
          if (index === 0) {
            keptNormal = split.keptNormal
            keptImportant = split.keptImportant
          }

          const composeSelector = classification.strippedSelector
          const extraHashes = isBareCondition(context.condition)
            ? (crossRuleAtoms.get(selectorKey(composeSelector))?.hashes ?? [])
            : []
          const composesHashes = [
            ...new Set([...split.ownHashes, ...extraHashes]),
          ]
          if (composesHashes.length > 0) anyHashes = true

          if (!isBareCondition(context.condition) || context.nested) continue

          const atomicComposes =
            index === 0
              ? mergeRegistryComposes(keptNormal, composesHashes, options)
              : composesHashes.length > 0
                ? composesDeclaration(composesHashes, options)
                : null
          if (!atomicComposes) continue
          composeRules.push(
            styleRule(rule.value.loc, [composeSelector], {
              declarations: [atomicComposes],
            })
          )
          composedSelectors.add(selectorKey(composeSelector))
        }

        const flatCount = flattenDeclarations(rule.value.declarations).length
        if (
          !anyHashes &&
          keptNormal.length + keptImportant.length === flatCount
        ) {
          return undefined
        }

        changed = true
        const nestedRules = rule.value.rules
        const keptDeclarations = {
          declarations: keptNormal,
          importantDeclarations: keptImportant,
        }
        const hasKept = keptNormal.length > 0 || keptImportant.length > 0

        if (!isBareCondition(context.condition) || context.nested) {
          if (hasKept) {
            return styleRule(
              rule.value.loc,
              selectors,
              keptDeclarations,
              nestedRules
            )
          }
          if (nestedRules && nestedRules.length > 0) {
            return styleRule(rule.value.loc, selectors, {}, nestedRules)
          }
          tracker.exit(rule)
          return []
        }

        if (nestedRules && nestedRules.length > 0) {
          attachNestedRules(composeRules, nestedRules)
        }

        if (hasKept) {
          return [
            styleRule(rule.value.loc, selectors, keptDeclarations),
            ...composeRules,
          ]
        }

        return composeRules
      },
      RuleExit(rule) {
        tracker.exit(rule)
      },
    },
  })

  if (!changed)
    return { filePath: file.filePath, code: file.code, changed: false }

  const rewritten = Buffer.from(result.code).toString('utf8')
  const finalized = finalizeStylesheet(rewritten, file.filePath, {
    crossRuleAtoms,
    composedSelectors,
    options,
    inputSourceMap: encodeSourceMap(result.map),
  })
  const exploded = explodeGroupedComposesText(finalized.code)
  let map = finalized.map
  // Printer may regroup identical compose-only siblings after the AST split.
  // The text fallback fixes CSS Modules acceptance but the finalize map then
  // describes the pre-split text — rebuild so positions still land in the
  // original file (at the grouped rule), or drop the map if we cannot.
  if (exploded.changed && map && options.sourceMap === true) {
    map = sourceMapForExplodedCss(exploded.code, file.filePath, file.code)
  }
  return {
    filePath: file.filePath,
    code: exploded.code,
    changed,
    ...(map ? { map } : {}),
  }
}

function encodeSourceMap(map: Uint8Array | void): string | undefined {
  if (!map) return undefined
  return Buffer.from(map).toString('utf8')
}

/**
 * Fallback when the printer re-groups compose-only siblings after AST split.
 * Returns whether the regex rewrote anything so callers can fix source maps.
 */
function explodeGroupedComposesText(css: string): {
  code: string
  changed: boolean
} {
  let changed = false
  const code = css.replace(
    /(^|\})(\s*)([^{}@]+?)\{((?:\s*composes:[^;]+;)+\s*)\}/g,
    (
      full,
      prefix: string,
      space: string,
      selectorList: string,
      body: string
    ) => {
      const selectors = selectorList
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean)
      if (selectors.length < 2) return full
      changed = true
      return (
        prefix +
        selectors.map((selector) => `${space}${selector} {${body}}`).join('')
      )
    }
  )
  return { code, changed }
}

/**
 * After a post-print grouped-compose split, emit a map that still names the
 * original file and points every generated line at the start of the source.
 * Per-selector columns cannot be recovered once the printer merged siblings.
 */
function sourceMapForExplodedCss(
  generatedCss: string,
  filePath: string,
  originalCss: string
): string {
  const generatedLineCount = generatedCss.split('\n').length
  // One VLQ segment per line: generated col 0 → source 0, line 0, col 0.
  // "AAAA" = (0, 0, 0, 0); repeat so every generated line has a mapping.
  const mappings = Array.from(
    { length: generatedLineCount },
    () => 'AAAA'
  ).join(';')
  return JSON.stringify({
    version: 3,
    file: filePath,
    sources: [filePath],
    sourcesContent: [originalCss],
    names: [],
    mappings,
  })
}

/**
 * Split multi-selector rules that only contain `composes` into one rule per
 * selector. LightningCSS may regroup identical siblings when printing; doing
 * this in the AST keeps source maps honest (unlike a post-print regex).
 */
function explodeGroupedComposesInAst(rules: Rule[]): Rule[] {
  const out: Rule[] = []
  for (const rule of rules) {
    if (
      rule.type === 'media' ||
      rule.type === 'container' ||
      rule.type === 'supports' ||
      rule.type === 'layer-block' ||
      rule.type === 'scope' ||
      rule.type === 'starting-style'
    ) {
      rule.value.rules = explodeGroupedComposesInAst(rule.value.rules)
      out.push(rule)
      continue
    }
    if (rule.type !== 'style') {
      out.push(rule)
      continue
    }
    if (rule.value.rules) {
      rule.value.rules = explodeGroupedComposesInAst(rule.value.rules)
    }
    const selectors = rule.value.selectors
    if (selectors.length < 2) {
      out.push(rule)
      continue
    }
    const flat = flattenDeclarations(rule.value.declarations)
    if (
      flat.length === 0 ||
      !flat.every(({ declaration }) => isComposesDeclaration(declaration))
    ) {
      out.push(rule)
      continue
    }
    for (const selector of selectors) {
      out.push(
        styleRule(
          rule.value.loc,
          [selector],
          rule.value.declarations ?? {},
          rule.value.rules
        )
      )
    }
  }
  return out
}

function sheetHasImportOrNamespace(rules: readonly Rule[]): boolean {
  for (const rule of rules) {
    if (rule.type === 'import' || rule.type === 'namespace') return true
  }
  return false
}

function finalizeStylesheet(
  css: string,
  filename: string,
  extras: {
    crossRuleAtoms: Map<string, { selector: Selector; hashes: string[] }>
    composedSelectors: Set<string>
    options: ProcessOptions
    inputSourceMap?: string
  }
): { code: string; map?: string } {
  const result = transform({
    filename,
    code: Buffer.from(css, 'utf8'),
    sourceMap: extras.options.sourceMap === true,
    ...(extras.inputSourceMap ? { inputSourceMap: extras.inputSourceMap } : {}),
    visitor: {
      StyleSheetExit(sheet) {
        // Only deep-clone when @import/@namespace null optionals would break
        // re-serialize; otherwise mutate in place.
        const target = sheetHasImportOrNamespace(sheet.rules)
          ? stripNullsDeep(sheet)
          : sheet
        target.rules = pruneEmptyAtRules(target.rules)
        mergeComposesDeclarations(target.rules, extras.options)
        for (const [key, { selector, hashes }] of extras.crossRuleAtoms) {
          if (extras.composedSelectors.has(key) || hashes.length === 0) continue
          target.rules.push(
            styleRule(locationStub(), [selector], {
              declarations: [
                composesDeclaration([...new Set(hashes)], extras.options),
              ],
            })
          )
        }
        target.rules = explodeGroupedComposesInAst(target.rules)
        return target
      },
    },
  })
  return {
    code: Buffer.from(result.code).toString('utf8'),
    map: encodeSourceMap(result.map),
  }
}

export function rewriteFiles(
  files: readonly SourceFile[],
  scanFiles: readonly ScanFileResult[],
  options: ProcessOptions,
  atoms: Map<string, Atom>
): RewrittenFile[] {
  const scanByPath = new Map(
    scanFiles.map((scanFile) => [scanFile.filePath, scanFile])
  )
  return files.map((file) => {
    const scanFile = scanByPath.get(file.filePath)
    if (!scanFile)
      throw new Error(`No scan result found for file: ${file.filePath}`)
    return rewriteFile(file, scanFile, options, atoms)
  })
}
