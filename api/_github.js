// Shared GitHub-Contents-API helpers. Live data is real files in this same
// repo (oosha/titan-crm) — GitHub itself is the "database", so no separate
// storage service is needed. GITHUB_TOKEN is a server-side Vercel env var;
// it never reaches the browser.
//
// "default" (the built-in Neo partnerships demo) keeps a seed.json/current.json
// split so it can be reverted on request. Other personas (joanna, and whatever
// comes next) are just a single file — no seed, no revert.
//
// ── Adding a new persona ──────────────────────────────────────────────────
//   1. Create data/personas/<id>.json with the persona's pipelines (its starting
//      content). <id> must match /^[a-z0-9_-]{1,32}$/ (see isValidPersonaId).
//      Reach it in the app with ?u=<id>.
//   2. That file is the persona's LIVE store — the app both reads AND writes it
//      via the GitHub API. It has no seed/revert; whatever is saved stays until a
//      record is deleted. Do NOT add a seed for it (seed.json is a manual, code-
//      side revert tool for "default" only, never used by the app at runtime).
//   3. Guard it from git so a stray push can't overwrite live saves with the
//      committed snapshot:
//        git update-index --skip-worktree data/personas/<id>.json
//      To intentionally edit it from code later (e.g. re-seed its starting data),
//      lift the flag first: git update-index --no-skip-worktree <file>, commit,
//      then re-apply --skip-worktree. Same rule already applies to
//      data/default/current.json.
const OWNER = 'oosha';
const REPO = 'titan-crm';
const BRANCH = 'main';
const BASE_PATH = 'data';

function currentPathFor(personaId) {
  return personaId === 'default' ? BASE_PATH + '/default/current.json' : BASE_PATH + '/personas/' + personaId + '.json';
}
function seedPathFor(personaId) {
  return personaId === 'default' ? BASE_PATH + '/default/seed.json' : null;
}

// Same-origin requests (the normal case once this is deployed — Vercel serves
// the static pages and these functions from the same domain) never hit CORS
// at all. This list only matters for local testing against a static file
// server on a different port/origin.
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'http://localhost:8123',
];

function corsHeaders(req) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function applyCors(req, res) {
  const headers = corsHeaders(req);
  Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
}

function isValidPersonaId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]{1,32}$/.test(id);
}

async function ghRequest(path, options) {
  const res = await fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path, Object.assign({
    headers: Object.assign({
      Authorization: 'token ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'titan-crm-prototype',
    }, (options && options.headers) || {}),
  }, options || {}));
  return res;
}

// Returns { sha, json } or null if the file doesn't exist yet.
async function readJsonFile(relativePath) {
  const res = await ghRequest(relativePath + '?ref=' + BRANCH);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub read failed (' + res.status + '): ' + (await res.text()));
  const body = await res.json();
  const content = Buffer.from(body.content, 'base64').toString('utf8');
  return { sha: body.sha, json: JSON.parse(content) };
}

// Creates or updates a file, reporting a sha conflict instead of resolving it.
// Returns { ok: true } or { ok: false, conflict: true }.
//
// writeJsonFile() below "resolves" a 409 by re-reading the sha and writing the
// same object again — which silently discards whatever the other writer put
// there. That is survivable for the app (one person editing their own board) and
// NOT survivable for anything concurrent, like a public form. Callers that must
// not lose a write use this and redo their own read-modify-write on a conflict,
// so the second writer merges onto the first instead of overwriting it.
async function writeJsonFileStrict(relativePath, dataObj, message, knownSha) {
  const content = Buffer.from(JSON.stringify(dataObj, null, 2) + '\n', 'utf8').toString('base64');
  const body = { message: message, content: content, branch: BRANCH };
  if (knownSha) body.sha = knownSha;
  const res = await ghRequest(relativePath, { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) return { ok: false, conflict: true };
  if (!res.ok) throw new Error('GitHub write failed (' + res.status + '): ' + (await res.text()));
  return { ok: true };
}

// Read → modify → write, retried whole so a concurrent write is merged onto
// rather than clobbered. `mutate(doc)` is called with the freshest document each
// attempt and may return false to abort without writing.
async function updateJsonFile(relativePath, mutate, message, attempts) {
  const tries = attempts || 4;
  for (let i = 0; i < tries; i++) {
    const existing = await readJsonFile(relativePath);
    if (!existing) throw new Error('No such data file: ' + relativePath);
    const result = mutate(existing.json);
    if (result === false) return { ok: false, aborted: true };
    const wrote = await writeJsonFileStrict(relativePath, existing.json, message, existing.sha);
    if (wrote.ok) return { ok: true, json: existing.json, result: result };
    // Someone else wrote first — loop and re-apply on top of their version.
  }
  throw new Error('Could not write ' + relativePath + ' after ' + tries + ' attempts (too much concurrent activity)');
}

// Creates or updates a file. Retries once on a sha conflict (409) in case
// another request wrote to it between our read and write.
async function writeJsonFile(relativePath, dataObj, message, knownSha) {
  const content = Buffer.from(JSON.stringify(dataObj, null, 2) + '\n', 'utf8').toString('base64');
  const body = { message: message, content: content, branch: BRANCH };
  if (knownSha) body.sha = knownSha;
  const res = await ghRequest(relativePath, { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 && knownSha) {
    const latest = await readJsonFile(relativePath);
    return writeJsonFile(relativePath, dataObj, message, latest ? latest.sha : undefined);
  }
  if (!res.ok) throw new Error('GitHub write failed (' + res.status + '): ' + (await res.text()));
  return res.json();
}

module.exports = {
  currentPathFor: currentPathFor,
  seedPathFor: seedPathFor,
  applyCors: applyCors,
  isValidPersonaId: isValidPersonaId,
  readJsonFile: readJsonFile,
  writeJsonFile: writeJsonFile,
  writeJsonFileStrict: writeJsonFileStrict,
  updateJsonFile: updateJsonFile,
};
