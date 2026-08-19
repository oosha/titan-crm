// GET/POST /api/sequences?persona=<id> — persona-scoped sequences and email templates.
//
// Sequences live in the same GitHub-backed persona document as pipelines, but
// this narrow endpoint updates only the sequence-owned fields. That keeps an edit
// from writing a stale copy of unrelated pipeline or dashboard data.
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
const MAX_TEMPLATES = 200;
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

function validTemplates(value) {
  if (!Array.isArray(value) || value.length > MAX_TEMPLATES) return false;
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES) return false;
  return value.every(function (template) {
    return template && typeof template === 'object' &&
      typeof template.id === 'string' && /^[a-z0-9_-]{1,80}$/.test(template.id) &&
      typeof template.name === 'string' && template.name.length <= 80 &&
      typeof template.subject === 'string' && template.subject.length <= 200 &&
      typeof template.body === 'string' && template.body.length <= 100000 &&
      (template.bodyHtml == null || (typeof template.bodyHtml === 'string' && template.bodyHtml.length <= 100000));
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
      res.status(200).json({
        sequences: Array.isArray(existing.json.sequences) ? existing.json.sequences : null,
        templates: Array.isArray(existing.json.sequenceTemplates) ? existing.json.sequenceTemplates : null,
      });
      return;
    }

    if (req.method === 'POST') {
      const sequences = req.body && req.body.sequences;
      const templates = req.body && req.body.templates;
      if (!validSequences(sequences)) {
        res.status(400).json({ error: 'Body must include a valid "sequences" array.' });
        return;
      }
      if (templates != null && !validTemplates(templates)) {
        res.status(400).json({ error: '"templates" must be a valid template array.' });
        return;
      }
      const currentPath = currentPathFor(personaId);
      const current = await readJsonFile(currentPath);
      if (current) {
        await updateJsonFile(currentPath, function (document) {
          document.sequences = sequences;
          if (templates != null) document.sequenceTemplates = templates;
        }, 'Update ' + personaId + ' sequences');
      } else {
        const seedPath = seedPathFor(personaId);
        const seed = seedPath ? await readJsonFile(seedPath) : null;
        if (!seed) { res.status(404).json({ error: 'Unknown persona: ' + personaId }); return; }
        seed.json.sequences = sequences;
        if (templates != null) seed.json.sequenceTemplates = templates;
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
