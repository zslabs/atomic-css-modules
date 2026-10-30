# webpack example

A minimal webpack 5 setup for `@zslabs/atomic-css-modules`: three CSS modules, `css-loader`, and `AtomicCssModulesWebpackPlugin`.

From the repo root:

```sh
npm install
npm run example:webpack
```

Open http://localhost:3001. The page lists the classes each element receives; atoms shared between modules (`border-radius-12px-…`, `font-weight-600-…`) appear in more than one list. Edit any file in `src/*.module.css` and the page hot-updates with the new atoms.

`npm run build -w example-webpack` writes a production build to `dist/` with hashed atom names and an extracted `main.css`.

The config is in [`webpack.config.js`](./webpack.config.js).
