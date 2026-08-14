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
// ── The safety model ──────────────────────────────────────────────────────────
// Three tiers, by how bad it is to get the action wrong:
//
//   Reads          run immediately.
//   Edits          apply immediately, and come back with an Undo button.
//   Deletes        are not possible at all. See MANUAL_TASKS below.
//
// Edits used to wait for a confirm click. They no longer do, because confirming
// every "add a note" made the rail slower than typing into the form it exists to
// replace — and a prompt that always appears stops being read. What replaces it
// is narrower and, for a routine edit, stronger: every applied edit carries the
// inverse action, so one click puts the record back exactly as it was.
//
// Confirmation still fires where undo is not the right answer — when we cannot
// be sure the change is landing on the record the user meant. Getting the
// *record* wrong is the failure undo repairs badly: by the time anyone notices,
// they are looking at two wrong records, not one.
//
// Two gates, in needsConfirm() below: the model escalates anything it had to
// guess at, and the server asks whether the user actually named the record. That
// second test is deliberately about the user's words, not the search results. It
// first asked "did a search match more than one row?", which punished the model
// for searching sensibly — "move FirstCry on premise" makes any search for
// firstcry return "Baby wear for FirstCry" as well, so a perfectly clear
// instruction got a confirm card. Two rows is not the same as two candidates.
//
// Deletes are the exception with no undo path — there is no delete tool and
// there must not be one. The stated use case is someone talking on a call, where
// a misheard word is normal, and this document is shared, commit-backed and
// carries no history. So the assistant hands over a link to the screen that owns
// the control instead, and the person does it with the record in front of them.

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

// ── What the assistant sends people elsewhere for ─────────────────────────────
// Refusing on its own is useless — the user still wants the thing done, and
// "I can't do that" leaves them hunting through a nav they may not know. Each
// entry names the screen that actually carries the control.
//
// These paths were read off the markup, not guessed, and they are the reason
// this is a table rather than a line in the prompt: a model inventing a plausible
// CRM URL is how you hand someone a 404 at the exact moment they are annoyed
// with you. `steps` is what to do once the page is open, since none of these
// controls is the first thing you see on it.
const MANUAL_TASKS = {
  delete_record: {
    label: 'Open the record',
    // opportunity-view.html renders a Delete button in the record header.
    steps: 'Open the record, then use Delete at the top right.',
    path: function (ctx) {
      return ctx.pipelineId && ctx.recordId
        ? '/crm/pipeline/' + ctx.pipelineId + '/record/' + ctx.recordId
        : '/crm';
    },
  },
  delete_pipeline: {
    label: 'Open the board',
    // deletePipeline() lives only in crm.html — the shared sidebar's own copy of
    // this menu item tells people to go to the board, so anywhere else is a dead end.
    steps: 'On the board, open the pipeline’s ••• menu in the sidebar and choose Delete pipeline.',
    path: function (ctx) { return ctx.pipelineId ? '/crm/pipeline/' + ctx.pipelineId : '/crm'; },
  },
  delete_stage: {
    label: 'Open pipeline settings',
    steps: 'Remove the stage under Stages. Move any records out of it first — they don’t move themselves.',
    path: function (ctx) { return ctx.pipelineId ? '/crm/pipeline/' + ctx.pipelineId + '/setting' : '/crm'; },
  },
  delete_field: {
    label: 'Open field settings',
    steps: 'Remove the field there. Anything already saved in it goes with it.',
    path: function (ctx) { return ctx.pipelineId ? '/crm/pipeline/' + ctx.pipelineId + '/record-setting' : '/crm'; },
  },
};

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
        'Change a record\'s fields. Use this when the user states new information about ' +
        'a deal — a new amount, a stage move, a corrected email. Look the record up with find_records ' +
        'first so you have its id and can see what the values are now. ' +
        'This saves straight away and the user gets an Undo button, so do not ask permission first ' +
        'and do not ask afterwards whether they want it kept. Make the change once and stop.',
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
          confirm: {
            type: 'boolean',
            description:
              'Leave this out almost always. Set it true only when their words genuinely fit more ' +
              'than one record, or when you would be inventing a value they never gave. Working ' +
              'something out is not guessing: "move it to the next stage" is the next stage in that ' +
              'pipeline\'s own order, and naming a record that search also returned near-misses for ' +
              'is still naming it. Neither needs approval.',
          },
        },
        required: ['recordId', 'changes'],
      },
    },
    {
      name: 'add_note',
      description:
        'Add a note to a record — call notes, next steps, anything the user says happened. ' +
        'Use this whenever the user is recounting a conversation rather than changing a field. Write ' +
        'the note in their voice, keeping the specifics they gave (names, numbers, dates); do not ' +
        'editorialise or add detail they did not say. ' +
        'This saves straight away and the user gets an Undo button — do not ask permission first.',
      input_schema: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: 'The record id from find_records.' },
          note: { type: 'string', description: 'The note text.' },
          confirm: {
            type: 'boolean',
            description:
              'Set true if you had to guess which record they meant. The note is then shown for ' +
              'approval instead of saving.',
          },
        },
        required: ['recordId', 'note'],
      },
    },
    {
      name: 'where_to_do_it',
      description:
        'Get a link to the screen where the user can do something you have no tool for. ' +
        'Call this whenever they ask you to DELETE or permanently remove anything — a record, a ' +
        'pipeline, a stage, a custom field. You cannot delete, and you must never say or imply that ' +
        'you have. Call this, then tell them in one sentence what to do; the interface shows them ' +
        'the button, so do not write out a URL or repeat the steps it already gives you.',
      input_schema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            enum: Object.keys(MANUAL_TASKS),
            description: 'Which thing they are trying to do.',
          },
          recordId: {
            type: 'string',
            description: 'The record id, for delete_record. Look it up with find_records first.',
          },
          pipelineId: {
            type: 'string',
            description: 'The pipeline id. Omit only if you genuinely cannot tell which one they mean.',
          },
        },
        required: ['task'],
      },
    },
  ];
}

