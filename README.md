# atomic-css-modules

Monorepo for [`@zslabs/atomic-css-modules`](./packages/atomic-css-modules): extracts repeated CSS Modules declarations into shared atomic classes.

Package docs (install, options, API): [`packages/atomic-css-modules/README.md`](./packages/atomic-css-modules/README.md). Selector eligibility: [`GUIDE.md`](./packages/atomic-css-modules/GUIDE.md).

Stylelint plugin for non-composable styles: [`packages/stylelint-atomic-css-modules`](./packages/stylelint-atomic-css-modules).

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

## Skipping

Add `/* atomic: skip */` before a selector, or as the first comment in a rule block, to leave that rule alone. Use it when a declaration would atomize but sharing it would break cascade or you need the styles to stay on the local class.

`buildStart` logs atom count, skip reasons, and source vs registry bytes.

## API

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
