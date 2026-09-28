import styles from './intro.module.css'

export function Intro() {
  return (
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
        ; providing even the most complex apps with bundles that plateau when
        using a design system. The usual tradeoff is a different authoring
        strategy.
      </p>
      <p className={styles.introTextSecondary}>
        This package keeps things simple using CSS Modules. At build time, it
        pulls repeated declarations into a global atomic registry and rewrites
        your classes to short hashes. Utility-class reuse, without learning a
        new syntax.
      </p>
    </div>
  )
}
