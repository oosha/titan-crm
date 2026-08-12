// /api/hubspot-key?persona=<id> — the one endpoint that touches the credential.
//
//   GET    → { hasKey, canStore }   never the key itself
//   POST   → { key }                stores it
//   DELETE →                        removes it
//
// The key goes to the secret store (see _secrets.js), never to the persona's
// data file. That file is committed to a public repo and GitHub rejects any
// commit containing a recognised credential, so this is not a preference — it is
// the only place a key can go.
//
// GET never returns the stored value. The page only ever needs to know whether
// one exists, and a "reveal my key" affordance is a liability with no purpose:
// nobody needs to read it back, they can only replace it.
const { applyCors, isValidPersonaId } = require('./_github');
const { secretName } = require('./_hubspot');
const { getSecret, setSecret, deleteSecret, canStore } = require('./_secrets');

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';
  const name = secretName(personaId);

  try {
    if (req.method === 'GET') {
      res.status(200).json({ hasKey: !!(await getSecret(name)), canStore: canStore() });
      return;
    }

    if (req.method === 'POST') {
      const key = req.body && typeof req.body.key === 'string' ? req.body.key.trim() : '';
      if (!key) { res.status(400).json({ error: 'Paste the copied text from HubSpot first.' }); return; }
      await setSecret(name, key);
      res.status(200).json({ ok: true, hasKey: true });
      return;
    }

    if (req.method === 'DELETE') {
      await deleteSecret(name);
      res.status(200).json({ ok: true, hasKey: false });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    // No store configured at all. Worth its own message: it means someone has to
    // change the deployment's settings, which is not something the person looking
    // at the page can do or should be told to retry.
    if (String(err && err.message) === 'NO_SECRET_STORE') {
      res.status(503).json({
        error: 'This Titan deployment has nowhere to keep a HubSpot key yet. ' +
               'Ask whoever set up Titan to configure the key store.',
      });
      return;
    }
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
