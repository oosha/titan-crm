# Titan CRM

An exploration prototype, not a product codebase. The question it exists to answer:
**what does a CRM feel like when it lives inside an email client?** Everything here is
in service of trying that out quickly — the mailbox and the CRM are built side by side
so we can see how a thread and a record behave when they're the same surface.

Treat it accordingly. Speed of iteration beats architectural purity; there is no build
step, no framework, no tests, and that's deliberate. Don't propose introducing them
unless asked.

## Running it

Static files + Vercel serverless functions. No `package.json`, no install.

- Deployed: Vercel serves the pages and `/api/*` from the same origin.
- Locally: **`node dev-server.js`** → http://localhost:8000. It serves the static files,
  applies the `vercel.json` rewrites (a plain static server 404s on `/crm/...`), and
  answers `/api/data`, `/api/revert` and `/api/logo` from the local files under `data/`.
  No `GITHUB_TOKEN`, no network writes — nothing you do locally can touch live data. The
  flip side: your saves land in the working tree; `git checkout -- data/` to discard.
  Read its header comment before reaching for anything else.
- `?apiBase=http://localhost:8010` points at a separate mock, but **only `crm.html`
  honours it** — every other page hardcodes a relative `/api/data`. Prefer `dev-server.js`.

## Pages

Multi-page app. Routes are rewrites in `vercel.json`; each route is its own document.

| Route | File | Notes |
|---|---|---|
| `/mail` | `index.html` | Mailbox. ~7k lines, self-contained. |
| `/crm`, `/crm/pipeline/:id` | `crm.html` | Kanban board. ~6k lines. |
| `/crm/dashboard` | `dashboard.html` | Charts + the "Ask Titan" rail |
| `/crm/pipeline/:id/record/:recordId` | `opportunity-view.html` | Record detail |
| `/crm/pipeline/:id/record/new` | `add-opportunity.html` | |
| `/crm/pipeline/:id/setting` | `pipeline-settings.html` | Stages, fields |
| `/crm/pipeline/:id/record-setting` | `opportunity-settings.html` | |
| `/crm/contacts`, `/crm/companies` | `contacts.html`, `companies.html` | Directory pages |
| `/crm/sequences` | `sequences.html` | Global prototype sequence library + linear editor |
| `/crm/forms` | `forms.html` | One row per pipeline: its intake form, or the offer of one |
| `/crm/pipeline/:id/form` | `form-settings.html` | Deep link to one form's editor |
| `/f/:token` | `form.html` | **Public.** The intake form itself — no auth, no sidebar |

`index.html` and `crm.html` are monoliths with inline CSS and JS; the newer pages are
thin shells over shared scripts (`crm-directory.js`, `titan-sidebar.js`) that fetch their
own data. **That's the direction to build in** — a page should be a standalone deep link
that works on a cold load, not something that depends on a previous page having stashed
state for it.

Cross-page deep links, all of which must survive a cold load: `?u=<persona>` everywhere,
`?company=<name>` and `?contact=<email>` (or `?contactName=`) open one row's panel on the
directory pages, and `?intent=new-pipeline|settings` tells `crm.html` to open a modal that
only it owns.

## Design system

**Before writing any UI, read [`design-system/DESIGN-SYSTEM.md`](design-system/DESIGN-SYSTEM.md)
and [`design-system/registry.json`](design-system/registry.json).** The registry lists
every component, its props and states, and every screen-level pattern; the doc has the rules.

`design-system/index.html` is the workbench: **http://localhost:8000/design-system/**,
six hash-routed views — `#overview` (the coverage ledger), `#foundations`, `#icons`,
`#components`, `#patterns`, `#directions`. Screenshot the relevant one after any visual change. It
renders straight from the registry and `dsIcon` rather than restating them, so it is the
fastest way to see what exists before you build — and the place a visual regression shows up.

