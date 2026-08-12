// Shared HubSpot helpers. Companion to _github.js: that one owns "where records
// live", this one owns "where new records come from".
//
// ── Why polling and not webhooks ──────────────────────────────────────────────
// HubSpot has no free, form-scoped webhook. The real-time option is a Workflow
// with a webhook action, which needs Operations Hub Professional; legacy-app
// webhooks only fire on CRM object events like contact.creation, which is not
// form-scoped and fires for contacts from every other source too. Polling the
// submissions endpoint works on a FREE HubSpot account, which is what makes this
// demoable at all.
//
// ── Which HubSpot credential this expects ─────────────────────────────────────
// A Service Key (Development → Keys → Service keys), which is what HubSpot now
// steers people to — trying to create the old "private app" raises an interstitial
// pushing you to Service Keys instead. Both are sent the same way,
// `Authorization: Bearer <key>`, so a private-app token still works here and no
// existing connection breaks; only the setup instructions changed.
//
// Two things to know about Service Keys:
//   • They have been in public beta since Feb 2026, so the UI wording may shift.
//   • They can't authenticate webhooks. Irrelevant here — we poll — but it rules
//     them out if this ever moves to a push model.
//
// UNVERIFIED: whether a Service Key can read the legacy v1 submissions endpoint
// below. HubSpot documents neither support nor exclusion for v1 under service
// keys, and it could not be tested without a live account. If reading
// submissions 403s while listing forms succeeds, that combination is the tell,
// and a legacy private app is the fallback.
//
// ── Adding another form provider (Contact Form 7, Typeform…) ──────────────────
// Everything below the fetch layer is provider-agnostic on purpose. A new
// provider needs its own listForms()/fetchSubmissions() returning the normalised
// { key, submittedAt, fields{} } shape; mapSubmissionToCard() and syncIntoData()
// can then be reused unchanged.

// HUBSPOT_BASE_URL exists so the integration can be exercised locally against a
// stub without a live HubSpot account. Unset in production.
const HS_BASE = process.env.HUBSPOT_BASE_URL || 'https://api.hubapi.com';

// The legacy Forms API is the one that can read SUBMISSIONS; the newer
// /marketing/forms endpoints list and manage form definitions but don't expose
// submitted values. So we use both: v3 to name the forms, v1 to read what came in.
const FORMS_LIST_PATH = '/marketing/v3/forms';
const SUBMISSIONS_PATH = '/form-integrations/v1/submissions/forms/';

// The key is entered in the UI and travels with the connection; HUBSPOT_TOKEN
// stays supported as a fallback so an environment-configured deployment keeps
// working without being reconnected by hand.
function resolveKey(cfg) {
  return (cfg && cfg.apiKey) || process.env.HUBSPOT_TOKEN || '';
}

function isConnected(cfg) {
  return !!resolveKey(cfg);
}

// A form GUID is a plain UUID. Validated before it reaches a URL, the same way
// api/logo.js validates a domain and _github.js validates a persona id.
function isValidFormGuid(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Errors here surface directly to someone who has never seen an API, so they say
// what to do next rather than what the status code was.
async function hsFetch(key, path, options) {
  if (!key) throw userError('Connect HubSpot first.');

  let res;
  try {
    res = await fetch(HS_BASE + path, Object.assign({
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    }, options || {}));
  } catch (err) {
    // fetch() rejects outright on DNS/connection failures, and its message
    // ("fetch failed") would otherwise reach the page verbatim.
    throw userError('Couldn’t reach HubSpot just now. Check your internet connection and try again.');
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw userError('HubSpot didn’t accept that key. It may have been copied incompletely, or removed in HubSpot. Try copying it again.');
    }
    if (res.status === 403) {
      throw userError('That key isn’t allowed to read forms. In HubSpot, go to Development → Keys, open your key, add the “forms” scope and save. Then press Connect again.');
    }
    if (res.status === 429) {
      throw userError('HubSpot is asking us to slow down. Wait a minute and try again.');
    }
    throw userError('HubSpot couldn’t be reached just now. Try again in a moment.');
  }
  return res.json();
}

// Something the person using the page can act on, as opposed to a genuine fault.
// Callers map this to a 400 and show the message as-is.
function userError(message) {
  const e = new Error(message);
  e.isSyncError = true;
  return e;
}

