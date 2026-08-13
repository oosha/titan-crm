// POST /api/assistant?persona=<id> — one turn of the Ask Titan conversation.
//
// Body: { messages: [{ role: "user" | "assistant", content: "..." }] }
// Returns: { reply, actions[] }
//
// `actions` are proposals the user has NOT yet confirmed — nothing in this
// endpoint writes to the CRM. Applying happens in assistant-apply.js, only after
// the user clicks. See the header of _assistant.js for why.
//
// The conversation is stateless: the page sends the history each turn, the same
// way the rest of this app avoids server-side session state.
const { currentPathFor, applyCors, isValidPersonaId, readJsonFile } = require('./_github');
const { isConfigured, converse } = require('./_assistant');

// Bounded so a page can't post an unbounded transcript back at us.
const MAX_TURNS = 40;
const MAX_CHARS = 6000;

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!isConfigured()) {
    res.status(503).json({
      error: 'The assistant isn’t switched on for this Titan yet. Ask whoever set it up to add it.',
    });
    return;
  }

  const personaId = isValidPersonaId(req.query.persona) ? req.query.persona : 'default';

  try {
    const raw = (req.body && Array.isArray(req.body.messages)) ? req.body.messages : [];
    const messages = raw.slice(-MAX_TURNS)
      .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; })
      .map(function (m) { return { role: m.role, content: m.content.slice(0, MAX_CHARS) }; });

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      res.status(400).json({ error: 'Nothing to answer.' });
      return;
    }

    const existing = await readJsonFile(currentPathFor(personaId));
    if (!existing) { res.status(404).json({ error: 'Unknown persona: ' + personaId }); return; }

    const account = req.body && typeof req.body.account === 'string' ? req.body.account.slice(0, 120) : '';
    const out = await converse(existing.json, messages, account);
    res.status(200).json(out);
  } catch (err) {
    res.status(err && err.isUserError ? 400 : 500).json({ error: String((err && err.message) || err) });
  }
};
