// The intake-form model, shared by api/form.js (validates and appends) and the
// browser (builds and previews). Kept in one file so the field list, the types and
// the mapping rules can't drift between what the builder offers and what the
// server accepts.
//
// A form lives on its pipeline, next to customFieldDefs:
//
//   pipelines[<id>].intakeForm = {
//     token:    "default.8x2kq9",   // unguessable; the persona prefix tells the
//                                   // server which data file to write
//     enabled:  true,
//     heading:  "Apply — Senior Frontend Engineer",
//     blurb:    "We reply to everyone within a week.",
//     logoUrl:  "",                 // empty = the preset placeholder
//     recordTitle: "Senior Frontend Engineer",  // becomes card.deal
//     fields:   [ { key, label, type, required, target, options[] } ]
//   }
//
// Nothing about the pipeline's records is ever exposed through the form endpoints —
// GET returns only what it takes to draw the form.

// Where a submitted value lands on the new card. The submitter never chooses the
// pipeline, the stage, the amount or the record title: those are the form's, set
// server-side, or the reader would be able to file themselves anywhere.
const TARGETS = {
  name:        { label: 'Full name',   type: 'text',     locked: true },
  email:       { label: 'Email',       type: 'email',    locked: true },
  phone:       { label: 'Phone',       type: 'tel' },
  designation: { label: 'Job title',   type: 'text' },
  company:     { label: 'Company',     type: 'text' },
  location:    { label: 'Location',    type: 'text' },
  linkedin:    { label: 'LinkedIn',    type: 'url' },
  note:        { label: 'Message',     type: 'textarea' },
  custom:      { label: 'Custom field', type: 'text' },
};

// name and email are the two a record cannot exist without: email is the key the
// whole Contacts/Companies layer deduplicates on (contactKey() → "e:<email>"), and
// name is what every surface renders. A submission missing either is a record you
// can neither act on nor merge.
const LOCKED_TARGETS = ['name', 'email'];

// The input types a form field may declare. `date` and `time` were missing, which made
// "when do you need this by" / "preferred start date" unaskable — the commonest thing an
// intake form wants after a name and a way to reach someone.
const FIELD_TYPES = ['text', 'email', 'tel', 'url', 'textarea', 'select', 'date', 'time'];

const LIMITS = { value: 2000, note: 4000, fields: 24, options: 24 };

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

// A browser date input posts YYYY-MM-DD and a time input HH:MM, but the endpoint is public
// and a POST need not come from the browser at all — so the shape is checked here rather
// than trusted. Range is checked too: <input type="date"> happily posts 2024-13-45.
function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.getUTCFullYear() === +m[1]
    && d.getUTCMonth() + 1 === +m[2] && d.getUTCDate() === +m[3];
}
function isTime(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || '').trim());
  return !!m && +m[1] <= 23 && +m[2] <= 59;
}

// "default.8x2kq9" → "default". Anything malformed returns null rather than a
// guess, so a bad token can never resolve to a real persona's file.
function personaFromToken(token) {
  const m = /^([a-z0-9_-]{1,32})\.[A-Za-z0-9]{6,32}$/.exec(String(token || ''));
  return m ? m[1] : null;
}

function findFormByToken(doc, token) {
  const pipelines = (doc && doc.pipelines) || {};
  const ids = Object.keys(pipelines);
  for (let i = 0; i < ids.length; i++) {
    const pl = pipelines[ids[i]];
    const f = pl && pl.intakeForm;
    if (f && f.token === token) return { pipelineId: ids[i], pipeline: pl, form: f };
  }
  return null;
}

// What the public page is allowed to see. Deliberately does not spread the form
// object — a field added to the stored shape later must be opted in here, not
// leaked by default.
function publicForm(form, pipeline) {
  return {
    heading: form.heading || ('Get in touch about ' + (pipeline.name || 'this')),
    blurb: form.blurb || '',
    logoUrl: form.logoUrl || '',
    submitLabel: form.submitLabel || 'Submit',
    thanks: form.thanks || 'Thanks — we have your details and will be in touch.',
    fields: (form.fields || []).map(function (f) {
      return {
        key: f.key, label: f.label, type: f.type || 'text',
        required: !!f.required || LOCKED_TARGETS.indexOf(f.target) !== -1,
        placeholder: f.placeholder || '',
        options: Array.isArray(f.options) ? f.options.slice(0, LIMITS.options) : undefined,
      };
    }),
  };
}

