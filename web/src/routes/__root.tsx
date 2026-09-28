import resetCss from '@/styles/reset.css?url'
import shellCss from '@/styles/shell.css?url'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'Atomic CSS Modules' },
      {
        name: 'description',
        content: 'Write CSS Modules. Ship atomic utilities.',
      },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: '/icon.png' },
      { rel: 'stylesheet', href: resetCss },
      { rel: 'stylesheet', href: shellCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => <p>Not found</p>,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
