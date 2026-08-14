// Record owner — who on the team a record belongs to.
//
// One module because five surfaces need the same answer to "who can own a record
// here": the board, the record page, the add-record page, pipeline settings, and
// the mailbox's CRM panel. The mailbox loads neither titan-sidebar.js nor
// crm-directory.js, so this is deliberately standalone — no imports, no globals
// beyond window.titanOwner.
//
// Shape, stored on the card so a name survives someone leaving the team:
//   card.owner            = { name, email }
//   pipeline.defaultOwner = { name, email }   // applied to new records
//
// Who can own: the account holder plus everyone invited to that pipeline
// (pipeline.team, written by crm.html's Add team modal). A pipeline with no team
// still offers the account holder, so the field is never an empty dropdown.
(function () {
  // The signed-in account. Personas carry their own; the default demo account is
  // the one the static markup shows.
  function account() {
    var p = (window.TITAN_PERSONAS || {})[window.PERSONA_ID];
    if (p && p.account && p.account.email) {
      return { name: p.account.name || p.account.email, email: p.account.email };
    }
    return { name: 'Ella Henderson', email: 'ella.henderson@avontechlabs.com' };
  }

  function sameEmail(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  // Account holder first, then the invited team, de-duplicated by email.
  function people(pipeline) {
    var out = [account()];
    ((pipeline && pipeline.team) || []).forEach(function (m) {
      if (!m || !m.email) return;
      if (out.some(function (p) { return sameEmail(p.email, m.email); })) return;
      out.push({ name: m.name || m.email, email: m.email });
    });
    return out;
  }

  // Normalises whatever is stored — an object, or a bare email string from an
  // older record — into { name, email }, resolving the name against the roster.
  function normalize(owner, pipeline) {
    if (!owner) return null;
    var email = typeof owner === 'string' ? owner : owner.email;
    if (!email) return null;
    var known = people(pipeline).find(function (p) { return sameEmail(p.email, email); });
    return { name: (owner && owner.name) || (known && known.name) || email, email: email };
  }

  // What a new record on this pipeline gets. Falls back to the account holder so
  // a record is never ownerless — someone is always accountable for it.
  function defaultOwner(pipeline) {
    return normalize(pipeline && pipeline.defaultOwner, pipeline) || account();
  }

  function label(owner) {
    var o = normalize(owner, null);
    return o ? o.name : 'Unassigned';
  }

  function initial(owner) {
    var o = normalize(owner, null);
    return ((o && o.name) || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // <option> list for a native select. `selected` may be an owner object or email.
  // includeUnassigned adds an explicit empty choice — used by pipeline settings,
  // where "no default" is a real answer, but not by a record, which always has one.
  function optionsHtml(pipeline, selected, includeUnassigned) {
    var sel = normalize(selected, pipeline);
    var html = includeUnassigned
      ? '<option value=""' + (sel ? '' : ' selected') + '>Unassigned</option>'
      : '';
    // An owner who has since left the pipeline's team would otherwise vanish from
    // the dropdown and read as a silent reassignment — keep them listed.
    var list = people(pipeline).slice();
    if (sel && !list.some(function (p) { return sameEmail(p.email, sel.email); })) list.push(sel);
    return html + list.map(function (p) {
      return '<option value="' + esc(p.email) + '"' +
        (sel && sameEmail(sel.email, p.email) ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }

  // Turns a select's value back into a storable owner.
  function fromEmail(email, pipeline) {
    if (!email) return null;
    return normalize({ email: email }, pipeline);
  }

  window.titanOwner = {
    account: account, people: people, normalize: normalize,
    defaultOwner: defaultOwner, label: label, initial: initial,
    optionsHtml: optionsHtml, fromEmail: fromEmail, sameEmail: sameEmail,
  };
})();