// The form picker's options: [{ guid, name, fields[] }].
//
// fields[] comes from the same response — the v3 list returns each form's full
// definition, so pulling the field names out here costs no extra round trip and
// lets the connect page offer mapping rows for the form's REAL questions
// (including custom ones) instead of only the standard properties.
async function listForms(key) {
  const body = await hsFetch(key, FORMS_LIST_PATH + '?limit=100');
  return (body.results || []).map(function (f) {
    return { guid: f.id || f.guid, name: f.name || 'Untitled form', fields: fieldNamesOf(f) };
  }).filter(function (f) { return f.guid; });
}

// HubSpot nests fields under fieldGroups[].fields[]. Shapes have shifted across
// form versions, so anything unrecognised falls back to the standard properties
// rather than rendering an empty mapping table.
function fieldNamesOf(form) {
  const names = [];
  (form.fieldGroups || []).forEach(function (g) {
    (g.fields || []).forEach(function (fld) {
      const n = fld && (fld.name || fld.propertyName);
      if (n && names.indexOf(n) === -1) names.push(String(n).toLowerCase());
    });
  });
  return names.length ? names : Object.keys(DEFAULT_MAP);
}

// Submissions for one form, normalised to { key, submittedAt, fields }.
// limit maxes out at 50 per HubSpot; we take one page because a sync triggered by
// a button press shouldn't turn into deep pagination against a busy form.
async function fetchSubmissions(key, formGuid, limit) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const body = await hsFetch(key, SUBMISSIONS_PATH + encodeURIComponent(formGuid) + '?limit=' + capped);
  return (body.results || []).map(normaliseSubmission);
}

function normaliseSubmission(raw) {
  const fields = {};
  (raw.values || []).forEach(function (v) {
    if (v && v.name) fields[String(v.name).toLowerCase()] = v.value == null ? '' : String(v.value);
  });
  return {
    key: submissionKey(raw, fields),
    submittedAt: Number(raw.submittedAt) || 0,
    fields: fields,
  };
}

// Dedupe identity. conversionId is documented but inconsistently returned in
// practice (widely reported on HubSpot's community forum), so it can't be the
// only key or repeat syncs would duplicate every record on accounts where it's
// absent. submittedAt is a millisecond timestamp, which combined with the email
// is specific enough: the same person submitting the same form twice in the same
// millisecond is not a case worth splitting.
function submissionKey(raw, fields) {
  if (raw && raw.conversionId) return 'c:' + raw.conversionId;
  const email = fields.email || '';
  return 't:' + (Number(raw && raw.submittedAt) || 0) + '|' + email.toLowerCase();
}

// Default HubSpot-field → Titan-field mapping. HubSpot's built-in contact
// properties use these internal names on virtually every form, so an untouched
// form usually maps correctly with no configuration at all.
const DEFAULT_MAP = {
  email: 'contactEmail',
  firstname: 'contact',
  lastname: 'contact',            // joined with firstname, see fullName()
  company: 'company',
  phone: 'contactPhone',
  jobtitle: 'contactDesignation',
  website: 'website',
};

// Every Titan card field a form question is allowed to fill. Anything not on this
// list is ignored rather than written blindly — a mapping UI that can set
// arbitrary keys on a card is a mapping UI that can quietly corrupt one.
const TARGET_FIELDS = [
  { key: 'contact', label: 'Contact name' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'contactPhone', label: 'Contact phone' },
  { key: 'contactDesignation', label: 'Job title' },
  { key: 'company', label: 'Company' },
  { key: 'website', label: 'Website' },
  { key: 'deal', label: 'Record name' },
  { key: 'note', label: 'Note' },
  { key: '', label: 'Don’t import' },
];

function fullName(fields, map) {
  // firstname/lastname both map to `contact`, so join them rather than letting
  // the second overwrite the first.
  const parts = [];
  Object.keys(fields).forEach(function (hsKey) {
    if (map[hsKey] !== 'contact') return;
    const v = String(fields[hsKey] || '').trim();
    if (v) parts.push(v);
  });
  return parts.join(' ').trim();
}

