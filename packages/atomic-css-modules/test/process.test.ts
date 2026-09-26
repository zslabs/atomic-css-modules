import { describe, expect, it } from 'vitest'
import { processCssModules } from '../src/process.js'
import { formatAtomizationReport } from '../src/report.js'

const registryImportPath = './atomic-registry.css'

function run(code: string) {
  const result = processCssModules(
    [{ filePath: 'component.module.css', code }],
    { registryImportPath }
  )
  const file = result.files[0]
  if (!file) throw new Error('expected one rewritten file')
  return {
    code: file.code,
    changed: file.changed,
    registryCss: result.registryCss,
  }
}

function extractComposedNames(ruleCss: string): string[] {
  const match = /composes:\s*([^;]+?)\s+from/.exec(ruleCss)
  if (!match?.[1]) throw new Error(`no composes found in: ${ruleCss}`)
  return match[1].split(/\s+/)
}

describe('atomization report', () => {
  it('counts atoms, skipped rules, and byte sizes', () => {
    const kept = '.a { color: red; }\n'
    const skipped = '.a .b { display: block; }\n'
    const result = processCssModules(
      [
        { filePath: 'kept.module.css', code: kept },
        { filePath: 'skip.module.css', code: skipped },
      ],
      { registryImportPath }
    )

    expect(result.report).toEqual({
      files: 2,
      atoms: 1,
      skippedRules: 1,
      bytesIn: Buffer.byteLength(kept + skipped, 'utf8'),
      registryBytes: Buffer.byteLength(result.registryCss, 'utf8'),
      skips: [
        {
          filePath: 'skip.module.css',
          selector: '.a .b',
          reason: 'combinator',
        },
      ],
    })
    expect(result.report.registryBytes).toBeGreaterThan(0)
  })

  it('records a skip reason for each unsupported selector shape', () => {
    const result = processCssModules(
      [
        { filePath: 'combo.module.css', code: '.a .b { color: red; }\n' },
        { filePath: 'compound.module.css', code: '.a.b { color: red; }\n' },
        { filePath: 'element.module.css', code: 'div { color: red; }\n' },
        { filePath: 'mixed.module.css', code: '.a, div { color: red; }\n' },
        { filePath: 'fn.module.css', code: '.a:not(.b) { color: red; }\n' },
        {
          filePath: 'chain.module.css',
          code: '.a:hover:focus { color: red; }\n',
        },
        {
          filePath: 'short.module.css',
          code: '.a { margin: 0; margin-left: 4px; }\n',
        },
      ],
      { registryImportPath }
    )

    expect(result.report.skips).toEqual([
      {
        filePath: 'combo.module.css',
        selector: '.a .b',
        reason: 'combinator',
      },
      {
        filePath: 'compound.module.css',
        selector: '.a.b',
        reason: 'compound',
      },
      {
        filePath: 'element.module.css',
        selector: 'div',
        reason: 'element',
      },
      {
        filePath: 'mixed.module.css',
        selector: '.a, div',
        reason: 'mixed-group',
      },
      {
        filePath: 'fn.module.css',
        selector: '.a:not(.b)',
        reason: 'functional-pseudo',
      },
      {
        filePath: 'chain.module.css',
        selector: '.a:hover:focus',
        reason: 'chained-pseudo',
      },
      {
        filePath: 'short.module.css',
        selector: '.a',
        reason: 'shorthand-conflict',
      },
    ])
    expect(result.report.skippedRules).toBe(7)
  })

  it('includes skip reason buckets in the summary line', () => {
    const result = processCssModules(
      [
        { filePath: 'combo.module.css', code: '.a .b { color: red; }\n' },
        { filePath: 'mixed.module.css', code: '.a, div { color: red; }\n' },
      ],
      { registryImportPath }
    )
    expect(formatAtomizationReport(result.report)).toBe(
      [
        `atomic-css-modules: 0 atoms, 2 skipped rules (1 combinator, 1 mixed-group), ${result.report.bytesIn}B in → ${result.report.registryBytes}B registry`,
        '  combinator: descendant or sibling selector (.a .b)',
        '  mixed-group: grouped list with an ineligible member (.a, div)',
      ].join('\n')
    )
  })

  it('appends one skip per line when the report is verbose', () => {
    const result = processCssModules(
      [{ filePath: 'combo.module.css', code: '.a .b { color: red; }\n' }],
      { registryImportPath }
    )
    expect(formatAtomizationReport(result.report, { verbose: true })).toBe(
      [
        `atomic-css-modules: 0 atoms, 1 skipped rule (1 combinator), ${result.report.bytesIn}B in → ${result.report.registryBytes}B registry`,
        '  combo.module.css  .a .b  combinator',
        '  combinator: descendant or sibling selector (.a .b)',
      ].join('\n')
    )
  })
})