**Patterns are requirements, not inspiration.** Before choosing whether a task opens in
a modal, drawer or full page, check `registry.json.patterns` / `#patterns`. If the task
matches a registered pattern, follow its route, structure, accessibility and state rules.
The current contracts are Modal dialog (short, bounded work that retains page context),
Full-page settings (sustained or multi-section configuration with a cold-loadable route),
and Two-pane workspace (two related surfaces that must remain visible together). The
two-pane contract covers only the adjacent full-bleed pane surfaces, their horizontally
centred and width-bounded shared content frame, separator, independent scroll regions and
responsive fallback; it does not carry feature styling between adopters. Using
design-system components inside the wrong interaction pattern does not make the surface compliant.

**Scope is the CRM and its modules — `index.html` is deliberately out.** The mailbox is the
mocked half; it keeps its own chrome and is excluded from both measurement scripts (and from
`personas/`). Don't migrate mail markup to `ds-*` and don't count it as coverage.

A page links the system with exactly two stylesheets — `/design-system/tokens.css` and
`/design-system/components.css`. Never link a file under `components/` directly; that drift is
how the record screen ended up using `.ds-input` on a page where the rules weren't loaded.

`node design-system/measure-adoption.js` reports how many call sites actually go through the
system; `measure-inventory.js` reports how much duplication each block still carries. Read
them to see where a surface stands before and after you touch it — the delta is the only
evidence that anything moved. Adoption ignores `ds-` classes on a page that doesn't link the
CSS, and names them as inert, which is usually a missing `<link>` rather than a bad number.

Three things it exists to stop:

- **Reinventing controls.** The live product has 82 button rules across 14 class names.
  Use `ds-btn`; don't write the fifteenth, and don't invent the sixteenth.
- **Hardcoding values.** Everything reads semantic tokens (`--text-primary`), which map to
  primitives (`--gray-700`). A hex in the CSS you write means you reached past the system.
- **Forking to explore.** A design direction is a file in `design-system/themes/` that
  redefines semantics only. Component *shape* is tokenised too (`--btn-radius`,
  `--btn-height`, …), so "try a different button everywhere" is a value change, not a
  refactor — and it is the designer's change to make.

### `design-system/` changes only on request

**Never edit anything under `design-system/` as part of doing something else.** Not to add
a component you needed, not to add a token you were missing, not to fix a value that looks
wrong. Only when the person you are talking to asks for that change, in this conversation,
in those terms. Everything counts: `tokens/`, `components/`, `themes/`, `components.css`,
`tokens.css`, `registry.json`, the workbench.

The system has one owner and you cannot tell from a session whether you are talking to
them, so the rule is written as a default rather than a permission — never on your own
initiative, only on an explicit ask. "This surface obviously needs a `ds-tabs`" is not an
ask; it is the exact reasoning the rule exists to stop.

The measurement scripts are the one safe exception: run `measure-adoption.js` /
`measure-inventory.js` to *read* where a surface stands. Don't pass `--write` — that
rewrites the registry.

### Building a new surface

Compose it from what already exists, and stay inside the existing language:

1. **Shop the registry first.** `registry.json` is the index of every component, its props
   and states, and every screen-level pattern; the workbench shows them rendered. Choose
   the matching pattern first, then build it from the registered pieces.
2. **Take the nearest fit over an invention.** A tags input is a `ds-input` with `ds-badge`
   children before it is a new component. A slightly-off button is `ds-btn` with a spacing
   token applied at the call site, not `ds-btn--myvariant`.
3. **Only page-specific layout is yours to write** — grids, positioning, how these
   components sit together on this screen. That CSS lives with the page and must read
   tokens (`--space-200`, `--text-secondary`), never literals or hex.
4. **When nothing fits, say so.** Build the smallest honest thing with page-local classes
   — **named for the page, never `ds-`** — keep it visually consistent with what's
   already there, and **flag it in your summary**: what you
   needed, what you used instead, which surface it's on. That list is what the designer
   audits and decides to absorb. Don't pre-empt that decision by writing the component
   yourself.

The failure mode this prevents isn't ugly UI — it's a `ds-`-looking class that nobody
designed, which reads as sanctioned and quietly becomes the fifteenth button.

