import designTokenPlugin from './web/stylelint/index.ts'

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  plugins: [
    'stylelint-use-logical',
    '@zslabs/stylelint-atomic-css-modules',
    designTokenPlugin,
  ],
  languageOptions: {
    syntax: {
      atRules: {
        'token-text': {
          prelude: '<custom-ident> | <string>',
        },
      },
    },
  },
  rules: {
    'selector-class-pattern': null,
    'at-rule-no-unknown': [true, { ignoreAtRules: ['token-text'] }],
    'function-no-unknown': [true, { ignoreFunctions: ['token'] }],
    'declaration-property-value-no-unknown': [
      true,
      {
        ignoreProperties: {
          '/.+/': [/token\(/],
        },
      },
    ],
    'csstools/use-logical': 'always',
    'design-token/no-unknown': true,
  },
  overrides: [
    {
      files: ['**/*.module.css'],
      rules: {
        'atomic-css-modules/no-non-composable': true,
      },
    },
  ],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    'web/.nitro/**',
    'web/.output/**',
    'web/.tanstack/**',
    'web/src/styles/reset.css',
  ],
}
