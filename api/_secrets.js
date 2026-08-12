// Where credentials live — which is deliberately NOT this repository.
//
// ── Why this file exists ──────────────────────────────────────────────────────
// Everything else Titan stores goes in data/*.json, committed through the GitHub
// Contents API (see _github.js). That is fine for records and settings and
// hopeless for secrets: the repo is public, git history is permanent, and GitHub
// blocks the write outright —
//
//   409 Repository rule violations found — Secret detected in content
//       token_type: HUBSPOT_API_KEY_WITH_PREFIX
//
// That is not an obstacle to route around; it is the correct behaviour, and it
// means a per-user credential needs somewhere else to live. Hence a small
// key-value store, holding one secret per persona, that the browser never reads
// and the repo never sees.
//
// ── Backends, in the order they are chosen ────────────────────────────────────
//   1. Upstash / Vercel KV over its REST API — production. Plain fetch on
//      purpose: this project has no package.json and no install step, so an SDK
//      is not an option. Both env-var namings are accepted because the Vercel
//      marketplace integration and a direct Upstash setup name them differently.
//   2. A local JSON file — dev-server.js only, so local development works with
//      no signup. Gated on TITAN_SECRETS_FILE, which only dev-server sets, since
//      a serverless filesystem is read-only anyway. The file is gitignored.
//   3. HUBSPOT_TOKEN — the original single-account setup. Read-only and shared
//      by every persona, kept so an environment already configured that way
//      keeps working. Anything stored in 1 or 2 takes precedence.
//
// ── Not solved here ───────────────────────────────────────────────────────────
// This app has no authentication of any kind: anyone who knows a ?u=<persona>
// link can already read and write that persona's records. Storing a credential
// per persona does not make that worse, but it does mean the store is only as
// private as the persona ids are unguessable. Real multi-tenant use needs real
// auth in front of it.

const fs = require('fs');

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/, ''), token: token } : null;
}

function localFile() {
  return process.env.TITAN_SECRETS_FILE || '';
}

// Upstash speaks Redis commands as a JSON array in the body. One shape covers
// GET, SET and DEL, so there is no per-command plumbing.
async function kvCommand(cfg, command) {
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error('Secret store request failed (' + res.status + '): ' + (await res.text()).slice(0, 200));
  }
  const body = await res.json();
  return body.result;
}

function readLocal(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
function writeLocal(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function getSecret(name) {
  const cfg = kvConfig();
  if (cfg) {
    const value = await kvCommand(cfg, ['GET', name]);
    if (value) return String(value);
  } else if (localFile()) {
    const value = readLocal(localFile())[name];
    if (value) return String(value);
  }
  // Legacy shared credential. Last, so a per-persona value always wins.
  return process.env.HUBSPOT_TOKEN || '';
}

async function setSecret(name, value) {
  const cfg = kvConfig();
  if (cfg) { await kvCommand(cfg, ['SET', name, value]); return; }
  if (localFile()) {
    const all = readLocal(localFile());
    all[name] = value;
    writeLocal(localFile(), all);
    return;
  }
  throw new Error('NO_SECRET_STORE');
}

async function deleteSecret(name) {
  const cfg = kvConfig();
  if (cfg) { await kvCommand(cfg, ['DEL', name]); return; }
  if (localFile()) {
    const all = readLocal(localFile());
    delete all[name];
    writeLocal(localFile(), all);
    return;
  }
  throw new Error('NO_SECRET_STORE');
}

// Whether a credential can be SAVED, as opposed to merely read. False when only
// HUBSPOT_TOKEN is configured — the connect page uses this to explain that the
// key has to come from server settings rather than showing a box that cannot work.
function canStore() {
  return !!(kvConfig() || localFile());
}

module.exports = {
  getSecret: getSecret,
  setSecret: setSecret,
  deleteSecret: deleteSecret,
  canStore: canStore,
};
