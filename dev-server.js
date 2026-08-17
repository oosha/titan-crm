#!/usr/bin/env node
// Local dev server — one origin serving everything, so the pages behave the way
// they do on Vercel.
//
//   node dev-server.js            → http://localhost:8000
//   node dev-server.js 3000       → custom port
//
// Three jobs:
//   1. Static files out of the repo root.
//   2. The vercel.json rewrites, so /crm, /crm/contacts, /crm/pipeline/x/record/1
//      resolve to the right .html (a plain static server 404s on these).
//   3. /api/data, /api/revert, /api/logo — same origin, because only crm.html
//      honours ?apiBase; every other page hardcodes a relative /api/data.
//
// Data is read from and written to the LOCAL files under data/. It never touches
// GitHub and needs no GITHUB_TOKEN, so nothing you do here can affect live data.
// The flip side: your saves land in your working tree as file changes. Discard
// them with `git checkout -- data/` when you're done.

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
// The intake-form rules come from the same module the deployed function uses, so
// what validates here is exactly what validates in production.
const F = require('./api/_form');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8000;

// A local .env so HUBSPOT_TOKEN can be set without exporting it into the shell.
// .gitignore covers .env — the token must never be committed, since this repo is
// public and is also its own database.
(function loadEnv() {
  try {
    fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* no .env is the normal case */ }
})();

// Credentials go to a local gitignored file rather than the data/ files, mirroring
// how production keeps them out of the repo (see api/_secrets.js). Setting this
// before api/_secrets is required is what selects the file backend; on Vercel it
// is unset, so the KV store is used instead.
if (!process.env.TITAN_SECRETS_FILE) {
  process.env.TITAN_SECRETS_FILE = path.join(ROOT, '.secrets.json');
}

// ── vercel.json rewrites → regexes, matched in file order ────────────────────
const REWRITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites.map((r) => ({
  re: new RegExp('^' + r.source.replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, '[^/]+') + '$'),
  destination: r.destination,
}));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
};

const isValidPersonaId = (id) => typeof id === 'string' && /^[a-z0-9_-]{1,32}$/.test(id);
const currentPathFor = (id) => id === 'default' ? 'data/default/current.json' : 'data/personas/' + id + '.json';
const seedPathFor = (id) => id === 'default' ? 'data/default/seed.json' : null;

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function readJson(rel) {
  try { return JSON.parse(await fsp.readFile(path.join(ROOT, rel), 'utf8')); }
  catch (e) { return null; }
}
async function writeJson(rel, obj) {
  const abs = path.join(ROOT, rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve(null); } });
  });
}

// ── /api/data ────────────────────────────────────────────────────────────────
async function apiData(req, res, query) {
  const personaId = isValidPersonaId(query.get('persona')) ? query.get('persona') : 'default';

  if (req.method === 'GET') {
    const current = await readJson(currentPathFor(personaId));
    if (current) return json(res, 200, current);
    const seed = seedPathFor(personaId) ? await readJson(seedPathFor(personaId)) : null;
    if (seed) return json(res, 200, seed);
    return json(res, 404, { error: 'Unknown persona: ' + personaId });
  }

  if (req.method === 'POST') {
    const data = await readBody(req);
    if (!data || typeof data !== 'object' || !data.pipelines) {
      return json(res, 400, { error: 'Body must include a "pipelines" object.' });
    }
    await writeJson(currentPathFor(personaId), data);
    console.log('  saved → ' + currentPathFor(personaId));
    return json(res, 200, { ok: true });
  }
  json(res, 405, { error: 'Method not allowed' });
}

