import button from './button.module.css'
import card from './card.module.css'

const samples = [
  ['card.card', card.card],
  ['card.title', card.title],
  ['button.button', button.button],
] as const

export default function Page() {
  return (
    <main className={card.card}>
      <h1 className={card.title}>atomic-css-modules + Next.js</h1>
      <button className={button.button} type="button">
        Button
      </button>
      <p>
        Shared atoms show up in more than one class list. The registry comes
        from <code>@atomic-css-modules</code> in the layout stylesheet.
      </p>
      <dl>
        {samples.map(([label, classes]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{classes}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
