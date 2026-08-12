// POST /api/hubspot-sync?persona=<id> — pull new HubSpot form submissions and
// append them to the pipelines their forms are connected to.
//
// This file is only the storage + transport shell. The sync itself (dedupe, id
// allocation, card building) is syncIntoData() in _hubspot.js, so dev-server.js
// can run identical logic against local files without a second copy.
//
// Called on a 60s poll from every open Titan tab, so the no-write-when-nothing-
// changed rule below is load-bearing: writes here are GitHub commits, and
// stamping a timestamp on every pass would commit to the repo once a minute.
//
// Config comes from the persona's own data blob (integrations.hubspot), written
// by the connect page through the normal /api/data save.
const { currentPathFor, applyCors, isValidPersonaId, readJsonFile, updateJsonFile } = require('./_github');
const {
  resolveKey, sessionKeyFrom, isValidFormGuid, ensureConfig, formGuidsFor, fetchSubmissions, syncIntoData,
} = require('./_hubspot');

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';
  const currentPath = currentPathFor(personaId);

  try {
    const existing = await readJsonFile(currentPath);
    if (!existing) { res.status(404).json({ error: 'Unknown persona: ' + personaId }); return; }

    const data = existing.json;
    const cfg = ensureConfig(data) || {};

    const key = await resolveKey(personaId, sessionKeyFrom(req));
    if (!key) { res.status(400).json({ error: 'Connect HubSpot first.' }); return; }

    const guids = formGuidsFor(cfg).filter(isValidFormGuid);
    if (!guids.length) { res.status(400).json({ error: 'Add a form first.' }); return; }

    // One fetch per distinct form, shared by every connection pointing at it.
    const submissionsByForm = {};
    for (const guid of guids) {
      submissionsByForm[guid] = await fetchSubmissions(key, guid, 50);
    }

    // updateJsonFile, not writeJsonFile: this is a read-modify-write on a file the
    // public intake form also appends to (api/form.js). writeJsonFile resolves a
    // conflict by overwriting, which would silently delete a form submission that
    // landed between our read and our write. Here the whole read-modify-write is
    // redone against the fresher document instead, so the two merge.
    //
    // syncIntoData() mutates the document it is given and is re-run per attempt,
    // which is what makes that safe — dedupe is recomputed against whatever `seen`
    // the fresh copy carries, so a retry can't double-import.
    let result = null;
    await updateJsonFile(currentPath, function (doc) {
      result = syncIntoData(doc, submissionsByForm);
      // No records, no commit. This is load-bearing: every open tab polls this
      // endpoint every 60s, and writes here are commits to the repo.
      return result.changed ? result : false;
    }, 'HubSpot sync');

    res.status(200).json(result);
  } catch (err) {
    // Anything the user can act on is a 400; genuine faults stay 500.
    res.status(err && err.isSyncError ? 400 : 500).json({ error: String((err && err.message) || err) });
  }
};
