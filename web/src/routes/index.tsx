import Bolt from '@/assets/bolt-lightning.svg?react'
import BroomSparkle from '@/assets/broom-sparkle.svg?react'
import Terminal from '@/assets/terminal.svg?react'
import { CodeBlock } from '@/components/code-block/code-block'
import { CodeMagicMove } from '@/components/code-magic-move/code-magic-move'
import { Footer } from '@/components/footer/footer'
import { Header } from '@/components/header/header'
import { Hero } from '@/components/hero/hero'
import { Intro } from '@/components/intro/intro'
import { Section } from '@/components/section/section'
import { createFileRoute } from '@tanstack/react-router'
import { SNIPPETS } from 'virtual:code-snippets'
import styles from './index.module.css'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className={styles.container}>
      <Header />
      <main>
        <Hero />
        <Intro />
        <Section id="see-it-in-action" title="See it in action" icon={<Bolt />}>
          <CodeMagicMove />
        </Section>
        <Section id="install" title="Install" icon={<Terminal />}>
          <CodeBlock copy snippet={SNIPPETS.install} />
          <CodeBlock snippet={SNIPPETS.viteConfig} filename="vite.config.ts" />
        </Section>
        <Section id="stylelint" title="Stylelint" icon={<BroomSparkle />}>
          <div className={styles.lintContainer}>
            <p className={styles.lintIntro}>
              <a
                className={styles.link}
                href="https://www.npmjs.com/package/@zslabs/stylelint-atomic-css-modules"
                target="_blank"
              >
                @zslabs/stylelint-atomic-css-modules
              </a>{' '}
              flags selectors and declarations that cannot be composed.
              Combinators, compounds, and a shorthand overlapping a longhand
              show up in the editor.
            </p>
          </div>

          <CodeBlock snippet={SNIPPETS.stylelint} copy={false} />
          <div className={styles.lintContainer}>
            <p className={styles.lintError} role="note">
              <span className={styles.lintErrorMessage}>
                Declaration &quot;margin-left&quot; cannot be composed
                (shorthand-conflict: shorthand plus an overlapping longhand)
              </span>
              <span className={styles.lintErrorRule}>
                atomic-css-modules/no-non-composable
              </span>
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
