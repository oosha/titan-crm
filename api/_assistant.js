// The Ask Titan assistant — model, tools, and the tool-use loop.
//
// ── Why raw fetch and not the Anthropic SDK ───────────────────────────────────
// The SDK is normally the right call, but this project has no package.json and
// no install step, and CLAUDE.md is explicit that adding one is out of scope.
// api/_github.js and api/_hubspot.js already talk to third-party APIs with plain
// fetch, so this follows the house pattern. If the project ever gains a build
// step, swapping this for @anthropic-ai/sdk is a contained change: only
// callModel() below touches the wire format.
//
// ── The safety property that shapes everything here ───────────────────────────
// Read tools run immediately. Write tools DO NOT. When the model calls
// update_record or add_note, the server records the request as a *pending
// action* and tells the model it has been put to the user — nothing touches the
// data. The page renders a confirm card showing old → new per field, and only an
// explicit click sends it to /api/assistant-apply.
//
// This is not ceremony. The stated use case is someone on a phone call, and a
// misheard word is the normal case there, not the exception. The CRM has no undo
// and no change history, so an unconfirmed wrong write is silent and permanent.

// ANTHROPIC_BASE_URL exists so the tool loop can be exercised locally against a
// stub — the loop, the field allowlist and the confirmation rule are worth
// testing without spending real tokens. Unset in production.
const ANTHROPIC_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';
const MODEL = 'claude-opus-5';

// Thinking is on by default on this model and counts against max_tokens, so this
// needs headroom beyond the visible reply — a tight cap truncates mid-answer.
const MAX_TOKENS = 16000;

// A chat rail is latency-sensitive and these are small, well-scoped tasks.
// `medium` keeps replies snappy; raise it if answers start missing things.
const EFFORT = 'medium';

// The loop is bounded so a model that keeps calling tools can't spin. Six is
// comfortably more than the 2–3 a real question needs.
const MAX_TOOL_ROUNDS = 6;

function apiKey() {
  return process.env.ANTHROPIC_API_KEY || '';
}
function isConfigured() {
  return !!apiKey();
}

// Something the person reading the rail can act on, as opposed to a fault.
function userError(message) {
  const e = new Error(message);
  e.isUserError = true;
  return e;
}

// ── The fields the assistant is allowed to change ─────────────────────────────
// An allowlist, not a passthrough. The model can only propose changes to fields
// on this list — anything else is dropped before it ever reaches a confirm card.
// A write path that accepts arbitrary keys from a model is one that can quietly
// corrupt a record.
const EDITABLE = [
  { key: 'deal', label: 'Record name', type: 'text' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'stage', label: 'Stage', type: 'stage' },
  { key: 'contact', label: 'Contact name', type: 'text' },
  { key: 'contactEmail', label: 'Contact email', type: 'text' },
  { key: 'contactPhone', label: 'Contact phone', type: 'text' },
  { key: 'contactDesignation', label: 'Job title', type: 'text' },
  { key: 'website', label: 'Website', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'closeDate', label: 'Expected close date', type: 'text' },
  { key: 'source', label: 'Source', type: 'text' },
];
const EDITABLE_KEYS = EDITABLE.map(function (f) { return f.key; });

function fieldLabel(key) {
  const f = EDITABLE.filter(function (x) { return x.key === key; })[0];
  return f ? f.label : key;
}

// ── Reading the CRM ───────────────────────────────────────────────────────────
function allCards(data) {
  const out = [];
  Object.keys(data.pipelines || {}).forEach(function (pid) {
    const p = data.pipelines[pid];
    (p.cards || []).forEach(function (c) { out.push({ pipelineId: pid, pipeline: p, card: c }); });
  });
  return out;
}

function findCard(data, recordId) {
  // Ids are mixed across personas — numbers on some, strings like "inquiries-i1"
  // on others — so compare as strings rather than trusting the JSON type.
  const want = String(recordId);
  return allCards(data).filter(function (e) { return String(e.card.id) === want; })[0] || null;
}

