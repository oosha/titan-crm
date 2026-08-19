// GET/POST /api/sequences?persona=<id> — persona-scoped sequence definitions.
//
// Sequences live in the same GitHub-backed persona document as pipelines, but
// this narrow endpoint updates only the `sequences` field. That keeps a sequence
// edit from writing a stale copy of unrelated pipeline or dashboard data.
const {
  currentPathFor,
  seedPathFor,
  applyCors,
  isValidPersonaId,
  readJsonFile,
  writeJsonFile,
  updateJsonFile,
} = require('./_github');

const MAX_SEQUENCES = 100;
const MAX_BYTES = 512 * 1024;

function validSequences(value) {
  if (!Array.isArray(value) || value.length > MAX_SEQUENCES) return false;
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES) return false;
  return value.every(function (sequence) {
    return sequence && typeof sequence === 'object' &&
      typeof sequence.id === 'string' && /^[a-z0-9_-]{1,80}$/.test(sequence.id) &&
      typeof sequence.name === 'string' && sequence.name.length <= 80 &&
      Array.isArray(sequence.steps);
  });
}

async function readPersonaDocument(personaId) {
  const current = await readJsonFile(currentPathFor(personaId));
  if (current) return current;
  const seedPath = seedPathFor(personaId);
  return seedPath ? readJsonFile(seedPath) : null;
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';

  try {
    if (req.method === 'GET') {
      const existing = await readPersonaDocument(personaId);
      if (!existing) { res.status(404).json({ error: 'Unknown persona: ' + personaId }); return; }
      res.status(200).json({ sequences: Array.isArray(existing.json.sequences) ? existing.json.sequences : null });
      return;
    }

    if (req.method === 'POST') {
      const sequences = req.body && req.body.sequences;
      if (!validSequences(sequences)) {
        res.status(400).json({ error: 'Body must include a valid "sequences" array.' });
        return;
      }
      const currentPath = currentPathFor(personaId);
      const current = await readJsonFile(currentPath);
      if (current) {
        await updateJsonFile(currentPath, function (document) {
          document.sequences = sequences;
        }, 'Update ' + personaId + ' sequences');
      } else {
        const seedPath = seedPathFor(personaId);
        const seed = seedPath ? await readJsonFile(seedPath) : null;
        if (!seed) { res.status(404).json({ error: 'Unknown persona: ' + personaId }); return; }
        seed.json.sequences = sequences;
        await writeJsonFile(currentPath, seed.json, 'Create ' + personaId + ' data with sequences');
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
