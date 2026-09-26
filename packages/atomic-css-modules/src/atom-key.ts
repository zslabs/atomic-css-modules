/**
 * Builds the deterministic key/hash for one atomizable declaration. Pure
 * function of (property, value, !important, pseudo, at-rule condition) so
 * scan and rewrite always agree on an atom's class name without needing to
 * share any other state.
 */
import type { Declaration } from 'lightningcss'
import { transform } from 'lightningcss'
import { atomClassName, fnv1a } from './hash.js'
import type { AtomCondition, AtomKey, AtomPseudo } from './types.js'

export interface BuildAtomKeyParams {
  property: string
  declaration: Declaration
  important: boolean
  pseudo: AtomPseudo | null
  condition: AtomCondition
}

export function buildAtomKey(params: BuildAtomKeyParams): AtomKey {
  return {
    property: params.property,
    // Omit `loc` so identical values at different source positions dedupe.
    valueFingerprint: JSON.stringify(
      params.declaration,
      (key, value: unknown) => (key === 'loc' ? undefined : value)
    ),
    important: params.important,
    pseudo: params.pseudo,
    condition: params.condition,
  }
}

export function atomKeyString(key: AtomKey): string {
  return JSON.stringify(key)
}

export function atomHashForKey(key: AtomKey): string {
  return atomClassName(atomKeyString(key))
}

function slug(value: string): string {
  const slugged = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slugged || 'x'
}

function printedDeclaration(
  declaration: Declaration,
  important: boolean
): string {
  const result = transform({
    filename: 'atom.css',
    code: Buffer.from('._{}'),
    visitor: {
      StyleSheetExit(sheet) {
        sheet.rules = [
          {
            type: 'style',
            value: {
              loc: { source_index: 0, line: 0, column: 1 },
              selectors: [[{ type: 'class', name: '_' }]],
              declarations: important
                ? { importantDeclarations: [declaration] }
                : { declarations: [declaration] },
            },
          },
        ]
        return sheet
      },
    },
  })
  const css = Buffer.from(result.code).toString('utf8')
  const match = /\{([^}]+)\}/.exec(css)
  return (match?.[1] ?? '').replace(/!important/g, '').trim()
}

function debugAtomClassName(key: AtomKey, declaration: Declaration): string {
  const prefixes: string[] = []
  for (const wrapper of key.condition) {
    prefixes.push(wrapper.kind === 'media' ? 'md' : wrapper.kind)
  }
  if (key.pseudo && 'kind' in key.pseudo) prefixes.push(key.pseudo.kind)
  const body = slug(printedDeclaration(declaration, key.important))
  if (key.important) prefixes.push('i')
  const name = [...prefixes, body].join('-')
  const base = /^[a-z]/i.test(name) ? name : `a-${name}`
  // Suffix with a short key hash so different at-rule conditions never collide.
  return `${base}-${fnv1a(atomKeyString(key)).slice(0, 6)}`
}

export function atomClassNameForKey(
  key: AtomKey,
  declaration: Declaration,
  debugNames = false
): string {
  if (debugNames) return debugAtomClassName(key, declaration)
  return atomHashForKey(key)
}
