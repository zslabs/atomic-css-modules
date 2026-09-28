import styles from './hero.module.css'

export function Hero() {
  return (
    <div className={styles.heroWrapper}>
      <div className={styles.heroBg} aria-hidden="true" />
      <div className={styles.heroBadge}>Beta</div>
      <h2 className={styles.heroText}>Atomic CSS Modules</h2>
      <p className={styles.heroTextSecondary}>Write CSS. Ship atoms.</p>
    </div>
  )
}