Extracted from `App Redesign/index_prodRedesign_interactions.html`, which remains the
visual ground truth. The shipped CRM is not migrated yet: `semantics.css` ends with a
bridge block aliasing the old `--dir-*` names, so pages can move over one at a time.

## The sidebar is a component

`titan-sidebar.js` owns the CRM nav for every regular CRM page — markup, account switcher,
pipeline rows, three-dot menu, footer — and `titan-sidebar.css` owns every sidebar style.
A page following the **Full-page settings** pattern is the deliberate exception: it does
not mount or load the global sidebar, because the task owns the complete viewport. It may
still link `titan-sidebar.css` for the shared `.app-window` / `.main-area` / `.subpage-*`
shell, and a multi-section settings page may provide one page-local section rail below its
full-width header.

A regular page's entire involvement is:
A page's entire involvement is:

```html
<link rel="stylesheet" href="/titan-sidebar.css">
<div id="sidebar-mount"></div>
<script src="/titan-sidebar.js"></script>
```

This was four hand-maintained copies (crm.html, the directory pages, opportunity-view,
and a replayed HTML snapshot on the settings pages) that had drifted apart — different
separator positions, a stale account email, saved views on one page only. Rules that keep
it from forking again:

1. **A page must not contain sidebar markup or sidebar CSS.** Change the component once.
2. **Active state is derived from `location.pathname`**, inside the component. A page
   never announces which nav item it is.
3. **Pages that already fetch `/api/data`** declare `<body data-sidebar-data="page">` and
   hand the list over with `titanSidebar.setPipelines(...)`. Pages that fetch nothing get
   a self-fetch, so a deep link into a settings page still has a real sidebar.
4. **No `window.opener` dependencies.** Sub-pages navigate in place; anything only the
   board can do travels as `?intent=`.
5. The component calls its own `titanSidebarGo()` for navigation — never a page-defined
   helper. `crmPath()` means *different things* in `crm.html` and `crm-directory.js`, and
   the shared markup calling it sent the board to `/crm/pipeline/%2Fcrm%2Fdashboard`.
6. **A page script must not grab a sidebar element at parse time.** The component
   renders on `DOMContentLoaded`, which is *after* an inline `<script>` runs, so
   `document.querySelector('.tab-switch')` finds nothing and any guard clause silently
   swallows the feature — that is exactly how crm.html's app switcher stopped opening.
   Bind by delegation on `document` instead; it also survives the sidebar re-rendering,
   which it does whenever the pipeline list changes.

The app switcher in the sidebar header is the component's markup, but its dropdown is
not: `crm.html` and `index.html` each ship the full `#app-switcher` panel and bind it
themselves. On every other CRM page the component falls back to navigating to `/mail`,
so the control is never inert.

The nav is: Dashboard · New pipeline · the pipeline rows (each with saved filter views and
a three-dot menu) · Upcoming activities · Sequences · Contacts · Companies · Forms · Integrations.

`crm.html` still defines its own `switchPipeline`, `openNewPipeline`, `toggleSettingsModal`,
`togglePipelineNavMenu`, `pipelineNavMenuAction` and account handlers — it loads the
component in `<head>`, so its later definitions win. That overlap is deliberate but it is
a contract: rename one of those and the board's sidebar breaks.

## Sequences

