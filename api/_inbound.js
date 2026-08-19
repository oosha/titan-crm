// Inbound form webhooks — the model.
//
// ── Why this is generic and not "the Contact Form 7 integration" ──────────────
// The research behind this (integration survey, Aug 2026) found that nine of the
// eleven providers our users have can POST a submission to a URL we choose. They
// differ in where the customer clicks, not in what we receive. So one endpoint
// that takes a token and accepts whatever JSON arrives is the whole integration
// for nine providers, and a per-provider poller — the HubSpot shape — is the
// wrong build for all of them.
//
// Contact Form 7 is the first provider on it because it is the most common and
// the cheapest to reach: CF7 has no native webhook, but it is free and several
// free webhook add-ons exist, so the customer's cost is installing a plugin
// rather than an upgrade. Jetpack, Elementor Pro, Gravity Forms and WPForms
// arrive here with no new server code — only a different setup guide.
//
// ── Push has one weakness, and this is the fix ────────────────────────────────
// With a poller we can list someone's forms before they choose. With push we
// cannot: until a submission lands we do not know what fields it carries. So the
// FIRST submission on a connection is not turned into a record. It is kept as a
// sample, the connection reports itself as awaiting mapping, and the user maps
// the fields it actually contained. Nothing is guessed and nothing is lost — the
// held sample is replayed once the mapping exists.
const F = require('./_form');

// Everything a provider might wrap the payload in. CF7 add-ons post a flat object
// of field names; others nest under one of these. Checked in order.
const ENVELOPES = ['data', 'fields', 'payload', 'form', 'values', 'submission'];

const LIMITS = {
  keys: 60,          // fields we will look at in one submission
  keyLen: 120,
  valueLen: 4000,
  samples: 1,        // held submissions per connection
  seen: 200,         // dedupe ring
  connections: 20,   // per persona
};

function connectionsOf(data) {
  const inbound = (data.integrations && data.integrations.inbound) || {};
  return Array.isArray(inbound.connections) ? inbound.connections : [];
}

function ensureInbound(data) {
  if (!data.integrations) data.integrations = {};
  if (!data.integrations.inbound) data.integrations.inbound = {};
  if (!Array.isArray(data.integrations.inbound.connections)) {
    data.integrations.inbound.connections = [];
  }
  return data.integrations.inbound;
}

function findByToken(data, token) {
  const want = String(token || '');
  if (!want) return null;
  return connectionsOf(data).filter(function (c) { return c.token === want; })[0] || null;
}

// Providers disagree about shape: some post the fields at the top level, some
// wrap them. Flatten one level of nesting so both look the same to the mapper,
// and stringify anything that isn't already a scalar rather than dropping it —
// a checkbox group arriving as an array is still an answer.
function flatten(body) {
  let src = body && typeof body === 'object' ? body : {};
  for (let i = 0; i < ENVELOPES.length; i++) {
    const inner = src[ENVELOPES[i]];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) { src = inner; break; }
  }
  const out = {};
  Object.keys(src).slice(0, LIMITS.keys).forEach(function (rawKey) {
    const key = String(rawKey).slice(0, LIMITS.keyLen);
    const v = src[rawKey];
    if (v === null || v === undefined) return;
    if (typeof v === 'object') {
      // Arrays become "a, b"; anything else is skipped rather than rendered as
      // "[object Object]", which is worse than an absent field.
      if (!Array.isArray(v)) return;
      out[key] = v.filter(function (x) { return typeof x !== 'object'; }).join(', ').slice(0, LIMITS.valueLen);
      return;
    }
    out[key] = String(v).slice(0, LIMITS.valueLen);
  });
  return out;
}

// A stable-ish identity for one submission, so a provider that retries — most do,
// on any non-2xx — doesn't create the record twice.
function fingerprint(values) {
  const keys = Object.keys(values).sort();
  let h = 5381;
  const s = keys.map(function (k) { return k + '=' + values[k]; }).join('');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'i:' + (h >>> 0).toString(36) + ':' + s.length;
}

