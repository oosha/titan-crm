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
- Locally: any static file server works for the pages, but the `/api` functions need a
  runtime. `?apiBase=http://localhost:8010` points the frontend at a standalone mock
  (see `crm.html`'s `API_BASE`). `api/_github.js` allowlists `localhost:8000` and
  `localhost:8123` for CORS.

## Pages

Multi-page app. Routes are rewrites in `vercel.json`; each route is its own document.

| Route | File | Notes |
|---|---|---|
| `/mail` | `index.html` | Mailbox. ~7k lines, self-contained. |
| `/crm`, `/crm/pipeline/:id` | `crm.html` | Kanban board. ~6.9k lines, self-contained. |
| `/crm/pipeline/:id/record/:recordId` | `opportunity-view.html` | Record detail |
| `/crm/pipeline/:id/record/new` | `add-opportunity.html` | |
| `/crm/pipeline/:id/setting` | `pipeline-settings.html` | Stages, fields |
| `/crm/pipeline/:id/record-setting` | `opportunity-settings.html` | |
| `/crm/contacts`, `/crm/companies` | `contacts.html`, `companies.html` | Directory pages |

`index.html` and `crm.html` are monoliths with inline CSS and JS. The newer pages are
thin shells over shared scripts (`crm-directory.js`, `titan-sidebar.js`) and fetch their
own data. **That's the direction to build in** — new pages should be standalone deep
links, not dependent on a previous page having stashed state.

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
- `titan-crm-sidebar-html` — replayed by `titan-sidebar.js` so the nav doesn't flash

Nothing is a source of truth. Don't add data to it; fetch from `/api/data` instead.

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
  pipelines: { <id>: { id, name, entity, plural, color,
                       stages[], cards[], hiddenFields[],
                       customFieldDefs[], contactsEnabled } } }
```

Cards carry both a `contacts[]` array and legacy flat `contact*` fields. Normalize with
`contactsOf()` in `crm-directory.js` rather than reading either directly.

## Known duplication

Company-logo derivation, HTML escaping, and currency fallback are copy-pasted across
`crm.html`, `opportunity-view.html`, and `crm-directory.js`. A change to one needs the
others. If you're touching this area anyway, consolidating into `crm-directory.js` is
welcome.
