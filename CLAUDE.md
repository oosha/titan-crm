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

`crm.html` still defines its own `switchPipeline`, `openNewPipeline`, `toggleSettingsModal`,
`togglePipelineNavMenu`, `pipelineNavMenuAction` and account handlers — it loads the
component in `<head>`, so its later definitions win. That overlap is deliberate but it is
a contract: rename one of those and the board's sidebar breaks.

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

- `api/data.js` — `GET`/`POST` a persona's pipeline data
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
                       customFieldDefs[], contactsEnabled, team } } }
```

`type` is `'sales'` or `'hiring'` (see `PIPELINE_TYPES` in `crm-directory.js`). It decides
whether records carry money, what the completion rate is called ("win rate" / "hire rate"),
and which tab of the dashboard a pipeline appears under. Anything without one is `'sales'`.

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