// ── /api/revert ──────────────────────────────────────────────────────────────
async function apiRevert(req, res, query) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const personaId = isValidPersonaId(query.get('persona')) ? query.get('persona') : 'default';
  if (personaId !== 'default') return json(res, 400, { error: 'Only the "default" persona has sample data to revert to.' });

  const seed = await readJson(seedPathFor(personaId));
  if (!seed) return json(res, 404, { error: 'No seed data found for default.' });

  const body = await readBody(req);
  const ids = body && Array.isArray(body.pipelineIds) ? body.pipelineIds : null;
  let next;
  if (!ids || !ids.length) {
    next = seed;
  } else {
    const existing = await readJson(currentPathFor(personaId));
    next = JSON.parse(JSON.stringify(existing || seed));
    next.pipelines = next.pipelines || {};
    ids.forEach((id) => { if (seed.pipelines[id]) next.pipelines[id] = seed.pipelines[id]; else delete next.pipelines[id]; });
  }
  await writeJson(currentPathFor(personaId), next);
  console.log('  reverted → ' + currentPathFor(personaId));
  json(res, 200, { ok: true, data: next });
}

// ── /api/form (mirrors api/form.js against the local data files) ─────────────
async function apiForm(req, res, query) {
  const token = query.get('token') || '';
  const personaId = F.personaFromToken(token);
  if (!personaId || !isValidPersonaId(personaId)) return json(res, 404, { error: 'Unknown form.' });

  const file = currentPathFor(personaId);
  const doc = await readJson(file);
  const hit = doc && F.findFormByToken(doc, token);
  if (!hit || !hit.form.enabled) return json(res, 404, { error: 'This form is not accepting responses.' });

  if (req.method === 'GET') return json(res, 200, F.publicForm(hit.form, hit.pipeline));

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: 'Malformed body.' });
    const checked = F.validateSubmission(hit.form, body);
    if (checked.error) return json(res, 400, { error: checked.error });

    const card = F.buildCard(doc, hit.pipeline, hit.form, checked.values);
    if (!Array.isArray(hit.pipeline.cards)) hit.pipeline.cards = [];
    hit.pipeline.cards.push(card);
    await writeJson(file, doc);
    console.log('  form submission → ' + file + ' (card #' + card.id + ' in ' + hit.pipelineId + ')');
    return json(res, 200, { ok: true, thanks: hit.form.thanks || '' });
  }
  json(res, 405, { error: 'Method not allowed' });
}

// ── /api/logo (mirrors api/logo.js, including the placeholder rejection) ─────
const PLACEHOLDER_MD5 = 'ab1fb25b83d4b333ea661a84bd298b2e';
async function apiLogo(req, res, query) {
  const domain = String(query.get('domain') || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/i.test(domain) || domain.indexOf('.') === -1) return json(res, 400, { error: 'Bad domain' });
  try {
    const up = await fetch('https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico',
      { headers: { 'User-Agent': 'titan-crm-prototype' } });
    if (!up.ok) { res.writeHead(404).end(); return; }
    const buf = Buffer.from(await up.arrayBuffer());
    if (!buf.length || crypto.createHash('md5').update(buf).digest('hex') === PLACEHOLDER_MD5) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': up.headers.get('content-type') || 'image/x-icon', 'Cache-Control': 'public, max-age=86400' });
    res.end(buf);
  } catch (e) { res.writeHead(404).end(); }
}

// ── /api/hubspot-forms and /api/hubspot-sync ─────────────────────────────────
// Unlike apiLogo above, this does NOT re-implement the endpoint: it requires the
// real api/_hubspot.js and calls the same syncIntoData() the deployed function
// calls. Only the storage differs — local files here, GitHub there — so the
// dedupe and card-building logic can't drift between the two.
const hubspot = require('./api/_hubspot');
const secrets = require('./api/_secrets');

