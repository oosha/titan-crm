const { currentPathFor, seedPathFor, applyCors, isValidPersonaId, readJsonFile, writeJsonFile } = require('./_github');

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';
  const currentPath = currentPathFor(personaId);
  const seedPath = seedPathFor(personaId);

  try {
    if (req.method === 'GET') {
      const current = await readJsonFile(currentPath);
      if (current) { res.status(200).json(current.json); return; }
      // Only "default" has a seed to fall back to if current.json is missing;
      // other personas' single file is expected to already exist.
      if (seedPath) {
        const seed = await readJsonFile(seedPath);
        if (seed) { res.status(200).json(seed.json); return; }
      }
      res.status(404).json({ error: 'Unknown persona: ' + personaId });
      return;
    }

    if (req.method === 'POST') {
      const data = req.body;
      if (!data || typeof data !== 'object' || !data.pipelines) {
        res.status(400).json({ error: 'Body must include a "pipelines" object.' });
        return;
      }
      const existing = await readJsonFile(currentPath);
      await writeJsonFile(currentPath, data, 'Update ' + personaId + ' data', existing ? existing.sha : undefined);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
