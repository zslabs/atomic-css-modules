# @zslabs/atomic-css-modules

Extracts repeated CSS Modules declarations into shared atomic classes via `composes`.

## Requirements

- **Node.js** `>=20.17` or `>=22.5` (uses `path.matchesGlob`)
- **CSS Modules** source (`.module.css`)
- **Vite** `^8` when using the Vite plugin (`vite` is an optional peer)

The core `processCssModules` API has no Vite dependency.

## Install

```sh
npm install @zslabs/atomic-css-modules
```

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

| Option       | Default                           | Notes                                               |
| ------------ | --------------------------------- | --------------------------------------------------- |
| `include`    | `**/*.module.css`                 | Globs relative to the Vite root                     |
| `exclude`    | `**/node_modules/**`              |                                                     |
| `debugNames` | `true` in serve, `false` in build | Readable atoms (`color-red-a1b2c3`) vs short hashes |
| `report`     | `"summary"`                       | `"verbose"` lists each skipped selector             |
| `preprocess` | —                                 | `(code, filePath) => code` before scan/atomize      |

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

`buildStart` logs atom count, skip reasons, and source vs registry bytes.

## Caveats

- Only selectors that CSS Modules can `composes` are atomized (see the guide).
- Shorthand + longhand in the same rule skip those properties for that rule.
- The registry is sorted deterministically (shorthands before longhands, then property, then atom key). Class / `composes` order does not control cascade. Stacking two atomized classes that set the same property to different values is undefined; use one rule or `/* atomic: skip */`.
- On small sheets, gzip/brotli often erase the atomic class win (many one-declaration rules compress worse than fewer larger ones). The payoff shows up when UI grows against a shared token surface: Modules CSS scales with components, the atom set scales with the design system.
- This is **0.x**: the supported surface below is stable within a minor when practical, but breaking changes may land before 1.0.

## Public API

**Supported**

- `@zslabs/atomic-css-modules/vite` — `atomicCssModules`, plugin option types, registry virtual module ids
- `@zslabs/atomic-css-modules` — `processCssModules`, `ProcessOptions` / `ProcessResult` and related result types, `SKIP_REASONS` / report helpers used with the pipeline

**Internal** (exported for advanced use and tests; may change without a major bump)

- `FileScanCache`, `scanFiles`, `rewriteFiles`, `buildRegistryCss`, `sortAtomsForRegistry`, `comparePropertyCascadeOrder`, `ensureUniqueAtomNames`, `syncScanAtomHashes`, and lower-level atom/scan types

```ts
import { processCssModules } from '@zslabs/atomic-css-modules'

const result = processCssModules([{ filePath: 'button.module.css', code }], {
  registryImportPath: './atomic-registry.css',
  composeFrom: 'file', // Vite plugin uses 'global'
  sourceMap: true,
})
```

## License

MIT