// Field names people actually use, in the order we'd rather match them. Only ever
// a starting suggestion — the user confirms the mapping before anything is saved.
const GUESSES = [
  ['email',       /^(your-)?e-?mail$|mail/i],
  ['name',        /^(your-)?name$|full[-_ ]?name|^fname$|first/i],
  ['phone',       /phone|mobile|tel\b/i],
  ['company',     /company|organisation|organization|business/i],
  ['designation', /title|role|position|designation|job/i],
  ['location',    /location|city|country|address/i],
  ['linkedin',    /linked-?in/i],
  ['note',        /message|comment|enquiry|inquiry|note|detail|subject|reason/i],
];

// Note is the one target that may be suggested more than once — a form asking for a
// subject and a message wants both, and the modal composes them into a single note.
// Every other target is claimed by the first field that matches it.
const MULTI_TARGETS = ['note'];

function guessMap(values) {
  const map = {}, taken = {};
  Object.keys(values).forEach(function (key) {
    for (let i = 0; i < GUESSES.length; i++) {
      const target = GUESSES[i][0];
      if (taken[target] && MULTI_TARGETS.indexOf(target) === -1) continue;
      if (GUESSES[i][1].test(key)) { map[key] = target; taken[target] = true; return; }
    }
    map[key] = '';                      // "Don't import" until told otherwise
  });
  return map;
}

// The mapping is {submissionFieldName: target}. buildCard() wants a form-shaped
// object, so the connection's map is presented as one — which keeps every card
// this creates identical to one from a Titan intake form.
// Answers with no home in the CRM's fields. Dropping them loses the part of a
// submission that is often the most useful — "how did you hear about us", a budget
// range, a checkbox list — so they are appended to the note with their labels
// kept, which is the only place free text can live on a card.
const EXTRAS_SEP = '\n\n';

// Form field keys are machine names — CF7 ships `your-subject`, Elementor `form_name`.
// Printed into a note as-is they read like debug output, so a key becomes a label the
// way a person would write it. A key that is already prose ("Comment or Message")
// passes through untouched.
function prettyLabel(key) {
  return String(key || '')
    .replace(/^your[-_ ]+/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/^./, function (c) { return c.toUpperCase(); }) || String(key || '');
}

function extrasNote(conn, values) {
  const map = conn.map || {};
  return Object.keys(values)
    .filter(function (k) { return !map[k]; })
    .filter(function (k) { return String(values[k]).trim(); })
    .map(function (k) { return prettyLabel(k) + ': ' + values[k]; })
    .join('\n');
}

// Note is the one target that may be pointed at from several fields at once. A
// Subject and a Message are two halves of one enquiry and the note is the only
// field on a card that can hold free text, so forcing a choice between them would
// throw half the submission away. Every other target stays one-to-one — two fields
// claiming `email` is a mapping mistake, not an intention, and the modal rejects it.
//
// With more than one, each answer keeps its label so the note reads as a transcript:
//
//     Subject:
//     Partnership enquiry
//
//     Message:
//     We'd like to talk about a pilot.
//
// A single note field stays bare, exactly as it always was — the labels appear only
// when there is something to tell apart.
//
// Returns the values to build from, plus the keys the form shape must now leave out:
// they have been folded into the first one and would otherwise overwrite it.
function valuesWithExtras(conn, values) {
  const map = conn.map || {};
  const noteKeys = Object.keys(values).filter(function (k) { return map[k] === 'note'; });

  // Labelled on what actually arrived, not on how the form was mapped: two note
  // fields where only one was filled in is one answer, and one answer under a
  // heading looks like a form someone half-completed.
  const filled = noteKeys.filter(function (k) {
    return String(values[k] == null ? '' : values[k]).trim();
  });
  const labelled = filled.length > 1;

  const parts = filled.map(function (k) {
    const v = String(values[k]).trim();
    return labelled ? prettyLabel(k) + ':\n' + v : v;
  });

  const extras = extrasNote(conn, values);
  if (extras) parts.push(extras);
  if (!parts.length) return { values: values, noteKey: null, dropKeys: [] };

  const noteKey = noteKeys[0] || '__extras';
  const out = Object.assign({}, values);
  out[noteKey] = parts.join(EXTRAS_SEP);
  return { values: out, noteKey: noteKey, dropKeys: noteKeys.slice(1) };
}

