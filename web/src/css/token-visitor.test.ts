import { transform } from 'lightningcss'
import { describe, expect, it } from 'vitest'
import {
  applyTokenVisitor,
  createTokenVisitor,
  expandTokenTextCss,
  listTokenPaths,
  listTokenTextKeys,
  resolveTokenPath,
  tokenCustomAtRules,
} from './token-visitor.ts'
import { tokens } from './tokens.ts'

function transformWithTokens(
  code: string,
  options: { targets?: boolean } = {}
): string {
  const result = transform({
    filename: 'test.css',
    minify: true,
    ...(options.targets === true ? { targets: { chrome: 100 << 16 } } : {}),
    code: new TextEncoder().encode(code),
    customAtRules: tokenCustomAtRules,
    visitor: createTokenVisitor(tokens),
  })
  return result.code.toString()
}

describe('resolveTokenPath', () => {
  it('resolves nested color leaves', () => {
    expect(resolveTokenPath(tokens, 'color.slate.1')).toBe(
      tokens.color.slate['1']
    )
  })

  it('resolves DEFAULT via the parent path', () => {
    expect(resolveTokenPath(tokens, 'spacing')).toBe(tokens.spacing.DEFAULT)
    expect(resolveTokenPath(tokens, 'text.base')).toBe(tokens.text.base.DEFAULT)
    expect(resolveTokenPath(tokens, 'font.default')).toBe(
      tokens.font.default.DEFAULT
    )
  })

  it('resolves nested modifiers', () => {
    expect(resolveTokenPath(tokens, 'text.base.lineHeight')).toBe(
      tokens.text.base.lineHeight
    )
    expect(resolveTokenPath(tokens, 'font.weight.normal')).toBe(
      tokens.font.weight.normal
    )
  })

  it('resolves half-step spacing via dotted paths', () => {
    expect(resolveTokenPath(tokens, 'spacing.2')).toBe(
      tokens.spacing['2'].DEFAULT
    )
    expect(resolveTokenPath(tokens, 'spacing.2.5')).toBe(
      tokens.spacing['2']['5']
    )
    expect(resolveTokenPath(tokens, 'spacing.0.5')).toBe(
      tokens.spacing['0']['5']
    )
    expect(resolveTokenPath(tokens, 'spacing.1.5')).toBe(
      tokens.spacing['1']['5']
    )
    expect(resolveTokenPath(tokens, 'spacing.3.5')).toBe(
      tokens.spacing['3']['5']
    )
  })

  it('returns undefined for unknown paths', () => {
    expect(resolveTokenPath(tokens, 'color.slat.1')).toBeUndefined()
    expect(resolveTokenPath(tokens, '')).toBeUndefined()
    expect(resolveTokenPath(tokens, 'color..slate')).toBeUndefined()
  })
})

describe('listTokenPaths', () => {
  it('includes DEFAULT-backed and nested leaves with matching resolve values', () => {
    const byPath = new Map(
      listTokenPaths(tokens).map((entry) => [entry.path, entry.value])
    )

    expect(byPath.get('spacing')).toBe(tokens.spacing.DEFAULT)
    expect(byPath.get('spacing.1')).toBe(tokens.spacing['1'].DEFAULT)
    expect(byPath.get('spacing.1.5')).toBe(tokens.spacing['1']['5'])
    expect(byPath.get('spacing.4')).toBe(tokens.spacing['4'])
    expect(byPath.get('color.slate.1')).toBe(tokens.color.slate['1'])
    expect(byPath.get('text.base')).toBe(tokens.text.base.DEFAULT)
    expect(byPath.get('text.base.lineHeight')).toBe(tokens.text.base.lineHeight)
    expect(byPath.has('spacing.1.DEFAULT')).toBe(false)
  })

  it('every listed path resolves to the same value', () => {
    for (const { path, value } of listTokenPaths(tokens)) {
      expect(resolveTokenPath(tokens, path)).toBe(value)
    }
  })
})

describe('createTokenVisitor', () => {
  it('inlines token() to the leaf value', () => {
    expect(
      transformWithTokens(`.foo { color: token('color.slate.1'); }`)
    ).toContain('oklch(')
  })

  it('resolves spacing and text modifiers', () => {
    const css = transformWithTokens(`
      .foo {
        padding: token('spacing.4');
        line-height: token('text.base.lineHeight');
      }
    `)
    expect(css).toContain('1rem')
    expect(css).toMatch(/line-height:/)
  })

  it('throws on unknown token paths', () => {
    expect(() =>
      transformWithTokens(`.foo { color: token('color.slat.1'); }`)
    ).toThrow('Unknown design token: "color.slat.1"')
  })

  it('throws when the argument is not a single string', () => {
    expect(() =>
      transformWithTokens(`.foo { color: token(color.slate.1); }`)
    ).toThrow('token() expects exactly one string argument')
  })
})

describe('expandTokenTextCss', () => {
  it('joins font-size and line-height for a text style key', () => {
    expect(expandTokenTextCss(tokens, 'base')).toBe(
      `font-size: ${tokens.text.base.DEFAULT}; line-height: ${tokens.text.base.lineHeight}`
    )
  })

  it('throws on unknown keys', () => {
    expect(() => expandTokenTextCss(tokens, 'nope')).toThrow(
      'Unknown text token: "nope"'
    )
  })
})

describe('listTokenTextKeys', () => {
  it('lists DEFAULT-backed text style keys', () => {
    expect(listTokenTextKeys(tokens)).toEqual([
      '2xl',
      '3xl',
      '4xl',
      '5xl',
      '6xl',
      'base',
      'lg',
      'sm',
      'xl',
      'xs',
    ])
  })
})

describe('@token-text', () => {
  it('expands to font-size and line-height', () => {
    const css = transformWithTokens(`.foo { @token-text base; }`, {
      targets: true,
    })
    expect(css).toContain('font-size:1rem')
    expect(css).toMatch(/line-height:/)
  })

  it('accepts a quoted prelude for keys that start with a digit', () => {
    const css = transformWithTokens(`.foo { @token-text '4xl'; }`, {
      targets: true,
    })
    expect(css).toContain('font-size:2.25rem')
    expect(css).toMatch(/line-height:/)
  })

  it('throws on unknown text keys', () => {
    expect(() =>
      transformWithTokens(`.foo { @token-text nope; }`, { targets: true })
    ).toThrow('Unknown text token: "nope"')
  })
})

describe('applyTokenVisitor', () => {
  it('expands @token-text and token() for preprocess use', () => {
    const css = applyTokenVisitor(
      tokens,
      `.foo { color: token('color.slate.1'); @token-text sm; }`
    )
    expect(css).toMatch(/color:\s*oklch\(/)
    expect(css).toMatch(/font-size:\s*\.?875rem/)
    expect(css).toMatch(/line-height:/)
    expect(css).not.toContain('@token-text')
    expect(css).not.toContain('token(')
  })
})
