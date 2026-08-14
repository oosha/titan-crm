// POST /api/assistant?persona=<id> — one turn of the Ask Titan conversation.
//
// Body: { messages: [{ role: "user" | "assistant", content: "..." }] }
// Returns: { reply, actions[], links[] }
//
// Every action the model took is applied here, in one write, and comes back with
// state "done" and the `undo` its card's button posts. There is no approval step
// — see the safety model at the top of _assistant.js for what replaced it and
// why. assistant-apply.js still exists: it is what Undo posts to.
//
// The conversation is stateless: the page sends the history each turn, the same
// way the rest of this app avoids server-side session state.
const { currentPathFor, applyCors, isValidPersonaId, readJsonFile, updateJsonFile } = require('./_github');
const { isConfigured, converse, applyAction } = require('./_assistant');

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

    const auto = out.actions || [];
    if (auto.length) {
      // One write for the whole turn, not one per action — every write is a
      // commit, and "set the amount and add a note" is a single thought.
      //
      // updateJsonFile re-runs this callback against the freshest document on a
      // conflict, so `applied` and `failed` are rebuilt from scratch each time
      // rather than accumulating across attempts.
      let applied, failed;
      await updateJsonFile(currentPathFor(personaId), function (doc) {
        applied = []; failed = [];
        auto.forEach(function (a) {
          try {
            applied.push({ action: a, result: applyAction(doc, a) });
          } catch (err) {
            // One bad action shouldn't sink the others — a stage that vanished
            // between the model reading it and this running is a real case.
            failed.push({ action: a, message: String((err && err.message) || err) });
          }
        });
        // Every write is a commit. If nothing survived validation there is
        // nothing to record, so abort rather than commit an unchanged file.
        return applied.length ? doc : false;
      }, 'Assistant: ' + auto.map(function (a) {
        return a.type === 'add_note' ? 'add note' : 'update record';
      }).join(', '));

      out.actions = auto.map(function (a) {
        const ok = applied.filter(function (x) { return x.action === a; })[0];
        if (ok) return Object.assign({}, a, { state: 'done', undo: ok.result.undo });
        const bad = failed.filter(function (x) { return x.action === a; })[0];
        return Object.assign({}, a, { state: 'failed', error: bad ? bad.message : 'Couldn’t save that.' });
      });
    }

    res.status(200).json(out);
  } catch (err) {
    res.status(err && err.isUserError ? 400 : 500).json({ error: String((err && err.message) || err) });
  }
};
