import {
  codeToKeyedTokens,
  createMagicMoveMachine,
} from '@shikijs/magic-move/core'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { processCssModules } from '@zslabs/atomic-css-modules'
import { atomicCssModules } from '@zslabs/atomic-css-modules/vite'
import { nitro } from 'nitro/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHighlighter } from 'shiki'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import {
  applyTokenVisitor,
  createTokenVisitor,
  tokenCustomAtRules,
} from './src/css/token-visitor.ts'
import { tokens } from './src/css/tokens.ts'
import {
  SHIKI_LANGS,
  SHIKI_THEME,
  transformerRemoveBackground,
} from './src/shiki/theme.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const pkgSrc = path.resolve(root, '../packages/atomic-css-modules/src')

const MAGIC_MOVE_SOURCE = `.button {
  padding-inline: 0.75rem;
  height: 2.5rem;
  border-radius: 9999px;
  background: oklch(94.892% 0.00288 264.62562);
  font-weight: 600;
}

.input {
  padding-inline: 0.75rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  border: 1px solid oklch(31.177% 0.0083 255.56204);
}`

/** Pulls composed atom class names for a local rule out of rewritten module CSS. */
function composedAtomsForClass(
  moduleCode: string,
  className: string
): string[] {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`).exec(moduleCode)
  if (!rule?.[1]) return []
  const match = /composes:\s*([^;]+?)\s+from/.exec(rule[1])
  if (!match?.[1]) return []
  return match[1].trim().split(/\s+/).filter(Boolean)
}

/** Demo class list for one local name: fake scoped hash + real composed atoms. */
function classList(
  moduleCode: string,
  className: string,
  localHash: string
): string {
  return [localHash, ...composedAtomsForClass(moduleCode, className)].join(' ')
}

/** Demo-only local hashes; real CSS Modules names come from the bundler. */
function buildOutputSnippet(moduleCode: string): string {
  const buttonClass = classList(moduleCode, 'button', '_button_a1b2c3')
  const inputClass = classList(moduleCode, 'input', '_input_d4e5f6')
  return `<button type="button" class="${buttonClass}">Save</button>

<input type="text" class="${inputClass}" />`
}

const CODE_SNIPPETS = [
  {
    id: 'install',
    lang: 'bash',
    code: 'npm install @zslabs/atomic-css-modules',
  },
  {
    id: 'viteConfig',
    lang: 'typescript',
    code: `import { defineConfig } from 'vite'
import { atomicCssModules } from '@zslabs/atomic-css-modules/vite'

export default defineConfig({
  plugins: [
    atomicCssModules({
      include: ['src/**/*.module.css'],
    }),
  ],
})
`,
  },
] as const

/** Runs processCssModules + Shiki in Node; ships keyed tokens so the client skips the highlighter. */
function magicMoveStepsPlugin(): Plugin {
  const virtualId = 'virtual:magic-move-steps'
  const resolvedId = `\0${virtualId}`

  return {
    name: 'magic-move-steps',
    resolveId(id) {
      if (id === virtualId) return resolvedId
      return undefined
    },
    async load(id) {
      if (id !== resolvedId) return undefined
      const processed = processCssModules(
        [{ filePath: 'demo.module.css', code: MAGIC_MOVE_SOURCE }],
        {
          registryImportPath: 'virtual:atomic-registry.css',
          composeFrom: 'global',
        }
      )
      const moduleCode = processed.files[0]?.code ?? ''
      const registryCode = `${processed.registryCss.trimEnd()}`
      const steps = [
        {
          id: 'before',
          label: 'Source',
          lang: 'css',
          code: MAGIC_MOVE_SOURCE,
        },
        {
          id: 'registry',
          label: 'Registry',
          lang: 'css',
          code: registryCode,
        },
        {
          id: 'output',
          label: 'Output',
          lang: 'html',
          code: buildOutputSnippet(moduleCode),
        },
      ] as const

      const highlighter = await createHighlighter({
        themes: [SHIKI_THEME],
        langs: ['css', 'html'],
      })
      try {
        let stepLang: 'css' | 'html' = 'css'
        const machine = createMagicMoveMachine(
          (code, lineNumbers) =>
            codeToKeyedTokens(
              highlighter,
              code,
              {
                lang: stepLang,
                theme: SHIKI_THEME,
              },
              lineNumbers
            ),
          { lineNumbers: false }
        )
        const compiledSteps = steps.map((step) => {
          stepLang = step.lang
          const {
            bg: _bg,
            rootStyle: _rootStyle,
            ...rest
          } = machine.commit(step.code).current
          return rest
        })
        const clientSteps = steps.map(({ id, label }) => ({ id, label }))
        return [
          `export const STEPS = ${JSON.stringify(clientSteps)}`,
          `export const COMPILED_STEPS = ${JSON.stringify(compiledSteps)}`,
        ].join('\n')
      } finally {
        highlighter.dispose()
      }
    },
  }
}

/** Precompiles static homepage fences with Shiki so the client only receives HTML + source. */
function codeSnippetsPlugin(): Plugin {
  const virtualId = 'virtual:code-snippets'
  const resolvedId = `\0${virtualId}`

  return {
    name: 'code-snippets',
    resolveId(id) {
      if (id === virtualId) return resolvedId
      return undefined
    },
    async load(id) {
      if (id !== resolvedId) return undefined

      const highlighter = await createHighlighter({
        themes: [SHIKI_THEME],
        langs: [...SHIKI_LANGS],
      })
      try {
        const snippets = Object.fromEntries(
          CODE_SNIPPETS.map((snippet) => {
            const html = highlighter.codeToHtml(snippet.code, {
              lang: snippet.lang,
              theme: SHIKI_THEME,
              transformers: [transformerRemoveBackground()],
            })
            return [
              snippet.id,
              {
                id: snippet.id,
                lang: snippet.lang,
                code: snippet.code,
                html,
              },
            ]
          })
        )
        return `export const SNIPPETS = ${JSON.stringify(snippets)}`
      } finally {
        highlighter.dispose()
      }
    },
  }
}

export default defineConfig({
  root,
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(root, 'src'),
      '@zslabs/atomic-css-modules/vite': path.resolve(pkgSrc, 'vite-plugin.ts'),
      '@zslabs/atomic-css-modules': path.resolve(pkgSrc, 'index.ts'),
    },
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      customAtRules: tokenCustomAtRules,
      visitor: createTokenVisitor(tokens),
    },
  },
  plugins: [
    svgr({
      svgrOptions: {
        icon: true,
      },
    }),
    magicMoveStepsPlugin(),
    codeSnippetsPlugin(),
    atomicCssModules({
      include: ['src/styles/**/*.module.css'],
      debugNames: false,
      preprocess: (code, filePath) => applyTokenVisitor(tokens, code, filePath),
    }),
    tanstackStart(),
    nitro({
      rolldownConfig: {
        // Suppress "use client" noise from motion / tanstack.
        checks: {
          moduleLevelDirective: false,
        },
      },
    }),
    react({
      include: /\.(jsx|js|tsx|ts)$/,
      compiler: true,
    }),
  ],
  server: {
    port: 3000,
  },
  build: {
    rolldownOptions: {
      checks: {
        moduleLevelDirective: false,
      },
    },
  },
})