// Returns { values } or { error }. Only fields the stored form declares are read —
// anything else in the body is dropped rather than trusted onto the card.
function validateSubmission(form, body) {
  const submitted = (body && body.values) || {};
  if (body && String(body.hp || '').trim()) return { error: 'Rejected.' };   // honeypot

  const fields = (form.fields || []).slice(0, LIMITS.fields);
  const values = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const required = !!f.required || LOCKED_TARGETS.indexOf(f.target) !== -1;
    const raw = submitted[f.key];
    const v = (raw == null ? '' : String(raw)).trim().slice(0, f.target === 'note' ? LIMITS.note : LIMITS.value);
    if (!v) {
      if (required) return { error: 'Please fill in ' + (f.label || f.key) + '.' };
      continue;
    }
    if ((f.type === 'email' || f.target === 'email') && !isEmail(v)) {
      return { error: 'That email address doesn\'t look right.' };
    }
    if (f.type === 'select' && Array.isArray(f.options) && f.options.indexOf(v) === -1) {
      return { error: 'Pick one of the listed options for ' + (f.label || f.key) + '.' };
    }
    if (f.type === 'date' && !isDate(v)) {
      return { error: 'That date doesn\'t look right for ' + (f.label || f.key) + '.' };
    }
    if (f.type === 'time' && !isTime(v)) {
      return { error: 'That time doesn\'t look right for ' + (f.label || f.key) + '.' };
    }
    values[f.key] = v;
  }
  return { values: values };
}

function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
}

function nextCardId(doc) {
  let max = 100;
  const pipelines = (doc && doc.pipelines) || {};
  Object.keys(pipelines).forEach(function (pid) {
    ((pipelines[pid] || {}).cards || []).forEach(function (c) {
      const n = Number(c && c.id);
      if (Number.isFinite(n) && n > max) max = n;
    });
  });
  return max + 1;
}

// Builds the card. Every field the app's views treat as load-bearing is set here —
// id, deal, stage, the contact (both contacts[] and the legacy flat contact* keys
// older views still read), initials, and the last-touch pair the lists render.
// Custom values go under customFieldValues keyed by the pipeline's own
// customFieldDefs, so the record page can actually render them.
function buildCard(doc, pipeline, form, values) {
  const byTarget = {};
  (form.fields || []).forEach(function (f) {
    if (values[f.key] === undefined) return;
    if (f.target === 'custom') {
      byTarget.custom = byTarget.custom || {};
      byTarget.custom[f.key] = values[f.key];
    } else {
      byTarget[f.target] = values[f.key];
    }
  });

  const name = byTarget.name || '';
  const email = byTarget.email || '';
  const stages = pipeline.stages || [];

  return {
    id: nextCardId(doc),
    deal: form.recordTitle || pipeline.name || 'New enquiry',
    stage: stages.length ? stages[0].key : '',
    company: byTarget.company || '',
    contact: name,
    initials: initialsFrom(name),
    contactEmail: email,
    contactPhone: byTarget.phone || '',
    contactDesignation: byTarget.designation || '',
    contactLocation: byTarget.location || '',
    contactLinkedin: byTarget.linkedin || '',
    contacts: [{
      name: name, email: email,
      phone: byTarget.phone || '', designation: byTarget.designation || '',
      location: byTarget.location || '', linkedin: byTarget.linkedin || '',
    }],
    value: 0,
    currency: form.currency || '$',
    source: form.sourceLabel || 'Form',
    note: byTarget.note || '',
    noteAuthor: name || 'Form',
    noteDate: '',
    lastActivity: 'just now',
    activityType: 'Form submission',
    overdue: false,
    createdBy: 'Form',
    customFieldValues: byTarget.custom || {},
  };
}

module.exports = {
  TARGETS: TARGETS,
  LOCKED_TARGETS: LOCKED_TARGETS,
  FIELD_TYPES: FIELD_TYPES,
  isEmail: isEmail,
  personaFromToken: personaFromToken,
  findFormByToken: findFormByToken,
  publicForm: publicForm,
  validateSubmission: validateSubmission,
  buildCard: buildCard,
  nextCardId: nextCardId,
  initialsFrom: initialsFrom,
};