// Builds a card in exactly the shape add-opportunity.html:333 produces —
// including BOTH the contacts[] array and the legacy flat contact* fields, since
// crm.html and opportunity-view.html still read the flat ones (see CLAUDE.md).
// Diverging here would produce records that render as blanks on the board.
function mapSubmissionToCard(submission, opts) {
  const map = Object.assign({}, DEFAULT_MAP, opts.map || {});
  const f = submission.fields;
  const out = {};

  Object.keys(f).forEach(function (hsKey) {
    const target = map[hsKey];
    if (!target || target === 'contact') return;          // name handled below
    if (!TARGET_FIELDS.some(function (t) { return t.key === target; })) return;
    const value = String(f[hsKey] || '').trim();
    if (value && !out[target]) out[target] = value;
  });

  const contact = fullName(f, map) || out.contactEmail || 'Unknown contact';
  const company = out.company || '';
  // A form submission has no deal name, so derive something a human can scan on
  // the board rather than leaving the card's headline blank.
  const deal = out.deal || (company ? company + ' — ' + opts.formName : opts.formName + ' submission');

  const contactRecord = {
    name: contact,
    email: out.contactEmail || '',
    phone: out.contactPhone || '',
    designation: out.contactDesignation || '',
    department: '',
    location: '',
    linkedin: '',
  };

  return {
    id: opts.id,
    company: company,
    contact: contact,
    initials: contact.charAt(0).toUpperCase(),
    deal: deal,
    value: 0,
    stage: opts.stage,
    lastActivity: 'just now',
    activityType: 'Form submission',
    overdue: false,
    upcomingActivities: [],
    createdBy: 'HubSpot',
    note: out.note || '',
    noteDate: '',
    currency: opts.currency || '$',
    location: '',
    website: out.website || '',
    companyLinkedin: '',
    instagram: '',
    closeDate: '',
    source: 'HubSpot form',
    contacts: [contactRecord],
    // Legacy flat mirror — read by the board and the record page.
    contactEmail: contactRecord.email,
    contactPhone: contactRecord.phone,
    contactDesignation: contactRecord.designation,
    contactDepartment: '',
    contactLocation: '',
    contactLinkedin: '',
    customFieldValues: {},
    // Kept so a submission can be traced back to HubSpot when a mapping looks wrong.
    hubspotSubmissionKey: submission.key,
  };
}

// ── The sync itself ───────────────────────────────────────────────────────────
// Deliberately storage-agnostic: hand it the persona blob and the submissions,
// get back a mutated blob and a report. Both callers — api/hubspot-sync.js
// (GitHub-backed) and dev-server.js (local files) — run THIS function, so the
// dedupe and card-building logic exists once. dev-server.js already re-implements
// /api/data and /api/logo locally; repeating this one too would be repeating the
// part most likely to harbour a bug.

// Keys of submissions already turned into records. Capped because this list is
// written back on every sync and would otherwise grow without bound on a busy
// form. 500 is far more than one page of submissions (max 50), so a key can't age
// out while it's still reachable by a sync.
const SEEN_CAP = 500;

// Normalises the stored config in place and returns it.
//
// v1 stored a single connection with formGuid/pipelineId/etc. directly on
// `hubspot`. v2 stores `connections[]`. Migrating in place means the next write
// persists the new shape, and an account connected under v1 keeps working
// instead of silently losing its form.
function ensureConfig(data) {
  if (!data.integrations || !data.integrations.hubspot) return null;
  const cfg = data.integrations.hubspot;
  if (Array.isArray(cfg.connections)) return cfg;

  cfg.connections = cfg.formGuid ? [{
    id: 'c1',
    formGuid: cfg.formGuid,
    formName: cfg.formName || 'HubSpot form',
    pipelineId: cfg.pipelineId || '',
    stage: cfg.stage || '',
    map: cfg.map || {},
    seen: Array.isArray(cfg.seen) ? cfg.seen : [],
    lastSyncedAt: cfg.lastSyncedAt || 0,
  }] : [];

  // The v1 fields would otherwise sit alongside the new array looking authoritative.
  ['formGuid', 'formName', 'pipelineId', 'stage', 'map', 'seen', 'lastSyncedAt']
    .forEach(function (k) { delete cfg[k]; });
  return cfg;
}

// The distinct forms that need fetching. Two connections can point at the same
// form (one form feeding two pipelines), and that should cost one API call, not two.
function formGuidsFor(cfg) {
  const out = [];
  (cfg.connections || []).forEach(function (c) {
    if (c.formGuid && out.indexOf(c.formGuid) === -1) out.push(c.formGuid);
  });
  return out;
}

