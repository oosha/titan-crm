// The public intake-form endpoint. Two jobs, both deliberately narrow:
//
//   GET  /api/form?token=<t>   → { heading, blurb, logoUrl, fields[] }
//   POST /api/form?token=<t>   → appends one card to the form's pipeline
//
// This exists instead of reusing /api/data because that endpoint hands the caller
// the whole document and accepts the whole document back. A public page must never
// be able to read every record or replace the file, so nothing here takes a
// pipeline id, a stage or an amount from the client: the token resolves to a stored
// form, and the card is built server-side from that form's own definition.
//
// The append goes through updateJsonFile(), which redoes the read-modify-write on a
// sha conflict — two submissions landing together merge instead of one overwriting
// the other. See the note on writeJsonFileStrict in _github.js.
const { currentPathFor, applyCors, isValidPersonaId, readJsonFile, updateJsonFile } = require('./_github');
const F = require('./_form');

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const token = String((req.query && req.query.token) || '');
  const personaId = F.personaFromToken(token);
  if (!personaId || !isValidPersonaId(personaId)) {
    res.status(404).json({ error: 'Unknown form.' });
    return;
  }
  const path = currentPathFor(personaId);

  try {
    if (req.method === 'GET') {
      const existing = await readJsonFile(path);
      const hit = existing && F.findFormByToken(existing.json, token);
      // A disabled form is indistinguishable from a missing one from out here, so a
      // shared link can be switched off without telling the world it once existed.
      if (!hit || !hit.form.enabled) { res.status(404).json({ error: 'This form is not accepting responses.' }); return; }
      res.status(200).json(F.publicForm(hit.form, hit.pipeline));
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      let outcome = null;
      const written = await updateJsonFile(path, function (doc) {
        const hit = F.findFormByToken(doc, token);
        if (!hit || !hit.form.enabled) { outcome = { status: 404, payload: { error: 'This form is not accepting responses.' } }; return false; }

        const checked = F.validateSubmission(hit.form, body);
        if (checked.error) { outcome = { status: 400, payload: { error: checked.error } }; return false; }

        const card = F.buildCard(doc, hit.pipeline, hit.form, checked.values);
        if (!Array.isArray(hit.pipeline.cards)) hit.pipeline.cards = [];
        hit.pipeline.cards.push(card);
        outcome = { status: 200, payload: { ok: true, thanks: hit.form.thanks || '' } };
        return card;
      }, 'Form submission — ' + personaId);

      if (outcome && outcome.status !== 200) { res.status(outcome.status).json(outcome.payload); return; }
      if (!written.ok) { res.status(409).json({ error: 'Busy — please try again.' }); return; }
      res.status(200).json(outcome.payload);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
