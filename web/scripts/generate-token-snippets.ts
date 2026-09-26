/**
 * Regenerates VS Code / Cursor snippets + hover lookup for `token('…')` paths
 * and `@token-text` expansions.
 *
 * Usage: npm run tokens:snippets
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  expandTokenTextCss,
  listTokenPaths,
  listTokenTextKeys,
} from '../src/css/token-visitor.ts'
import { tokens } from '../src/css/tokens.ts'

type VsCodeSnippet = {
  scope: string
  prefix: string[]
  body: string
  description: string
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..')
const vscodeDir = join(rootDir, '.vscode')
const snippetsPath = join(vscodeDir, 'tokens.code-snippets')
const lookupPath = join(vscodeDir, 'tokens.lookup.json')

const REM_BASE_PX = 16
const REM_VALUE_RE = /(-?\d*\.?\d+)rem\b/g

/** Appends `(Npx)` after rem values using a 16px root for snippet/hover display. */
function formatTokenDisplay(value: string): string {
  return value.replace(REM_VALUE_RE, (match, rem: string) => {
    const px = Number(rem) * REM_BASE_PX
    const pxLabel = Number.isInteger(px) ? String(px) : String(Number(px.toFixed(4)))
    return `${match} (${pxLabel}px)`
  })
}

const scope = 'css,scss,less,postcss'
const entries = listTokenPaths(tokens).sort((a, b) =>
  a.path.localeCompare(b.path)
)

const snippets: Record<string, VsCodeSnippet> = {}
const lookup: Record<string, string> = {}

for (const { path, value } of entries) {
  const description = formatTokenDisplay(value)
  snippets[path] = {
    scope,
    prefix: [`token.${path}`, path],
    body: `token('${path}')`,
    description,
  }
  lookup[path] = description
}

function tokenTextPrelude(key: string): string {
  return /^[0-9]/.test(key) ? `'${key}'` : key
}

for (const key of listTokenTextKeys(tokens)) {
  const css = formatTokenDisplay(expandTokenTextCss(tokens, key))
  const prelude = tokenTextPrelude(key)
  const label = `@token-text ${prelude}`
  snippets[label] = {
    scope,
    prefix: [`token-text.${key}`, `token-text ${key}`, label],
    body: `${label};`,
    description: css,
  }
  lookup[label] = css
  // Unquoted form for hover when the author wrote `@token-text base`
  lookup[`@token-text ${key}`] = css
}

mkdirSync(vscodeDir, { recursive: true })
writeFileSync(snippetsPath, `${JSON.stringify(snippets, null, 2)}\n`, 'utf8')
writeFileSync(lookupPath, `${JSON.stringify(lookup, null, 2)}\n`, 'utf8')

console.log(`Wrote ${Object.keys(snippets).length} snippets → ${snippetsPath}`)
console.log(
  `Wrote ${Object.keys(lookup).length} lookup entries → ${lookupPath}`
)
