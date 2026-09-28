import ArrowDown from '@/assets/arrow-down.svg?react'
import GitHub from '@/assets/github.svg?react'
import logoUrl from '@/assets/logo.svg'
import { LiquidMetal } from '@paper-design/shaders-react'
import { ClientOnly } from '@tanstack/react-router'
import styles from './header.module.css'

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerLogo}>
        <div className={styles.liquidMetalLogo} role="img" aria-label="ZS Labs">
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
  )
}
