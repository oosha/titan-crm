// POST /api/inbound?token=<token> — the public receiver for form webhooks.
//
// This is the endpoint a customer pastes into Contact Form 7 (via a webhook
// add-on), Jetpack, Elementor Pro, Gravity Forms or WPForms. It takes whatever
// JSON the provider sends and, once the connection has a field mapping, appends
// one card. See api/_inbound.js for why it is generic rather than per-provider.
//
// ── The public surface is deliberately narrow ────────────────────────────────
// Like api/form.js, this must never behave like /api/data. It accepts a token and
// a body; it returns whether the submission was taken. It never returns records,
// never names a pipeline back to the caller, and the client cannot choose where
// the card lands — the stored connection decides that.
//
// A token is <persona>.<random>, so the prefix picks the data file without
// trusting a query param, and rotating the token revokes a URL that has leaked
// into someone's WordPress admin.
const { currentPathFor, applyCors, isValidPersonaId, updateJsonFile } = require('./_github');
const F = require('./_form');
const IN = require('./_inbound');

// Providers retry on any non-2xx, and several retry hard. Anything that is not a
// server fault answers 200 with a status in the body, so a misconfigured form
// doesn't turn into a retry storm against the data file.
function ok(res, status, extra) {
  res.status(200).json(Object.assign({ ok: status === 'added' || status === 'sample', status: status }, extra || {}));
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const token = String((req.query && req.query.token) || '');
  const personaId = F.personaFromToken(token);
  if (!personaId || !isValidPersonaId(personaId)) {
    // Same answer as a token that doesn't exist — a bad token shouldn't be able to
    // tell the difference between "malformed" and "not yours".
    res.status(404).json({ ok: false, status: 'unknown-token' });
    return;
  }

  try {
    let outcome = { status: 'unknown-token', changed: false };
    await updateJsonFile(currentPathFor(personaId), function (doc) {
      const conn = IN.findByToken(doc, token);
      if (!conn) { outcome = { status: 'unknown-token', changed: false }; return false; }
      if (conn.enabled === false) { outcome = { status: 'paused', changed: false }; return false; }
      outcome = IN.receive(doc, conn, req.body);
      // Nothing to record — don't spend a commit saying so.
      return outcome.changed ? doc : false;
    }, 'Inbound form submission');

    if (outcome.status === 'unknown-token') { res.status(404).json({ ok: false, status: 'unknown-token' }); return; }
    ok(res, outcome.status, outcome.fields ? { fields: outcome.fields } : undefined);
  } catch (err) {
    // A real fault: let the provider retry this one.
    res.status(500).json({ ok: false, status: 'error', error: String((err && err.message) || err) });
  }
};