function stageLabel(pipeline, key) {
  const s = (pipeline.stages || []).filter(function (x) { return x.key === key; })[0];
  return s ? (s.label || s.key) : key;
}

function cardSummary(entry) {
  const c = entry.card;
  return {
    id: c.id,
    name: c.deal || '(untitled)',
    company: c.company || '',
    contact: c.contact || '',
    contactEmail: c.contactEmail || '',
    value: Number(c.value) || 0,
    currency: c.currency || '$',
    stage: stageLabel(entry.pipeline, c.stage),
    stageKey: c.stage,
    pipeline: entry.pipeline.name,
    pipelineId: entry.pipelineId,
    lastActivity: c.lastActivity || '',
    overdue: !!c.overdue,
    note: c.note || '',
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────
// Descriptions say WHEN to call, not just what the tool does — recent models are
// conservative about reaching for tools, and trigger conditions in the
// description are what move the should-call rate.
function toolDefs() {
  return [
    {
      name: 'find_records',
      description:
        'Search the CRM for records by name, company, or contact. Call this whenever the user ' +
        'refers to a specific deal, candidate, company or person — including before proposing any ' +
        'change, so you are working from the real record and its current field values. Returns ' +
        'matching records with their ids, which every other tool needs.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Name, company, or contact to search for. Partial matches are fine.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'pipeline_overview',
      description:
        'Get the current state of one pipeline or all of them: how many records sit in each stage, ' +
        'total and open value, how many are overdue, and the largest open records. Call this for ' +
        'any question about how things are going, what needs attention, where deals are stuck, or ' +
        'to summarise a pipeline.',
      input_schema: {
        type: 'object',
        properties: {
          pipelineId: {
            type: 'string',
            description: 'Which pipeline to look at. Omit to cover every pipeline.',
          },
        },
      },
    },
    {
      name: 'update_record',
      description:
        'Propose changes to a record\'s fields. Use this when the user states new information about ' +
        'a deal — a new amount, a stage move, a corrected email. Look the record up with find_records ' +
        'first so you have its id and can see what the values are now. ' +
        'This does NOT save anything: the user is shown exactly what would change and confirms it ' +
        'themselves. Propose the change once and then stop — do not re-propose or ask whether to go ahead.',
      input_schema: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: 'The record id from find_records.' },
          changes: {
            type: 'object',
            description:
              'The fields to change, as field name to new value. Allowed fields: ' +
              EDITABLE_KEYS.join(', ') + '. For stage, use the stage name as shown on the board.',
          },
        },
        required: ['recordId', 'changes'],
      },
    },
    {
      name: 'add_note',
      description:
        'Propose adding a note to a record — call notes, next steps, anything the user says happened. ' +
        'Use this whenever the user is recounting a conversation rather than changing a field. Write ' +
        'the note in their voice, keeping the specifics they gave (names, numbers, dates); do not ' +
        'editorialise or add detail they did not say. ' +
        'This does NOT save anything — the user confirms it themselves.',
      input_schema: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: 'The record id from find_records.' },
          note: { type: 'string', description: 'The note text.' },
        },
        required: ['recordId', 'note'],
      },
    },
  ];
}

// ── Executing read tools ──────────────────────────────────────────────────────
function runFindRecords(data, input) {
  const q = String(input.query || '').trim().toLowerCase();
  if (!q) return { matches: [] };
  const hits = allCards(data).filter(function (e) {
    const c = e.card;
    return [c.deal, c.company, c.contact, c.contactEmail]
      .filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
  });
  return {
    matches: hits.slice(0, 8).map(cardSummary),
    truncated: hits.length > 8 ? hits.length - 8 : 0,
  };
}