// submissionsByForm: { <formGuid>: [normalised submission, …] }
//
// Returns { changed, added, perConnection[], records[] }. `changed` is the
// important one: when nothing was imported the caller MUST NOT write. Writes are
// GitHub commits, and this runs on a 60s poll from every open tab — stamping a
// "last checked" time on every pass would commit to the repo once a minute
// forever. Nothing is recorded unless a record was actually created.
function syncIntoData(data, submissionsByForm) {
  const cfg = ensureConfig(data);
  if (!cfg || !cfg.connections.length) throw userError('Add a form first.');

  // Swept once and shared, so two connections importing in the same pass can't
  // hand out the same id. Same derivation as add-opportunity.html:333 — ids are
  // mixed across personas (numbers, and strings like "inquiries-i1"), so only
  // numeric ones can raise the ceiling.
  let maxId = 100;
  Object.keys(data.pipelines).forEach(function (pid) {
    (data.pipelines[pid].cards || []).forEach(function (c) {
      if (typeof c.id === 'number' && c.id > maxId) maxId = c.id;
    });
  });

  const perConnection = [];
  const allRecords = [];

  (cfg.connections || []).forEach(function (conn) {
    const pipeline = data.pipelines && data.pipelines[conn.pipelineId];
    // One broken connection shouldn't stop the others importing — report it and
    // carry on, rather than failing the whole sync.
    if (!pipeline) {
      perConnection.push({
        id: conn.id, formName: conn.formName, added: 0,
        problem: 'The pipeline this form fed has been deleted.',
      });
      return;
    }

    const stages = pipeline.stages || [];
    // A renamed stage shouldn't strand submissions that already happened; they
    // land in the first stage, which is where a new lead belongs anyway.
    const stage = stages.some(function (s) { return s.key === conn.stage; })
      ? conn.stage
      : (stages[0] && stages[0].key);
    if (!stage) {
      perConnection.push({
        id: conn.id, formName: conn.formName, added: 0,
        problem: 'That pipeline has no stages to put a record in.',
      });
      return;
    }

    const submissions = submissionsByForm[conn.formGuid] || [];
    // Per CONNECTION, not per form. Two connections on the same form each keep
    // their own history, so one submission can legitimately create a record in
    // both pipelines instead of the second being deduped away.
    const seen = Array.isArray(conn.seen) ? conn.seen : [];
    const seenSet = new Set(seen);
    const fresh = submissions
      .filter(function (s) { return !seenSet.has(s.key); })
      // Oldest first, so ids and board order follow the order people submitted.
      .sort(function (a, b) { return a.submittedAt - b.submittedAt; });

    const currency = (pipeline.cards || []).reduce(function (acc, c) { return acc || c.currency; }, '') || '$';

    const added = fresh.map(function (submission) {
      maxId += 1;
      return mapSubmissionToCard(submission, {
        id: maxId,
        stage: stage,
        currency: currency,
        formName: conn.formName || 'HubSpot form',
        map: conn.map,
      });
    });

    if (added.length) {
      pipeline.cards = (pipeline.cards || []).concat(added);
      const nextSeen = seen.concat(added.map(function (c) { return c.hubspotSubmissionKey; }));
      conn.seen = nextSeen.slice(Math.max(0, nextSeen.length - SEEN_CAP));
      conn.lastSyncedAt = Date.now();
      added.forEach(function (c) {
        allRecords.push({ id: c.id, deal: c.deal, contact: c.contact, pipelineId: conn.pipelineId });
      });
    }

    perConnection.push({
      id: conn.id,
      formName: conn.formName,
      pipelineId: conn.pipelineId,
      added: added.length,
      scanned: submissions.length,
      lastSyncedAt: conn.lastSyncedAt || 0,
    });
  });

  const total = allRecords.length;
  return { changed: total > 0, added: total, perConnection: perConnection, records: allRecords };
}

module.exports = {
  resolveKey: resolveKey,
  isConnected: isConnected,
  isValidFormGuid: isValidFormGuid,
  ensureConfig: ensureConfig,
  formGuidsFor: formGuidsFor,
  listForms: listForms,
  fetchSubmissions: fetchSubmissions,
  mapSubmissionToCard: mapSubmissionToCard,
  syncIntoData: syncIntoData,
  userError: userError,
  DEFAULT_MAP: DEFAULT_MAP,
  TARGET_FIELDS: TARGET_FIELDS,
};
