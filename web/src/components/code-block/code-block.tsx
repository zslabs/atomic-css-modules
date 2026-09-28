import { CopyButton } from '@/components/copy-button/copy-button'
import type { CodeSnippet } from 'virtual:code-snippets'
import styles from './code-block.module.css'

type CodeBlockProps = {
  snippet: CodeSnippet
  copy?: boolean
  filename?: string
}

export function CodeBlock({ snippet, copy = true, filename }: CodeBlockProps) {
  return (
    <div className={styles.codeWrapper}>
      <div className={styles.codeScroll}>
        {filename ? <div className={styles.filename}>{filename}</div> : null}
        {copy ? <CopyButton code={snippet.code} /> : null}
        <div dangerouslySetInnerHTML={{ __html: snippet.html }} />
      </div>
    </div>
  )
}
