// GET /api/hubspot-forms?persona=<id> — what the connect page needs to render
// its options: { connected, forms[], targetFields[], defaultMap }.
//
// The key is read from the persona's saved connection (falling back to the
// HUBSPOT_TOKEN environment variable) and is never included in the response.
//
// A missing key is NOT an error here. "Not connected yet" is the normal first
// state of this page, so it answers 200 with connected:false and lets the UI
// render its setup steps, rather than making the page handle a 500 on the most
// common path it will ever hit.
const { applyCors, isValidPersonaId } = require('./_github');
const { resolveKey, listForms, DEFAULT_MAP, TARGET_FIELDS } = require('./_hubspot');

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const base = { targetFields: TARGET_FIELDS, defaultMap: DEFAULT_MAP };
  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';

  // Straight from the secret store — no need to read the data file at all now
  // that the key doesn't live there.
  const key = await resolveKey(personaId);
  if (!key) {
    res.status(200).json(Object.assign({ connected: false, forms: [] }, base));
    return;
  }

  try {
    const forms = await listForms(key);
    res.status(200).json(Object.assign({ connected: true, forms: forms }, base));
  } catch (err) {
    // Connected but the call failed — usually a key that's been removed in
    // HubSpot. Report connected:true with the message so the page can say what
    // actually went wrong instead of showing setup steps to someone who has
    // already followed them.
    res.status(200).json(Object.assign({
      connected: true, forms: [], error: String((err && err.message) || err),
    }, base));
  }
};
