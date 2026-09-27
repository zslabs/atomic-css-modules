# Changelog

All notable changes to `@zslabs/atomic-css-modules` are documented here.

## 0.1.0

- Initial release: Vite plugin and `processCssModules` core API
- Shared atomic registry via CSS Modules `composes`
- Eligibility for single local classes, simple trailing pseudos, and nested at-rules
- Shorthand/longhand conflict handling and `/* atomic: skip */`
- Public helpers for selector classification, shorthand conflicts, and `parseSelectorList` (used by the stylelint plugin)
