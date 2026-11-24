# @zslabs/atomic-css-modules

Extracts repeated CSS Modules declarations into shared atomic classes via `composes`.

## Requirements

- **Node.js** `>=20.17` or `>=22.5` (uses `path.matchesGlob`)
- **CSS Modules** source (`.module.css`)
- **Vite** `^8` when using the Vite plugin (`vite` is an optional peer)
- **webpack** `^5` with `css-loader` `^7`, or **Rspack** `^2` with `css-loader` or native CSS, when using the webpack plugin (all optional peers)
- **PostCSS** `^8` when using the PostCSS plugin (optional peer). This is the Next.js integration, for Turbopack and for `next dev --webpack`

The core `processCssModules` API has no bundler dependency.

## Install

```sh
npm install @zslabs/atomic-css-modules
```

### Vite

```ts
import { defineConfig } from 'vite'
import { atomicCssModules } from '@zslabs/atomic-css-modules/vite'

export default defineConfig({
  plugins: [
    atomicCssModules({
      include: ['src/**/*.module.css'],
    }),
  ],
})
```

### webpack / Rspack

Add the plugin alongside your existing CSS setup. It injects its own loaders ahead of `css-loader`, so no extra rules are needed.

```js
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { AtomicCssModulesWebpackPlugin } from '@zslabs/atomic-css-modules/webpack'

export default {
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin(),
    new AtomicCssModulesWebpackPlugin({
      include: ['src/**/*.module.css'],
    }),
  ],
}
```

CommonJS configs can `require('@zslabs/atomic-css-modules/webpack')`. The same `require` condition exists for the package root, `./vite`, and `./postcss`.

On Rspack, use `rspack.CssExtractRspackPlugin` with the same rule, or native CSS with the standard `{ test: /\.css$/, type: 'css/auto' }` rule and `experiments.css: true`.

`.module.less`, `.module.scss`, `.module.sass`, and `.module.styl` work when the bundler already compiles them. Set `include` to those globs. The plugin inserts its rewrite loader immediately before `less-loader`, `sass-loader`, or `stylus-loader`, so it sees compiled CSS. A `preprocess` function is only needed when you want the startup scan to see that same compiled CSS. It may be async, and it has to reproduce the bundler's aliases, global variables, and plugins.

Keep `css-loader`'s default `modules.auto` (or any setting that only scopes `*.module.css` and the other module suffixes you include). The shared registry is a plain `.css` file shipped with the package and must stay global. Each compilation gets a registry built from the modules it actually uses. Two apps in one repo that share no modules get disjoint registries. Entries in one compilation still share a registry.

The registry loader reads the in-memory registry for that compilation, so it is not itself cached. Loader options include a hash of the atomization options so a persistent loader cache misses when those options change.

### Next.js

Turbopack does not run webpack plugins, and it will not run a loader that rewrites stylesheets. Next.js does run `postcss.config.js` before Lightning CSS scopes `.module.css`, on Turbopack and on webpack. The PostCSS plugin is the integration.

```js
// postcss.config.js
import { atomicCssModulesPostcss } from '@zslabs/atomic-css-modules/postcss'

export default {
  plugins: [atomicCssModulesPostcss()],
}
```

Next.js loads `postcss.config.js` in Node. It bundles `postcss.config.mjs`, and that bundle cannot load the native `lightningcss` addon this plugin uses, so the config file has to be `postcss.config.js` and Node has to treat it as ESM (`"type": "module"`, or an app that already is). A CommonJS config that only names the package does not load it.

Put `@atomic-css-modules;` in the global CSS imported by the root layout. The plugin replaces that at-rule with the shared atom rules. App Router only allows global CSS from that layout, so the registry is not injected into components.

```css
@atomic-css-modules;

body {
  margin: 0;
}
```

`next dev` uses readable atom names. `next build` uses short hashes. Globs are relative to the directory where the PostCSS config is loaded (`root` overrides that).

### Options