async function apiHubspot(pathname, req, res, query) {
  const personaId = isValidPersonaId(query.get('persona')) ? query.get('persona') : 'default';
  const rel = currentPathFor(personaId);
  const data = await readJson(rel);
  const name = hubspot.secretName(personaId);

  // /api/hubspot-key — the credential, kept out of data/ exactly as in production.
  if (pathname === '/api/hubspot-key') {
    if (req.method === 'GET') {
      return json(res, 200, { hasKey: !!(await secrets.getSecret(name)), canStore: secrets.canStore() });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const key = body && typeof body.key === 'string' ? body.key.trim() : '';
      if (!key) return json(res, 400, { error: 'Paste the copied text from HubSpot first.' });
      await secrets.setSecret(name, key);
      console.log('  hubspot key stored → ' + process.env.TITAN_SECRETS_FILE);
      return json(res, 200, { ok: true, hasKey: true });
    }
    if (req.method === 'DELETE') {
      await secrets.deleteSecret(name);
      return json(res, 200, { ok: true, hasKey: false });
    }
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (pathname === '/api/hubspot-forms') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const base = { targetFields: hubspot.TARGET_FIELDS, defaultMap: hubspot.DEFAULT_MAP };
    const key = await hubspot.resolveKey(personaId, hubspot.sessionKeyFrom(req));
    if (!key) return json(res, 200, Object.assign({ connected: false, forms: [] }, base));
    try {
      const forms = await hubspot.listForms(key);
      return json(res, 200, Object.assign({ connected: true, forms: forms }, base));
    } catch (e) {
      return json(res, 200, Object.assign({ connected: true, forms: [], error: String(e.message || e) }, base));
    }
  }

  // /api/hubspot-sync
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!data) return json(res, 404, { error: 'Unknown persona: ' + personaId });

  const cfg = hubspot.ensureConfig(data) || {};
  const key = await hubspot.resolveKey(personaId, hubspot.sessionKeyFrom(req));
  if (!key) return json(res, 400, { error: 'Connect HubSpot first.' });
  const guids = hubspot.formGuidsFor(cfg).filter(hubspot.isValidFormGuid);
  if (!guids.length) return json(res, 400, { error: 'Add a form first.' });

  try {
    const submissionsByForm = {};
    for (const guid of guids) submissionsByForm[guid] = await hubspot.fetchSubmissions(key, guid, 50);

    const result = hubspot.syncIntoData(data, submissionsByForm);
    // Mirrors api/hubspot-sync.js: no records, no write. Locally that keeps the
    // working tree clean under a 60s poll; deployed it avoids a commit a minute.
    if (result.changed) {
      await writeJson(rel, data);
      console.log('  hubspot sync → ' + result.added + ' added');
    }
    return json(res, 200, result);
  } catch (e) {
    return json(res, e && e.isSyncError ? 400 : 500, { error: String(e.message || e) });
  }
}

// ── /api/assistant and /api/assistant-apply ──────────────────────────────────
// Requires the real api/_assistant.js, so the tool loop, the field allowlist and
// the never-write-without-confirmation rule are identical here and in production.
// Only the storage differs: local files rather than GitHub.
const assistant = require('./api/_assistant');

// Local file I/O, shared model. The api/*.js handlers go through _github.js, so
// requiring them here would try to reach GitHub — dev-server mirrors the route and
// reuses api/_inbound.js for the actual behaviour, the same split apiForm() uses.
const IN = require('./api/_inbound');

async function apiInbound(pathname, req, res, query) {
  if (pathname === '/api/inbound') return await apiInboundReceive(req, res, query);
  return await apiInboundConfig(req, res, query);
}

async function apiInboundReceive(req, res, query) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const token = query.get('token') || '';
  const personaId = F.personaFromToken(token);
  if (!personaId || !isValidPersonaId(personaId)) return json(res, 404, { ok: false, status: 'unknown-token' });

  const file = currentPathFor(personaId);
  const doc = await readJson(file);
  const conn = doc && IN.findByToken(doc, token);
  if (!conn) return json(res, 404, { ok: false, status: 'unknown-token' });
  if (conn.enabled === false) return json(res, 200, { ok: false, status: 'paused' });

  const body = await readBody(req);
  const outcome = IN.receive(doc, conn, body || {});
  if (outcome.changed) await writeJson(file, doc);
  console.log('  inbound ' + (conn.provider || 'webhook') + ' → ' + outcome.status +
    (outcome.cardId ? ' (card #' + outcome.cardId + ')' : '') +
    (outcome.fields ? ' [' + outcome.fields.join(', ') + ']' : ''));
  return json(res, 200, Object.assign(
    { ok: outcome.status === 'added' || outcome.status === 'sample', status: outcome.status },
    outcome.fields ? { fields: outcome.fields } : {}));
}