// Resolves the link server-side so the path is always real. Takes the pipeline
// from the record when only a record was named, which is the common case —
// people say "delete the Meridian deal", not which board it is on.
function runWhereToDoIt(data, input) {
  const spec = MANUAL_TASKS[input.task];
  if (!spec) return { error: 'Unknown task: ' + input.task };

  const ctx = { pipelineId: input.pipelineId ? String(input.pipelineId) : '', recordId: '' };
  if (input.recordId) {
    const entry = findCard(data, input.recordId);
    if (entry) {
      ctx.recordId = String(entry.card.id);
      ctx.pipelineId = entry.pipelineId;
    }
  }
  if (ctx.pipelineId && !(data.pipelines || {})[ctx.pipelineId]) ctx.pipelineId = '';

  return { link: { label: spec.label, path: spec.path(ctx), steps: spec.steps } };
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
    'update_record and add_note save immediately, and the user gets an Undo button. Act on what',
    'they said rather than checking first — asking "shall I?" for a note they just dictated wastes',
    'the turn that makes this worth using. So:',
    '- Make the change. Do not ask permission first, and do not ask afterwards whether to keep it.',
    '- Say in one short sentence what you did. The card already lists the fields, so do not',
    '  repeat them back.',
    '- If they tell you several things at once, do them in one call rather than one call per field.',
    '- Only change what they actually said.',
    '',
    '# When to stop and ask instead',
    'This is a narrow exception, not a habit. Undo fixes a wrong value, but it does not really fix',
    'a change written to the wrong record — by the time anyone notices, two records are wrong. So',
    'the one thing worth pausing over is whether you have the right record:',
    '- Their words genuinely fit two records and nothing separates them → ask which, and name both.',
    '- They asked for a change but never said to what ("bump the amount") → ask for the value.',
    '- Close to sure but not certain → set confirm on the call rather than asking a question whose',
    '  only content is "is this the right one?".',
    '',
    'Everything else goes straight through. In particular these are NOT reasons to pause:',
    '- Working out a value from what is in front of you. "The next stage" is the next one in that',
    '  pipeline\'s list of stages; read it off and move the record.',
    '- A search returning near-misses alongside the record they clearly named. "FirstCry on premise"',
    '  is unambiguous even when searching turns up other FirstCry rows.',
    '- The change being large, or final, or one you would double-check yourself. Undo covers it.',
    '',
    '# What you cannot do',
    'You have no way to delete anything, and no way to undo a deletion someone else makes.',
    'If they ask you to delete or permanently remove a record, a pipeline, a stage or a field:',
    '- Call where_to_do_it and tell them where it is, in one sentence. The interface shows the',
    '  link and the steps, so do not write a URL or list the steps yourself.',
    '- Never say you have deleted something, never say you will, and do not offer a substitute',
    '  like blanking the fields or moving it to a lost stage — that leaves a broken record behind',
    '  and is not what they asked for.',
    '- Do not argue the point or explain the policy at length. Point them at the screen and move on.',
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
// Returns { reply, actions, links }. Each action carries `confirm`: false means
// the caller should apply it now, true means the page must ask first. Nothing is
// written here either way — this function has no file access, and keeping it
// that way is what lets it be exercised against a stubbed model.
async function converse(data, history, account) {
  const messages = history.slice();
  const actions = [];
  const links = [];
  const tools = toolDefs();

  // id → the other ids the same search turned up. A search returning several
  // rows means the model chose from a list; whether that choice was actually
  // uncertain is a separate question, answered by namedDistinctly() below.
  const contested = Object.create(null);

  // What the user last said, which is what "did they name it clearly?" has to be
  // measured against — not what a search happened to return.
  const lastUserText = (function () {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] && history[i].role === 'user') {
        return String(history[i].content || '').toLowerCase();
      }
    }
    return '';
  })();

  function nameOf(recordId) {
    const e = findCard(data, recordId);
    return e ? String(e.card.deal || e.card.company || '').trim().toLowerCase() : '';
  }

  // The gate used to fire on "a search matched more than one row", which punished
  // the model for searching sensibly. Asking to move "FirstCry on premise" makes
  // any search for firstcry return "Baby wear for FirstCry" too — two rows, but
  // nothing ambiguous about what the user asked for.
  //
  // So the test is whether the user spelled this record out and did not also
  // spell out a rival. That is the thing confirmation is actually for: they said
  // something that fits two records, not the model cast a wide net.
  function namedDistinctly(recordId) {
    const rivals = contested[String(recordId)];
    if (!rivals) return true;                       // nothing competed with it
    const mine = nameOf(recordId);
    // Short names match too easily inside ordinary prose to mean anything.
    if (mine.length < 4 || lastUserText.indexOf(mine) === -1) return false;
    return !rivals.some(function (id) {
      if (String(id) === String(recordId)) return false;
      const other = nameOf(id);
      return other.length >= 4 && lastUserText.indexOf(other) !== -1;
    });
  }

  function needsConfirm(input) {
    if (input && input.confirm === true) return true;      // the model escalated
    return !namedDistinctly(input && input.recordId);
  }

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
      return { reply: 'I can’t help with that one.', actions: [], links: [] };
    }

    const textOut = (response.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('').trim();

    if (response.stop_reason !== 'tool_use') {
      return { reply: textOut, actions: actions, links: links };
    }

    const toolUses = (response.content || []).filter(function (b) { return b.type === 'tool_use'; });
    messages.push({ role: 'assistant', content: response.content });

    // Every tool_use needs a matching tool_result, and they all go back in ONE
    // user message — splitting them trains the model out of parallel calls.
    const results = toolUses.map(function (tu) {
      let payload;
      if (tu.name === 'find_records') {
        payload = runFindRecords(data, tu.input || {});
        const found = payload.matches || [];
        if (found.length > 1) {
          const ids = found.map(function (m) { return String(m.id); });
          ids.forEach(function (id) { contested[id] = ids; });
        } else if (found.length === 1) {
          // A search that lands on exactly one record settles it, even if an
          // earlier, broader search had it competing with others.
          delete contested[String(found[0].id)];
        }
      } else if (tu.name === 'pipeline_overview') {
        payload = runPipelineOverview(data, tu.input || {});
      } else if (tu.name === 'where_to_do_it') {
        payload = runWhereToDoIt(data, tu.input || {});
        if (payload.link) links.push(payload.link);
      } else if (tu.name === 'update_record' || tu.name === 'add_note') {
        const input = tu.input || {};
        const built = tu.name === 'update_record'
          ? buildProposedUpdate(data, input)
          : buildProposedNote(data, input);
        if (built.error) {
          payload = { error: built.error };
        } else {
          const confirm = needsConfirm(input);
          built.action.confirm = confirm;
          actions.push(built.action);
          payload = {
            status: confirm
              ? 'NOT saved. More than one record could have been the one they meant, so this is ' +
                'waiting on the user to approve it. Tell them in one line that you have put it up ' +
                'to check — do not list the fields, the interface shows them.'
              : 'Saved. The interface is showing them what changed and an Undo button, so do not ' +
                'list the fields again and do not ask whether they want to keep it. One short line ' +
                'about what you did, then stop.',
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
    links: links,
  };
}

// ── Applying a confirmed action ───────────────────────────────────────────────
// Mutates the document in place and returns a description of what changed.
// Re-validates from scratch: the payload arrives from the browser, so the fact
// that the server proposed it earlier proves nothing about what came back.
function applyAction(data, action) {
  const entry = findCard(data, action && action.recordId);
  if (!entry) throw userError('That record no longer exists.');

  // Shared by both branches: what the card said before we touched it, shaped as
  // an action that puts it back. Built here rather than when the change was
  // proposed, because this runs against the freshly-read document — if someone
  // else edited the record in between, undo must restore what is actually there
  // now, not what we showed a moment ago.
  const where = {
    recordId: String(entry.card.id),
    recordName: entry.card.deal || entry.card.company || 'Untitled',
    pipelineId: entry.pipelineId,
    pipelineName: entry.pipeline.name,
  };

  // Also restores an empty note, which is how undoing the first note on a record
  // has to work — add_note rejects empty text, and rightly so.
  if (action.type === 'restore_note') {
    const undo = Object.assign({ type: 'restore_note', note: entry.card.note || '' }, where);
    entry.card.note = String(action.note || '');
    entry.card.lastActivity = 'just now';
    entry.card.activityType = entry.card.note ? 'Note added' : 'Note removed';
    return { recordName: where.recordName, summary: 'Note restored', undo: undo };
  }

  if (action.type === 'add_note') {
    const note = String(action.note || '').trim();
    if (!note) throw userError('The note is empty.');
    const undo = Object.assign({ type: 'restore_note', note: entry.card.note || '' }, where);
    entry.card.note = note;
    entry.card.noteDate = '';
    entry.card.lastActivity = 'just now';
    entry.card.activityType = 'Note added';
    return { recordName: where.recordName, summary: 'Note added', undo: undo };
  }

  if (action.type === 'update_record') {
    const changes = Array.isArray(action.changes) ? action.changes : [];
    const applied = [];
    const back = [];
    changes.forEach(function (ch) {
      if (!ch || EDITABLE_KEYS.indexOf(ch.key) === -1) return;
      if (ch.key === 'stage') {
        const ok = (entry.pipeline.stages || []).some(function (s) { return s.key === ch.after; });
        if (!ok) return;
      }
      // Read the live value rather than trusting ch.before from the browser.
      const was = entry.card[ch.key];
      back.push({
        key: ch.key,
        label: ch.label || fieldLabel(ch.key),
        before: ch.after,
        after: was == null ? '' : was,
        beforeText: ch.key === 'stage' ? stageLabel(entry.pipeline, ch.after) : String(ch.after),
        afterText: ch.key === 'stage' ? stageLabel(entry.pipeline, was) : String(was == null ? '' : was),
      });
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
    return {
      recordName: where.recordName,
      summary: applied.join(', ') + ' updated',
      // recordName is re-read above, so if the change renamed the record the undo
      // card still says what it was called when the edit happened.
      undo: Object.assign({ type: 'update_record', changes: back }, where),
    };
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
