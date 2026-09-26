/**
 * Detect an `atomic: skip` CSS comment from source text. LightningCSS drops
 * comments from the AST, so we look next to the rule's source location.
 */
import type { Location2 } from 'lightningcss'

const SKIP_BODY = /^atomic:\s*skip$/i

function locOffset(code: string, loc: Location2): number {
  let line = 0
  let index = 0
  while (line < loc.line && index < code.length) {
    if (code[index] === '\n') line += 1
    index += 1
  }
  return Math.min(code.length, index + Math.max(loc.column, 1) - 1)
}

function isSkipBody(body: string): boolean {
  return SKIP_BODY.test(body.trim())
}

function commentBefore(code: string, offset: number): string | null {
  let index = offset - 1
  while (index >= 0 && /\s/.test(code[index] ?? '')) index -= 1
  if (index < 1 || code[index] !== '/' || code[index - 1] !== '*') return null
  const start = code.lastIndexOf('/*', index - 1)
  if (start === -1) return null
  return code.slice(start + 2, index - 1)
}

function firstBlockComment(code: string, offset: number): string | null {
  const open = code.indexOf('{', offset)
  if (open === -1) return null
  let index = open + 1
  while (index < code.length && /\s/.test(code[index] ?? '')) index += 1
  if (code.slice(index, index + 2) !== '/*') return null
  const close = code.indexOf('*/', index + 2)
  if (close === -1) return null
  return code.slice(index + 2, close)
}

export function hasAtomicSkipComment(code: string, loc: Location2): boolean {
  const offset = locOffset(code, loc)
  const before = commentBefore(code, offset)
  if (before !== null && isSkipBody(before)) return true
  const inside = firstBlockComment(code, offset)
  return inside !== null && isSkipBody(inside)
}
