import type { Element, ElementContent, Text } from 'hast'
import type { ShikiTransformer } from 'shiki'

const SQUIGGLE_PROPERTY = 'margin-left'

function spanText(node: Element): string {
  let text = ''
  for (const child of node.children) {
    if (child.type === 'text') text += child.value
  }
  return text
}

function textNode(value: string): Text {
  return { type: 'text', value }
}

/** Wavy underline on the longhand that conflicts with `margin`. */
export function transformerLintConflict(): ShikiTransformer {
  return {
    name: 'lint-conflict',
    span(node) {
      if ('dataSquiggle' in node.properties) return

      const raw = spanText(node)
      const trimmed = raw.trim()
      if (trimmed !== SQUIGGLE_PROPERTY) return
      const onlyChild = node.children.length === 1 ? node.children[0] : undefined
      if (onlyChild?.type !== 'text') return

      const start = raw.indexOf(trimmed)
      const prefix = raw.slice(0, start)
      const suffix = raw.slice(start + trimmed.length)
      const squiggle: Element = {
        type: 'element',
        tagName: 'span',
        properties: { dataSquiggle: '' },
        children: [textNode(trimmed)],
      }
      const next: ElementContent[] = []
      if (prefix.length > 0) next.push(textNode(prefix))
      next.push(squiggle)
      if (suffix.length > 0) next.push(textNode(suffix))
      node.children = next
    },
  }
}
