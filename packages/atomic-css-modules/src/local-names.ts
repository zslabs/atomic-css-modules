/**
 * Declarations that name something the file itself defines must stay on the
 * local class. CSS Modules renames `@keyframes` and `@counter-style`, and an
 * atom would keep the original name.
 */
import type { AnimationName, Declaration, ListStyleType } from 'lightningcss'
import type { AtomCondition } from './types.js'

export interface LocalNames {
  keyframes: Set<string>
  counterStyles: Set<string>
  containerNames: Set<string>
  dashedIdents: Set<string>
}

export function emptyLocalNames(): LocalNames {
  return {
    keyframes: new Set(),
    counterStyles: new Set(),
    containerNames: new Set(),
    dashedIdents: new Set(),
  }
}

export function referencesLocalName(
  declaration: Declaration,
  condition: AtomCondition,
  names: LocalNames
): boolean {
  if (names.keyframes.size > 0 && usesKeyframe(declaration, names.keyframes)) {
    return true
  }
  if (
    names.counterStyles.size > 0 &&
    usesCounterStyle(declaration, names.counterStyles)
  ) {
    return true
  }
  if (
    names.containerNames.size > 0 &&
    usesContainer(declaration, condition, names.containerNames)
  ) {
    return true
  }
  if (
    names.dashedIdents.size > 0 &&
    usesDashedIdent(declaration, names.dashedIdents)
  ) {
    return true
  }
  return false
}

function usesKeyframe(declaration: Declaration, names: Set<string>): boolean {
  const idents = animationIdents(declaration)
  if (!idents) return false
  return idents.some((ident) => names.has(ident))
}

function usesCounterStyle(
  declaration: Declaration,
  names: Set<string>
): boolean {
  const idents = counterStyleIdents(declaration)
  if (!idents) return false
  return idents.some((ident) => names.has(ident))
}

function usesContainer(
  declaration: Declaration,
  condition: AtomCondition,
  names: Set<string>
): boolean {
  if (
    declaration.property === 'container-name' ||
    declaration.property === 'container'
  ) {
    return true
  }
  return condition.some(
    (wrapper) =>
      wrapper.kind === 'container' &&
      wrapper.name !== null &&
      names.has(wrapper.name)
  )
}

function usesDashedIdent(
  declaration: Declaration,
  names: Set<string>
): boolean {
  if (declaration.property === 'custom' && names.has(declaration.value.name)) {
    return true
  }
  const json = JSON.stringify(declaration)
  for (const name of names) {
    if (json.includes(JSON.stringify(name))) return true
  }
  return false
}

function animationIdents(declaration: Declaration): string[] | undefined {
  if (declaration.property === 'animation') {
    return declaration.value.flatMap((item) => animationName(item.name))
  }
  if (declaration.property === 'animation-name') {
    return declaration.value.flatMap((name) => animationName(name))
  }
  if (declaration.property === 'unparsed') {
    const property = declaration.value.propertyId.property
    if (property !== 'animation' && property !== 'animation-name') return
    return identsIn(declaration.value.value)
  }
  return
}

function counterStyleIdents(declaration: Declaration): string[] | undefined {
  if (declaration.property === 'list-style') {
    return counterStyleName(declaration.value.listStyleType)
  }
  if (declaration.property === 'list-style-type') {
    return counterStyleName(declaration.value)
  }
  if (declaration.property === 'unparsed') {
    const property = declaration.value.propertyId.property
    if (property !== 'list-style' && property !== 'list-style-type') return
    return identsIn(declaration.value.value)
  }
  return
}

function animationName(name: AnimationName): string[] {
  if (name.type === 'ident' || name.type === 'string') return [name.value]
  return []
}

function counterStyleName(value: ListStyleType): string[] {
  if (value.type === 'counter-style' && value.value.type === 'name') {
    return [value.value.value]
  }
  return []
}

function identsIn(value: unknown): string[] {
  const idents: string[] = []
  collectIdents(value, idents)
  return idents
}

function collectIdents(value: unknown, into: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIdents(item, into)
    return
  }
  if (typeof value !== 'object' || value === null) return
  if (
    'type' in value &&
    value.type === 'ident' &&
    'value' in value &&
    typeof value.value === 'string'
  ) {
    into.push(value.value)
  }
  for (const nested of Object.values(value)) collectIdents(nested, into)
}
