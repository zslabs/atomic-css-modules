/**
 * Builds the shared atomic registry stylesheet from every {@link Atom}
 * collected while scanning. Reuses the real `Declaration`/`MediaQuery` AST
 * objects captured during the scan and asks lightningcss to print them by
 * fully replacing an (empty) stylesheet's rules in `StyleSheetExit` - this
 * lets lightningcss's own printer serialize declarations we never wrote as
 * source text ourselves.
 */
import type { Rule, StyleRule } from 'lightningcss'
import { transform } from 'lightningcss'
import { stripNullsDeep } from './declaration-utils.js'
import { userStylesheetOptions } from './lightning-options.js'
import { comparePropertyCascadeOrder } from './shorthand-groups.js'
import type { Atom, AtomCondition, AtomWrapper } from './types.js'

export interface RegistryBuildOptions {
  groupConditions?: boolean
  definitions?: readonly Rule[]
}

/**
 * Stable registry emission order: shorthands before their longhands, then
 * property name, then atom key fingerprint. Equal-specificity atoms resolve
 * by this stylesheet order when multiple classes land on one element.
 */
export function sortAtomsForRegistry(atoms: readonly Atom[]): Atom[] {
  return [...atoms].sort((left, right) => {
    const cascade = comparePropertyCascadeOrder(
      left.key.property,
      right.key.property
    )
    if (cascade !== 0) return cascade
    const byProperty = left.key.property.localeCompare(right.key.property)
    if (byProperty !== 0) return byProperty
    return left.keyString.localeCompare(right.keyString)
  })
}

function locationStub(): {
  source_index: number
  line: number
  column: number
} {
  return { source_index: 0, line: 0, column: 1 }
}

function atomSelector(atom: Atom): StyleRule['selectors'][number] {
  const selector: StyleRule['selectors'][number] = [
    { type: 'class', name: atom.className },
  ]
  if (atom.key.pseudo) selector.push(atom.key.pseudo)
  return selector
}

function atomStyleRule(atom: Atom): Rule {
  const declarations = atom.key.important
    ? { importantDeclarations: [atom.declaration] }
    : { declarations: [atom.declaration] }
  return {
    type: 'style',
    value: {
      loc: locationStub(),
      selectors: [atomSelector(atom)],
      declarations,
    },
  }
}

function wrapMany(wrapper: AtomWrapper, rules: Rule[]): Rule {
  if (wrapper.kind === 'media') {
    return {
      type: 'media',
      value: {
        loc: locationStub(),
        query: wrapper.query,
        rules,
      },
    }
  }
  if (wrapper.kind === 'container') {
    return {
      type: 'container',
      value: {
        loc: locationStub(),
        rules,
        ...(wrapper.name ? { name: wrapper.name } : {}),
        ...(wrapper.condition ? { condition: wrapper.condition } : {}),
      },
    }
  }
  if (wrapper.kind === 'supports') {
    return {
      type: 'supports',
      value: {
        loc: locationStub(),
        condition: wrapper.condition,
        rules,
      },
    }
  }
  if (wrapper.kind === 'layer') {
    return {
      type: 'layer-block',
      value: {
        loc: locationStub(),
        rules,
        ...(wrapper.name ? { name: wrapper.name } : {}),
      },
    }
  }
  if (wrapper.kind === 'starting-style') {
    return {
      type: 'starting-style',
      value: {
        loc: locationStub(),
        rules,
      },
    }
  }
  return {
    type: 'scope',
    value: {
      loc: locationStub(),
      rules,
      ...(wrapper.scopeStart ? { scopeStart: wrapper.scopeStart } : {}),
      ...(wrapper.scopeEnd ? { scopeEnd: wrapper.scopeEnd } : {}),
    },
  }
}

function wrapRules(condition: AtomCondition, rules: Rule[]): Rule[] {
  let wrapped = rules
  for (let index = condition.length - 1; index >= 0; index -= 1) {
    const wrapper = condition[index]
    if (!wrapper) continue
    wrapped = [wrapMany(wrapper, wrapped)]
  }
  return wrapped
}

function groupAtoms(
  atoms: readonly Atom[],
  groupConditions: boolean
): Atom[][] {
  if (!groupConditions) return atoms.map((atom) => [atom])
  const groups: Atom[][] = []
  for (const atom of atoms) {
    const last = groups.at(-1)
    const previous = last?.[0]
    if (
      last &&
      previous &&
      JSON.stringify(previous.key.condition) ===
        JSON.stringify(atom.key.condition)
    ) {
      last.push(atom)
      continue
    }
    groups.push([atom])
  }
  return groups
}

/** Builds the atomic registry CSS text for a set of collected atoms. Returns an empty string if there are none. */
export function buildRegistryCss(
  atoms: Iterable<Atom>,
  options: RegistryBuildOptions = {}
): string {
  const atomList = sortAtomsForRegistry([...atoms])
  const definitions = options.definitions ?? []
  if (atomList.length === 0 && definitions.length === 0) return ''

  const groups = groupAtoms(atomList, options.groupConditions === true)
  const result = transform({
    filename: 'atomic-registry.css',
    code: Buffer.from(''),
    ...userStylesheetOptions(),
    visitor: {
      StyleSheetExit(sheet) {
        const rules: Rule[] = [
          ...definitions,
          ...groups.flatMap((group) => {
            const first = group[0]
            if (!first) return []
            return wrapRules(
              first.key.condition,
              group.map((atom) => atomStyleRule(atom))
            )
          }),
        ]
        const target = stripNullsDeep(sheet)
        target.rules = stripNullsDeep(rules)
        return target
      },
    },
  })

  return Buffer.from(result.code).toString('utf8')
}
