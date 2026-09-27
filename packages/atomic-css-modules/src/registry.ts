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
import { comparePropertyCascadeOrder } from './shorthand-groups.js'
import type { Atom, AtomWrapper } from './types.js'

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

function wrapOne(wrapper: AtomWrapper, inner: Rule): Rule {
  if (wrapper.kind === 'media') {
    return {
      type: 'media',
      value: {
        loc: locationStub(),
        query: wrapper.query,
        rules: [inner],
      },
    }
  }
  if (wrapper.kind === 'container') {
    return {
      type: 'container',
      value: {
        loc: locationStub(),
        rules: [inner],
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
        rules: [inner],
      },
    }
  }
  if (wrapper.kind === 'layer') {
    return {
      type: 'layer-block',
      value: {
        loc: locationStub(),
        rules: [inner],
        ...(wrapper.name ? { name: wrapper.name } : {}),
      },
    }
  }
  if (wrapper.kind === 'starting-style') {
    return {
      type: 'starting-style',
      value: {
        loc: locationStub(),
        rules: [inner],
      },
    }
  }
  return {
    type: 'scope',
    value: {
      loc: locationStub(),
      rules: [inner],
      ...(wrapper.scopeStart ? { scopeStart: wrapper.scopeStart } : {}),
      ...(wrapper.scopeEnd ? { scopeEnd: wrapper.scopeEnd } : {}),
    },
  }
}

function wrapInCondition(atom: Atom, styleRule: Rule): Rule {
  return atom.key.condition.reduceRight(
    (inner, wrapper) => wrapOne(wrapper, inner),
    styleRule
  )
}

/** Builds the atomic registry CSS text for a set of collected atoms. Returns an empty string if there are none. */
export function buildRegistryCss(atoms: Iterable<Atom>): string {
  const atomList = sortAtomsForRegistry([...atoms])
  if (atomList.length === 0) return ''

  const result = transform({
    filename: 'atomic-registry.css',
    code: Buffer.from(''),
    visitor: {
      StyleSheetExit(sheet) {
        sheet.rules = atomList.map((atom) =>
          wrapInCondition(atom, atomStyleRule(atom))
        )
        return sheet
      },
    },
  })

  return Buffer.from(result.code).toString('utf8')
}
