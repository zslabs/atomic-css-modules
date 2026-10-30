# @zslabs/atomic-css-modules

Extracts repeated CSS Modules declarations into shared atomic classes via `composes`.

## Requirements

- **Node.js** `>=20.17` or `>=22.5` (uses `path.matchesGlob`)
- **CSS Modules** source (`.module.css`)
- **Vite** `^8` when using the Vite plugin (`vite` is an optional peer)
- **webpack** `^5` with `css-loader` `^7`, or **Rspack** `^2` with `css-loader` or native CSS, when using the webpack plugin (all optional peers)

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

On Rspack, use `rspack.CssExtractRspackPlugin` with the same rule, or native CSS with the standard `{ test: /\.css$/, type: 'css/auto' }` rule and `experiments.css: true`.

Keep `css-loader`'s default `modules.auto` (or any setting that only scopes `*.module.css`). The shared registry is a plain `.css` file shipped with the package and must stay global.

Next.js is not supported: it owns its `css-loader` configuration, and Turbopack does not run webpack plugins.

### Options

| Option       | Default                         | Notes                                               |
| ------------ | ------------------------------- | --------------------------------------------------- |
| `include`    | `**/*.module.css`               | Globs relative to the Vite root or webpack context  |
| `exclude`    | `**/node_modules/**`            |                                                     |
| `debugNames` | `true` in dev, `false` in build | Readable atoms (`color-red-a1b2c3`) vs short hashes |
| `report`     | `"summary"`                     | `"verbose"` lists each skipped selector             |
| `preprocess` | —                               | `(code, filePath) => code` before scan/atomize      |

"Dev" means `vite serve`, or webpack/Rspack in `development` mode or watch mode.

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
- Stick to CSS Modules local classes. Do not stack atomized classes, or another utility system on the same node, to override the same property. Prefer one class, or `/* atomic: skip */` when sharing would be wrong.
- On small sheets, gzip/brotli often erase the atomic class win (many one-declaration rules compress worse than fewer larger ones). The payoff shows up when UI grows against a shared token surface: Modules CSS scales with components, the atom set scales with the design system.
- This is **0.x**: the supported surface below is stable within a minor when practical, but breaking changes may land before 1.0.

## Public API

**Supported**

- `@zslabs/atomic-css-modules/vite` — `atomicCssModules`, plugin option types, registry virtual module ids
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
