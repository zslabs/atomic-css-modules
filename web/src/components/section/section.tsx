import type { ReactNode } from 'react'
import styles from './section.module.css'

type SectionProps = {
  id: string
  title: string
  icon: ReactNode
  children: ReactNode
}

export function Section({ id, title, icon, children }: SectionProps) {
  return (
    <section className={styles.section} id={id}>
      <h2 className={styles.sectionTitle}>
        {title}
        <span className={styles.sectionTitleIcon}>{icon}</span>
      </h2>
      {children}
    </section>
  )
}