`/crm/sequences` is a global, frontend-only prototype library. `titan-sequences.js` owns
the small shared set of sales email templates and linear sequences, and both
`sequences.html` and `pipeline-settings.html` read it. A sequence step is a timing group
with actions that send an email, set a call reminder, or create a task. Actions in the same
group run together, and each action renders as its own card. A group may temporarily be
empty while editing, in which case the editor shows a compact add-action state. Calls and
tasks represent new items that would appear in Upcoming
activities; they are not reusable task definitions. Both use the same reminder schedule:
immediately, in one hour, the next day, in two days, in three days, or a custom number of days.
Every day-based choice also stores an exact `reminderTime` (default `09:00`), while custom uses
`reminderDays` for the relative day count. Before each action group, the editor
shows one compact control with three modes: continue immediately, continue after a delay
of N days, or continue if there is no reply for N days. New action groups default to the
no-reply option with a one-day wait. Waits are relative to the previous action (or the sequence
trigger for step one). Condition cards use a small solid amber-brown timeline dot rather than
the more prominent numbered circles reserved for action steps. The add-step control uses a
compact blue circle with a white plus. Every flow begins with a small blue dot labeled `Start of sequence`
and finishes with a small red dot labeled `End of sequence`. A reply stops the remaining linear sequence. Only the
no-email-reply condition is supported; there is no branching model.
The gray template summary beneath the selector is an inline disclosure: its Expand control
reveals the recipient and full body in place, and changes to Collapse without rerendering
the action card. The adjacent Add another template button is intentionally disabled in this
prototype and does not open another surface. Each sequence also has a `weekdaysOnly`
setting, enabled by default, that represents skipping Saturday and Sunday when execution
is eventually connected to a scheduler. The selected sequence name is edited inline in the
flow header. Template selectors use a viewport-positioned menu so the editor's scrolling
timeline cannot clip their options; the active timeline node is raised above its siblings
while that menu is open so later cards cannot cover it. Editor labels distinguish adding another action
inside the current step from adding another step to the sequence. Adding a step uses a smooth
entrance, scrolls the new step into view and animates the lower timeline items into their new
positions. Removing a step first scrolls it into view, animates it out, then smoothly reflows
the remaining keyed timeline items. These effects use the Web Animations API, announce the
result through an ARIA live region and respect `prefers-reduced-motion`; do not add GSAP for them.
Sequence list cards show the number of steps (not the total actions nested inside them) and
`activeInstances`, the representative number of pipeline-record sequence instances currently active. This is intentionally different from `usedBy`, which
describes stage configuration references rather than live record-level instances.

There is deliberately no scheduler, sender or sequence API yet. The editor keeps changes
in memory and says so in the UI; a reload restores the shared sample definitions. Do not
move the drafts to localStorage or turn sessionStorage into sequence persistence. Stage
settings may reference the sample sequence ids for entry, quiet-stage and exit actions,
but nothing executes those references yet.

## Intake forms

A pipeline can carry a public form. Someone fills it in at `/f/<token>` and the
submission arrives as a card in that pipeline's first stage.

The form lives **on its pipeline**, beside `customFieldDefs`:

```
pipelines[<id>].intakeForm = {
  token, enabled, heading, logoUrl, recordTitle, sourceLabel,
  submitLabel, thanks, blurb,
  fields: [ { key, label, type, required, target, placeholder } ]
}
```

