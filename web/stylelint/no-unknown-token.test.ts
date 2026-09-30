import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'
import plugin, { ruleName } from './index.ts'

async function lint(code: string) {
  const result = await stylelint.lint({
    code,
    config: {
      plugins: [plugin],
      rules: {
        [ruleName]: true,
      },
    },
  })
  const warnings = result.results[0]?.warnings ?? []
  return warnings.map((warning) => warning.text)
}

describe('design-token/no-unknown', () => {
  it('allows a token path that resolves to a leaf', async () => {
    expect(await lint(`.a { color: token('color.slate.1'); }`)).toEqual([])
  })

  it('allows a DEFAULT-backed branch path', async () => {
    expect(
      await lint(
        `.a { font-family: token('font.default'); padding: token('spacing.0.5'); }`
      )
    ).toEqual([])
  })

  it('flags a token path that does not exist', async () => {
    const warnings = await lint(`.a { color: token('color.slat.1'); }`)
    expect(warnings).toEqual([
      `Unknown design token: "color.slat.1". Did you mean "color.slate.1"? (${ruleName})`,
    ])
  })

  it('suggests a root token when the name is a close typo', async () => {
    const warnings = await lint(`.a { padding: token('space.4'); }`)
    expect(warnings).toEqual([
      `Unknown design token: "space.4". Did you mean "spacing.4"? (${ruleName})`,
    ])
  })

  it('suggests the nearest spacing token when a half step is missing', async () => {
    const warnings = await lint(`.a { padding: token('spacing.9.5'); }`)
    expect(warnings).toEqual([
      `Unknown design token: "spacing.9.5". Did you mean "spacing.9"? (${ruleName})`,
    ])
  })

  it('does not guess when the unknown token is not close to one', async () => {
    const warnings = await lint(`.a { padding: token('spacing.nope'); }`)
    expect(warnings).toEqual([
      `Unknown design token: "spacing.nope" (${ruleName})`,
    ])
  })

  it('flags token() without a single string argument', async () => {
    const warnings = await lint(`.a { color: token(color.slate.1); }`)
    expect(warnings).toEqual([
      `token() expects exactly one string argument, e.g. token('color.slate.1') (${ruleName})`,
    ])
  })

  it('flags token() with more than one argument', async () => {
    const warnings = await lint(
      `.a { color: token('color.slate.1', 'color.slate.2'); }`
    )
    expect(warnings[0]).toContain('exactly one string argument')
  })

  it('flags an empty token() call', async () => {
    const warnings = await lint(`.a { color: token(); }`)
    expect(warnings[0]).toContain('exactly one string argument')
  })

  it('flags an unknown token() nested in another function', async () => {
    const warnings = await lint(
      `.a { background: black calc(100% - token('spacing.nope')); }`
    )
    expect(warnings[0]).toContain('Unknown design token: "spacing.nope"')
  })

  it('ignores token() written inside a string', async () => {
    expect(await lint(`.a { content: "token('color.nope')"; }`)).toEqual([])
  })

  it('allows @token-text with a text style ident', async () => {
    expect(await lint(`.a { @token-text base; }`)).toEqual([])
  })

  it('allows a quoted @token-text key', async () => {
    expect(await lint(`.a { @token-text '4xl'; }`)).toEqual([])
  })

  it('flags an unknown @token-text key', async () => {
    const warnings = await lint(`.a { @token-text nope; }`)
    expect(warnings).toEqual([`Unknown text token: "nope" (${ruleName})`])
  })

  it('suggests a text style when the key is a close typo', async () => {
    const warnings = await lint(`.a { @token-text bsae; }`)
    expect(warnings).toEqual([
      `Unknown text token: "bsae". Did you mean "base"? (${ruleName})`,
    ])
  })

  it('flags @token-text without an ident or string', async () => {
    const warnings = await lint(`.a { @token-text 4xl; }`)
    expect(warnings[0]).toContain(
      "@token-text expects an ident or string, e.g. @token-text base; or @token-text '4xl';"
    )
  })

  it('flags @token-text with an empty prelude', async () => {
    const warnings = await lint(`.a { @token-text; }`)
    expect(warnings[0]).toContain('@token-text expects an ident or string')
  })
})
