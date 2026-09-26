/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-use-logical'],
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
  },
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    'web/.nitro/**',
    'web/.output/**',
    'web/.tanstack/**',
    'web/src/styles/reset.css',
  ],
}
