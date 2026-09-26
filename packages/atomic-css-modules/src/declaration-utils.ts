/**
 * Helpers for reading lightningcss `Declaration` / `DeclarationBlock` values.
 */
import type { Declaration, DeclarationBlock } from 'lightningcss'

/** True for CSS Modules `composes`, whether lightningcss parsed it or left it unparsed. */
export function isComposesDeclaration(declaration: Declaration): boolean {
  if (declaration.property === 'composes') return true
  return (
    declaration.property === 'unparsed' &&
    declaration.value.propertyId.property === 'composes'
  )
}

export type ComposesOrigin =
  | { kind: 'local' }
  | { kind: 'global' }
  | { kind: 'file'; path: string }

/** Where a `composes` declaration pulls class names from. */
export function composesOrigin(
  declaration: Declaration
): ComposesOrigin | null {
  if (declaration.property === 'composes') {
    const from = declaration.value.from
    if (!from) return { kind: 'local' }
    if (from.type === 'global') return { kind: 'global' }
    if (from.type === 'file') return { kind: 'file', path: from.value }
    return { kind: 'local' }
  }
  if (
    !isComposesDeclaration(declaration) ||
    declaration.property !== 'unparsed'
  ) {
    return null
  }
  let seenFrom = false
  for (const token of declaration.value.value) {
    if (token.type !== 'token') continue
    if (token.value.type === 'ident' && token.value.value === 'from') {
      seenFrom = true
      continue
    }
    if (!seenFrom) continue
    if (token.value.type === 'ident' && token.value.value === 'global') {
      return { kind: 'global' }
    }
    if (token.value.type === 'string')
      return { kind: 'file', path: token.value.value }
  }
  return { kind: 'local' }
}

/** Class names listed on a `composes` declaration. */
export function composesNames(declaration: Declaration): string[] {
  if (declaration.property === 'composes') return [...declaration.value.names]
  if (
    !isComposesDeclaration(declaration) ||
    declaration.property !== 'unparsed'
  ) {
    return []
  }
  const names: string[] = []
  for (const token of declaration.value.value) {
    if (token.type !== 'token') continue
    if (token.value.type === 'ident') {
      if (token.value.value === 'from') break
      names.push(token.value.value)
    }
  }
  return names
}

/** The `from` file path on a `composes` declaration, or null if it is local or global. */
export function composesFrom(declaration: Declaration): string | null {
  const origin = composesOrigin(declaration)
  return origin?.kind === 'file' ? origin.path : null
}

/** The CSS property name a declaration represents, including custom properties and unparsed values. */
export function declarationProperty(declaration: Declaration): string {
  if (declaration.property === 'custom') return declaration.value.name
  if (declaration.property === 'unparsed')
    return declaration.value.propertyId.property
  return declaration.property
}

export interface FlatDeclaration {
  declaration: Declaration
  important: boolean
}

/**
 * lightningcss visitors surface `Option::None` as JSON `null`. Passing those
 * objects back into `transform` fails for some types (notably `Specifier` on
 * `var()` names, and `@import`/`@namespace` optionals). Drop nulls before we
 * store or re-inject AST nodes.
 */
export function stripAstNulls(declaration: Declaration): Declaration {
  return JSON.parse(
    JSON.stringify(declaration, (_key, value: unknown) =>
      value === null ? undefined : value
    )
  )
}

/** Deep-clone any LightningCSS AST value, dropping only JSON `null`s. */
export function stripNullsDeep<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested: unknown) =>
      nested === null ? undefined : nested
    )
  )
}

/** Flattens a rule's declaration block into a single ordered list, tagging each with its `!important` flag. */
export function flattenDeclarations(
  block: DeclarationBlock<Declaration> | undefined
): FlatDeclaration[] {
  if (!block) return []
  const flat: FlatDeclaration[] = []
  for (const declaration of block.declarations ?? [])
    flat.push({ declaration: stripAstNulls(declaration), important: false })
  for (const declaration of block.importantDeclarations ?? [])
    flat.push({ declaration: stripAstNulls(declaration), important: true })
  return flat
}
