import {
  transform,
  type Function as CssFunction,
  type ReturnedRule,
  type Visitor,
} from 'lightningcss'
import type { TokenTree } from './tokens.ts'

const DEFAULT_KEY = 'DEFAULT'

/**
 * Custom at-rules for the token visitor. Register these on every LightningCSS
 * transform that must parse `@token-text`, including a preprocess pass before
 * CSS Modules atomization.
 */
export const tokenCustomAtRules = {
  'token-text': {
    // Strings required for keys that start with a digit (`4xl` parses as a dimension).
    prelude: '<custom-ident> | <string>',
  },
} as const

export type TokenCustomAtRules = typeof tokenCustomAtRules

const TEXT_STYLE_PROPS = [
  ['DEFAULT', 'font-size'],
  ['lineHeight', 'line-height'],
] as const

const MIXIN_CAPTURE_AT_RULES = {
  mixin: {
    prelude: '<custom-ident>',
    body: 'style-block',
  },
} as const

/** Parse a declaration list into LightningCSS rule nodes (for Rule.custom returns). */
function parseStyleBlock(css: string): ReturnedRule[] {
  const holder: { rules?: ReturnedRule[] } = {}

  transform({
    filename: 'token-text-expand.css',
    code: new TextEncoder().encode(`@mixin __expand { ${css} }`),
    targets: { chrome: 100 << 16 },
    customAtRules: MIXIN_CAPTURE_AT_RULES,
    visitor: {
      Rule: {
        custom: {
          mixin(rule) {
            holder.rules = rule.body.value
            return []
          },
        },
      },
    },
  })

  if (holder.rules === undefined) {
    throw new Error(`Failed to parse token style block: ${css}`)
  }
  return holder.rules
}

/**
 * Build the CSS declaration list for `@token-text <key>` from `tokens.text.<key>`.
 * Emits `font-size` from DEFAULT and `line-height` when present.
 */
export function expandTokenTextCss(tree: TokenTree, key: string): string {
  const textRoot = lookupTokenNode(tree, 'text')
  if (textRoot === undefined || typeof textRoot === 'string') {
    throw new Error('Token tree has no text branch')
  }

  const branch = lookupTokenNode(textRoot, key)
  if (branch === undefined) {
    throw new Error(`Unknown text token: "${key}"`)
  }
  if (typeof branch === 'string') {
    throw new Error(
      `"${key}" is not a text style token (expected DEFAULT + lineHeight)`
    )
  }

  const defaultValue = lookupTokenNode(branch, DEFAULT_KEY)
  if (typeof defaultValue !== 'string') {
    throw new Error(
      `"${key}" is not a text style token (missing DEFAULT font-size)`
    )
  }

  const declarations: string[] = []
  for (const [tokenKey, cssProp] of TEXT_STYLE_PROPS) {
    const value = lookupTokenNode(branch, tokenKey)
    if (typeof value === 'string') {
      declarations.push(`${cssProp}: ${value}`)
    }
  }

  return declarations.join('; ')
}

/** Text style keys that `@token-text` can expand (branches with DEFAULT). */
export function listTokenTextKeys(tree: TokenTree): string[] {
  const textRoot = lookupTokenNode(tree, 'text')
  if (textRoot === undefined || typeof textRoot === 'string') return []

  const keys: string[] = []
  for (const [key, value] of Object.entries(textRoot)) {
    if (key === DEFAULT_KEY) continue
    if (typeof value === 'string') continue
    const defaultValue = lookupTokenNode(value, DEFAULT_KEY)
    if (typeof defaultValue === 'string') keys.push(key)
  }
  return keys.sort((a, b) => a.localeCompare(b))
}

function lookupTokenNode(
  node: TokenTree,
  key: string
): string | TokenTree | undefined {
  for (const [entryKey, entryValue] of Object.entries(node)) {
    if (entryKey !== key) continue
    if (typeof entryValue === 'string') return entryValue
    return entryValue
  }
  return undefined
}

/**
 * Walk a nested token tree by dotted path. A branch with `DEFAULT` is a valid
 * leaf when the path ends on that branch (e.g. `spacing`, `text.base`).
 */
