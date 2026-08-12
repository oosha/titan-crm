# Titan Design System — read this before writing UI

The source of truth for how this product looks. Extracted from
`App Redesign/index_prodRedesign_interactions.html`, which stays the visual ground
truth: when this document and that file disagree, the file wins and this gets fixed.

**Start here:** [`registry.json`](./registry.json) lists every component, its props,
its states and its file. [`index.html`](./index.html) is the workbench — open it and
you can see the whole system at once.

---

## The three rules

**1. Don't hand-roll what exists.** Check `registry.json` first. The live product has
**82 button rules across 14 class names** (`titan-action-btn`, `comp-fmt-btn`,
`action-btn`, `split-btn`, `dir-btn`, `np-btn`, …) — every one of them is someone
solving "I need a button" again from scratch. That is the thing this replaces. If a
component is close but not quite right, add a **variant** to it; don't fork it.

**2. Components read semantics, never primitives, never literals.** Three tiers:

```
primitives.css   raw values          --gray-700: #333333
      ↓
semantics.css    intent              --text-primary: var(--gray-700)
      ↓
component css    use                 color: var(--text-primary)
```

A hex or a themeable px inside a component file is a bug — it means a token is
missing. Add it to `semantics.css` and point the component at it.

**3. A design direction is a theme file, not an edit.** See `themes/`. A direction may
only redefine semantic tokens; it may not add component rules or new raw values.
That constraint is what makes exploring cheap: try it, look at the whole product,
`git checkout` if you don't like it.

---

## Trying a direction

```html
<link rel="stylesheet" href="/design-system/tokens/primitives.css">
<link rel="stylesheet" href="/design-system/tokens/semantics.css">
<link rel="stylesheet" href="/design-system/themes/soft.css">   <!-- ← swap this line -->
<link rel="stylesheet" href="/design-system/components/button.css">
```

The workbench switches it live. `themes/soft.css` is a worked example — nine token
overrides restyle every button, input, badge and card in the product, with no
component touched.

**Component shape is tokenised on purpose.** `--btn-radius`, `--btn-height`,
`--btn-pad-x`, `--btn-weight`, `--btn-font`, `--btn-border-width` live in
`semantics.css`, so "try a pill button everywhere" is one value, not a refactor.

---

## Adding a component

1. Stylesheet in `components/`, classes prefixed `ds-`, variants as
   `.ds-<name>--<variant>`. Semantic tokens only.
2. A JS render module **only if composition earns one** — `titanFormBuilder` needed
   one, a badge does not. Signature returns an HTML string; props map 1:1 onto
   variant class names so the two can't drift.
3. Every state: `default`, `hover`, `active`, `focus-visible`, `disabled`, plus
   `loading` where it applies. The workbench renders all of them, which is how you
   find the ones you skipped.
4. Add it to `registry.json` **in the same change**. A registry that lags is worse
   than none — it makes an agent confident about something untrue.
5. Add it to the workbench and screenshot it.

---

## Adopting it in the live app

The shipped CRM has its own tokens (`--dir-*` in `crm-directory.css`) and ~1,150
hardcoded hex values. The migration is deliberately incremental:

- `semantics.css` ends with a **bridge block** aliasing `--dir-*` onto the new
  semantics. A page adopts the system by deleting its own `--dir-*` definitions and
  inheriting these. No markup changes, because the markup already says
  `var(--dir-…)`.
- Then replace literals with tokens, file by file, screenshotting each.
- Then, and only then, replace hand-rolled controls with `ds-` components. This is
  the markup-level step and the slow one; it is per-surface and can stop anywhere.

Delete the bridge block once no page defines `--dir-*` locally.

---

## Known gaps

- **Not yet components:** Modal, Nav item, Tooltip, Checkbox, Toggle, Avatar, Table
  row, Menu, Toast, Tabs. Listed in `registry.json` under `notPortedYet` so nobody
  reinvents one under a new name.
- **No dark mode.** The reference has none. When it arrives it is a theme file, and
  primitives will need dark steps rather than an inverted filter.
- **Contrast is unverified** for the label palette pairs. Anything that becomes text
  on a fill should be checked before it ships — the `dataviz` skill's
  `validate_palette.js` is the tool already used for the dashboard.