function formShapeFor(conn, values, extraNoteKey, dropKeys) {
  const map = conn.map || {};
  const dropped = dropKeys || [];
  // buildCard falls back to the pipeline's name, which would title every lead
  // "Neo partnerships". Whoever submitted is the useful name for a record that is,
  // at this point, just a person who got in touch.
  const nameKey = Object.keys(map).filter(function (k) { return map[k] === 'name'; })[0];
  const who = (values && nameKey && values[nameKey]) || '';
  return {
    recordTitle: conn.recordTitle || who || (conn.name ? conn.name + ' enquiry' : 'Website enquiry'),
    sourceLabel: conn.source || conn.sourceLabel || 'Web form',
    fields: Object.keys(map).filter(function (k) {
      return map[k] && dropped.indexOf(k) === -1;
    }).map(function (k) {
      return { key: k, label: k, target: map[k] };
    // When nothing was mapped to the note, the folded extras need a field of their
    // own or buildCard has no route for them.
    }).concat(extraNoteKey === '__extras' ? [{ key: '__extras', label: 'Other answers', target: 'note' }] : []),
  };
}

// A form that gains a field after it was set up keeps working — the new answer falls
// into the note with the other unmapped ones, so nothing is lost. But nobody is told,
// and the field stays out of the CRM's own columns forever.
//
// We cannot ask a form what it contains: CF7 pushes to us and has no API to read. So
// the next submission is the only place a new field can be discovered, and this is
// where that happens. The names are remembered so the modal can mark them, and cleared
// when the mapping is next saved.
function noteNewFields(conn, values) {
  var known = Array.isArray(conn.knownFields) ? conn.knownFields : [];
  var map = conn.map || {};
  var fresh = Object.keys(values).filter(function (k) {
    return known.indexOf(k) === -1 && !Object.prototype.hasOwnProperty.call(map, k);
  });
  conn.knownFields = known.concat(Object.keys(values).filter(function (k) {
    return known.indexOf(k) === -1;
  })).slice(0, LIMITS.keys);
  if (!fresh.length) return;
  conn.newFields = (conn.newFields || []).concat(fresh.filter(function (k) {
    return (conn.newFields || []).indexOf(k) === -1;
  })).slice(0, LIMITS.keys);
}