export function resolveTokenPath(
  tree: TokenTree,
  path: string
): string | undefined {
  if (path.length === 0) return undefined

  const segments = path.split('.')
  let current: string | TokenTree = tree

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === undefined || segment.length === 0) return undefined
    if (typeof current === 'string') return undefined

    const next = lookupTokenNode(current, segment)
    if (next === undefined) return undefined
    current = next
  }

  if (typeof current === 'string') return current
  const fallback = lookupTokenNode(current, DEFAULT_KEY)
  if (typeof fallback === 'string') return fallback
  return undefined
}

export type TokenPathEntry = {
  path: string
  value: string
}

/**
 * Flatten the token tree into authoring paths (same resolution rules as
 * `resolveTokenPath` / `token('…')`), including DEFAULT-backed branch paths.
 */
export function listTokenPaths(tree: TokenTree, prefix = ''): TokenPathEntry[] {
  const entries: TokenPathEntry[] = []

  for (const [key, value] of Object.entries(tree)) {
    if (key === DEFAULT_KEY) continue

    const path = prefix.length === 0 ? key : `${prefix}.${key}`

    if (typeof value === 'string') {
      entries.push({ path, value })
      continue
    }

    const defaultValue = lookupTokenNode(value, DEFAULT_KEY)
    if (typeof defaultValue === 'string') {
      entries.push({ path, value: defaultValue })
    }

    entries.push(...listTokenPaths(value, path))
  }

  return entries
}

function tokenArgumentPath(fn: CssFunction): string | undefined {
  if (fn.arguments.length !== 1) return undefined
  const arg = fn.arguments[0]
  if (arg === undefined) return undefined
  if (arg.type !== 'token') return undefined
  if (arg.value.type !== 'string') return undefined
  return arg.value.value
}

function tokenTextPreludeKey(prelude: {
  type: string
  value?: unknown
}): string | undefined {
  if (prelude.type === 'custom-ident' || prelude.type === 'string') {
    if (typeof prelude.value === 'string' && prelude.value.length > 0) {
      return prelude.value
    }
  }
  return undefined
}

/**
 * Run the token visitor over a CSS string (inline `token()` and expand
 * `@token-text`). Use as `atomicCssModules({ preprocess })` so modules can
 * use the same authoring as global CSS.
 */
export function applyTokenVisitor(
  tree: TokenTree,
  code: string,
  filename = 'tokens.css'
): string {
  const result = transform({
    filename,
    code: new TextEncoder().encode(code),
    customAtRules: tokenCustomAtRules,
    visitor: createTokenVisitor(tree),
  })
  return new TextDecoder().decode(result.code)
}

/**
 * LightningCSS visitor: inlines `token('…')` and expands `@token-text <ident>`
 * into font-size + line-height declarations.
 */
export function createTokenVisitor(
  tree: TokenTree
): Visitor<TokenCustomAtRules> {
  const tokenCache = new Map<string, { raw: string }>()
  const textCache = new Map<string, ReturnedRule[]>()

  return {
    Function: {
      token(fn) {
        const path = tokenArgumentPath(fn)
        if (path === undefined) {
          throw new Error(
            "token() expects exactly one string argument, e.g. token('color.slate.1')"
          )
        }

        const cached = tokenCache.get(path)
        if (cached !== undefined) return cached

        const value = resolveTokenPath(tree, path)
        if (value === undefined) {
          throw new Error(`Unknown design token: "${path}"`)
        }

        const raw = { raw: value }
        tokenCache.set(path, raw)
        return raw
      },
    },
    Rule: {
      custom: {
        'token-text'(rule) {
          const key = tokenTextPreludeKey(rule.prelude)
          if (key === undefined) {
            throw new Error(
              "@token-text expects an ident or string, e.g. @token-text base; or @token-text '4xl';"
            )
          }

          const cached = textCache.get(key)
          if (cached !== undefined) return cached

          const css = expandTokenTextCss(tree, key)
          const rules = parseStyleBlock(css)
          textCache.set(key, rules)
          return rules
        },
      },
    },
  }
}
