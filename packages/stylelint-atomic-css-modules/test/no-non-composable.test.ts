import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'
import plugin, { ruleName } from '../src/index.js'

async function lint(
  code: string,
  secondary?: { selectors?: boolean; declarations?: boolean }
) {
  const result = await stylelint.lint({
    code,
    config: {
      plugins: [plugin],
      rules: {
        [ruleName]: secondary === undefined ? true : [true, secondary],
      },
    },
  })
  const warnings = result.results[0]?.warnings ?? []
  return warnings.map((warning) => ({
    text: warning.text,
    line: warning.line,
    column: warning.column,
  }))
}

describe('atomic-css-modules/no-non-composable', () => {
  it('allows a composable local class', async () => {
    expect(await lint('.card { color: red; }')).toEqual([])
  })

  it('allows a trailing simple pseudo', async () => {
    expect(await lint('.card:hover { color: red; }')).toEqual([])
  })

  it('allows sibling longhands', async () => {
    expect(
      await lint('.card { font-size: 12px; font-family: sans-serif; }')
    ).toEqual([])
  })

  it('warns on combinator selectors', async () => {
    const warnings = await lint('.a .b { color: red; }')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('combinator')
  })

  it('warns on compound selectors', async () => {
    const warnings = await lint('.a.b { color: red; }')
    expect(warnings[0]?.text).toContain('compound')
  })

  it('warns on element selectors', async () => {
    const warnings = await lint('div { color: red; }')
    expect(warnings[0]?.text).toContain('element')
  })

  it('warns on mixed groups', async () => {
    const warnings = await lint('.a, div { color: red; }')
    expect(warnings[0]?.text).toContain('mixed-group')
  })

  it('warns on functional pseudos', async () => {
    const warnings = await lint('.a:not(.b) { color: red; }')
    expect(warnings[0]?.text).toContain('functional-pseudo')
  })

  it('warns on chained pseudos', async () => {
    const warnings = await lint('.a:hover:focus { color: red; }')
    expect(warnings[0]?.text).toContain('chained-pseudo')
  })

  it('warns on shorthand conflicts', async () => {
    const warnings = await lint('.a { margin: 0; margin-left: 4px; }')
    expect(warnings.length).toBeGreaterThanOrEqual(2)
    expect(warnings.every((warning) => warning.text.includes('margin'))).toBe(
      true
    )
    expect(
      warnings.every((warning) => warning.text.includes('shorthand-conflict'))
    ).toBe(true)
  })

  it('stays quiet for atomic: skip before a rule', async () => {
    expect(
      await lint(`/* atomic: skip */
.a .b { color: red; }`)
    ).toEqual([])
  })

  it('stays quiet for atomic: skip inside a rule', async () => {
    expect(
      await lint(`.a {
  /* atomic: skip */
  margin: 0;
  margin-left: 4px;
}`)
    ).toEqual([])
  })

  it('can disable selector checks', async () => {
    const warnings = await lint('.a .b { color: red; }', {
      selectors: false,
      declarations: true,
    })
    expect(warnings).toEqual([])
  })

  it('can disable declaration checks', async () => {
    const warnings = await lint('.a { margin: 0; margin-left: 4px; }', {
      selectors: true,
      declarations: false,
    })
    expect(warnings).toEqual([])
  })

  it('warns on nested descendant selectors after resolving nesting', async () => {
    const warnings = await lint(`.card {
  .child { color: red; }
}`)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('combinator')
  })

  it('allows nested simple pseudos', async () => {
    expect(
      await lint(`.card {
  &:hover { color: blue; }
}`)
    ).toEqual([])
  })

  it('honors skip on a nested rule without silencing the parent', async () => {
    const warnings = await lint(`.a {
  color: blue;
  /* atomic: skip */
  .child { color: red; }
}`)
    expect(warnings).toEqual([])
  })

  it('ignores keyframes selectors', async () => {
    expect(
      await lint(`@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}`)
    ).toEqual([])
  })
})
