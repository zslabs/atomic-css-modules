# Changelog

All notable changes to `@zslabs/atomic-css-modules` are documented here.

## 0.4.0

- Add `atomicCssModulesPostcss` for Next.js on Turbopack and webpack, replacing `@atomic-css-modules` in global CSS with the shared registry (#5)

## 0.3.0

- Add `AtomicCssModulesWebpackPlugin` for webpack 5 and Rspack, covering css-loader and Rspack native CSS (#3)
- Cache debug class names and skip unchanged CSS modules on watch (#4)
- Emit CSS source maps only when the bundler is configured to produce them (#4)

## 0.2.1

- Emit the atomic registry in deterministic cascade order: shorthands before their longhands, then by property name, then by atom key
- Merge scanned files by sorted path so registry identity no longer depends on update/glob completion order
- Clarify caveats: stick to CSS Modules local classes; do not stack atomized classes to override the same property

## 0.2.0

- Export selector classifiers, `findShorthandConflicts`, and `parseSelectorList` for shared tooling
- Companion Stylelint package `@zslabs/stylelint-atomic-css-modules` for non-composable styles

## 0.1.0

- Initial release: Vite plugin and `processCssModules` core API
- Shared atomic registry via CSS Modules `composes`
- Eligibility for single local classes, simple trailing pseudos, and nested at-rules
- Shorthand/longhand conflict handling and `/* atomic: skip */`
