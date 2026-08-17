// GET/POST/DELETE /api/inbound-config?persona=<id> — managing inbound connections.
//
// Separate from api/inbound.js on purpose: that one is public and takes a token,
// this one is the authenticated-by-persona admin side the Integrations page talks
// to. Keeping them in one file would mean one bug away from letting a webhook
// caller rewrite where its own submissions land.
const { currentPathFor, applyCors, isValidPersonaId, readJsonFile, updateJsonFile } = require('./_github');
const IN = require('./_inbound');

const MAX_CONNECTIONS = 20;

// <persona>.<random>, matching the intake-form tokens. The prefix is what lets the
// public endpoint pick a data file without trusting a query param.
function newToken(personaId) {
  let r = '';
  for (let i = 0; i < 4; i++) r += Math.random().toString(36).slice(2, 8);
  return personaId + '.' + r.slice(0, 22);
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';
  const path = currentPathFor(personaId);

  try {
    if (req.method === 'GET') {
      const existing = await readJsonFile(path);
      if (!existing) { res.status(404).json({ error: 'Unknown persona: ' + personaId }); return; }
      res.status(200).json({ connections: IN.connectionsOf(existing.json) });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      let saved = null;
      await updateJsonFile(path, function (doc) {
        const inbound = IN.ensureInbound(doc);
        const list = inbound.connections;
        let conn = body.id ? list.filter(function (c) { return c.id === body.id; })[0] : null;

        if (!conn) {
          if (list.length >= MAX_CONNECTIONS) throw new Error('Too many connections.');
          conn = {
            id: 'in' + Date.now().toString(36),
            token: newToken(personaId),
            provider: String(body.provider || 'cf7').slice(0, 32),
            seen: [],
          };
          list.push(conn);
        }

        if (body.name !== undefined) conn.name = String(body.name || '').slice(0, 120);
        if (body.pipelineId !== undefined) conn.pipelineId = String(body.pipelineId || '');
        if (body.stage !== undefined) conn.stage = String(body.stage || '');
        if (body.source !== undefined) conn.source = String(body.source || '').slice(0, 60);
        if (body.enabled !== undefined) conn.enabled = body.enabled !== false;
        if (body.map && typeof body.map === 'object') {
          // Only keys the sample actually carried, and only targets we understand —
          // this arrives from a browser, so the stored mapping is rebuilt rather
          // than trusted.
          const clean = {};
          Object.keys(body.map).slice(0, 60).forEach(function (k) {
            const t = String(body.map[k] || '');
            if (t && !Object.prototype.hasOwnProperty.call(require('./_form').TARGETS, t)) return;
            clean[String(k).slice(0, 120)] = t;
          });
          conn.map = clean;
        }

        // A held sample becomes a record the moment the mapping that was missing
        // exists — the submission that taught us the shape isn't thrown away.
        if (conn.sample && IN.isMapped(conn)) {
          const held = conn.sample.values;
          delete conn.sample;
          delete conn.suggested;
          IN.receive(doc, conn, held);
        }

        saved = conn;
        return doc;
      }, 'Inbound: save connection');

      res.status(200).json({ ok: true, connection: saved });
      return;
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      let removed = false;
      await updateJsonFile(path, function (doc) {
        const inbound = IN.ensureInbound(doc);
        const before = inbound.connections.length;
        inbound.connections = inbound.connections.filter(function (c) { return c.id !== id; });
        removed = inbound.connections.length !== before;
        return removed ? doc : false;
      }, 'Inbound: remove connection');
      res.status(200).json({ ok: true, removed: removed });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