| Option            | Default                         | Notes                                                                                                                         |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `include`         | `**/*.module.css`               | Globs relative to the Vite root, webpack context, or PostCSS cwd. Example: `**/*.module.less`                                 |
| `exclude`         | `**/node_modules/**`            |                                                                                                                               |
| `debugNames`      | `true` in dev, `false` in build | Readable atoms (`color-red-a1b2c3`) vs short hashes                                                                           |
| `report`          | `"summary"`                     | `"verbose"` lists each skipped selector. The summary also lists per-file failures                                             |
| `preprocess`      |                                 | `(code, filePath) => string`. Used by the startup scan, and by rewrite when the bundler has not already compiled the file     |
| `conflicts`       | `"skip"`                        | `"error"` fails the build. `"allow"` keeps both atoms and lets registry order decide                                          |
| `localIdents`     | keyframes and counter-styles    | `container` and `dashedIdents` also keep those names local. Off unless you set them                                           |
| `customAtRules`   |                                 | At-rules with a body are passed to lightningcss. Statement at-rules stay unknown so their semicolons survive                  |
| `strict`          | `false`                         | One broken file stays as authored and is listed on the report. `true` fails the build                                         |

"Dev" means `vite serve`, webpack/Rspack in `development` mode, or `next dev`. Production watch keeps the short hashes.

## How it works

Matching declarations share one registry class. Single local classes are eligible, including simple pseudos and nested at-rules.

```css
.card {
  color: red;
  &:hover {
    color: blue;
  }
  @media (min-width: 600px) {
    padding: 16px;
  }
}
```

becomes:

```css
/* module */
.card {
  composes: bn89ziv jtnf3j g1h5a7 from global;
}
```

```css
/* registry */
.bn89ziv {
  color: red;
}

.jtnf3j:hover {
  color: #00f;
}

@media (width >= 600px) {
  .g1h5a7 {
    padding: 16px;
  }
}
```

Selector eligibility, shorthand/longhand rules, and non-goals: [GUIDE.md](./GUIDE.md).

## Skipping

Add `/* atomic: skip */` before a selector, or as the first comment in a rule block, to leave that rule alone. Use it when a declaration would atomize but sharing it would break cascade or you need the styles to stay on the local class.

The first build logs atom count, skip reasons, and source vs registry bytes.

## Caveats

- Only selectors that CSS Modules can `composes` are atomized (see the guide).
- Shorthand + longhand in the same rule skip those properties for that rule.
- Same-file classes that set one property (or a shorthand and its longhand) to different values stay local. `conflicts: "error"` fails the build instead. Cross-file conflicts are not detected, so two modules can still publish different values for one atom and the registry order decides the winner.
- `@keyframes` and `@counter-style` names defined in a file stay with the declarations that use them. Container names and dashed idents stay local only when `localIdents.container` or `localIdents.dashedIdents` is set.
- The registry keeps `@custom-media`, `@property`, and `@layer` order statements collected from the scanned file and its relative `@import`s. Bare and remote specifiers are skipped.
- On small sheets, gzip/brotli often erase the atomic class win (many one-declaration rules compress worse than fewer larger ones). The payoff shows up when UI grows against a shared token surface: Modules CSS scales with components, the atom set scales with the design system.
- This is **0.x**: the supported surface below is stable within a minor when practical, but breaking changes may land before 1.0.

## Public API

**Supported**

- `@zslabs/atomic-css-modules/vite` — `atomicCssModules`, plugin option types, registry virtual module ids
- `@zslabs/atomic-css-modules/postcss` — `atomicCssModulesPostcss`, plugin option types
- `@zslabs/atomic-css-modules/webpack` — `AtomicCssModulesWebpackPlugin`, plugin option types, `REGISTRY_STUB_PATH`
- `@zslabs/atomic-css-modules` — `processCssModules`, `ProcessOptions` / `ProcessResult` and related result types, `SKIP_REASONS` / report helpers used with the pipeline

**Internal** (exported for advanced use and tests; may change without a major bump)

- `FileScanCache`, `scanFiles`, `rewriteFiles`, `buildRegistryCss`, `sortAtomsForRegistry`, `comparePropertyCascadeOrder`, `ensureUniqueAtomNames`, `syncScanAtomHashes`, and lower-level atom/scan types

```ts
import { processCssModules } from '@zslabs/atomic-css-modules'

const result = processCssModules([{ filePath: 'button.module.css', code }], {
  registryImportPath: './atomic-registry.css',
  composeFrom: 'file', // the bundler plugins use 'global'
  sourceMap: true,
})
```

## License

MIT