describe('composeFrom global', () => {
  it('emits composes from global so the registry is not imported per module', () => {
    const result = processCssModules(
      [{ filePath: 'component.module.css', code: '.a { color: red; }' }],
      { registryImportPath: './atomic-registry.css', composeFrom: 'global' }
    )
    const file = result.files[0]
    if (!file) throw new Error('expected one rewritten file')
    expect(file.code).toMatch(/composes:\s*[a-z][a-z0-9]+ from global;/)
    expect(file.code).not.toContain('atomic-registry.css')
  })
})

describe('existing composes', () => {
  it('keeps a user composes and adds atomic composes beside it', () => {
    const { code, registryCss } = run(`
      .button {
        composes: base from "./base.module.css";
        color: red;
      }
    `)

    expect(code).toMatch(/composes:\s*base from "\.\/base\.module\.css"/)
    expect(code).toMatch(
      /composes:\s*[a-z][a-z0-9]+ from "\.\/atomic-registry\.css"/
    )
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
    expect(registryCss).not.toMatch(/composes/)
  })

  it('merges atomic class names into an existing registry composes', () => {
    const { code } = run(`
      .button {
        composes: already from "./atomic-registry.css";
        color: red;
      }
    `)

    const names = extractComposedNames(code)
    expect(names).toContain('already')
    expect(names.length).toBeGreaterThan(1)
    expect(code.match(/composes:/g)).toHaveLength(1)
  })
})

