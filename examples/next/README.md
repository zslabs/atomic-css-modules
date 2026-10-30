# Next.js example

A minimal App Router setup for `@zslabs/atomic-css-modules`: two CSS modules, the PostCSS plugin, and `@atomic-css-modules` in the layout's global CSS. Next.js runs that plugin under Turbopack.

From the repo root:

```sh
npm install
npm run example:next
```

Open http://localhost:3456. The page lists the classes each element receives. Atoms shared between modules (`border-radius-12px-…`, `font-weight-600-…`) appear in more than one list. Edit a `.module.css` file and the page hot-updates with the new atoms.

`npm run build -w example-next` writes a production build. Production atom names are short hashes.

The PostCSS config is in [`postcss.config.js`](./postcss.config.js). It is ESM, and the example package sets `"type": "module"`. Next bundles `postcss.config.mjs` and then cannot load the native `lightningcss` addon.
