# Titan Design System — read this before writing UI

The source of truth for how this product looks. Extracted from
`App Redesign/index_prodRedesign_interactions.html`, which stays the visual ground
truth: when this document and that file disagree, the file wins and this gets fixed.

**Start here:** [`registry.json`](./registry.json) lists every component, its props,
its states and its file. [`index.html`](./index.html) is the workbench — open it and
you can see the whole system at once.

> **This directory changes only when someone asks for it, in so many words.** Adding a
> component, a token, a variant or a direction is never a side effect of building a
> feature — it is its own task, started by an explicit request. Building something? You
> are a consumer: compose what is already here, write only page-local layout, and if
> nothing fits, **name the gap in your summary instead of filling it**. The sections
> below marked *owner* describe how the system grows when that request comes; reading
> them is not the request.

## The workbench

`node dev-server.js`, then **http://localhost:8000/design-system/**. Five views, each on
its own hash so it can be linked and screenshotted:

| `#overview` | The coverage ledger — one row per block in the inventory, bar = duplication absorbed, sorted by it. Click a row for the evidence. |
| `#foundations` | Curated specimens (ramps, type, radius, space, elevation) **plus a complete token index parsed from `primitives.css` and `semantics.css`** — grouped by those files' own section comments, so a token you add shows up without editing the page. |
| `#icons` | The whole set, filterable by name *or* alias; click to copy the call. |
| `#components` | Every variant in every state. A registered component with no demo is called out by name. |
| `#directions` | Each theme rendered live, side by side. |

It is rendered **in its own system** — the dark rail is the product's real sidebar colour,
and every value on the page is a token. So the tool restyles when a direction does, and
a broken token shows up here first.

Three things it reads rather than restates, so it can't drift from the truth:

- the ledger, the stat band and the headline all come from `registry.json`
- the icon grid, the weight options and the current weight come from `dsIcon` itself
- the token index is parsed from the token CSS. It exists because the curated specimens
  were a hardcoded list of 18 names, so `--checkbox-size`, `--border-hairline`,
  `--surface-sunken`, `--kanban-*` and **every component token** were invisible on the one
  page whose job is to show them. If you find yourself typing a token name into
  `index.html`, that's the bug repeating.
- **`#directions` fetches each theme file and rewrites its `:root` to a wrapper class**,
  so every direction previews at once without its values being copied into this page.
  The override list under each preview is parsed from that same file.

Adding a direction is therefore one file in `themes/` plus one entry in the registry's
`themes` array — the workbench picks up both the header control and the side-by-side
column from that entry.

---

## The three rules

**1. Don't hand-roll what exists.** Check `registry.json` first. The live product has
**82 button rules across 14 class names** (`titan-action-btn`, `comp-fmt-btn`,
`action-btn`, `split-btn`, `dir-btn`, `np-btn`, …) — every one of them is someone
solving "I need a button" again from scratch. That is the thing this replaces. If a
component is close but not quite right, use it anyway and adjust *at the call site* with
spacing tokens — don't fork it, and don't add a `ds-` variant of your own. A variant is
the designer's to add; report the need instead.

**2. Components read semantics, never primitives, never literals.** Three tiers:

```
primitives.css   raw values          --gray-700: #333333
      ↓
semantics.css    intent              --text-primary: var(--gray-700)
      ↓
component css    use                 color: var(--text-primary)
```

A hex or a themeable px in any CSS you write is a bug — it means you reached past the
system. The fix is a semantic token, which the designer adds; flag it rather than
inlining the value and moving on.

**3. A design direction is a theme file, not an edit.** See `themes/`. A direction may
only redefine semantic tokens; it may not add component rules or new raw values.
That constraint is what makes exploring cheap: try it, look at the whole product,
`git checkout` if you don't like it.

---

## Trying a direction *(owner)*

```html
<link rel="stylesheet" href="/design-system/tokens/primitives.css">
<link rel="stylesheet" href="/design-system/tokens/semantics.css">
<link rel="stylesheet" href="/design-system/themes/soft.css">   <!-- ← swap this line -->
<link rel="stylesheet" href="/design-system/components/button.css">
```