`target` says where a value lands on the card (`name`, `email`, `phone`, `designation`,
`company`, `location`, `linkedin`, `note`, or `custom` — for `custom`, `key` must match a
`customFieldDefs` key or the record page can't render it). **`name` and `email` are locked
and cannot be removed**: email is what `contactKey()` deduplicates contacts on, and name is
what every list renders. The token is `<persona>.<random>` — the prefix tells the server
which data file to write without trusting a query param, and rotating it revokes a shared
link.

### The public surface is deliberately narrow

**`form.html` must never call `/api/data`.** That endpoint returns every record for a
persona and accepts the whole document back. The public page talks only to `api/form.js`:

- `GET /api/form?token=` → `{ heading, logoUrl, fields }` and nothing else. A disabled
  form 404s exactly like a missing one, so switching a link off doesn't announce that it
  once existed.
- `POST /api/form?token=` → takes only `{ values }`. The server looks the form up by
  token, validates against the **stored** field list (unknown keys dropped, honeypot
  rejected), and **builds the card itself** — the client never names a pipeline, a stage,
  an amount or a record id.

Writes go through `updateJsonFile()` in `api/_github.js`, which redoes the whole
read-append-write on a sha conflict so two simultaneous submissions merge. Do **not** reuse
`writeJsonFile()` here — see the note in that file.

`api/_form.js` holds the model (targets, validation, card construction) and is required by
both `api/form.js` and `dev-server.js`, so what validates locally is what validates in
production. **`dev-server.js` hardcodes its API routes** — a new `api/*.js` works on Vercel
and 404s locally until it's added there too.

### The builder is one module on one full-page route

`form-builder.js` (+ `form-builder.css`) is the editor. Every form creation/editing entry
point navigates in place to `/crm/pipeline/:id/form`, following the Full-page settings
pattern; its body composes the Two-pane workspace pattern with the editor on the left and
the live preview on the right. `titanFormBuilder.mount(host, {…})` renders it inline there.
After a successful publish, the editor leaves, the preview slides into the left pane, and a
right-hand handoff pane confirms publication and offers link copying, native social sharing,
and embed-code copying. The route header does not duplicate that success result.
The route fetches its own data on a cold load, replaces the global sidebar, preserves
`?u=<persona>`, and saves via `saveData()`. A safe
`?from=forms|board|pipeline-settings` enum controls Back without accepting an arbitrary
return URL.

The board's New Pipeline flow creates and persists the pipeline before navigating to the
form route, because a full-page editor cannot fetch a pipeline that still exists only in
the previous document's memory. Do not reintroduce `titanFormBuilder.open()` at a call site
or stack the form editor over another modal.

`form-render.js` (+ `form.css`) draws the form's actual markup and is shared by the public
page and the builder's preview. Keep it that way: a preview that drifts from the real form
is worse than no preview. New forms start **accepting responses** — the token is random, so
nothing is reachable until the link is shared, and a form that silently drops submissions is
the worse of the two failures. Their default fields come from the pipeline's `type` (hiring
asks for a portfolio link and why the role; sales for company and what they need).

A logo is stored as a **data URI on the form**, downscaled to 320px and capped at 60KB.
That cap is not cosmetic: the whole document is POSTed on every save and every save is a
commit, so a full-size logo would be re-committed on every unrelated CRM edit.

## Where data actually lives

**GitHub is the database.** `api/_github.js` reads and writes JSON files in this very
repo through the GitHub Contents API, authenticated with a server-side `GITHUB_TOKEN`
(a Vercel env var; it never reaches the browser).

Consequences that matter:

- Saves are **shared**, not per-browser. Everyone opening the same `?u=` link sees the
  same data and each other's edits.
- App saves land as commits. Most of this repo's history is `Update default data` /
  `Update joanna data` — those are writes from the running app, not human work.
- **A `git push` can clobber live data.** `data/default/current.json` and
  `data/personas/*.json` must be guarded:
  `git update-index --skip-worktree <file>`. To intentionally re-seed one from code:
  lift the flag with `--no-skip-worktree`, commit, then re-apply.

`crm.html`'s `persistNow()` debounces 600ms and POSTs the entire
`{currentPipelineId, pipelineSeq, pipelines}` blob on every change.

### There is no localStorage

Zero occurrences, on purpose. We are not simulating a backend client-side — the
persistence above is a real server round-trip.

`sessionStorage` appears, but only as a **courier between page navigations**, since
separate documents share no JS runtime:

- `titan-crm-edit-pipeline` — hands a pipeline object to the settings page
- `titan-crm-commit-pipeline` — hands the edited result back to `crm.html`
- `titan-crm-add-opportunity-source` — context for the new-record page
- `titan-crm-pipeline-nav:<persona>` — the sidebar's row **data** cache, so the nav paints
  before that page's own `/api/data` returns. Stale for one frame, then reconciled.

Nothing there is a source of truth for CRM data. Don't cache records in it; fetch from
`/api/data` instead.

One key is not a courier, and it's the exception that proves the rule:

- `titan-crm-chat:<persona>` — the Ask Titan transcript on the dashboard.

It lives here because it has no server that owns it. It isn't CRM data, so `/api/data`
is the wrong home twice over: every message would become a commit, and the document is
shared, so one person's conversation would appear in everyone else's rail on the same
`?u=` link. The transcript is per-tab and dies with it, which is the right lifetime for a
chat rail and is *why* `sessionStorage` rather than `localStorage` — the "no localStorage"
rule above still holds.

