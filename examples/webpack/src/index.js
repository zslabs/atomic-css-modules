import * as badge from './badge.module.css'
import * as button from './button.module.css'
import * as card from './card.module.css'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function render() {
  const root = element('main', card.card)
  root.append(
    element('h1', card.title, 'atomic-css-modules + webpack'),
    element('span', badge.badge, 'badge'),
    element('button', button.button, 'Button'),
    element(
      'p',
      card.body,
      'Each element below lists the classes it receives. Shared atoms show up in more than one list. Edit a .module.css file and watch them change.'
    )
  )

  const samples = [
    ['card.card', card.card],
    ['card.title', card.title],
    ['button.button', button.button],
    ['badge.badge', badge.badge],
  ]
  const list = element('dl', card.list)
  for (const [label, classes] of samples) {
    list.append(element('dt', '', label), element('dd', card.value, classes))
  }
  root.append(list)
  document.body.replaceChildren(root)
}

render()

// Editing a module changes which atoms it composes, so its exported class
// names change too. Re-render instead of keeping stale classes in the DOM.
import.meta.webpackHot?.accept(
  ['./badge.module.css', './button.module.css', './card.module.css'],
  render
)