The workbench switches it live, and `#directions` shows every direction at once.
`themes/soft.css` is a worked example — eleven token overrides restyle every button,
input, badge and card in the product, with no component touched. Register it in
`registry.json`'s `themes` array or the workbench won't know it exists.

**Component shape is tokenised on purpose.** `--btn-radius`, `--btn-height`,
`--btn-pad-x`, `--btn-weight`, `--btn-font`, `--btn-border-width` live in
`semantics.css`, so "try a pill button everywhere" is one value, not a refactor.

**Removing hex is not the same as being themeable.** A rule that reads
`var(--border-subtle)` has no literals left but a direction still cannot restyle it,
because a theme remaps *semantics*, and the surface has no component token of its own to
override. The kanban proved this: it went to 0 hex and the board still didn't move under
`soft.css`. It became themeable only once it had `--kanban-card-*` / `--kanban-lane-*`.
So a surface is migrated when it reads **its own component tokens**, not merely when the
hex is gone.

**Derived colour is not a token.** `renderBoard()` computes each stage header from the
pipeline's own colour via `darken()` / `shadeFor()`, and writes it inline — which beats the
stylesheet. Those values are data, like chart marks, and the registry marks them
`excluded`. Don't tokenise a colour the product calculates; the CSS fallbacks underneath
such a rule never render, which is exactly why `.kanban-col-title { color: #0d2b52 }` sat
there unnoticed.

---

## Adding a component *(owner)*

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
5. Add a demo to `renderComponents()` in the workbench and screenshot `#components`.
   Skip it and the view says so out loud, by name.

---

## Linking it

Every page needs exactly **two** links, in this order:

```html
<link rel="stylesheet" href="/design-system/tokens.css">
<link rel="stylesheet" href="/design-system/components.css">
```

`components.css` imports every component stylesheet. Add a new component file to it in the
same change that creates it.

This replaced per-page link lists, which had already drifted badly: `crm.html` linked
`button.css`, **nothing linked `primitives.css` at all**, and the record screen was migrated
to `.ds-input` / `.ds-card` / `.ds-badge` while none of those rules could reach it. Thirty-four
call sites counted as adopted and the screen rendered unstyled. `measure-adoption.js` now
refuses to count a `ds-` class on a page that doesn't link the CSS, and reports the inert uses
by name — **a component you cannot see is not adopted.**

## What a migration turns up

Adopting a surface is also how the system finds out what it's missing. The record screen
(`opportunity-view.html`) added four variants and one whole block, all in `registry.json`
under `variantNotes`:

| Added | Because |
|---|---|
| `ds-btn--destructive-quiet` | "Delete record" sits inside a form being edited; a filled red block reads as the page's primary action. There was no outlined destructive variant, which is exactly why the page had forked `.ov-btn-danger`. |
| `ds-input--inline` | 25 values are edited in place. Mapping them onto the boxed `.ds-input` would have drawn 25 borders into a reading layout. |
| `ds-badge--pill` | The default badge is a soft rectangle; three surfaces had independently typed `999px`. |
| `ds-card--section` | A page content panel, not a tile — `--card-section-radius` / `--card-section-pad`. Seven per screen. Forking a second card class for this is what produced `.ov-card`. |
| **Tooltip** (block, planned) | Missed by the original 27-block survey because it has **no class of its own** — it's an `::after` on a `[data-tip]` attribute, so a class-rule census could not see it. |

The rule this suggests: when a surface resists a component, ask whether the component is
missing a variant before writing a local rule. Four of the five above already existed in the
product as a fork.

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

## The building blocks

`registry.json` carries an **inventory** of every recurring UI role in this product,
derived by surveying all 756 distinct CSS class-rule roots in the CRM and clustering by
role — not by guessing at a component list. Each block records what duplication it would
absorb, which is also its priority:

