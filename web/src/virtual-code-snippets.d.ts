declare module 'virtual:code-snippets' {
  export type CodeSnippetId = 'install' | 'viteConfig'

  export interface CodeSnippet {
    id: CodeSnippetId
    lang: string
    code: string
    html: string
  }

  export const SNIPPETS: Record<CodeSnippetId, CodeSnippet>
}