describe('debug atom names', () => {
  it('uses a readable class name when debugNames is on', () => {
    const result = processCssModules(
      [{ filePath: 'button.module.css', code: '.a { color: red; }' }],
      { registryImportPath: './atomic-registry.css', debugNames: true }
    )
    const file = result.files[0]
    if (!file) throw new Error('expected one rewritten file')
    expect(file.code).toMatch(/composes:\s*color-red-[a-z0-9]+\b/)
    expect(result.registryCss).toMatch(/\.color-red-[a-z0-9]+\s*\{/)
  })

  it('prefixes a trailing pseudo in the debug name', () => {
    const result = processCssModules(
      [{ filePath: 'button.module.css', code: '.a:hover { color: blue; }' }],
      { registryImportPath: './atomic-registry.css', debugNames: true }
    )
    expect(result.registryCss).toMatch(/\.hover-color-00f-[a-z0-9]+:hover\s*\{/)
  })

  it('gives distinct debug names for the same decl under different media queries', () => {
    const result = processCssModules(
      [
        {
          filePath: 'responsive.module.css',
          code: `
            @media (min-width: 600px) { .a { color: red; } }
            @media (min-width: 800px) { .b { color: red; } }
          `,
        },
      ],
      { registryImportPath: './atomic-registry.css', debugNames: true }
    )
    const names = [
      ...result.registryCss.matchAll(/\.(md-color-red-[a-z0-9]+)/g),
    ].map((match) => match[1])
    expect(names).toHaveLength(2)
    expect(names[0]).not.toBe(names[1])
    expect(result.registryCss).toMatch(/@media \(width >= 600px\)/)
    expect(result.registryCss).toMatch(/@media \(width >= 800px\)/)
  })
})

describe('source maps', () => {
  it('keeps a source map for grouped local class lists', () => {
    const original = '.a, .b { color: red; }'
    const result = processCssModules(
      [{ filePath: 'group.module.css', code: original }],
      { registryImportPath: './atomic-registry.css', sourceMap: true }
    )
    const file = result.files[0]
    if (!file) throw new Error('expected one rewritten file')
    expect(file.code).not.toMatch(/\.a\s*,\s*\.b/)
    expect(file.code).toMatch(/\.a\s*\{/)
    expect(file.code).toMatch(/\.b\s*\{/)
    expect(file.map).toBeTruthy()
    const map = JSON.parse(file.map ?? '') as {
      sources: string[]
      mappings: string
      sourcesContent?: string[]
    }
    expect(map.sources).toContain('group.module.css')
    expect(map.mappings.length).toBeGreaterThan(0)

    // Printer regroups identical compose siblings; text split repairs CSS.
    // Rebuilt maps must still land inside the original grouped rule.
    const generated = file.code
    const consumer = decodeBasicMappings(map.mappings)
    for (const selector of ['.a', '.b'] as const) {
      const generatedIndex = generated.indexOf(selector)
      expect(generatedIndex).toBeGreaterThanOrEqual(0)
      const { line, column } = offsetToLineColumn(generated, generatedIndex)
      const originalPos = consumer.originalPositionFor(line, column)
      expect(originalPos).toBeTruthy()
      if (!originalPos) throw new Error('expected mapping')
      const originalIndex = lineColumnToOffset(
        original,
        originalPos.line,
        originalPos.column
      )
      expect(original.slice(originalIndex, originalIndex + 6)).toContain('.a')
    }
  })
})

/** Minimal VLQ segment decoder for asserting source-map honesty in tests. */
function decodeVlq(segment: string): number[] {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const values: number[] = []
  let value = 0
  let shift = 0
  for (const char of segment) {
    const digit = chars.indexOf(char)
    if (digit < 0) continue
    const hasContinuation = (digit & 32) !== 0
    value += (digit & 31) << shift
    if (hasContinuation) {
      shift += 5
      continue
    }
    const negated = (value & 1) === 1
    const abs = value >> 1
    values.push(negated ? -abs : abs)
    value = 0
    shift = 0
  }
  return values
}

function decodeBasicMappings(mappings: string): {
  originalPositionFor: (
    generatedLine: number,
    generatedColumn: number
  ) => { line: number; column: number } | null
} {
  type Entry = {
    generatedColumn: number
    sourceLine: number
    sourceColumn: number
  }
  const lines: Entry[][] = []
  let sourceLine = 0
  let sourceColumn = 0
  for (const line of mappings.split(';')) {
    const entries: Entry[] = []
    let generatedColumn = 0
    if (line.length > 0) {
      for (const segment of line.split(',')) {
        const parts = decodeVlq(segment)
        generatedColumn += parts[0] ?? 0
        if (parts.length >= 4) {
          sourceLine += parts[2] ?? 0
          sourceColumn += parts[3] ?? 0
          entries.push({
            generatedColumn,
            sourceLine,
            sourceColumn,
          })
        }
      }
    }
    lines.push(entries)
  }
  return {
    originalPositionFor(generatedLine, generatedColumn) {
      const entries = lines[generatedLine] ?? []
      let best: Entry | null = null
      for (const entry of entries) {
        if (entry.generatedColumn > generatedColumn) break
        best = entry
      }
      if (!best) return null
      return { line: best.sourceLine, column: best.sourceColumn }
    },
  }
}

function offsetToLineColumn(
  text: string,
  offset: number
): { line: number; column: number } {
  let line = 0
  let column = 0
  for (let index = 0; index < offset; index++) {
    if (text[index] === '\n') {
      line++
      column = 0
    } else {
      column++
    }
  }
  return { line, column }
}

function lineColumnToOffset(
  text: string,
  line: number,
  column: number
): number {
  let currentLine = 0
  let index = 0
  while (currentLine < line && index < text.length) {
    if (text[index] === '\n') currentLine++
    index++
  }
  return index + column
}

describe('plain class dedup', () => {
  it('shares an identical declaration between two rules', () => {
    const { code, registryCss } = run(`
      .component { background: blue; font-size: 12px; }
      .component2 { background: blue; text-align: center; }
    `)

    const componentRule = /\.component\s*\{[^}]*\}/.exec(code)?.[0]
    const component2Rule = /\.component2\s*\{[^}]*\}/.exec(code)?.[0]
    expect(componentRule).toBeTruthy()
    expect(component2Rule).toBeTruthy()

    const componentAtoms = extractComposedNames(componentRule!)
    const component2Atoms = extractComposedNames(component2Rule!)
    expect(componentAtoms).toHaveLength(2)
    expect(component2Atoms).toHaveLength(2)

    // The shared `background: blue` atom must be identical between both rules.
    const shared = componentAtoms.filter((name) =>
      component2Atoms.includes(name)
    )
    expect(shared).toHaveLength(1)

    for (const name of [...componentAtoms, ...component2Atoms]) {
      expect(registryCss).toContain(`.${name}`)
    }
    expect(registryCss).toMatch(/background:\s*(blue|#00f)/)
    expect(registryCss).toContain('font-size: 12px')
    expect(registryCss).toContain('text-align: center')
  })
})

describe('simple pseudo-selectors', () => {
  it('hoists a trailing simple pseudo onto the atomic class itself', () => {
    const { code, registryCss } = run(`.button:hover { color: red; }`)

    expect(code).not.toContain(':hover')
    expect(code).toMatch(
      /\.button\s*\{\s*composes:\s*[a-z][a-z0-9]+ from "\.\/atomic-registry\.css";\s*\}/
    )

    const [name] = extractComposedNames(code)
    expect(registryCss).toMatch(
      new RegExp(`\\.${name}:hover\\s*\\{\\s*color:\\s*red;`)
    )
  })

  it('leaves a functional or chained pseudo completely untouched', () => {
    const notCode = run(`.a:not(.b) { color: red; }`).code
    expect(notCode.replace(/\s+/g, ' ').trim()).toBe(
      '.a:not(.b) { color: red; }'
    )

    const chainedCode = run(`.a:hover:focus { color: red; }`).code
    expect(chainedCode.replace(/\s+/g, ' ').trim()).toBe(
      '.a:hover:focus { color: red; }'
    )
  })
})

describe('media queries', () => {
  it('moves a media-scoped declaration into the registry and composes it onto the bare rule', () => {
    const { code, registryCss } = run(`
      .card { background: white; }
      @media (min-width: 600px) {
        .card { padding: 16px; }
      }
    `)

    expect(code).not.toContain('@media')
    const cardRule = /\.card\s*\{[^}]*\}/.exec(code)?.[0]
    expect(cardRule).toBeTruthy()
    const names = extractComposedNames(cardRule!)
    expect(names).toHaveLength(2)

    expect(registryCss).toMatch(
      /@media \(width >= 600px\)\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*padding:\s*16px;/
    )
  })

  it('synthesizes a bare class when the only rule is inside @media', () => {
    const { code, registryCss } = run(`
      @media (min-width: 600px) {
        .card { padding: 16px; }
      }
    `)

    expect(code).not.toContain('@media')
    expect(code).toMatch(
      /\.card\s*\{\s*composes:\s*[a-z][a-z0-9]+ from "\.\/atomic-registry\.css";\s*\}/
    )
    expect(registryCss).toMatch(
      /@media \(width >= 600px\)\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*padding:\s*16px;/
    )
  })

  it('synthesizes a bare class for a media-scoped pseudo when no bare rule exists', () => {
    const { code, registryCss } = run(`
      @media (min-width: 600px) {
        .card:hover { color: blue; }
      }
    `)

    expect(code).not.toContain('@media')
    expect(code).not.toContain(':hover')
    expect(code).toMatch(/\.card\s*\{/)
    expect(extractComposedNames(code)).toHaveLength(1)
    expect(registryCss).toMatch(
      /@media \(width >= 600px\)\s*\{\s*\.[a-z][a-z0-9]+:hover\s*\{\s*color:\s*(blue|#00f)/
    )
  })
})

describe('@supports and @container', () => {
  it('moves a supports-scoped declaration into the registry and composes it onto the bare rule', () => {
    const { code, registryCss } = run(`
      .card { color: red; }
      @supports (display: grid) {
        .card { display: grid; }
      }
    `)

    expect(code).not.toContain('@supports')
    const names = extractComposedNames(code)
    expect(names).toHaveLength(2)
    expect(registryCss).toMatch(
      /@supports \(display: grid\)\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*display:\s*grid;/
    )
  })

  it('moves a container-scoped declaration into the registry and composes it onto the bare rule', () => {
    const { code, registryCss } = run(`
      .card { color: red; }
      @container (min-width: 400px) {
        .card { font-size: 20px; }
      }
    `)

    expect(code).not.toContain('@container')
    const names = extractComposedNames(code)
    expect(names).toHaveLength(2)
    expect(registryCss).toMatch(/@container/)
    expect(registryCss).toMatch(/font-size:\s*20px/)
  })
})

describe('nested CSS', () => {
  it('hoists a nested &:hover onto the parent class and the atom', () => {
    const { code, registryCss } = run(`
      .button {
        color: red;
        &:hover { color: blue; }
      }
    `)

    expect(code).not.toContain(':hover')
    expect(code).not.toContain('&')
    const names = extractComposedNames(code)
    expect(names).toHaveLength(2)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
    expect(registryCss).toMatch(
      /\.[a-z][a-z0-9]+:hover\s*\{\s*color:\s*(blue|#00f)/
    )
  })

  it('moves nested @media declarations onto the parent class', () => {
    const { code, registryCss } = run(`
      .card {
        background: white;
        @media (min-width: 600px) {
          padding: 16px;
        }
      }
    `)

    expect(code).not.toContain('@media')
    const names = extractComposedNames(code)
    expect(names).toHaveLength(2)
    expect(registryCss).toMatch(
      /@media \(width >= 600px\)\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*padding:\s*16px;/
    )
  })

  it('leaves ineligible nested descendants in place while atomizing the parent', () => {
    const { code, registryCss } = run(`
      .card {
        color: red;
        .child { color: blue; }
      }
    `)

    expect(code).toMatch(/composes:/)
    expect(code).toMatch(/\.child\s*\{\s*color:\s*(blue|#00f)/)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
    expect(registryCss).not.toMatch(/color:\s*(blue|#00f)/)
  })

  it('atomizes nested-declarations under a simple pseudo parent', () => {
    const { code, registryCss } = run(`
      .card:hover {
        color: red;
        .child { padding: 1px; }
        margin: 2px;
      }
    `)

    expect(code).not.toMatch(/margin:\s*2px/)
    expect(code).not.toMatch(/color:\s*(red|#f00)/)
    expect(code).toMatch(/\.child\s*\{\s*padding:\s*1px/)
    const names = extractComposedNames(code)
    expect(names.length).toBeGreaterThanOrEqual(2)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
    expect(registryCss).toMatch(/margin:\s*2px/)
    expect(registryCss).toMatch(/\.card:hover|\.[a-z][a-z0-9]+:hover/)
  })
})

describe('@layer and @scope', () => {
  it('keeps layered and unlayered declarations as distinct atoms', () => {
    const { code, registryCss } = run(`
      @layer utilities {
        .card { color: red; }
      }
      .box { color: red; }
    `)

    expect(code).not.toContain('@layer')
    const cardNames = extractComposedNames(
      /\.card\s*\{[^}]*\}/.exec(code)?.[0] ?? ''
    )
    const boxNames = extractComposedNames(
      /\.box\s*\{[^}]*\}/.exec(code)?.[0] ?? ''
    )
    expect(cardNames).toHaveLength(1)
    expect(boxNames).toHaveLength(1)
    expect(cardNames[0]).not.toBe(boxNames[0])
    expect(registryCss).toMatch(
      /@layer utilities\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*color:\s*(red|#f00)/
    )
    expect(registryCss).toMatch(
      new RegExp(`\\.${boxNames[0]}\\s*\\{\\s*color:\\s*(red|#f00)`)
    )
  })

  it('preserves layer wrapping around a nested media query', () => {
    const { code, registryCss } = run(`
      @layer utilities {
        @media (min-width: 600px) {
          .card { padding: 16px; }
        }
      }
    `)

    expect(code).not.toContain('@layer')
    expect(code).not.toContain('@media')
    expect(extractComposedNames(code)).toHaveLength(1)
    expect(registryCss).toMatch(
      /@layer utilities\s*\{\s*@media \(width >= 600px\)\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*padding:\s*16px;/
    )
  })

  it('moves a scoped declaration into the registry and composes it onto the bare rule', () => {
    const { code, registryCss } = run(`
      @scope (.card) {
        .title { color: red; }
      }
    `)

    expect(code).not.toContain('@scope')
    expect(extractComposedNames(code)).toHaveLength(1)
    expect(registryCss).toMatch(/@scope/)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
  })
})

describe('@starting-style', () => {
  it('moves a starting-style declaration into the registry and composes it onto the bare rule', () => {
    const { code, registryCss } = run(`
      .card { opacity: 1; }
      @starting-style {
        .card { opacity: 0; }
      }
    `)

    expect(code).not.toContain('@starting-style')
    expect(extractComposedNames(code)).toHaveLength(2)
    expect(registryCss).toMatch(
      /@starting-style\s*\{\s*\.[a-z][a-z0-9]+\s*\{\s*opacity:\s*0;/
    )
  })
})

describe('!important', () => {
  it('keeps important declarations in their own atom and preserves the flag', () => {
    const { code, registryCss } = run(`.a { color: red !important; }`)
    const [name] = extractComposedNames(code)
    expect(registryCss).toMatch(
      new RegExp(`\\.${name}\\s*\\{\\s*color:\\s*red\\s*!important;`)
    )
  })
})

describe('shorthand and longhand in the same rule', () => {
  it('leaves conflicting shorthand/longhand declarations inline', () => {
    const { changed, code } = run(`.box { margin: 8px; margin-left: 16px; }`)
    expect(changed).toBe(false)
    expect(code.replace(/\s+/g, ' ').trim()).toBe(
      '.box { margin: 8px; margin-left: 16px; }'
    )
  })

  it('still atomizes sibling longhands of the same shorthand', () => {
    const { code, registryCss } = run(
      `.mono { font-family: monospace; font-size: 12px; }`
    )
    expect(code).toMatch(/composes:/)
    expect(registryCss).toMatch(/font-family:\s*monospace/)
    expect(registryCss).toMatch(/font-size:\s*12px/)
  })
})

describe('custom properties', () => {
  it('atomizes custom properties', () => {
    const { code, registryCss } = run(`.a { --brand: blue; color: red; }`)
    expect(code).toMatch(/composes:/)
    expect(registryCss).toMatch(/--brand:\s*blue/)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
  })

  it('atomizes var() font-size and line-height', () => {
    const { registryCss } = run(
      `.a { font-size: var(--text-base); line-height: var(--text-base--line-height); }`
    )
    expect(registryCss).toMatch(/var\(--text-base\)/)
    expect(registryCss).toMatch(/var\(--text-base--line-height\)/)
  })
})

describe('unsupported selectors', () => {
  it.each([
    ['#header { color: red; }'],
    ['div { color: red; }'],
    ['[data-theme="dark"] { color: red; }'],
    [':root { color: red; }'],
  ])('leaves %s untouched', (css) => {
    const { changed, code } = run(css)
    expect(changed).toBe(false)
    expect(code.replace(/\s+/g, ' ').trim()).toBe(
      css.replace(/\s+/g, ' ').trim()
    )
  })

  it('splits a grouped list of local classes into compose targets', () => {
    const { code, registryCss } = run(`.a, .b { color: red; }`)
    expect(code).not.toMatch(/\.a\s*,\s*\.b/)
    const aNames = extractComposedNames(/\.a\s*\{[^}]*\}/.exec(code)?.[0] ?? '')
    const bNames = extractComposedNames(/\.b\s*\{[^}]*\}/.exec(code)?.[0] ?? '')
    expect(aNames).toEqual(bNames)
    expect(aNames).toHaveLength(1)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
  })

  it('leaves a grouped list untouched when any selector is ineligible', () => {
    const { changed, code } = run(`.a, div { color: red; }`)
    expect(changed).toBe(false)
    expect(code.replace(/\s+/g, ' ').trim()).toBe('.a, div { color: red; }')
  })

  it.each([
    ['.masthead strong { color: red; }'],
    ['.card.featured { color: red; }'],
    ['.list > .item { color: red; }'],
  ])(
    'leaves %s untouched because composes needs a single local class',
    (css) => {
      const { changed, code } = run(css)
      expect(changed).toBe(false)
      expect(code).not.toContain('composes:')
    }
  )
})

describe('atomic skip comment', () => {
  it('leaves a rule with a leading block comment inline', () => {
    const { changed, code, registryCss } = run(`
      .a {
        /* atomic: skip */
        color: red;
      }
      .b { color: blue; }
    `)
    expect(changed).toBe(true)
    expect(code).toMatch(/\.a\s*\{[^}]*color:\s*(red|#f00)/)
    expect(code).not.toMatch(/\.a\s*\{[^}]*composes:/)
    expect(code).toMatch(/\.b\s*\{[^}]*composes:/)
    expect(registryCss).toMatch(/color:\s*(blue|#00f)/)
    expect(registryCss).not.toMatch(/color:\s*(red|#f00)/)
  })

  it('leaves a rule with a preceding skip comment inline', () => {
    const { changed, code, registryCss } = run(`
      /* atomic: skip */
      .a { color: red; }
    `)
    expect(changed).toBe(false)
    expect(code).toMatch(/color:\s*(red|#f00)/)
    expect(code).not.toContain('composes:')
    expect(registryCss).toBe('')
  })

  it('records skip-comment on the report', () => {
    const result = processCssModules(
      [
        {
          filePath: 'skip.module.css',
          code: '.a { /* atomic: skip */ color: red; }\n',
        },
      ],
      { registryImportPath }
    )
    expect(result.report.skips).toEqual([
      {
        filePath: 'skip.module.css',
        selector: '.a',
        reason: 'skip-comment',
      },
    ])
  })

  it('honors skip on a nested hover rule without blocking the parent', () => {
    const { code, registryCss } = run(`
      .a {
        color: blue;
        /* atomic: skip */
        &:hover { color: red; }
      }
    `)
    expect(code).toMatch(/composes:/)
    expect(code).toMatch(/:hover/)
    expect(code).toMatch(/color:\s*(red|#f00)/)
    expect(registryCss).toMatch(/color:\s*(blue|#00f)/)
    expect(registryCss).not.toMatch(/:hover/)
  })

  it('honors skip inside an at-rule', () => {
    const { code, registryCss } = run(`
      .a { color: blue; }
      @media (min-width: 600px) {
        /* atomic: skip */
        .a { padding: 16px; }
      }
    `)
    expect(code).toMatch(/composes:/)
    expect(code).toMatch(/@media/)
    expect(code).toMatch(/padding:\s*16px/)
    expect(registryCss).toMatch(/color:\s*(blue|#00f)/)
    expect(registryCss).not.toMatch(/padding/)
  })
})

describe('import and namespace rules', () => {
  it('rewrites atomizable rules in a file that still has @import', () => {
    const { code, registryCss, changed } = run(`
      @import url("theme.css");
      .a { color: red; }
    `)
    expect(changed).toBe(true)
    expect(code).toMatch(/@import/)
    expect(code).toMatch(/composes:/)
    expect(registryCss).toMatch(/color:\s*(red|#f00)/)
  })
})

describe('url() fingerprints', () => {
  it('dedupes identical url() values despite different source locations', () => {
    const { code, registryCss } = run(`
      .a { background: url(./img.png); }
      .bb { background: url(./img.png); }
    `)
    const aNames = extractComposedNames(/\.a\s*\{[^}]*\}/.exec(code)?.[0] ?? '')
    const bNames = extractComposedNames(
      /\.bb\s*\{[^}]*\}/.exec(code)?.[0] ?? ''
    )
    expect(aNames).toEqual(bNames)
    expect(aNames).toHaveLength(1)
    expect(registryCss.match(/background:/g)?.length ?? 0).toBe(1)
  })
})

describe('grouped selectors with nesting', () => {
  it('atomizes nested hover for every member of a local class group', () => {
    const { code, registryCss } = run(`
      .a, .b {
        color: green;
        &:hover { color: red; }
      }
    `)
    const aNames = extractComposedNames(/\.a\s*\{[^}]*\}/.exec(code)?.[0] ?? '')
    const bNames = extractComposedNames(/\.b\s*\{[^}]*\}/.exec(code)?.[0] ?? '')
    expect(aNames).toHaveLength(2)
    expect(bNames).toHaveLength(2)
    expect(new Set(aNames)).toEqual(new Set(bNames))
    expect(registryCss).toMatch(/color:\s*(green|#0f0)/)
    expect(registryCss).toMatch(/:hover\s*\{\s*color:\s*(red|#f00)/)
  })
})

describe('duplicate same-selector rules', () => {
  it('merges registry composes into a single declaration', () => {
    const { code } = run(`
      .a { color: red; }
      .a { color: blue; }
    `)
    const rule = /\.a\s*\{[^}]*\}/.exec(code)?.[0] ?? ''
    expect(rule.match(/composes:/g)?.length ?? 0).toBe(1)
    const names = extractComposedNames(rule)
    expect(names).toHaveLength(2)
  })
})