async function apiInboundConfig(req, res, query) {
  const personaId = isValidPersonaId(query.get('persona')) ? query.get('persona') : 'default';
  const file = currentPathFor(personaId);
  const doc = await readJson(file);
  if (!doc) return json(res, 404, { error: 'Unknown persona: ' + personaId });

  if (req.method === 'GET') return json(res, 200, { connections: IN.connectionsOf(doc) });

  if (req.method === 'POST') {
    const body = (await readBody(req)) || {};
    const inbound = IN.ensureInbound(doc);
    let conn = body.id ? inbound.connections.filter((c) => c.id === body.id)[0] : null;
    if (!conn) {
      let r = '';
      for (let i = 0; i < 4; i++) r += Math.random().toString(36).slice(2, 8);
      conn = { id: 'in' + Date.now().toString(36), token: personaId + '.' + r.slice(0, 22),
               provider: String(body.provider || 'cf7').slice(0, 32), seen: [] };
      inbound.connections.push(conn);
    }
    if (body.name !== undefined) conn.name = String(body.name || '').slice(0, 120);
    if (body.pipelineId !== undefined) conn.pipelineId = String(body.pipelineId || '');
    if (body.stage !== undefined) conn.stage = String(body.stage || '');
    if (body.source !== undefined) conn.source = String(body.source || '').slice(0, 60);
    if (body.enabled !== undefined) conn.enabled = body.enabled !== false;
    if (body.map && typeof body.map === 'object') {
      const clean = {};
      Object.keys(body.map).slice(0, 60).forEach((k) => {
        const t = String(body.map[k] || '');
        if (t && !Object.prototype.hasOwnProperty.call(F.TARGETS, t)) return;
        clean[String(k).slice(0, 120)] = t;
      });
      conn.map = clean;
    }
    // The submission that taught us the shape becomes a record once the mapping exists.
    if (conn.sample && IN.isMapped(conn)) {
      const held = conn.sample.values;
      delete conn.sample; delete conn.suggested;
      IN.receive(doc, conn, held);
    }
    await writeJson(file, doc);
    return json(res, 200, { ok: true, connection: conn });
  }

  if (req.method === 'DELETE') {
    const id = query.get('id') || '';
    const inbound = IN.ensureInbound(doc);
    const before = inbound.connections.length;
    inbound.connections = inbound.connections.filter((c) => c.id !== id);
    const removed = inbound.connections.length !== before;
    if (removed) await writeJson(file, doc);
    return json(res, 200, { ok: true, removed: removed });
  }
  json(res, 405, { error: 'Method not allowed' });
}

