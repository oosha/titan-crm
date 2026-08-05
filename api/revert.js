const { currentPathFor, seedPathFor, applyCors, isValidPersonaId, readJsonFile, writeJsonFile } = require('./_github');

// POST /api/revert?persona=default  ("default" is the only persona with a
// seed to revert to; other personas are a single file with no revert, and
// are rejected below rather than silently reverting the wrong thing).
// Body {} (or omitted)               -> full revert: current.json := seed.json
// Body { pipelineIds: ['neo', ...] } -> partial revert: only those pipelines'
//   entries are replaced with the seed's version; everything else in
//   current.json is left as-is.
module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';
  if (personaId !== 'default') {
    res.status(400).json({ error: 'Only the "default" persona has sample data to revert to.' });
    return;
  }
  const currentPath = currentPathFor(personaId);
  const seedPath = seedPathFor(personaId);

  try {
    const seed = await readJsonFile(seedPath);
    if (!seed) { res.status(404).json({ error: 'No seed data found for default.' }); return; }

    const pipelineIds = req.body && Array.isArray(req.body.pipelineIds) ? req.body.pipelineIds : null;
    const existing = await readJsonFile(currentPath);

    let next;
    if (!pipelineIds || !pipelineIds.length) {
      next = seed.json;
    } else {
      next = existing ? JSON.parse(JSON.stringify(existing.json)) : JSON.parse(JSON.stringify(seed.json));
      next.pipelines = next.pipelines || {};
      pipelineIds.forEach(function (id) {
        if (seed.json.pipelines[id]) next.pipelines[id] = seed.json.pipelines[id];
        else delete next.pipelines[id];
      });
    }

    await writeJsonFile(currentPath, next, 'Revert default data' + (pipelineIds ? ' (partial: ' + pipelineIds.join(', ') + ')' : ' (full)'), existing ? existing.sha : undefined);
    res.status(200).json({ ok: true, data: next });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
