# @zslabs/stylelint-atomic-css-modules

Stylelint plugin that warns when CSS Modules styles cannot be composed by [`@zslabs/atomic-css-modules`](https://www.npmjs.com/package/@zslabs/atomic-css-modules).

Eligibility matches the atomizer: single local classes (optional one trailing simple pseudo) can be composed; combinators, compounds, elements, mixed groups, functional/chained pseudos, and shorthand/longhand conflicts cannot. Rules marked with `/* atomic: skip */` are left alone.

## Install

```bash
npm install -D @zslabs/stylelint-atomic-css-modules stylelint
```

Peer dependency: `stylelint` `^16 || ^17`. Depends on `@zslabs/atomic-css-modules` for shared classifiers.

## Usage

```js
/** @type {import('stylelint').Config} */
export default {
  plugins: ['@zslabs/stylelint-atomic-css-modules'],
  overrides: [
    {
      files: ['**/*.module.css'],
      rules: {
        'atomic-css-modules/no-non-composable': true,
      },
    },
  ],
}
```

Scope the rule to CSS Modules files so global stylesheets are not flagged for element selectors and similar.

### Options

Both checks default to on. Disable either independently:

```js
'atomic-css-modules/no-non-composable': [
  true,
  {
    selectors: true,
    declarations: true,
  },
]
```

| Option         | Default | Effect                                                |
| -------------- | ------- | ----------------------------------------------------- |
| `selectors`    | `true`  | Warn on selectors the atomizer would skip             |
| `declarations` | `true`  | Warn on shorthand/longhand conflicts in the same rule |

### Opt out

```css
/* atomic: skip */
.legacy .nested {
  color: red;
}

.legacy {
  /* atomic: skip */
  margin: 0;
  margin-left: 4px;
}
```

## License

MIT
