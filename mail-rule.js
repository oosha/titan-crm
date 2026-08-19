// The "From incoming email" rule builder.
//
// Two surfaces offer this — crm.html's New Pipeline step 4 and pipeline-settings.html's
// Sources modal — and both used to hold their own copy of a textarea. A structured
// builder duplicated the same way would drift the moment one of them gained a field, so
// it lives here and both mount it, the way form-builder.js is shared.
//
//   var rule = titanMailRule.mount(hostEl, { value: pipeline.emailIntake,
//                                            accountEmail: 'ella@acme.com' });
//   rule.read()      -> the object to store on pipeline.emailIntake
//   rule.validate()  -> null, or a message to show the user
//
// Nothing scans mail. This is a saved intent, exactly as the free-text version was.
(function () {
  'use strict';

  // shape drives what a row renders to the right of the field select.
  //   address — a mode (email/domain) plus any number of values, ORed within the row
  //   text    — one substring
  //   none    — the field is the whole condition
  var FIELDS = [
    { id: 'from',        label: 'From',                  shape: 'address' },
    { id: 'sentTo',      label: 'Sent To',               shape: 'address' },
    { id: 'ccMe',        label: 'CC to me',              shape: 'none' },
    { id: 'subject',     label: 'Subject includes',      shape: 'text' },
    { id: 'subjectBody', label: 'Subject/body includes', shape: 'text' },
    { id: 'attachment',  label: 'Has attachment',        shape: 'none' },
  ];
  var MODES = [{ id: 'email', label: 'Email' }, { id: 'domain', label: 'Domain' }];

  function fieldDef(id) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) return FIELDS[i];
    return FIELDS[0];
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Prototype data. A real build would list the domain's mailboxes from the mail
  // service; the shape is what matters here — some you already have, some you must ask
  // for. `owned` is the whole difference.
  function mailboxesFor(accountEmail) {
    var at = String(accountEmail || '').indexOf('@');
    var domain = at === -1 ? 'avontechlabs.com' : accountEmail.slice(at + 1);
    var me = accountEmail || ('you@' + domain);
    return [
      { email: me,                          sub: 'You',           owned: true },
      { email: 'sales@' + domain,           sub: 'Shared inbox',  owned: true },
      { email: 'support@' + domain,         sub: 'Shared inbox',  owned: true },
      { email: 'usha.loutongbam@' + domain, sub: 'Usha Loutongbam',  owned: false },
      { email: 'rahul.mehta@' + domain,     sub: 'Rahul Mehta',      owned: false },
      { email: 'priya.nair@' + domain,      sub: 'Priya Nair',       owned: false },
    ];
  }

  function blankCondition() { return { field: 'from', mode: 'email', values: [], text: '' }; }

  // Legacy pipelines stored one free-text line. Dropping it would lose the only thing
  // that pipeline knew, so it is shown verbatim above the builder rather than guessed
  // into a condition — "anything asking about pricing" is not a substring match, and
  // silently turning it into one would change what the rule catches.
  function normalise(value) {
    var v = value || {};
    var conds = Array.isArray(v.conditions) ? v.conditions.slice() : [];
    return {
      mailboxes: Array.isArray(v.mailboxes) ? v.mailboxes.slice() : [],
      requested: Array.isArray(v.requested) ? v.requested.slice() : [],
      conditions: conds.length ? conds.map(function (c) {
        return { field: c.field || 'from', mode: c.mode || 'email',
                 values: Array.isArray(c.values) ? c.values.slice() : [], text: c.text || '' };
      }) : [blankCondition()],
      legacy: (!conds.length && v.rule) ? String(v.rule) : '',
    };
  }

  function conditionText(c) {
    var def = fieldDef(c.field);
    if (def.shape === 'none') return def.label;
    // Single curlies: the source-row summary this feeds is itself wrapped in “…”.
    if (def.shape === 'text') return def.label + ' ‘' + (c.text || '…') + '’';
    var vals = (c.values || []);
    if (!vals.length) return def.label + ' …';
    var what = c.mode === 'domain' ? 'domain ' : '';
    return def.label + ' ' + what + vals.join(' or ');
  }

  function isFilled(c) {
    var def = fieldDef(c.field);
    if (def.shape === 'none') return true;
    if (def.shape === 'text') return !!String(c.text || '').trim();
    return (c.values || []).length > 0;
  }

  window.titanMailRule = {
    FIELDS: FIELDS,

    mount: function (host, opts) {
      opts = opts || {};
      var state = normalise(opts.value);
      var boxes = mailboxesFor(opts.accountEmail);
      var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
      var open = false;

      host.innerHTML =
        '<div class="mr-sec">' +
          '<div class="mr-label">Which mailboxes should Titan watch?</div>' +
          '<div class="mr-hint">Mail arriving in these is checked against the conditions below.</div>' +
          '<div class="mr-mailbox-field" data-mr-mailbox>' +
            '<button type="button" class="mr-mailbox-trigger" data-mr-toggle>' +
              '<span class="mr-mailbox-summary" data-mr-mbsummary></span>' +
              '<span class="mr-caret" data-ds-icon="caret-down" data-size="14"></span>' +
            '</button>' +
            '<div class="mr-mailbox-panel" data-mr-mbpanel></div>' +
          '</div>' +
        '</div>' +
        '<div class="mr-sec">' +
          '<div class="mr-label">When an incoming email meets the below conditions</div>' +
          (state.legacy
            ? '<div class="mr-legacy">Your previous rule was “<strong>' + esc(state.legacy) +
              '</strong>”. Rebuild it below — it is kept until you save.</div>'
            : '') +
          '<div class="mr-conds" data-mr-conds></div>' +
          '<button type="button" class="mr-add" data-mr-add>+ Add a condition</button>' +
          '<div class="mr-summary" data-mr-summary></div>' +
        '</div>';

      var panel = host.querySelector('[data-mr-mbpanel]');
      var mbField = host.querySelector('[data-mr-mailbox]');
      var mbSummary = host.querySelector('[data-mr-mbsummary]');
      var condWrap = host.querySelector('[data-mr-conds]');
      var summaryEl = host.querySelector('[data-mr-summary]');
      var addBtn = host.querySelector('[data-mr-add]');

      function drawMailboxes() {
        var mine = boxes.filter(function (b) { return b.owned; });
        var others = boxes.filter(function (b) { return !b.owned; });
        function row(b) {
          var on = state.mailboxes.indexOf(b.email) !== -1;
          if (!b.owned) {
            var asked = state.requested.indexOf(b.email) !== -1;
            return '<div class="mr-mb is-locked">' +
              '<div class="mr-mb-text"><div class="mr-mb-email">' + esc(b.email) + '</div>' +
                '<div class="mr-mb-sub">' + esc(b.sub) + '</div></div>' +
              (asked
                ? '<span class="mr-mb-pending"><span data-ds-icon="clock" data-size="13"></span>Access requested</span>'
                : '<button type="button" class="mr-mb-ask" data-mr-ask="' + esc(b.email) + '">Request access</button>') +
            '</div>';
          }
          return '<label class="mr-mb is-selectable">' +
            '<input type="checkbox" class="mr-mb-check" data-mr-mb="' + esc(b.email) + '"' + (on ? ' checked' : '') + '>' +
            '<div class="mr-mb-text"><div class="mr-mb-email">' + esc(b.email) + '</div>' +
              '<div class="mr-mb-sub">' + esc(b.sub) + '</div></div>' +
          '</label>';
        }
        panel.innerHTML =
          '<div class="mr-mb-group">Mailboxes you can use</div>' + mine.map(row).join('') +
          (others.length ? '<div class="mr-mb-group">Needs the owner’s approval</div>' + others.map(row).join('') : '');

        var n = state.mailboxes.length;
        mbSummary.textContent = n === 0 ? 'Choose one or more mailboxes'
          : n === 1 ? state.mailboxes[0]
          : state.mailboxes[0] + ' and ' + (n - 1) + ' more';
        mbSummary.classList.toggle('is-empty', n === 0);
        if (window.dsIcon) window.dsIcon.hydrate(panel);
      }

      function drawConditions() {
        condWrap.innerHTML = state.conditions.map(function (c, i) {
          var def = fieldDef(c.field);
          var right;
          if (def.shape === 'none') {
            right = '<div class="mr-none">No value needed — this is the whole condition.</div>';
          } else if (def.shape === 'text') {
            right = '<input class="mr-text mr-value" type="text" data-mr-text="' + i + '" ' +
              'value="' + esc(c.text) + '" placeholder="Words to look for">';
          } else {
            right =
              '<select class="mr-select mr-mode-sel" data-mr-mode="' + i + '">' +
                MODES.map(function (m) {
                  return '<option value="' + m.id + '"' + (c.mode === m.id ? ' selected' : '') + '>' + m.label + '</option>';
                }).join('') +
              '</select>' +
              '<div class="mr-chips" data-mr-chips="' + i + '">' +
                (c.values || []).map(function (v, vi) {
                  return '<span class="mr-chip"><span>' + esc(v) + '</span>' +
                    '<button type="button" data-mr-unchip="' + i + ':' + vi + '" aria-label="Remove ' + esc(v) + '">&times;</button></span>';
                }).join('') +
                '<input class="mr-chip-input" type="text" data-mr-chipin="' + i + '" ' +
                  'placeholder="' + (c.mode === 'domain' ? 'acme.com' : 'name@acme.com') + '">' +
              '</div>';
          }
          return (i ? '<div class="mr-and">and</div>' : '') +
            '<div class="mr-row">' +
              '<select class="mr-select mr-field-sel" data-mr-field="' + i + '">' +
                FIELDS.map(function (f) {
                  return '<option value="' + f.id + '"' + (c.field === f.id ? ' selected' : '') + '>' + f.label + '</option>';
                }).join('') +
              '</select>' + right +
              (state.conditions.length > 1
                ? '<button type="button" class="mr-del" data-mr-del="' + i + '" aria-label="Remove condition">' +
                  '<span data-ds-icon="trash" data-size="15"></span></button>'
                : '') +
            '</div>';
        }).join('');
        if (window.dsIcon) window.dsIcon.hydrate(condWrap);
        drawSummary();
      }

      function drawSummary() {
        var filled = state.conditions.filter(isFilled);
        if (!state.mailboxes.length || !filled.length) {
          summaryEl.innerHTML = '';
          return;
        }
        summaryEl.innerHTML = 'Mail in <strong>' + esc(state.mailboxes.join(', ')) + '</strong> where ' +
          filled.map(function (c) { return '<strong>' + esc(conditionText(c)) + '</strong>'; }).join(' and ') +
          ' becomes a new record.';
      }

      function changed() { drawSummary(); onChange(); }

      // One delegated listener: rows are re-rendered on every edit, so anything bound
      // to a row would be bound to an element that no longer exists.
      host.addEventListener('click', function (e) {
        var t = e.target;
        var toggle = t.closest('[data-mr-toggle]');
        if (toggle) { open = !open; mbField.classList.toggle('is-open', open); return; }

        var ask = t.closest('[data-mr-ask]');
        if (ask) {
          var who = ask.getAttribute('data-mr-ask');
          if (state.requested.indexOf(who) === -1) state.requested.push(who);
          drawMailboxes();
          if (typeof opts.onRequestAccess === 'function') opts.onRequestAccess(who);
          changed();
          return;
        }

        var del = t.closest('[data-mr-del]');
        if (del) { state.conditions.splice(+del.getAttribute('data-mr-del'), 1); drawConditions(); changed(); return; }

        var unchip = t.closest('[data-mr-unchip]');
        if (unchip) {
          var parts = unchip.getAttribute('data-mr-unchip').split(':');
          state.conditions[+parts[0]].values.splice(+parts[1], 1);
          drawConditions(); changed(); return;
        }

        if (t.closest('[data-mr-add]')) { state.conditions.push(blankCondition()); drawConditions(); changed(); return; }

        var chips = t.closest('[data-mr-chips]');
        if (chips) { var inp = chips.querySelector('.mr-chip-input'); if (inp) inp.focus(); return; }

        // Clicking away closes the mailbox panel, but a click inside it must not.
        if (open && !t.closest('[data-mr-mailbox]')) { open = false; mbField.classList.remove('is-open'); }
      });

      host.addEventListener('change', function (e) {
        var f = e.target.getAttribute && e.target.getAttribute('data-mr-field');
        if (f !== null && f !== undefined) {
          var c = state.conditions[+f];
          c.field = e.target.value;
          // Values from the previous shape would be invisible but still saved.
          c.values = []; c.text = '';
          drawConditions(); changed(); return;
        }
        var m = e.target.getAttribute && e.target.getAttribute('data-mr-mode');
        if (m !== null && m !== undefined) { state.conditions[+m].mode = e.target.value; drawConditions(); changed(); return; }
        var mb = e.target.getAttribute && e.target.getAttribute('data-mr-mb');
        if (mb) {
          var at = state.mailboxes.indexOf(mb);
          if (e.target.checked && at === -1) state.mailboxes.push(mb);
          else if (!e.target.checked && at !== -1) state.mailboxes.splice(at, 1);
          drawMailboxes(); changed();
        }
      });

      host.addEventListener('input', function (e) {
        var t = e.target.getAttribute && e.target.getAttribute('data-mr-text');
        if (t !== null && t !== undefined) { state.conditions[+t].text = e.target.value; changed(); }
      });

      // Enter or comma commits a chip; Backspace on an empty input removes the last,
      // which is what every other chip field people use does.
      host.addEventListener('keydown', function (e) {
        var i = e.target.getAttribute && e.target.getAttribute('data-mr-chipin');
        if (i === null || i === undefined) return;
        var c = state.conditions[+i];
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          var v = e.target.value.trim().replace(/,$/, '');
          if (v && c.values.indexOf(v) === -1) { c.values.push(v); drawConditions(); changed(); }
          else e.target.value = '';
          var again = condWrap.querySelector('[data-mr-chipin="' + i + '"]');
          if (again) again.focus();
        } else if (e.key === 'Backspace' && !e.target.value && c.values.length) {
          c.values.pop(); drawConditions(); changed();
          var back = condWrap.querySelector('[data-mr-chipin="' + i + '"]');
          if (back) back.focus();
        }
      });

      // A value typed but never committed is still what the person meant.
      host.addEventListener('blur', function (e) {
        var i = e.target.getAttribute && e.target.getAttribute('data-mr-chipin');
        if (i === null || i === undefined) return;
        var v = e.target.value.trim();
        if (!v) return;
        var c = state.conditions[+i];
        if (c.values.indexOf(v) === -1) { c.values.push(v); drawConditions(); changed(); }
      }, true);

      drawMailboxes();
      drawConditions();
      // The trigger's caret sits outside both redraw roots, so it needs the one
      // pass over the whole host that the section-level redraws never cover.
      if (window.dsIcon) window.dsIcon.hydrate(host);

      return {
        validate: function () {
          if (!state.mailboxes.length) return 'Choose at least one mailbox to watch.';
          if (!state.conditions.some(isFilled)) return 'Add a condition — otherwise every email would match.';
          return null;
        },
        read: function () {
          var filled = state.conditions.filter(isFilled);
          return {
            enabled: true,
            mailboxes: state.mailboxes.slice(),
            requested: state.requested.slice(),
            conditions: filled,
            // Kept so the source rows and `hasMailRule` checks that already read
            // `.rule` keep working without every caller learning the new shape.
            rule: filled.map(conditionText).join(' and '),
          };
        },
      };
    },
  };
})();
