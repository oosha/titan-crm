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

## The sidebar is a component

`titan-sidebar.js` owns the CRM nav for **every** page — markup, account switcher,
pipeline rows, three-dot menu, footer — and `titan-sidebar.css` owns every sidebar style.
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
a three-dot menu) · Contacts · Companies · Forms.

`crm.html` still defines its own `switchPipeline`, `openNewPipeline`, `toggleSettingsModal`,
`togglePipelineNavMenu`, `pipelineNavMenuAction` and account handlers — it loads the
component in `<head>`, so its later definitions win. That overlap is deliberate but it is
a contract: rename one of those and the board's sidebar breaks.

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

### The builder is one module, opened from four places

`form-builder.js` (+ `form-builder.css`) is the editor. `titanFormBuilder.open({…})` puts
it in a modal; `.mount(host, {…})` renders it inline. It never saves — `onSave(form,
pipeline)` hands the objects back and the caller decides what that means:

| Where | How it saves |
|---|---|
| Board header **Form** button / pipeline three-dot menu | `schedulePersist()` |
| `/crm/forms` **Edit** | `saveData()`, then re-render the row |
| New-pipeline modal, step 2 "Lead form" | held in memory, attached in `npCreate()` so pipeline and form land in one write |
| `/crm/pipeline/:id/form` | `saveData()` |

`form-render.js` (+ `form.css`) draws the form's actual markup and is shared by the public
page and the builder's preview. Keep it that way: a preview that drifts from the real form
is worse than no preview. New forms start **paused**, and their default fields come from the
pipeline's `type` (hiring asks for a portfolio link and why the role; sales for company and
what they need).

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

Nothing is a source of truth. Don't add data to it; fetch from `/api/data` instead.

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
                       stages[], cards[], hiddenFields[],
                       customFieldDefs[], contactsEnabled, team,
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
