import type { ShikiTransformer } from 'shiki'

export const SHIKI_THEME = 'aurora-x'

export const SHIKI_LANGS = ['typescript', 'bash'] as const

/** Drop Shiki's theme background from `<pre>`; keep token colors. */
export function transformerRemoveBackground(): ShikiTransformer {
  return {
    name: 'remove-background',
    pre(node) {
      const style = node.properties?.style
      if (typeof style !== 'string') return

      const next = style
        .split(';')
        .map((part) => part.trim())
        .filter(
          (part) => part.length > 0 && !/^background(-color)?\s*:/i.test(part)
        )
        .join(';')

      if (next.length > 0) {
        node.properties.style = next
      } else {
        delete node.properties.style
      }
    },
  }
}
