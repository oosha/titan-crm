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

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8000;

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
    if (pathname === '/api/logo') return await apiLogo(req, res, url.searchParams);

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
