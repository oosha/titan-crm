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
  ['note',        /message|comment|enquiry|inquiry|note|detail/i],
];

function guessMap(values) {
  const map = {}, taken = {};
  Object.keys(values).forEach(function (key) {
    for (let i = 0; i < GUESSES.length; i++) {
      const target = GUESSES[i][0];
      if (taken[target]) continue;
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
function extrasNote(conn, values) {
  const map = conn.map || {};
  return Object.keys(values)
    .filter(function (k) { return !map[k]; })
    .filter(function (k) { return String(values[k]).trim(); })
    .map(function (k) { return k + ': ' + values[k]; })
    .join('\n');
}

// Returns the values to build from: the submission, with unmapped answers folded
// into whichever field is pointed at the note.
function valuesWithExtras(conn, values) {
  const extras = extrasNote(conn, values);
  if (!extras) return { values: values, noteKey: null };
  const map = conn.map || {};
  const noteKey = Object.keys(map).filter(function (k) { return map[k] === 'note'; })[0] || '__extras';
  const out = Object.assign({}, values);
  const existing = String(out[noteKey] || '').trim();
  out[noteKey] = existing ? existing + EXTRAS_SEP + extras : extras;
  return { values: out, noteKey: noteKey };
}

function formShapeFor(conn, values, extraNoteKey) {
  const map = conn.map || {};
  // buildCard falls back to the pipeline's name, which would title every lead
  // "Neo partnerships". Whoever submitted is the useful name for a record that is,
  // at this point, just a person who got in touch.
  const nameKey = Object.keys(map).filter(function (k) { return map[k] === 'name'; })[0];
  const who = (values && nameKey && values[nameKey]) || '';
  return {
    recordTitle: conn.recordTitle || who || (conn.name ? conn.name + ' enquiry' : 'Website enquiry'),
    sourceLabel: conn.source || conn.sourceLabel || 'Web form',
    fields: Object.keys(map).filter(function (k) { return map[k]; }).map(function (k) {
      return { key: k, label: k, target: map[k] };
    // When nothing was mapped to the note, the folded extras need a field of their
    // own or buildCard has no route for them.
    }).concat(extraNoteKey === '__extras' ? [{ key: '__extras', label: 'Other answers', target: 'note' }] : []),
  };
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
    formShapeFor(conn, withExtras.values, withExtras.noteKey), withExtras.values);
  if (conn.stage) card.stage = conn.stage;
  card.inboundKey = print;
  pipeline.cards = pipeline.cards || [];
  pipeline.cards.unshift(card);

  conn.seen = (conn.seen || []).concat([print]).slice(-LIMITS.seen);
  conn.lastAt = Date.now();
  delete conn.sample;
  delete conn.suggested;
  return { status: 'added', changed: true, cardId: card.id };
}

module.exports = {
  ENVELOPES: ENVELOPES,
  extrasNote: extrasNote,
  valuesWithExtras: valuesWithExtras,
  connectionsOf: connectionsOf,
  ensureInbound: ensureInbound,
  findByToken: findByToken,
  flatten: flatten,
  fingerprint: fingerprint,
  guessMap: guessMap,
  formShapeFor: formShapeFor,
  isMapped: isMapped,
  receive: receive,
};
