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
const { currentPathFor, applyCors, isValidPersonaId, readJsonFile, writeJsonFile } = require('./_github');
const {
  isConnected, resolveKey, isValidFormGuid, ensureConfig, formGuidsFor, fetchSubmissions, syncIntoData,
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
    if (!isConnected(cfg)) { res.status(400).json({ error: 'Connect HubSpot first.' }); return; }

    const guids = formGuidsFor(cfg).filter(isValidFormGuid);
    if (!guids.length) { res.status(400).json({ error: 'Add a form first.' }); return; }

    // One fetch per distinct form, shared by every connection pointing at it.
    const key = resolveKey(cfg);
    const submissionsByForm = {};
    for (const guid of guids) {
      submissionsByForm[guid] = await fetchSubmissions(key, guid, 50);
    }

    const result = syncIntoData(data, submissionsByForm);

    // The whole point: no records, no commit.
    if (result.changed) {
      await writeJsonFile(
        currentPath, data,
        'HubSpot sync: ' + result.added + ' new ' + (result.added === 1 ? 'record' : 'records'),
        existing.sha
      );
    }

    res.status(200).json(result);
  } catch (err) {
    // Anything the user can act on is a 400; genuine faults stay 500.
    res.status(err && err.isSyncError ? 400 : 500).json({ error: String((err && err.message) || err) });
  }
};
