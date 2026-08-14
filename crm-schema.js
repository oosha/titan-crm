// What fields a record has, what they're called, and which ones exist at all.
//
// Three places used to decide this independently and disagree: STANDARD_FIELDS in
// opportunity-settings.html (19 hardcoded labels, hardcoded group headings, one
// global `required` flag), ENTITY_LABELS in opportunity-view.html (3 of the 19),
// and guesswork in add-opportunity.html. The visible symptom was a Tee orders board
// showing "Opportunity name" under "Opportunity details" inside a page titled
// "Order setting". One table now, read by all of them.
//
// Standalone module, one window.titanSchema global and no imports — same shape and
// same reason as crm-owner.js and crm-status.js.
//
// TWO AXES resolve in order:
//
//   base  →  entity (Opportunity|Project|Order|Candidate|Record)
//         →  subject overlay ('person')     [pipeline.subject]
//         →  the user's own toggles         [pipeline.hiddenFields / shownFields]
//
// `entity` is what the record IS. `subject` is who it's ABOUT — a company or a
// person. They're independent: a Titan customer taking orders from individuals and
// one taking corporate orders both run an Order pipeline, and a photographer's
// sales pipeline sells to people. Only Candidate has its subject fixed, because a
// candidate is a person by definition rather than by preference.
(function () {
  var ENTITIES = ['Opportunity', 'Project', 'Order', 'Candidate', 'Record'];

  // Field order is display order, and the groups are the settings page's sections.
  var ORDER = [
    'name', 'value', 'stage', 'status', 'close-date', 'source', 'note',
    'company', 'location', 'website', 'company-linkedin', 'instagram',
    'contact', 'contact-name', 'contact-email', 'contact-phone',
    'contact-designation', 'contact-department', 'contact-location', 'contact-linkedin',
  ];
  var GROUP = {
    name: 'record', value: 'record', stage: 'record', status: 'record',
    'close-date': 'record',
    source: 'record', note: 'record',
    company: 'company', location: 'company', website: 'company',
    'company-linkedin': 'company', instagram: 'company',
    contact: 'contact', 'contact-name': 'contact', 'contact-email': 'contact',
    'contact-phone': 'contact', 'contact-designation': 'contact',
    'contact-department': 'contact', 'contact-location': 'contact',
    'contact-linkedin': 'contact',
  };

  // Four states, one column per entity, in ENTITIES order:
  //
  //   R  required   — shown, locked on. The user can't hide it.
  //   +  on         — shown by default, the user may hide it.
  //   -  off        — offered but off by default, the user may show it.
  //   x  not offered — absent from settings entirely. Not a default, an absence.
  //
  // Only + and - are user-togglable, which is what stops anyone hiding `stage` and
  // what keeps Instagram off a hiring board. The rule behind + vs -: ON if a user
  // of that record type fills it most times, OFF if it's occasionally useful, and X
  // only if it's meaningless for the type.
  //
  //                             Opp Proj Ord Cand Rec
  var STATES = {
    'name':                      'RRRRR',
    'value':                     'R+Rx-',   // x on Candidate — a person has no deal size
    'stage':                     'RRRRR',
    // The outcome axis (crm-status.js owns the words). Required where the outcome is
    // the point of the record — a deal, an order — and optional elsewhere. Off by
    // default on a custom pipeline, which may have no notion of finishing at all.
    'status':                    'R+R+-',
    'close-date':                '+++++',
    'source':                    '+-++-',
    'note':                      '+++++',
    'company':                   '+++++',
    'location':                  '--+--',   // + on Order — it's the delivery address
    'website':                   '+++x-',
    'company-linkedin':          '+--x-',
    'instagram':                 '---x-',
    'contact':                   'RRRRR',
    'contact-name':              '+++++',
    'contact-email':             '+++++',
    'contact-phone':             '+++++',
    'contact-designation':       '++-+-',
    'contact-department':        '--x--',
    'contact-location':          '-----',
    'contact-linkedin':          '+-x+-',
  };
  var STATE_NAME = { R: 'required', '+': 'on', '-': 'off', x: 'none' };

  // Defaults. `{company}` interpolates that entity's own company label, so a
  // projects pipeline says "Client website" without needing four more table rows.
  var BASE_LABELS = {
    'name': 'Record name', 'value': 'Value', 'stage': 'Record stage', 'status': 'Status',
    'close-date': 'Expected end date', 'source': 'Source', 'note': 'Note',
    'company': 'Company', 'location': 'Location',
    'website': '{company} website', 'company-linkedin': '{company} LinkedIn',
    'instagram': '{company} Instagram',
    'contact': 'Contact person', 'contact-name': 'Contact name',
    'contact-email': 'Email', 'contact-phone': 'Phone',
    'contact-designation': 'Designation', 'contact-department': 'Department',
    'contact-location': 'Location', 'contact-linkedin': 'LinkedIn',
  };

  // Only the differences. Anything absent keeps its BASE_LABELS wording.
  var LABELS = {
    Opportunity: {
      'name': 'Opportunity name', 'value': 'Total value', 'stage': 'Opportunity stage',
      'close-date': 'Expected close date',
    },
    Project: {
      'name': 'Project name', 'value': 'Project budget', 'stage': 'Project stage',
      'close-date': 'Expected launch date', 'company': 'Client',
    },
    Order: {
      'name': 'Order name', 'value': 'Order total', 'stage': 'Order stage',
      'close-date': 'Expected delivery date', 'source': 'Order channel',
      'company': 'Customer', 'location': 'Delivery address',
    },
    Candidate: {
      'name': 'Candidate name', 'stage': 'Candidate stage',
      'close-date': 'Expected start date', 'source': 'Applied via',
      'company': 'Current employer', 'contact-designation': 'Current title',
    },
    Record: {},
  };

  // Applied on top of the entity layer when the pipeline's subject is a person.
  // The company fields don't vanish because a person can't have an employer — they
  // demote, because the employer stops being the counterparty and becomes a detail.
  var PERSON_STATES = {
    'website': 'none', 'company-linkedin': 'none', 'instagram': 'none',
    'company': 'off',
  };
  var PERSON_LABELS = {
    Order: { 'company': 'Ordering on behalf of' },
    Candidate: { 'company': 'Current employer' },
  };

  function entityOf(pipeline) {
    var e = pipeline && pipeline.entity;
    return ENTITIES.indexOf(e) === -1 ? 'Record' : e;
  }

  // Candidate is locked to 'person'. Everything else defaults to 'company' and can
  // be changed in pipeline settings, so today's data reads exactly as it does now.
  function subjectLocked(entity) { return entity === 'Candidate'; }
  function subjectOf(pipeline) {
    var entity = entityOf(pipeline);
    if (subjectLocked(entity)) return 'person';
    return (pipeline && pipeline.subject) === 'person' ? 'person' : 'company';
  }
  function isPerson(pipeline) { return subjectOf(pipeline) === 'person'; }

  function stateFor(entity, subject, key) {
    var row = STATES[key];
    var base = row ? STATE_NAME[row.charAt(ENTITIES.indexOf(entity))] : 'off';
    if (subject === 'person' && PERSON_STATES[key]) {
      // The overlay may only demote. It never promotes a field the entity ruled out.
      if (base === 'none') return 'none';
      if (base !== 'required') return PERSON_STATES[key];
    }
    return base;
  }

  function labelFor(entity, subject, key) {
    var label = (subject === 'person' && (PERSON_LABELS[entity] || {})[key]) ||
                (LABELS[entity] || {})[key] || BASE_LABELS[key] || key;
    if (label.indexOf('{company}') === -1) return label;
    return label.replace('{company}', (LABELS[entity] || {}).company || BASE_LABELS.company);
  }

  // Group headings, derived rather than tabled: the company section is named after
  // whatever that entity calls a company, so it reads "Client details" on projects.
  function headings(entity, subject) {
    var company = (subject === 'person' && (PERSON_LABELS[entity] || {}).company) ||
                  (LABELS[entity] || {}).company || BASE_LABELS.company;
    return {
      record: entity + ' details',
      // "Client details" reads fine; "Current employer details" doesn't — so a
      // person-subject pipeline names the section outright instead of suffixing it.
      company: subject === 'person'
        ? (entity === 'Candidate' ? 'Current employer' : 'Employer')
        : company + ' details',
      contact: 'Contact details',
    };
  }

  // Whether a field is switched on for this pipeline right now.
  //
  // `hiddenFields` is the existing stored array and keeps its meaning exactly — an
  // explicit hide list. `shownFields` is its mirror, needed only because some fields
  // now default to off and would otherwise be unreachable. A pipeline that has never
  // seen this code has no shownFields and behaves as it always did.
  function isOn(pipeline, def) {
    if (def.state === 'required') return true;
    if (def.state === 'none') return false;
    var hidden = (pipeline && pipeline.hiddenFields) || [];
    var shown = (pipeline && pipeline.shownFields) || [];
    if (hidden.indexOf(def.key) !== -1) return false;
    if (shown.indexOf(def.key) !== -1) return true;
    return def.state === 'on';
  }

  // Everything a page needs for one pipeline, resolved once.
  function resolve(pipeline) {
    var entity = entityOf(pipeline);
    var subject = subjectOf(pipeline);
    var defs = [], byKey = {};
    ORDER.forEach(function (key) {
      var state = stateFor(entity, subject, key);
      if (state === 'none') return;          // not offered — the page never sees it
      var def = {
        key: key, group: GROUP[key], state: state,
        label: labelFor(entity, subject, key),
        required: state === 'required',
        dependsOnContacts: key === 'contact-name',
      };
      def.on = isOn(pipeline, def);
      defs.push(def); byKey[key] = def;
    });
    return {
      entity: entity, subject: subject, isPerson: subject === 'person',
      subjectLocked: subjectLocked(entity),
      headings: headings(entity, subject),
      fields: defs, byKey: byKey,
      // Falls through labelFor rather than BASE_LABELS so a field this type doesn't
      // offer still returns a finished string — reading BASE_LABELS raw would hand
      // back the literal "{company} website".
      label: function (key) { return byKey[key] ? byKey[key].label : labelFor(entity, subject, key); },
      offered: function (key) { return !!byKey[key]; },
      on: function (key) { return !!byKey[key] && byKey[key].on; },
    };
  }

  // One field, without building the other nineteen. For hot paths — the board asks
  // this per card, and the dashboard per record.
  function onePipelineField(pipeline, key) {
    var state = stateFor(entityOf(pipeline), subjectOf(pipeline), key);
    return state !== 'none' && isOn(pipeline, { key: key, state: state });
  }

  window.titanSchema = {
    ENTITIES: ENTITIES, resolve: resolve, on: onePipelineField,
    subjectOf: subjectOf, subjectLocked: subjectLocked, isPerson: isPerson,
    entityOf: entityOf,
  };
})();