function runPipelineOverview(data, input) {
  const wanted = input.pipelineId ? String(input.pipelineId) : null;
  const entries = allCards(data).filter(function (e) { return !wanted || e.pipelineId === wanted; });
  if (!entries.length) {
    return { error: wanted ? 'No pipeline with id ' + wanted : 'There are no records yet.' };
  }

  const byPipeline = {};
  entries.forEach(function (e) {
    const p = byPipeline[e.pipelineId] || (byPipeline[e.pipelineId] = {
      name: e.pipeline.name, type: e.pipeline.type || 'sales',
      stages: {}, total: 0, openValue: 0, overdue: 0, records: [],
    });
    const label = stageLabel(e.pipeline, e.card.stage);
    p.stages[label] = (p.stages[label] || 0) + 1;
    p.total += 1;
    if (e.card.overdue) p.overdue += 1;
    // "closed" is the convention for a terminal stage across these boards.
    if (String(e.card.stage || '').indexOf('closed') === -1) {
      p.openValue += Number(e.card.value) || 0;
    }
    p.records.push(cardSummary(e));
  });

  Object.keys(byPipeline).forEach(function (k) {
    const p = byPipeline[k];
    // Only the biggest few — the model doesn't need every record to summarise,
    // and sending them all is what fills a context window for no gain.
    p.records = p.records.sort(function (a, b) { return b.value - a.value; }).slice(0, 5);
  });
  return { pipelines: byPipeline };
}

// ── Validating a proposed write ───────────────────────────────────────────────
// Runs on the server, before the change is ever shown to the user, so a confirm
// card can never offer something the apply step would reject.
function buildProposedUpdate(data, input) {
  const entry = findCard(data, input.recordId);
  if (!entry) return { error: 'No record with id ' + input.recordId + '. Use find_records first.' };

  const changes = [];
  const skipped = [];
  const raw = input.changes && typeof input.changes === 'object' ? input.changes : {};

  Object.keys(raw).forEach(function (key) {
    if (EDITABLE_KEYS.indexOf(key) === -1) { skipped.push(key); return; }
    let next = raw[key];

    if (key === 'stage') {
      // The model is told to use the label a human sees; the card stores a key.
      const stages = entry.pipeline.stages || [];
      const match = stages.filter(function (s) {
        return s.key === next ||
          String(s.label || '').toLowerCase() === String(next).toLowerCase();
      })[0];
      if (!match) {
        skipped.push('stage (no stage called "' + next + '" in ' + entry.pipeline.name + ')');
        return;
      }
      next = match.key;
    }
    if (key === 'value') {
      const n = Number(String(next).replace(/[^0-9.\-]/g, ''));
      if (!isFinite(n)) { skipped.push('value (not a number)'); return; }
      next = n;
    }

    const before = entry.card[key];
    if (String(before == null ? '' : before) === String(next)) return;   // no-op

    changes.push({
      key: key,
      label: fieldLabel(key),
      before: before == null ? '' : before,
      after: next,
      // What the confirm card shows — stage keys are meaningless to a reader.
      beforeText: key === 'stage' ? stageLabel(entry.pipeline, before) : String(before == null ? '' : before),
      afterText: key === 'stage' ? stageLabel(entry.pipeline, next) : String(next),
    });
  });

  if (!changes.length) {
    return { error: skipped.length
      ? 'Nothing could be changed. Rejected: ' + skipped.join(', ')
      : 'Those values are already what the record says.' };
  }

  return {
    action: {
      type: 'update_record',
      recordId: String(entry.card.id),
      recordName: entry.card.deal || entry.card.company || 'Untitled',
      pipelineId: entry.pipelineId,
      pipelineName: entry.pipeline.name,
      changes: changes,
    },
    skipped: skipped,
  };
}

