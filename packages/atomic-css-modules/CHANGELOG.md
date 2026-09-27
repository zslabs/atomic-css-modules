# Changelog

All notable changes to `@zslabs/atomic-css-modules` are documented here.

## 0.2.0

- Export selector classifiers, `findShorthandConflicts`, and `parseSelectorList` for shared tooling
- Companion Stylelint package `@zslabs/stylelint-atomic-css-modules` for non-composable styles

## 0.1.0

- Initial release: Vite plugin and `processCssModules` core API
- Shared atomic registry via CSS Modules `composes`
- Eligibility for single local classes, simple trailing pseudos, and nested at-rules
- Shorthand/longhand conflict handling and `/* atomic: skip */`
