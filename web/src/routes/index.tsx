import Bolt from '@/assets/bolt-lightning.svg?react'
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
          <CodeBlock snippet={SNIPPETS.install} />
          <CodeBlock snippet={SNIPPETS.viteConfig} filename="vite.config.ts" />
        </Section>
      </main>
      <Footer />
    </div>
  )
}