// Applying a saved connection form. Both api/inbound-config.js and dev-server.js used
// to hold their own copy of this, and the copies drifted the moment one of them learned
// something — which is the whole reason this file exists.
//
// Mutates `doc`. Returns the connection.
function saveConnection(doc, personaId, body, newToken) {
  var inbound = ensureInbound(doc);
  var list = inbound.connections;
  var conn = body.id ? list.filter(function (c) { return c.id === body.id; })[0] : null;

  if (!conn) {
    if (list.length >= LIMITS.connections) throw new Error('Too many connections.');
    conn = { id: 'in' + Date.now().toString(36), token: newToken(personaId),
             provider: String(body.provider || 'cf7').slice(0, 32), seen: [] };
    list.push(conn);
  }

  if (body.name !== undefined) conn.name = String(body.name || '').slice(0, 120);
  if (body.pipelineId !== undefined) conn.pipelineId = String(body.pipelineId || '');
  if (body.stage !== undefined) conn.stage = String(body.stage || '');
  if (body.source !== undefined) conn.source = String(body.source || '').slice(0, 60);
  if (body.enabled !== undefined) conn.enabled = body.enabled !== false;

  if (body.map && typeof body.map === 'object') {
    // Rebuilt rather than trusted — this arrives from a browser. Only targets we
    // understand survive.
    var clean = {};
    Object.keys(body.map).slice(0, LIMITS.keys).forEach(function (k) {
      var t = String(body.map[k] || '');
      if (t && !Object.prototype.hasOwnProperty.call(F.TARGETS, t)) return;
      clean[String(k).slice(0, LIMITS.keyLen)] = t;
    });
    conn.map = clean;
    // Saving the mapping is the acknowledgement: whatever was flagged as newly
    // arrived has now been looked at, whether it was mapped or left out on purpose.
    delete conn.newFields;
    var known = Array.isArray(conn.knownFields) ? conn.knownFields : [];
    Object.keys(clean).forEach(function (k) { if (known.indexOf(k) === -1) known.push(k); });
    conn.knownFields = known;
  }

  // The submission that taught us the shape becomes a record the moment the mapping
  // it was waiting for exists.
  if (conn.sample && isMapped(conn)) {
    var held = conn.sample.values;
    delete conn.sample;
    delete conn.suggested;
    receive(doc, conn, held);
  }
  return conn;
}

function isMapped(conn) {
  const map = conn && conn.map;
  if (!map) return false;
  // A mapping without name or email cannot make a record worth keeping — email is
  // what contacts dedupe on and name is what every list renders.
  const targets = Object.keys(map).map(function (k) { return map[k]; });
  return targets.indexOf('email') !== -1 || targets.indexOf('name') !== -1;
}

// Mutates `doc`. Returns what happened, so the endpoint can say it plainly and the
// caller can decide whether the document is worth writing.
function receive(doc, conn, body) {
  const values = flatten(body);
  if (!Object.keys(values).length) return { status: 'empty', changed: false };

  const print = fingerprint(values);
  if ((conn.seen || []).indexOf(print) !== -1) return { status: 'duplicate', changed: false };

  if (!isMapped(conn)) {
    // Hold it rather than guess. Overwrites any previous sample: the most recent
    // submission is the best description of what this form sends now.
    conn.sample = { values: values, at: Date.now() };
    conn.suggested = guessMap(values);
    return { status: 'sample', changed: true, fields: Object.keys(values) };
  }

  const pipeline = (doc.pipelines || {})[conn.pipelineId];
  if (!pipeline) return { status: 'no-pipeline', changed: false };

  const withExtras = valuesWithExtras(conn, values);
  const card = F.buildCard(doc, pipeline,
    formShapeFor(conn, withExtras.values, withExtras.noteKey, withExtras.dropKeys),
    withExtras.values);
  if (conn.stage) card.stage = conn.stage;
  card.inboundKey = print;
  pipeline.cards = pipeline.cards || [];
  pipeline.cards.unshift(card);

  conn.seen = (conn.seen || []).concat([print]).slice(-LIMITS.seen);
  // A running total, because `seen` is a bounded ring — after 200 submissions its
  // length stops being the answer to "how many has this form sent us?".
  conn.count = (conn.count || 0) + 1;
  conn.lastAt = Date.now();
  noteNewFields(conn, values);
  delete conn.sample;
  delete conn.suggested;
  return { status: 'added', changed: true, cardId: card.id };
}

module.exports = {
  ENVELOPES: ENVELOPES,
  prettyLabel: prettyLabel,
  extrasNote: extrasNote,
  valuesWithExtras: valuesWithExtras,
  connectionsOf: connectionsOf,
  saveConnection: saveConnection,
  noteNewFields: noteNewFields,
  ensureInbound: ensureInbound,
  findByToken: findByToken,
  flatten: flatten,
  fingerprint: fingerprint,
  guessMap: guessMap,
  formShapeFor: formShapeFor,
  isMapped: isMapped,
  receive: receive,
};
