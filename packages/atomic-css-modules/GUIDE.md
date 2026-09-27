# atomic-css-modules internals

Eligibility and compose constraints. For install and options, see the [package README](./README.md).

## What selectors are supported

CSS Modules only allows `composes` on a **single local class**. Eligibility mirrors that:

| Shape                                                         | Atomized?                                  |
| ------------------------------------------------------------- | ------------------------------------------ |
| `.card`                                                       | Yes                                        |
| `.card:hover` / `.card::before` (one trailing simple pseudo)  | Yes — pseudo is hoisted onto the atom      |
| `.a, .b` when every member is a local class (± simple pseudo) | Yes — split into per-class compose targets |
| Combinators, compounds, elements, attributes, IDs, `:root`    | No                                         |
| `.a, div` (mixed group)                                       | No                                         |
| `:not()`, `:nth-child()`, chained `:hover:focus`              | No                                         |

A trailing simple pseudo-class or pseudo-element (no arguments) is eligible. Functional or multiple trailing pseudos are not: they cannot map to one shared atom plus Modules `composes`.

## Shorthand and longhand

If a rule has a shorthand and any of its longhands (`margin` + `margin-left`), neither those properties atomize for that rule. Sibling longhands of the same shorthand (`font-family` + `font-size`) still do.

## Registry order

The shared registry is emitted in a fixed order:

1. Shorthands before their longhands (so `margin` then `margin-top` when both atoms exist)
2. Then by property name
3. Then by atom key (value / `!important` / pseudo / at-rule condition)

Equal-specificity atoms win by that stylesheet order. Changing `composes` name order or the HTML `class` attribute does not change which atom wins. If two local classes set the same property to different values, keep the declarations on one rule or use `/* atomic: skip */`.

## Size and compression

Raw registry bytes can shrink when the same declarations repeat. Over the wire, gzip/brotli often close the gap on small stylesheets; savings show up at scale when many components share a design-token surface. See [Caveats](./README.md#caveats) in the README.

## Non-goals

- Last-wins overrides from stacking local classes that set the same property
- Atomizing combinators or compounds while still using Modules `composes`
- Reimplementing CSS Modules compose resolution here