async function apiAssistant(pathname, req, res, query) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const personaId = isValidPersonaId(query.get('persona')) ? query.get('persona') : 'default';
  const rel = currentPathFor(personaId);
  const data = await readJson(rel);
  if (!data) return json(res, 404, { error: 'Unknown persona: ' + personaId });

  const body = await readBody(req);
  if (!body) return json(res, 400, { error: 'Malformed body.' });

  try {
    if (pathname === '/api/assistant') {
      if (!assistant.isConfigured()) {
        return json(res, 503, {
          error: 'The assistant isn’t switched on for this Titan yet. Ask whoever set it up to add it.',
        });
      }
      const messages = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }))
        .slice(-40);
      if (!messages.length || messages[messages.length - 1].role !== 'user') {
        return json(res, 400, { error: 'Nothing to answer.' });
      }
      const out = await assistant.converse(data, messages, typeof body.account === 'string' ? body.account : '');

      // Mirrors api/assistant.js: everything the model did is applied here and
      // comes back already saved, with the undo the card's button posts. Locally
      // this is one file write instead of a GitHub commit, but the states the
      // page sees must be identical or the rail behaves differently here than in
      // production.
      const auto = out.actions || [];
      const applied = new Map();
      const failed = new Map();
      auto.forEach((a) => {
        try {
          applied.set(a, assistant.applyAction(data, a));
        } catch (e) {
          failed.set(a, String((e && e.message) || e));
        }
      });
      if (applied.size) {
        await writeJson(rel, data);
        applied.forEach((r) => console.log('  assistant → ' + r.summary + ' on ' + r.recordName));
      }
      out.actions = auto.map((a) => {
        if (applied.has(a)) return Object.assign({}, a, { state: 'done', undo: applied.get(a).undo });
        return Object.assign({}, a, { state: 'failed', error: failed.get(a) || 'Couldn’t save that.' });
      });
      return json(res, 200, out);
    }

    // /api/assistant-apply
    if (!body.action) return json(res, 400, { error: 'No change to apply.' });
    const applied = assistant.applyAction(data, body.action);
    await writeJson(rel, data);
    console.log('  assistant applied → ' + applied.summary + ' on ' + applied.recordName);
    return json(res, 200, { ok: true, applied: applied });
  } catch (e) {
    return json(res, e && e.isUserError ? 400 : 500, { error: String(e.message || e) });
  }
}

// ── static ───────────────────────────────────────────────────────────────────
function serveStatic(res, pathname) {
  const abs = path.join(ROOT, decodeURIComponent(pathname));
  if (!abs.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return true; }   // no traversal
  let stat;
  try { stat = fs.statSync(abs); } catch (e) { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(abs).pipe(res);
  return true;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  console.log(req.method + ' ' + req.url);

  try {
    if (pathname === '/api/data') return await apiData(req, res, url.searchParams);
    if (pathname === '/api/revert') return await apiRevert(req, res, url.searchParams);
    if (pathname === '/api/form') return await apiForm(req, res, url.searchParams);
    if (pathname === '/api/logo') return await apiLogo(req, res, url.searchParams);
    if (pathname === '/api/hubspot-forms' || pathname === '/api/hubspot-sync' || pathname === '/api/hubspot-key') {
      return await apiHubspot(pathname, req, res, url.searchParams);
    }
    // Inbound webhooks. dev-server hardcodes its routes, so a new api/*.js works on
    // Vercel and 404s here until it's added — which is exactly how you'd waste an
    // afternoon testing a webhook that was never reachable.
    if (pathname === '/api/inbound' || pathname === '/api/inbound-config') {
      return await apiInbound(pathname, req, res, url.searchParams);
    }

    if (pathname === '/api/assistant' || pathname === '/api/assistant-apply') {
      return await apiAssistant(pathname, req, res, url.searchParams);
    }

    if (pathname === '/') return void (serveStatic(res, '/index.html'));

    // Filesystem wins over rewrites — same precedence Vercel uses.
    if (serveStatic(res, pathname)) return;

    const hit = REWRITES.find((r) => r.re.test(pathname.replace(/\/+$/, '') || '/') || r.re.test(pathname));
    if (hit && serveStatic(res, hit.destination)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 — no file or rewrite for ' + pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: String(err && err.message || err) });
  }
}).listen(PORT, () => {
  console.log('\n  Titan CRM dev server\n');
  console.log('    Mail      http://localhost:' + PORT + '/mail');
  console.log('    CRM       http://localhost:' + PORT + '/crm');
  console.log('    Dashboard http://localhost:' + PORT + '/crm/dashboard');
  console.log('    Contacts  http://localhost:' + PORT + '/crm/contacts');
  console.log('    Companies http://localhost:' + PORT + '/crm/companies');
  console.log('    Persona   add ?u=joanna to any of the above\n');
  console.log('  Data: local files under data/ — GitHub is never touched.\n');
});
