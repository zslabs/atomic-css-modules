/**
 * Names and at-rule definitions a stylesheet contributes. Definitions are
 * copied onto the registry so it compiles without the module's `@import`s.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Declaration, KeyframesName, Rule } from 'lightningcss'
import { transform } from 'lightningcss'
import { stripNullsDeep } from './declaration-utils.js'
import { userStylesheetOptions } from './lightning-options.js'
import { emptyLocalNames, type LocalNames } from './local-names.js'
import type { AtomicCustomAtRules, LocalIdentOptions } from './types.js'

export interface SheetInfo {
  names: LocalNames
  definitions: Rule[]
}

export function inspectSheet(
  rules: readonly Rule[],
  filePath: string,
  options: {
    localIdents?: LocalIdentOptions
    customAtRules?: AtomicCustomAtRules
  },
  seen: Set<string> = new Set()
): SheetInfo {
  seen.add(path.resolve(filePath))
  const names = emptyLocalNames()
  const definitions: Rule[] = []
  walk(rules, (rule) => {
    if (rule.type === 'keyframes') {
      names.keyframes.add(keyframeName(rule.value.name))
      return
    }
    if (rule.type === 'counter-style') {
      names.counterStyles.add(rule.value.name)
      return
    }
    if (
      rule.type === 'custom-media' ||
      rule.type === 'property' ||
      rule.type === 'layer-statement'
    ) {
      definitions.push(stripNullsDeep(rule))
      return
    }
    if (rule.type === 'import') {
      definitions.push(
        ...importedDefinitions(rule.value.url, filePath, options, seen)
      )
      return
    }
    collectDeclaredNames(rule, names, options.localIdents)
  })
  return { names, definitions }
}

export function ruleHasForeignAtRule(rule: Rule): boolean {
  const nested = childRules(rule)
  if (!nested) return false
  return nested.some(
    (child) =>
      child.type === 'unknown' ||
      child.type === 'custom' ||
      ruleHasForeignAtRule(child)
  )
}

export function dedupeDefinitions(rules: readonly Rule[]): Rule[] {
  const seen = new Set<string>()
  const unique: Rule[] = []
  for (const rule of rules) {
    const key = definitionKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(rule)
  }
  return unique
}

function definitionKey(rule: Rule): string {
  if (rule.type === 'custom-media') return `media:${rule.value.name}`
  if (rule.type === 'property') return `prop:${rule.value.name}`
  if (rule.type === 'layer-statement') {
    return `layer:${JSON.stringify(rule.value.names)}`
  }
  return JSON.stringify(rule)
}

function keyframeName(name: KeyframesName): string {
  return name.value
}

function collectDeclaredNames(
  rule: Rule,
  names: LocalNames,
  localIdents: LocalIdentOptions | undefined
): void {
  if (!localIdents?.container && !localIdents?.dashedIdents) return
  for (const declaration of declarationsOf(rule)) {
    if (localIdents.dashedIdents && declaration.property === 'custom') {
      names.dashedIdents.add(declaration.value.name)
    }
    if (!localIdents.container) continue
    if (
      declaration.property === 'container-name' &&
      declaration.value.type === 'names'
    ) {
      for (const name of declaration.value.value) names.containerNames.add(name)
    }
    if (
      declaration.property === 'container' &&
      declaration.value.name.type === 'names'
    ) {
      for (const name of declaration.value.name.value) {
        names.containerNames.add(name)
      }
    }
  }
}

function declarationsOf(rule: Rule): Declaration[] {
  if (rule.type !== 'style' && rule.type !== 'nested-declarations') return []
  const block = rule.value.declarations
  return [
    ...(block?.declarations ?? []),
    ...(block?.importantDeclarations ?? []),
  ]
}

function importedDefinitions(
  url: string,
  fromFile: string,
  options: {
    localIdents?: LocalIdentOptions
    customAtRules?: AtomicCustomAtRules
  },
  seen: Set<string>
): Rule[] {
  if (
    url.startsWith('http:') ||
    url.startsWith('https:') ||
    url.startsWith('//') ||
    url.startsWith('data:')
  ) {
    return []
  }
  const clean = url.split('?')[0] ?? url
  const resolved = path.resolve(path.dirname(fromFile), clean)
  if (seen.has(resolved) || !existsSync(resolved)) return []
  let code: string
  try {
    code = readFileSync(resolved, 'utf8')
  } catch {
    return []
  }
  try {
    let found: Rule[] = []
    transform({
      filename: resolved,
      code: Buffer.from(code),
      ...userStylesheetOptions(options.customAtRules),
      visitor: {
        StyleSheet(sheet) {
          found = inspectSheet(sheet.rules, resolved, options, seen).definitions
        },
      },
    })
    return found
  } catch {
    return []
  }
}

function walk(rules: readonly Rule[], visit: (rule: Rule) => void): void {
  for (const rule of rules) {
    visit(rule)
    const nested = childRules(rule)
    if (nested) walk(nested, visit)
  }
}

function childRules(rule: Rule): Rule[] | undefined {
  if (rule.type === 'ignored' || !('value' in rule)) return
  const value: unknown = rule.value
  if (typeof value !== 'object' || value === null || !('rules' in value)) {
    return
  }
  const nested: unknown = value.rules
  if (!Array.isArray(nested)) return
  const rules: Rule[] = []
  for (const child of nested) {
    if (isRule(child)) rules.push(child)
  }
  return rules
}

function isRule(value: unknown): value is Rule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}
