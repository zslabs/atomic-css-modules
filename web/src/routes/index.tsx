import ArrowDown from '@/assets/arrow-down.svg?react'
import Bolt from '@/assets/bolt-lightning.svg?react'
import GitHub from '@/assets/github.svg?react'
import logoUrl from '@/assets/logo.svg'
import Terminal from '@/assets/terminal.svg?react'
import X from '@/assets/x-twitter.svg?react'
import { CodeBlock } from '@/components/code-block'
import { CodeMagicMove } from '@/components/code-magic-move'
import styles from '@/styles/index.module.css'
import { LiquidMetal } from '@paper-design/shaders-react'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { SNIPPETS } from 'virtual:code-snippets'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLogo}>
          <div
            className={styles.liquidMetalLogo}
            role="img"
            aria-label="ZS Labs"
          >
            <ClientOnly>
              <LiquidMetal
                image={logoUrl}
                colorBack="#00000000"
                colorTint="#ffffff"
                repetition={4}
                softness={0.25}
                distortion={0.15}
                contour={0.7}
                shiftRed={0.3}
                shiftBlue={0.3}
                angle={70}
                speed={0.8}
                scale={0.85}
                fit="contain"
                width="100%"
                height="100%"
              />
            </ClientOnly>
          </div>
        </div>
        <a href="#install" className={styles.button}>
          Install <ArrowDown />
        </a>
        <div className={styles.headerLinkWrapper}>
          <a
            href="https://github.com/zslabs/atomic-css-modules"
            target="_blank"
            title="zslabs/atomic-css-modules on GitHub"
            className={styles.headerLink}
          >
            <GitHub />
          </a>
        </div>
      </header>
      <main>
        <div className={styles.heroWrapper}>
          <div className={styles.heroBg} aria-hidden="true" />
          <div className={styles.heroBadge}>Beta</div>
          <h2 className={styles.heroText}>Atomic CSS Modules</h2>
          <p className={styles.heroTextSecondary}>Write CSS. Ship atoms.</p>
        </div>

        <div className={styles.introContent}>
          <p className={styles.introTextPrimary}>
            Atomic classes keep stylesheets small. One declaration. One shared
            class. Reused everywhere. That's the model behind projects like{' '}
            <a
              className={styles.link}
              href="https://tailwindcss.com/"
              target="_blank"
            >
              Tailwind CSS
            </a>{' '}
            and{' '}
            <a
              className={styles.link}
              href="https://panda-css.com/"
              target="_blank"
            >
              Panda CSS
            </a>
            ; providing even the most complex apps with bundles that plateau
            when using a design system. The usual tradeoff is a different
            authoring strategy.
          </p>
          <p className={styles.introTextSecondary}>
            This package keeps things simple using CSS Modules. At build time,
            it pulls repeated declarations into a global atomic registry and
            rewrites your classes to short hashes. Utility-class reuse, without
            learning a new syntax.
          </p>
        </div>
        <section className={styles.section} id="see-it-in-action">
          <h2 className={styles.sectionTitle}>
            See it in action
            <span className={styles.sectionTitleIcon}>
              <Bolt />
            </span>
          </h2>
          <CodeMagicMove />
        </section>
        <section className={styles.section} id="install">
          <h2 className={styles.sectionTitle}>
            Install
            <span className={styles.sectionTitleIcon}>
              <Terminal />
            </span>
          </h2>
          <div className={styles.codeWrapper}>
            <div className={styles.codeScroll}>
              <CodeBlock snippet={SNIPPETS.install} />
            </div>
          </div>
          <div className={styles.codeWrapper}>
            <div className={styles.codeScroll}>
              <CodeBlock snippet={SNIPPETS.viteConfig} />
            </div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <a
          href="https://x.com/zslabs"
          target="_blank"
          title="@zslabs on X"
          className={styles.footerLink}
        >
          <X />
        </a>
      </footer>
    </main>
  )
}
