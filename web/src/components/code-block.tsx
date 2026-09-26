import { CopyButton } from '@/components/copy-button'
import styles from '@/styles/code-block.module.css'
import type { CodeSnippet } from 'virtual:code-snippets'

type CodeBlockProps = {
  snippet: CodeSnippet
  copy?: boolean
}

export function CodeBlock({ snippet, copy = true }: CodeBlockProps) {
  return (
    <div>
      {copy ? <CopyButton className={styles.copy} code={snippet.code} /> : null}
      <div dangerouslySetInnerHTML={{ __html: snippet.html }} />
    </div>
  )
}