Two things it deliberately does not store: the greeting, which is rebuilt on load so its
figures aren't stale, and any rendered HTML — see below. Writes are capped by message
count and byte size, and every access is wrapped, because `sessionStorage` throws on
quota and in some private modes.

Never stash *rendered HTML* here. The sidebar used to be handed between pages that way,
which is why sub-pages showed a frozen copy of whatever the board looked like on the way
out — and an empty black column when deep-linked with nothing stashed.

**The mailbox is the mocked half.** In `index.html`, threads and tiles are static demo
markup (default persona) or `personas/<id>.js` (other personas) — in-memory, no reload
persistence. Only the CRM records behind them are real. `THREAD_LINKS` ties a thread to
a record (`t3` → record #6 in `neo` is hardcoded; persona threads use
`mailbox.threads[].pipelineRef`).

## API

- `api/data.js` — `GET`/`POST` a persona's pipeline data (whole document; see the
  warning at the end of this file)
- `api/form.js` — the **public** intake-form endpoint. `GET` returns one form's definition,
  `POST` appends one card. Never returns records. Backed by `api/_form.js`.
- `api/revert.js` — reset `default` to seed; full, or per-pipeline via `{pipelineIds}`
- `api/logo.js` — proxies DuckDuckGo favicons. It MD5-matches their "no icon"
  placeholder so unknown domains return a real 404 and the initial-letter fallback
  fires. Don't point `<img>` straight at an icon service; that's the bug this fixes.
- `api/_github.js` — shared Contents-API helpers. **Read its header comment** before
  touching personas or data files.

## Personas

`?u=<id>` selects a dataset. `<id>` must match `/^[a-z0-9_-]{1,32}$/`.

- `default` — the Neo partnerships demo. The **only** persona with a
  `seed.json`/`current.json` split and a working revert.
- Everything else — a single live file at `data/personas/<id>.json`, no seed, no revert.
  Whatever is saved stays.

A persona has two halves: `personas/<id>.js` carries identity (name, currency, branding,
mailbox threads) and loads client-side; `data/personas/<id>.json` carries the pipeline
records and is served through the API. Adding one is documented in `api/_github.js:10-24`.

## Data shape

```
{ currentPipelineId, pipelineSeq,
  contactFields[],            // the contact schema (Contacts page "Fields")
  dashboard: { type, scope, hidden[] },   // dashboard prefs, persisted like the rest
  pipelines: { <id>: { id, name, entity, plural, color, type,
                       stages[], cards[], hiddenFields[], shownFields[],
                       subject, customFieldDefs[], contactsEnabled, team,
                       intakeForm } } }        // see § Intake forms
```

`type` is `'sales'` or `'hiring'` (see `PIPELINE_TYPES` in `crm-directory.js`). It decides
whether records carry money, what the completion rate is called ("win rate" / "hire rate"),
which dashboard tab a pipeline appears under, and which preset fields a new form gets.
Anything without one is `'sales'` — and pipelines created before `NP_PIPELINE_TYPE` existed
have no `type`, so a hiring board built from the Candidates template can still be showing
money columns. Check for it before trusting the field.

Cards carry both a `contacts[]` array and legacy flat `contact*` fields. Normalize with
`contactsOf()` in `crm-directory.js` rather than reading either directly. Values for
`customFieldDefs[]` live on the card as `customFieldValues` keyed by field key.

## Record fields

`crm-schema.js` owns which fields a record type has, what they're called, and which
sections they sit in. Two axes: `entity` (what the record is) and `subject` (who it's
about — `'company'` or `'person'`). **Never hardcode a field label or list.** Call
`titanSchema.resolve(pipeline)` and read `.label(key)`, `.on(key)`, `.headings`, or
`.fields`; three pages used to keep their own tables and disagreed, which is how an
orders board came to show "Opportunity name" under "Opportunity details".