function buildProposedNote(data, input) {
  const entry = findCard(data, input.recordId);
  if (!entry) return { error: 'No record with id ' + input.recordId + '. Use find_records first.' };
  const note = String(input.note || '').trim();
  if (!note) return { error: 'The note is empty.' };
  return {
    action: {
      type: 'add_note',
      recordId: String(entry.card.id),
      recordName: entry.card.deal || entry.card.company || 'Untitled',
      pipelineId: entry.pipelineId,
      pipelineName: entry.pipeline.name,
      note: note,
      existingNote: entry.card.note || '',
    },
  };
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Kept stable across turns so the cached prefix survives; the volatile part (the
// user's question) arrives in messages, after the breakpoint.
function systemPrompt(data, account) {
  const pipelines = Object.keys(data.pipelines || {}).map(function (id) {
    const p = data.pipelines[id];
    return '- ' + p.name + ' (id: ' + id + ', ' + (p.type || 'sales') + '): ' +
      (p.cards || []).length + ' records. Stages: ' +
      (p.stages || []).map(function (s) { return s.label || s.key; }).join(' → ');
  }).join('\n');

  return [
    'You are Titan, the assistant inside a CRM that lives in the user\'s email client.',
    'You help them understand what is happening in their pipelines and keep records up to date',
    'without them having to click through forms — often while they are on a call.',
    '',
    account ? 'You are working for ' + account + '.' : '',
    '',
    'The pipelines in view:',
    pipelines || '(no pipelines yet)',
    '',
    '# Reading the CRM',
    'Look things up rather than guessing. Never state a number, stage, or name you have not',
    'read from a tool result in this conversation. If you could not find something, say so',
    'plainly rather than offering a plausible answer.',
    '',
    '# Changing the CRM',
    'update_record and add_note do not save anything — they put a change in front of the user',
    'to confirm, and the interface shows them exactly which fields would change. So:',
    '- Propose the change; do not ask "shall I?" first, and do not ask again afterwards.',
    '- Say in one short sentence what you have put up for confirmation. The card already lists',
    '  the fields, so do not repeat them.',
    '- If the user tells you several things at once, propose them together in one call rather',
    '  than one call per field.',
    '- Only change what they actually said. If something is ambiguous — which of two records,',
    '  an amount you are unsure you heard right — ask instead of picking.',
    '',
    '# Style',
    'Keep replies short and plain — a couple of sentences, no headers, no bullet lists unless',
    'you are genuinely listing records. Lead with the answer. This is a narrow side panel, so',
    'long replies are unreadable. Do not open with pleasantries or restate the question.',
    'Talk about records the way the user does ("the Meridian deal"), not by id.',
  ].filter(function (l) { return l !== null; }).join('\n');
}

// ── One call to the model ─────────────────────────────────────────────────────
async function callModel(body) {
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw userError('Couldn’t reach the assistant just now. Check your connection and try again.');
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (res.status === 401) throw userError('The assistant isn’t set up correctly on this deployment.');
    if (res.status === 429) throw userError('The assistant is busy right now. Try again in a moment.');
    if (res.status >= 500) throw userError('The assistant is temporarily unavailable. Try again in a moment.');
    throw new Error('Anthropic request failed (' + res.status + '): ' + text);
  }
  return res.json();
}

// ── The tool loop ─────────────────────────────────────────────────────────────
// Returns { reply, actions } — actions are proposals awaiting confirmation and
// have NOT been applied.
async function converse(data, history, account) {
  const messages = history.slice();
  const actions = [];
  const tools = toolDefs();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callModel({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      // Stable prefix (tools render first, then system) cached across the turns
      // of a conversation; the question itself sits after the breakpoint.
      system: [{ type: 'text', text: systemPrompt(data, account), cache_control: { type: 'ephemeral' } }],
      tools: tools,
      messages: messages,
    });

    // Checked before reading content: a refusal returns 200 with content that
    // may be empty, so indexing straight into it would throw.
    if (response.stop_reason === 'refusal') {
      return { reply: 'I can’t help with that one.', actions: [] };
    }

    const textOut = (response.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('').trim();

    if (response.stop_reason !== 'tool_use') {
      return { reply: textOut, actions: actions };
    }

    const toolUses = (response.content || []).filter(function (b) { return b.type === 'tool_use'; });
    messages.push({ role: 'assistant', content: response.content });

    // Every tool_use needs a matching tool_result, and they all go back in ONE
    // user message — splitting them trains the model out of parallel calls.
    const results = toolUses.map(function (tu) {
      let payload;
      if (tu.name === 'find_records') {
        payload = runFindRecords(data, tu.input || {});
      } else if (tu.name === 'pipeline_overview') {
        payload = runPipelineOverview(data, tu.input || {});
      } else if (tu.name === 'update_record' || tu.name === 'add_note') {
        // The write path: validated, queued, never executed here.
        const built = tu.name === 'update_record'
          ? buildProposedUpdate(data, tu.input || {})
          : buildProposedNote(data, tu.input || {});
        if (built.error) {
          payload = { error: built.error };
        } else {
          actions.push(built.action);
          payload = {
            status: 'Put to the user for confirmation. Nothing has been saved yet. The interface is ' +
                    'already showing them each field that would change, so do not list the changes again — ' +
                    'just say briefly what you have put up, and stop.',
            skipped: built.skipped && built.skipped.length ? built.skipped : undefined,
          };
        }
      } else {
        payload = { error: 'Unknown tool: ' + tu.name };
      }
      return {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(payload),
        is_error: !!(payload && payload.error),
      };
    });

    messages.push({ role: 'user', content: results });
  }

  // Ran out of rounds. Say so rather than returning an empty bubble.
  return {
    reply: 'That turned into more digging than I can do in one go — try asking for one thing at a time.',
    actions: actions,
  };
}

// ── Applying a confirmed action ───────────────────────────────────────────────
// Mutates the document in place and returns a description of what changed.
// Re-validates from scratch: the payload arrives from the browser, so the fact
// that the server proposed it earlier proves nothing about what came back.
function applyAction(data, action) {
  const entry = findCard(data, action && action.recordId);
  if (!entry) throw userError('That record no longer exists.');

  if (action.type === 'add_note') {
    const note = String(action.note || '').trim();
    if (!note) throw userError('The note is empty.');
    entry.card.note = note;
    entry.card.noteDate = '';
    entry.card.lastActivity = 'just now';
    entry.card.activityType = 'Note added';
    return { recordName: entry.card.deal || 'Untitled', summary: 'Note added' };
  }

  if (action.type === 'update_record') {
    const changes = Array.isArray(action.changes) ? action.changes : [];
    const applied = [];
    changes.forEach(function (ch) {
      if (!ch || EDITABLE_KEYS.indexOf(ch.key) === -1) return;
      if (ch.key === 'stage') {
        const ok = (entry.pipeline.stages || []).some(function (s) { return s.key === ch.after; });
        if (!ok) return;
      }
      entry.card[ch.key] = ch.after;
      // Keep the flat contact mirror in step — crm.html and the record page read
      // those, so updating only one side makes the change look half-applied.
      if (ch.key === 'contact' && entry.card.contacts && entry.card.contacts[0]) {
        entry.card.contacts[0].name = ch.after;
      }
      if (ch.key === 'contactEmail' && entry.card.contacts && entry.card.contacts[0]) {
        entry.card.contacts[0].email = ch.after;
      }
      if (ch.key === 'contactPhone' && entry.card.contacts && entry.card.contacts[0]) {
        entry.card.contacts[0].phone = ch.after;
      }
      applied.push(ch.label || ch.key);
    });
    if (!applied.length) throw userError('None of those changes could be applied.');
    entry.card.lastActivity = 'just now';
    entry.card.activityType = 'Updated';
    return { recordName: entry.card.deal || 'Untitled', summary: applied.join(', ') + ' updated' };
  }

  throw userError('Unknown action.');
}

module.exports = {
  isConfigured: isConfigured,
  converse: converse,
  applyAction: applyAction,
  userError: userError,
  EDITABLE: EDITABLE,
};
