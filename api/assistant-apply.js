// POST /api/assistant-apply?persona=<id> — apply one change the user confirmed.
//
// Body: { action: { type: "update_record" | "add_note", ... } }
//
// This is the only place the assistant can write, and it runs only after an
// explicit click. The action arrives from the browser, so it is re-validated
// from scratch in applyAction() — that the server proposed something earlier
// says nothing about what came back.
//
// updateJsonFile, not writeJsonFile: this is a read-modify-write on a file the
// board, the HubSpot sync and the public intake form all append to. writeJsonFile
// resolves a conflict by overwriting, which would silently drop whichever of
// those landed in between.
const { currentPathFor, applyCors, isValidPersonaId, updateJsonFile } = require('./_github');
const { applyAction } = require('./_assistant');

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';
  const action = req.body && req.body.action;
  if (!action || typeof action !== 'object') { res.status(400).json({ error: 'No change to apply.' }); return; }

  try {
    let result = null;
    await updateJsonFile(currentPathFor(personaId), function (doc) {
      // Re-runs against the freshest document on every retry, so a concurrent
      // write means this change lands on top of it rather than replacing it.
      result = applyAction(doc, action);
      return result;
    }, 'Assistant: ' + (action.type === 'add_note' ? 'add note' : 'update record'));

    res.status(200).json({ ok: true, applied: result });
  } catch (err) {
    res.status(err && err.isUserError ? 400 : 500).json({ error: String((err && err.message) || err) });
  }
};