Four field states: `required` (locked on), `on`, `off`, and `none` — *not offered*,
absent from `.fields` entirely, so a hiring board has no Instagram field to toggle.
Only `on`/`off` are user-togglable, via **two** stored arrays: `hiddenFields[]` keeps
its original meaning (an explicit hide list) and `shownFields[]` is its mirror, needed
because some fields now default to off. A pipeline with neither behaves as it always did.

`subject` is `'company'` unless set, so existing data is unchanged. `Candidate` is
**locked** to `'person'` (`titanSchema.subjectLocked`) — a candidate is a person by
definition, not by preference, and that's what keeps candidates' employers off the
Companies page without a special case there. The New Pipeline flow asks only for the
Orders and Custom templates; everything else infers it, the way `type` already does.
Switching subject **hides company fields, never clears them** — `card.company` and
friends stay on the card and come back if you switch again.

`card.status` is the *outcome* axis and is deliberately independent of `card.stage` — a
record can sit in the last stage and still be open, and can be Lost from anywhere. Its
vocabulary is per `entity` and lives in `crm-status.js` (Won/Lost, Hired/Rejected/Withdrawn,
Fulfilled/Returned…). Never compare `card.status` to a literal: read it through
`titanStatus.current(card, entity)` and colour it by `titanStatus.toneOf(...)`, or a hiring
board silently loses its pills.

Every vocabulary opens `New → In progress → <outcome>`. **"Not finished" is two tones**,
`new` and `open` — test with `titanStatus.isOpenTone(tone)`, never `tone === 'open'`, or
every untouched record drops out of the open totals. New records are created with `New`
(the add-record form defaults to it); a card with *no* stored status still reads as
`In progress`, because a legacy record is in progress, not new.

Anything that changes `card.stage` must call `titanStatus.syncToStage(card, pipeline)` —
moving a record off the first stage clears a lingering `New`. It only ever promotes, so
dragging a card back doesn't undo it. Three callers today: the board's drop handler, the
record page's `selectStage`, and the mailbox panel's stage menu.

Whether a pipeline *has* a status is a schema question, not a status one — check
`titanSchema.on(pipeline, 'status')` first (required on Opportunity/Order, optional on
Project/Candidate, off by default on Record). Anything reading status must honour it, or
a card carrying a stale value from before the field was switched off will show an outcome
the record page has already hidden. Cards predating the field carry a `won` boolean instead,
which `current()` resolves to that entity's positive outcome.

The dashboard's win/hire rate reads `card.status`, not the stage: `Won / (Won + Lost)`,
so a full pipeline of live deals doesn't drag the rate down and a Closed-and-Lost deal
doesn't score as a win. `'paused'` (a project On hold) counts as neither open nor settled.

Two fields to be careful with, because they read as live signals and are not:
`card.overdue` is a **hand-authored boolean** nothing computes — `lastActivity` is a
display string (`"6d ago"`), not a timestamp, and there is no date arithmetic anywhere in
the CRM. `card.activityType` is the *type of the last touch on that record*, not a log of
activity. Don't build a feature that assumes either one is derived.

## Known duplication

Company-logo derivation (`companyDomainFor` / `companyLogoHTML`) and HTML escaping are
still copy-pasted across `crm.html`, `opportunity-view.html`, `index.html` and
`crm-directory.js`. A change to one needs the others. If you're touching this area anyway,
consolidating into `crm-directory.js` is welcome — that's where the shared helpers live
(`contactsOf`, `defaultCurrency`, `titleWithoutOrg`, `companyHref`, `contactHref`).

A helper used by both directory pages **must** go in `crm-directory.js`. Defining it in
`contacts.html` and calling it from `companies.html` looks fine locally and throws in the
browser — they are separate documents.

## Writing to `/api/data`

`POST /api/data` replaces the **entire** document for a persona, and `writeJsonFile()`
resolves a 409 by re-reading the sha and re-writing the same stale object
(`api/_github.js`) — last-write-wins, not a merge. That's tolerable for the app, where one
person edits their own board. It is **not** safe for anything public or concurrent: a
narrow, append-only endpoint that re-reads and re-appends inside the retry is the right
shape there, not a reuse of `saveData()`.
