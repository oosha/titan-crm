// Saved filter views — the model, the matcher, and the condition editor.
//
// The sidebar has shown "Deal over $10k" and "North America" under Neo partnerships
// since the first prototype, as labels with no behaviour: no click handler, nothing
// reading them, no definition anywhere. This gives them one.
//
// A view lives on its pipeline beside customFieldDefs and intakeForm:
//
//   pipelines[<id>].views = [ { id, name, conditions: [ { field, op, value } ] } ]
//
// Conditions are ANDed, the same contract as the incoming-email rule builder, so the
// two places in the CRM where someone describes "which records" behave alike.
//
// Shared by titan-sidebar.js (which lists them) and crm.html (which applies and edits
// them), because a view the sidebar can show but the board cannot read is the bug this
// file exists to remove.
(function () {
  'use strict';

  var FIELDS = [
    { id: 'owner',    label: 'Owner',    type: 'owner'  },
    { id: 'stage',    label: 'Stage',    type: 'stage'  },
    { id: 'status',   label: 'Status',   type: 'status' },
    { id: 'value',    label: 'Amount',   type: 'number' },
    { id: 'company',  label: 'Company',  type: 'text'   },
    { id: 'contact',  label: 'Contact',  type: 'text'   },
    { id: 'source',   label: 'Source',   type: 'text'   },
    { id: 'location', label: 'Location', type: 'text'   },
    { id: 'overdue',  label: 'Overdue',  type: 'bool'   },
  ];
  var OPS = {
    number: [['gt', 'is more than'], ['lt', 'is less than'], ['eq', 'is exactly']],
    text:   [['contains', 'contains'], ['is', 'is'], ['not', 'is not']],
    stage:  [['is', 'is'], ['not', 'is not']],
    status: [['is', 'is'], ['not', 'is not']],
    owner:  [['is', 'is'], ['not', 'is not']],
    bool:   [['is', 'is']],
  };

  // The two the prototype has always shown, given the definitions their names imply.
  // Seeded only when a pipeline has no views of its own, and only by id, so they stop
  // appearing the moment someone edits or deletes them.
  var SEEDED = {
    neo: [
      { id: 'v-over10k', name: 'Deal over $10k',
        conditions: [{ field: 'value', op: 'gt', value: '10000' }] },
      { id: 'v-namerica', name: 'North America',
        conditions: [{ field: 'location', op: 'contains', value: 'US' }] },
    ],
  };

  function fieldDef(id) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) return FIELDS[i];
    return FIELDS[0];
  }
  function opsFor(id) { return OPS[fieldDef(id).type] || OPS.text; }
  function opLabel(fieldId, op) {
    var list = opsFor(fieldId);
    for (var i = 0; i < list.length; i++) if (list[i][0] === op) return list[i][1];
    return list[0][1];
  }

  function list(pipeline) {
    if (!pipeline) return [];
    if (Array.isArray(pipeline.views)) {
      return pipeline.views.map(function (v, i) {
        // Tolerates the old shape, where a view was just its name.
        if (typeof v === 'string') return { id: 'v' + i, name: v, conditions: [] };
        return { id: v.id || ('v' + i), name: v.name || 'Untitled view',
                 conditions: Array.isArray(v.conditions) ? v.conditions : [] };
      });
    }
    return (SEEDED[pipeline.id] || []).map(function (v) { return JSON.parse(JSON.stringify(v)); });
  }

  function byId(pipeline, viewId) {
    var all = list(pipeline);
    for (var i = 0; i < all.length; i++) if (all[i].id === viewId) return all[i];
    return null;
  }

  // Location is two fields in practice: some records carry the company's, some only the
  // contact's, and a person filtering by region means either.
  function readField(card, field) {
    if (field === 'location') return card.location || card.contactLocation || '';
    // Stored as {name, email} so a name survives someone leaving the team. Matched on
    // email, which is the stable half.
    if (field === 'owner') return (card.owner && card.owner.email) || '';
    if (field === 'overdue') return card.overdue ? 'yes' : 'no';
    if (field === 'status') {
      if (window.titanStatus && window.titanStatus.current) {
        try { return window.titanStatus.current(card) || ''; } catch (e) { /* fall through */ }
      }
      return card.status || '';
    }
    return card[field] == null ? '' : card[field];
  }

  function matchOne(card, cond) {
    var def = fieldDef(cond.field);
    var actual = readField(card, cond.field);
    var wanted = cond.value == null ? '' : String(cond.value).trim();
    if (!wanted) return true;                 // an unfinished condition filters nothing

    if (def.type === 'number') {
      var a = Number(actual) || 0, w = Number(wanted);
      if (isNaN(w)) return true;
      if (cond.op === 'lt') return a < w;
      if (cond.op === 'eq') return a === w;
      return a > w;
    }
    var A = String(actual).toLowerCase(), W = wanted.toLowerCase();
    if (cond.op === 'is') return A === W;
    if (cond.op === 'not') return A !== W;
    return A.indexOf(W) !== -1;
  }

  function match(card, view) {
    var conds = (view && view.conditions) || [];
    if (!conds.length) return true;
    for (var i = 0; i < conds.length; i++) if (!matchOne(card, conds[i])) return false;
    return true;
  }

  function apply(cards, view) {
    if (!view) return cards;
    return (cards || []).filter(function (c) { return match(c, view); });
  }

  function valueLabel(c, pipeline) {
    var def = fieldDef(c.field);
    // fromEmail(email, pipeline) — the arguments are that way round, and it returns an
    // owner object, so the name has to come off it rather than the object being printed.
    if (def.type === 'owner' && window.titanOwner && window.titanOwner.fromEmail) {
      var who = window.titanOwner.fromEmail(c.value, pipeline);
      if (who && who.name) return who.name;
    }
    if (def.type === 'bool') return c.value === 'no' ? 'No' : 'Yes';
    if (def.type === 'stage' && pipeline) {
      var st = (pipeline.stages || []).filter(function (x) { return x.key === c.value; })[0];
      if (st) return st.label || st.key;
    }
    return c.value || '…';
  }
  function describe(view, pipeline) {
    var conds = (view && view.conditions) || [];
    if (!conds.length) return 'Shows every record';
    return conds.map(function (c) {
      return fieldDef(c.field).label + ' ' + opLabel(c.field, c.op) + ' ' + valueLabel(c, pipeline);
    }).join(' and ');
  }

  // The value a select-backed field starts on. Text and number fields start empty,
  // which reads as "not filled in yet" and filters nothing.
  function firstValueFor(fieldId, pipeline) {
    var t = fieldDef(fieldId).type;
    if (t === 'stage') { var s0 = (pipeline && pipeline.stages || [])[0]; return s0 ? s0.key : ''; }
    if (t === 'bool') return 'yes';
    if (t === 'owner') {
      var ppl = (window.titanOwner && window.titanOwner.people) ? window.titanOwner.people(pipeline) : [];
      return ppl.length ? ppl[0].email : '';
    }
    if (t === 'status') {
      var vals = [];
      if (window.titanStatus && window.titanStatus.values) {
        try { vals = window.titanStatus.values(pipeline && pipeline.entity) || []; } catch (e) { vals = []; }
      }
      vals = vals.map(function (v) { return typeof v === 'string' ? v : (v && (v.label || v.key)) || ''; }).filter(Boolean);
      return vals.length ? vals[0] : 'New';
    }
    return '';
  }
  function blankCondition(pipeline) {
    return { field: 'owner', op: 'is', value: firstValueFor('owner', pipeline) };
  }

  function newId() {
    var r = '';
    for (var i = 0; i < 3; i++) r += Math.random().toString(36).slice(2, 8);
    return 'v' + r.slice(0, 12);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  // Rendered into a host the page supplies, so the board keeps its own modal shell
  // rather than this file inventing a second one.
  function mountEditor(host, opts) {
    opts = opts || {};
    var pipeline = opts.pipeline || {};
    var src = opts.value;
    var state = {
      id: (src && src.id) || newId(),
      name: (src && src.name) || '',
      conditions: (src && src.conditions && src.conditions.length)
        ? JSON.parse(JSON.stringify(src.conditions))
        : [blankCondition(pipeline)],
    };

    host.innerHTML =
      // The board's filter panel has no name field: it is not a view yet, and asking
      // for a name before someone has decided to keep it is asking too early.
      (opts.hideName ? '' :
        '<div class="cv-sec">' +
          '<div class="cv-label">View name</div>' +
          '<input class="cv-text" id="cv-name" type="text" maxlength="40" ' +
            'placeholder="e.g. Deal over $10k" value="' + esc(state.name) + '">' +
        '</div>') +
      '<div class="cv-sec">' +
        '<div class="cv-label">Show records where</div>' +
        '<div class="cv-conds" data-cv-conds></div>' +
        '<button type="button" class="cv-add" data-cv-add>+ Add a condition</button>' +
        '<div class="cv-summary" data-cv-summary></div>' +
      '</div>';

    var wrap = host.querySelector('[data-cv-conds]');
    var summary = host.querySelector('[data-cv-summary]');

    function valueControl(c, i) {
      var def = fieldDef(c.field);
      if (def.type === 'stage') {
        return '<select class="cv-select cv-value" data-cv-value="' + i + '">' +
          (pipeline.stages || []).map(function (s) {
            return '<option value="' + esc(s.key) + '"' + (c.value === s.key ? ' selected' : '') + '>' +
              esc(s.label || s.key) + '</option>';
          }).join('') + '</select>';
      }
      if (def.type === 'owner') {
        var people = (window.titanOwner && window.titanOwner.people)
          ? window.titanOwner.people(pipeline) : [];
        if (!people.length) people = [{ name: 'Me', email: 'me@example.com' }];
        return '<select class="cv-select cv-value" data-cv-value="' + i + '">' +
          people.map(function (o) {
            return '<option value="' + esc(o.email) + '"' + (c.value === o.email ? ' selected' : '') + '>' +
              esc(o.name || o.email) + '</option>';
          }).join('') + '</select>';
      }
      if (def.type === 'bool') {
        return '<select class="cv-select cv-value" data-cv-value="' + i + '">' +
          [['yes', 'Yes'], ['no', 'No']].map(function (o) {
            return '<option value="' + o[0] + '"' + (c.value === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select>';
      }
      if (def.type === 'status') {
        var vals = [];
        if (window.titanStatus && window.titanStatus.values) {
          try { vals = window.titanStatus.values(pipeline.entity) || []; } catch (e) { vals = []; }
        }
        vals = vals.map(function (v) { return typeof v === 'string' ? v : (v && (v.label || v.key)) || ''; }).filter(Boolean);
        if (!vals.length) vals = ['New', 'In progress', 'Won', 'Lost'];
        return '<select class="cv-select cv-value" data-cv-value="' + i + '">' +
          vals.map(function (v) {
            return '<option value="' + esc(v) + '"' + (c.value === v ? ' selected' : '') + '>' + esc(v) + '</option>';
          }).join('') + '</select>';
      }
      return '<input class="cv-text cv-value" data-cv-value="' + i + '" ' +
        'type="' + (def.type === 'number' ? 'number' : 'text') + '" ' +
        'value="' + esc(c.value) + '" placeholder="' + (def.type === 'number' ? '10000' : 'Value') + '">';
    }

    function draw() {
      wrap.innerHTML = state.conditions.map(function (c, i) {
        return (i ? '<div class="cv-and">and</div>' : '') +
          '<div class="cv-row">' +
            '<select class="cv-select cv-field" data-cv-field="' + i + '">' +
              FIELDS.map(function (f) {
                return '<option value="' + f.id + '"' + (c.field === f.id ? ' selected' : '') + '>' + f.label + '</option>';
              }).join('') +
            '</select>' +
            '<select class="cv-select cv-op" data-cv-op="' + i + '">' +
              opsFor(c.field).map(function (o) {
                return '<option value="' + o[0] + '"' + (c.op === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('') +
            '</select>' +
            valueControl(c, i) +
            (state.conditions.length > 1
              ? '<button type="button" class="cv-del" data-cv-del="' + i + '" aria-label="Remove condition">' +
                '<span data-ds-icon="trash" data-size="15"></span></button>'
              : '') +
          '</div>';
      }).join('');
      if (window.dsIcon) window.dsIcon.hydrate(wrap);
      var n = opts.countMatching ? opts.countMatching(read()) : null;
      summary.textContent = describe(read(), pipeline) + (n === null ? '' : ' — ' + n + (n === 1 ? ' record' : ' records') + ' right now');
    }

    function read() {
      return { id: state.id, name: state.name.trim(), conditions: state.conditions };
    }

    host.addEventListener('click', function (e) {
      var del = e.target.closest('[data-cv-del]');
      if (del) { state.conditions.splice(+del.getAttribute('data-cv-del'), 1); draw(); return; }
      if (e.target.closest('[data-cv-add]')) {
        state.conditions.push(blankCondition(pipeline)); draw();
      }
    });
    host.addEventListener('change', function (e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-cv-field');
      if (f !== null && f !== undefined) {
        var c = state.conditions[+f];
        c.field = e.target.value;
        c.op = opsFor(c.field)[0][0];
        // The old value belongs to the old field's vocabulary; a stage key left in a
        // number box would silently never match. A field backed by a select takes its
        // first option, because a select showing an option it has not stored is a lie.
        c.value = firstValueFor(c.field, pipeline);
        draw(); return;
      }
      var o = e.target.getAttribute && e.target.getAttribute('data-cv-op');
      if (o !== null && o !== undefined) { state.conditions[+o].op = e.target.value; draw(); return; }
      var v = e.target.getAttribute && e.target.getAttribute('data-cv-value');
      if (v !== null && v !== undefined) { state.conditions[+v].value = e.target.value; draw(); }
    });
    host.addEventListener('input', function (e) {
      if (e.target.id === 'cv-name') { state.name = e.target.value; return; }
      var v = e.target.getAttribute && e.target.getAttribute('data-cv-value');
      if (v !== null && v !== undefined) { state.conditions[+v].value = e.target.value; draw(); }
    });

    draw();
    return {
      read: read,
      validate: function () {
        if (!opts.hideName && !state.name.trim()) return 'Give the view a name.';
        if (!state.conditions.some(function (c) { return String(c.value || '').trim(); })) {
          return 'Fill in at least one condition.';
        }
        return null;
      },
    };
  }

  window.titanViews = {
    FIELDS: FIELDS, OPS: OPS, blankCondition: blankCondition, firstValueFor: firstValueFor,
    list: list, byId: byId, match: match, apply: apply, describe: describe,
    newId: newId, mountEditor: mountEditor,
  };
})();