| block | status | duplication it absorbs |
|---|---|---|
| Button, Icon, Input, Badge, Card | **built** | 46 / 196 / 46 / 25 / 40 variants |
| **List row** | planned | 88 variants across 30 prefixes — the largest in the codebase |
| **Modal / dialog** | planned | 58 across 14 |
| **Section header / toolbar** | planned | 35 across 17 |
| Menu, Avatar, Divider, Checkbox, Empty state, Toast, Meter, Link, Tabs, Table | planned | 11–20 each |
| **Kanban card / column** | planned, **tokenised** | 26 rules, 0 hex, 23 tokens. `--kanban-card-*` / `--kanban-lane-*` mean a direction restyles the board; a component still needs `dsKanbanCard()`, because `renderCard()` builds each card as an innerHTML string |
| Nav item, Side panel, Stat tile, Search bar, Split button | planned | page-specific today |
| Chart marks, Brand marks | **excluded** | not components — data geometry and brand art |

Read that inventory before adding anything. Two rules follow from it:

1. **If a block is `planned`, you are the one who builds it** — as a component, not as
   another prefixed copy. `ao-btn-primary`, `np-btn-primary`, `ps-btn-primary`,
   `os-btn-primary`, `opp-btn-primary` and `dir-btn-primary` are all the same button; that
   is what happens when a page invents its own instead.
2. **If a block is `excluded`, don't componentise it.** Chart geometry belongs to the
   dataviz rules; brand marks go through `dsIcon.register()` or stay as assets.

## Scope: the CRM, not the mailbox

**`index.html` is out of scope.** It is the mocked half of the prototype — static demo
threads, its own `.nav-item` rules, 275 hand-rolled call sites — and it is not where the
system is being adopted. Both measurement scripts exclude it, along with `personas/`
(identity and mailbox threads, not CRM UI).

This is not bookkeeping. Left in the scan the mailbox dominated every figure and made CRM
progress unreadable: converting *all nineteen* of crm.html's icons moved the headline from
2% to 4%, because the denominator was mostly mail. Rescoped, the same work reads 7%, and
Icon reads 22% rather than 10%.

The exclusion is a denylist, not an allowlist, so a new CRM page is in scope the moment it
exists.

One consequence worth knowing: some mailbox CSS has leaked into `crm.html` and still counts
as CRM by file. `.thread-*` has **25 rules and zero markup uses** there, and `.email-tile-*`
has 10 — the same kind of stranded chrome the composer was. Until those are removed they
inflate `List row`, which is why that block carries a note saying so.

## Measuring adoption

**`node design-system/measure-adoption.js`** counts, per built block, how many call sites
in the shipped pages go through the system versus still hand-roll it. `--write` puts the
figures into `registry.json`, which is where the workbench's green bar segment comes from.
Run it before and after a migration pass; the delta is the only honest evidence that
anything moved.

Nothing hand-edits `adopted` / `legacy`. The patterns in that script are coarse on purpose
— the useful property isn't precision, it's that the same rule runs every time, so a
change in the number is real movement rather than a change of definition. `design-system/`
is excluded from the scan: counting the workbench's own `ds-btn` demos as adoption would
flatter every figure.

Two rules this measurement enforces:

1. **`built` is not `adopted`.** A component can exist and be used nowhere. Icon was the
   worked example: a real Phosphor module, 196 variants nominally absorbed, and six actual
   call sites against 185 inline `<svg>` blocks.
2. **Don't migrate dead markup.** Converting an unreachable `<svg>` raises the number
   without moving anything a user can see. The back chevron inside crm.html's dead
   `#opp-detail` panel is left alone for exactly this reason.

## Known gaps

- **20 of the 27 blocks are still `planned`** — see the inventory above. The system
  currently governs tokens everywhere they are linked, icons in the sidebar, and five
  primitives; everything else is per-page.
- **No dark mode.** The reference has none. When it arrives it is a theme file, and
  primitives will need dark steps rather than an inverted filter.
- **Contrast is unverified** for the label palette pairs. Anything that becomes text
  on a fill should be checked before it ships — the `dataviz` skill's
  `validate_palette.js` is the tool already used for the dashboard.
