import X from '@/assets/x-twitter.svg?react'
import styles from './footer.module.css'

export function Footer() {
  return (
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
  )
}
