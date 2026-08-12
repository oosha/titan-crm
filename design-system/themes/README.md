# Themes = design directions

A theme is **one file that redefines semantic tokens on top of the same primitives.**
It never touches a component. That is the whole trick: trying a direction costs a
file, and abandoning it costs `git checkout`.

- `default.css` — nothing. The extracted look from
  `App Redesign/index_prodRedesign_interactions.html` is already the value of every
  semantic, so the default direction is the absence of an override. Kept as an empty
  file on purpose, so switching *to* default is the same operation as switching away.
- `soft.css` — a worked example: rounder controls, no card borders, shadow doing the
  separating. Shows what a direction is allowed to change.

## Trying one

Load it after `tokens/semantics.css` — later wins, no specificity games:

```html
<link rel="stylesheet" href="/design-system/tokens/primitives.css">
<link rel="stylesheet" href="/design-system/tokens/semantics.css">
<link rel="stylesheet" href="/design-system/themes/soft.css">   <!-- ← the direction -->
```

The workbench (`../index.html`) switches this at runtime so you can see a direction
across every component at once, then across the product.

## Rules

1. **A theme may only redefine tokens.** If a direction needs a new rule, the
   component is missing a token — add it to `semantics.css` and point the theme at it.
2. **Primitives stay put.** A direction remaps which primitive a semantic uses; it
   does not invent `#f3f0ea`. New raw values are a palette change, not a direction,
   and belong in `primitives.css` with a reason.
3. **Contrast is checked, not eyeballed.** Any direction that changes text or accent
   colour gets run through the validator before it's kept.
