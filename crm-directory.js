// Shared bootstrap for the CRM directory pages (Contacts, Companies).
//
// Both pages are standalone deep links: like opportunity-view.html they build their
// own sidebar and fetch their own data from /api/data, rather than depending on
// crm.html having stashed state in sessionStorage on the way out. That's what makes
// /crm/contacts and /crm/companies work when opened or refreshed directly.
(function () {
  window.PERSONA_ID = (function () {
    var raw = new URLSearchParams(location.search).get('u');
    var u = (raw && /^[a-z0-9_-]{1,32}$/.test(raw)) ? raw.toLowerCase() : null;
    return u || 'default';
  })();

  // Preserves ?u=<persona> (and ?apiBase=... for local testing) across in-app links.
  window.crmPath = function (suffix) { return (suffix || '/crm') + location.search; };

  // Deep link to one contact on the Contacts page — the mirror of companyHref, so a
  // person named anywhere in the app can be opened where they actually live.
  // Keyed by email because that is what contacts are deduplicated by; falls back to
  // the name for the rare record that has one without the other.
  // Only the environment params travel: copying the whole query dragged the current
  // page's own deep-link param along, so opening a person from a company's panel
  // produced /crm/contacts?company=Delta+Retail&contact=… — a stale company filter
  // riding on a contacts URL.
  function envQuery() {
    var from = new URLSearchParams(location.search), q = new URLSearchParams();
    ['u', 'apiBase'].forEach(function (k) { if (from.get(k)) q.set(k, from.get(k)); });
    return q;
  }
  window.contactHref = function (contact) {
    var q = envQuery();
    var email = String((contact && contact.email) || '').trim();
    if (email) q.set('contact', email);
    else q.set('contactName', String((contact && contact.name) || '').trim());
    return '/crm/contacts?' + q.toString();
  };

  // Deep link to one company on the Companies page. Keeps the current query
  // (persona, apiBase) and adds the company to open on arrival.
  window.companyHref = function (company) {
    var q = envQuery();
    q.set('company', company);
    return '/crm/companies?' + q.toString();
  };

  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  // Many designations already carry the employer ("Backend Engineer at Delta
  // Retail"), so a view that also names the company ends up saying it twice. This
  // drops a trailing "at <employer>" when it names the company being shown
  // alongside — matched loosely, since the stored designation and the record's
  // company field disagree on suffixes ("Brightpath" vs "Brightpath Co").
  // Anything that doesn't match is left exactly as typed.
  function sameOrg(a, b) {
    var norm = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var x = norm(a), y = norm(b);
    return !!x && !!y && (x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0);
  }
  window.titleWithoutOrg = function (designation, company) {
    var m = String(designation || '').match(/^(.*\S)\s+at\s+(\S.*)$/i);
    return (m && sameOrg(m[2], company)) ? m[1] : designation;
  };

  // ── Company logo — same derivation and fallback as crm.html / opportunity-view.html ──
  // An @gmail.com address says nothing about a company's domain, so consumer
  // providers never contribute a logo.
  var GENERIC_EMAIL_DOMAINS = [
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
    'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'mail.com', 'zoho.com',
    'yandex.com', 'qq.com', '163.com', 'titan.email',
  ];
  window.companyDomainFor = function (rec) {
    var site = String((rec && rec.website) || '').trim();
    if (site) {
      var d = site.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();
      if (d.indexOf('.') !== -1) return d;
    }
    var email = String((rec && (rec.contactEmail || rec.email || ((rec.contacts || [])[0] || {}).email)) || '').trim();
    var at = email.lastIndexOf('@');
    if (at !== -1) {
      var ed = email.slice(at + 1).toLowerCase();
      if (ed.indexOf('.') !== -1 && GENERIC_EMAIL_DOMAINS.indexOf(ed) === -1) return ed;
    }
    return '';
  };
  // Goes through /api/logo, which turns "no icon for this domain" into a real 404 so
  // the initial underneath shows through (see api/logo.js).
  window.companyLogoHTML = function (rec) {
    var name = String((rec && rec.company) || '').trim();
    var initial = (name.charAt(0) || '?').toUpperCase();
    var domain = window.companyDomainFor(rec);
    return '<span class="company-logo">' + window.esc(initial) +
      (domain ? '<img src="/api/logo?domain=' + encodeURIComponent(domain) + '" alt="" onerror="this.remove()">' : '') +
      '</span>';
  };

  // Records don't all carry their own currency, so fall back to the persona
  // account's symbol (loaded by the persona script in <head>) the way crm.html does.
  window.defaultCurrency = function () {
    var p = (window.TITAN_PERSONAS || {})[window.PERSONA_ID];
    return (p && p.account && p.account.currency && p.account.currency.symbol) || '$';
  };

  // The whole fetched document is kept so saves can write it back intact —
  // pipelines plus any top-level keys (contactFields) the other pages don't model.
  window.DATA = null;

  window.fetchPipelineData = async function () {
    var res = await fetch('/api/data?persona=' + encodeURIComponent(window.PERSONA_ID), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load data (' + res.status + ')');
    window.DATA = await res.json();
    return window.DATA;
  };

  window.saveData = async function () {
    var res = await fetch('/api/data?persona=' + encodeURIComponent(window.PERSONA_ID), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window.DATA),
    });
    if (!res.ok) throw new Error('Save failed (' + res.status + ')');
  };

  // ── Contact field schema ───────────────────────────────────────────────────
  // What a contact "is". Stored on the data document as contactFields so it
  // survives alongside the records; the built-in seven are what every record
  // already carried before this was configurable.
  //
  // name and email are locked: name is what the row shows, and email is the key
  // contacts are deduplicated by across records. Removing either would leave
  // people unidentifiable or silently merged.
  window.DEFAULT_CONTACT_FIELDS = [
    { key: 'name', label: 'Name', type: 'text', locked: true },
    { key: 'email', label: 'Email', type: 'email', locked: true },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'designation', label: 'Designation', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'linkedin', label: 'LinkedIn', type: 'url' },
  ];

  window.contactFields = function () {
    var f = window.DATA && window.DATA.contactFields;
    return (Array.isArray(f) && f.length) ? f : window.DEFAULT_CONTACT_FIELDS.slice();
  };

  window.setContactFields = async function (fields) {
    if (!window.DATA) throw new Error('No data loaded');
    window.DATA.contactFields = fields;
    await window.saveData();
  };

  // Turns a label into a storage key that won't collide with an existing one.
  window.fieldKeyFor = function (label, taken) {
    var base = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
    var key = base, i = 2;
    while (taken.indexOf(key) !== -1) { key = base + '_' + i; i++; }
    return key;
  };

  // The sidebar — its markup, its pipeline rows, its cache and its active state —
  // belongs to titan-sidebar.js, which every CRM page loads. It used to be
  // reimplemented here as well (and in crm.html, and in opportunity-view.html),
  // which is how the four copies drifted apart. Pages hand their fetched
  // pipelines over with titanSidebar.setPipelines(); nothing else here touches
  // the nav.

  // Every card across every pipeline, tagged with the pipeline it came from so rows
  // can link back to the right /crm/pipeline/<id>/record/<id>.
  window.allCards = function (pipelines) {
    var out = [];
    Object.keys(pipelines || {}).forEach(function (pid) {
      var pl = pipelines[pid];
      (pl.cards || []).forEach(function (card) { out.push({ card: card, pipeline: pl, pipelineId: pid }); });
    });
    return out;
  };

  // A record's contacts, normalised: the contacts[] array when present, else the
  // legacy flat contact* fields that older records still use.
  window.contactsOf = function (card) {
    if (card.contacts && card.contacts.length) {
      return card.contacts.filter(function (c) { return (c && (c.name || c.email)); });
    }
    if (!card.contact && !card.contactEmail) return [];
    return [{
      name: card.contact || '', email: card.contactEmail || '', phone: card.contactPhone || '',
      designation: card.contactDesignation || '', department: card.contactDepartment || '',
      location: card.contactLocation || '', linkedin: card.contactLinkedin || '',
    }];
  };

  // The records cell. Chips stack vertically and the row grows to fit them, so
  // several records can each be read in full rather than one being legible and
  // the rest collapsing into a count. Past three the row starts to dominate the
  // list's rhythm, so the tail is summarised and the panel lists every one.
  window.recordChipsHTML = function (records, max) {
    var cap = max || 3;
    var extra = records.length - cap;
    return '<div class="dir-chips">' +
      records.slice(0, cap).map(window.recordChipHTML).join('') +
      (extra > 0 ? '<span class="dir-chip dir-chip-more">+' + extra + ' more</span>' : '') +
    '</div>';
  };

  // Activity is stored as human text ("2d ago"), so rank by that rather than
  // parsing a date that isn't there.
  var RECENCY = { 'just now': 0, 'today': 1, 'yesterday': 2 };
  var UNITS = { h: 1 / 24, d: 1, w: 7, m: 30, y: 365 };
  window.recencyRank = function (s) {
    var t = String(s || '').trim().toLowerCase();
    if (t in RECENCY) return RECENCY[t];
    var m = t.match(/^(\d+)\s*([hdwmy])/);
    if (!m) return Infinity;
    return 3 + Number(m[1]) * (UNITS[m[2]] || 1);
  };
  // The most recent touch across every record a row is attached to.
  window.lastActivityOf = function (records) {
    var best = null;
    records.forEach(function (e) {
      if (!e.card.lastActivity) return;
      if (!best || window.recencyRank(e.card.lastActivity) < window.recencyRank(best.card.lastActivity)) best = e;
    });
    return best;
  };
  window.lastActivityCellHTML = function (entry) {
    if (!entry) return '<span class="dir-muted">—</span>';
    return '<div>' + window.esc(entry.card.lastActivity) + '</div>' +
      (entry.card.activityType ? '<div class="dir-sub">' + window.esc(entry.card.activityType) + '</div>' : '');
  };
  // Per-symbol totals — records in a pipeline can carry different currencies,
  // and adding unlike amounts together would quietly invent a number.
  window.totalsText = function (totals) {
    return Object.keys(totals).filter(function (c) { return totals[c] > 0; })
      .map(function (c) { return c + Number(totals[c]).toLocaleString(); }).join(' · ');
  };

  window.recordChipHTML = function (entry) {
    var href = window.crmPath('/crm/pipeline/' + encodeURIComponent(entry.pipelineId) + '/record/' + encodeURIComponent(entry.card.id));
    return '<a class="dir-chip" href="' + href + '" title="' + window.esc(entry.pipeline.name) + '">' +
      '<span class="dir-chip-dot" style="background:' + window.esc(entry.pipeline.color || '#2170f4') + ';"></span>' +
      window.esc(entry.card.deal || 'Untitled') + '</a>';
  };

  // Live filter over the rendered rows — each row carries its own searchable text.
  window.wireSearch = function (inputId, tbodyId, countId, noun) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var rows = document.querySelectorAll('#' + tbodyId + ' tr');
      var shown = 0;
      rows.forEach(function (tr) {
        var hit = !q || (tr.dataset.search || '').indexOf(q) !== -1;
        tr.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      var countEl = document.getElementById(countId);
      if (countEl) countEl.textContent = shown + ' ' + (shown === 1 ? noun : noun + 's');
    });
  };

  // ── Avatars ────────────────────────────────────────────────────────────────
  // A stable hue per name. Scanning a directory is mostly recognition, and a
  // person's chip being reliably the same colour is a faster cue than reading
  // the initial. Saturation and lightness are fixed so the set stays quiet.
  window.avatarHTML = function (name, cls) {
    var s = String(name || '').trim();
    var initial = (s.charAt(0) || '?').toUpperCase();
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return '<span class="dir-avatar' + (cls ? ' ' + cls : '') +
      '" style="background:hsl(' + h + ',38%,52%)"' +
      (s ? ' title="' + window.esc(s) + '"' : '') + '>' + window.esc(initial) + '</span>';
  };

  window.fmtMoney = function (value, currency) {
    var n = Number(value) || 0;
    return (currency || window.defaultCurrency()) + n.toLocaleString();
  };

  // ── Stage track ────────────────────────────────────────────────────────────
  // Where a record actually sits in its pipeline, drawn in that pipeline's own
  // colour. Naming the stage alone loses the thing you want at a glance: how
  // far along it is, and how much is left.
  window.stageTrackHTML = function (pipeline, card) {
    var stages = (pipeline && pipeline.stages) || [];
    if (!stages.length) return '';
    var idx = -1;
    for (var i = 0; i < stages.length; i++) if (stages[i].key === card.stage) { idx = i; break; }
    if (idx === -1) return '';
    var color = pipeline.color || '#2170f4';
    var segs = stages.map(function (s, i) {
      return '<span class="stage-seg' + (i <= idx ? ' is-done' : '') + '"></span>';
    }).join('');
    return '<div class="stage-track" style="--pipe:' + window.esc(color) + '">' + segs + '</div>' +
      '<div class="stage-caption">' + window.esc(stages[idx].label) +
      ' · step ' + (idx + 1) + ' of ' + stages.length + '</div>';
  };

  // A linked record, as it appears inside the panel.
  window.panelRecordHTML = function (entry) {
    var card = entry.card, pl = entry.pipeline;
    var href = window.crmPath('/crm/pipeline/' + encodeURIComponent(entry.pipelineId) + '/record/' + encodeURIComponent(card.id));
    return '<a class="dir-rec" href="' + href + '">' +
      '<div class="dir-rec-top">' +
        '<span class="dir-rec-deal">' + (window.esc(card.deal) || 'Untitled') + '</span>' +
        (card.value ? '<span class="dir-rec-value">' + window.esc(window.fmtMoney(card.value, card.currency)) + '</span>' : '') +
      '</div>' +
      '<div class="dir-rec-pipe">' +
        '<span class="dir-chip-dot" style="background:' + window.esc(pl.color || '#2170f4') + '"></span>' +
        window.esc(pl.name || '') +
      '</div>' +
      window.stageTrackHTML(pl, card) +
    '</a>';
  };

  // Only renders the fields that actually have a value — a panel full of dashes
  // reads as broken rather than as empty.
  // pairs: [label, value, valueHTML?] — valueHTML wins when the value needs to be
  // a link; otherwise the plain value is escaped.
  window.kvHTML = function (pairs) {
    var rows = pairs.filter(function (p) { return p[1]; }).map(function (p) {
      return '<dt>' + window.esc(p[0]) + '</dt><dd>' + (p[2] || window.esc(p[1])) + '</dd>';
    });
    return rows.length ? '<dl class="dir-kv">' + rows.join('') + '</dl>' : '';
  };

  // ── Pipeline types ─────────────────────────────────────────────────────────
  // A pipeline isn't always a sales pipeline. A hiring pipeline moves candidates,
  // not money — showing it a "won amount" tile would be showing it a column of
  // zeroes. The type is what says which questions are worth asking of a pipeline,
  // and `money` is the one that matters most: false means every currency figure
  // is dropped rather than rendered as 0.
  //
  // Pipelines written before types existed carry no `type`; they're sales.
  window.PIPELINE_TYPES = [
    { id: 'sales',  label: 'Sales',  money: true,  rateLabel: 'win rate' },
    { id: 'hiring', label: 'Hiring', money: false, rateLabel: 'hire rate' },
  ];
  window.pipelineTypeOf = function (pl) {
    var id = (pl && pl.type) || 'sales';
    return window.PIPELINE_TYPES.filter(function (t) { return t.id === id; })[0] || window.PIPELINE_TYPES[0];
  };
  window.pipelineHasMoney = function (pl) { return window.pipelineTypeOf(pl).money; };

  // What a pipeline calls its records — every pipeline defines its own entity
  // ("Opportunity"/"opportunities", "Order"/"orders", "Project"/"projects"), so
  // say that rather than the generic "record". A row spanning pipelines that
  // disagree falls back to "record", since there's no one right noun for a set
  // that mixes opportunities and orders.
  window.entityNoun = function (records, n) {
    var seen = {};
    records.forEach(function (e) {
      var pl = e.pipeline || {};
      if (pl.entity && pl.plural) seen[pl.entity + '|' + pl.plural] = pl;
    });
    var keys = Object.keys(seen);
    if (keys.length === 1) {
      var pl = seen[keys[0]];
      return n === 1 ? pl.entity.toLowerCase() : pl.plural.toLowerCase();
    }
    return n === 1 ? 'record' : 'records';
  };

  // aside is optional trailing HTML for the heading row — a total, a status —
  // which belongs beside the label it qualifies rather than trailing the section.
  window.sectionHTML = function (label, inner, aside) {
    if (!inner) return '';
    return '<div class="dir-sec">' +
      '<div class="dir-sec-head">' +
        '<div class="dir-sec-label">' + window.esc(label) + '</div>' +
        (aside ? '<span class="dir-sec-aside">' + aside + '</span>' : '') +
      '</div>' + inner +
    '</div>';
  };

  // ── Detail panel ───────────────────────────────────────────────────────────
  // Opens beside the table rather than over it, so the list you were reading
  // stays on screen and the row you picked stays marked.
  var panelEl = null, scrimEl = null, selectedRow = null, rowRenderer = null;

  function ensurePanel() {
    if (panelEl) return;
    var win = document.querySelector('.app-window');
    scrimEl = document.createElement('div');
    scrimEl.className = 'dir-scrim';
    scrimEl.addEventListener('click', window.closePanel);
    panelEl = document.createElement('aside');
    panelEl.className = 'dir-panel';
    panelEl.setAttribute('aria-label', 'Details');
    panelEl.setAttribute('aria-hidden', 'true');
    win.appendChild(panelEl);
    document.body.appendChild(scrimEl);
  }

  window.closePanel = function () {
    if (!panelEl) return;
    panelEl.classList.remove('is-open');
    panelEl.setAttribute('aria-hidden', 'true');
    scrimEl.classList.remove('is-open');
    document.body.classList.remove('has-panel');
    if (selectedRow) { selectedRow.classList.remove('is-selected'); selectedRow.setAttribute('aria-selected', 'false'); }
    selectedRow = null;
  };

  // head: {avatar, name, role}  body: HTML string
  window.openPanel = function (head, bodyHTML, row) {
    ensurePanel();
    if (selectedRow) { selectedRow.classList.remove('is-selected'); selectedRow.setAttribute('aria-selected', 'false'); }
    selectedRow = row || null;
    if (selectedRow) { selectedRow.classList.add('is-selected'); selectedRow.setAttribute('aria-selected', 'true'); }

    var wasOpen = panelEl.classList.contains('is-open');
    var previous = panelEl.querySelector('.dir-panel-inner:not(.dir-panel-ghost)');

    var inner = document.createElement('div');
    inner.className = 'dir-panel-inner';
    inner.innerHTML =
      '<div class="dir-panel-head">' +
        head.avatar +
        '<div class="dir-panel-id">' +
          '<div class="dir-panel-name">' + head.name + '</div>' +
          (head.role ? '<div class="dir-panel-role">' + head.role + '</div>' : '') +
        '</div>' +
        '<button class="dir-panel-close" type="button" aria-label="Close details">' +
          '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="dir-panel-body">' + bodyHTML + '</div>';

    if (wasOpen && previous) {
      // The new content has to be in the DOM before this call returns — callers
      // wire up their handlers immediately after. So the outgoing content stays
      // as an absolutely-positioned copy that animates out on top, rather than
      // deferring the swap behind a timer.
      previous.classList.add('dir-panel-ghost');
      // Its ids would otherwise be duplicated in the document for the ~200ms it
      // lingers, and getElementById would find the dying copy first.
      previous.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
      previous.addEventListener('animationend', function () { previous.remove(); }, { once: true });
      inner.classList.add('is-swapping');
      inner.addEventListener('animationend', function () { inner.classList.remove('is-swapping'); }, { once: true });
      panelEl.appendChild(inner);
    } else {
      panelEl.innerHTML = '';
      panelEl.appendChild(inner);
    }

    inner.querySelector('.dir-panel-close').addEventListener('click', window.closePanel);
    inner.querySelector('.dir-panel-body').scrollTop = 0;
    panelEl.classList.add('is-open');
    panelEl.setAttribute('aria-hidden', 'false');
    scrimEl.classList.add('is-open');
    document.body.classList.add('has-panel');   // narrows the table's column set
  };

  // The live panel contents — never the outgoing copy. Page code must scope its
  // queries to this while a swap is in flight, or it will find the dying nodes.
  window.panelRoot = function () {
    return (panelEl && panelEl.querySelector('.dir-panel-inner:not(.dir-panel-ghost)')) || document;
  };

  // ── Modal shell ────────────────────────────────────────────────────────────
  // Generic scrim + card. The caller supplies the body and the footer buttons,
  // and gets back handles so it can drive its own status line.
  window.openModal = function (opts) {
    var scrim = document.createElement('div');
    scrim.className = 'dir-modal-scrim';
    scrim.innerHTML =
      '<div class="dir-modal" role="dialog" aria-modal="true" aria-label="' + window.esc(opts.title) + '">' +
        '<div class="dir-modal-head">' +
          '<div class="dir-modal-title">' + window.esc(opts.title) + '</div>' +
          (opts.note ? '<div class="dir-modal-note">' + opts.note + '</div>' : '') +
        '</div>' +
        '<div class="dir-modal-body"></div>' +
        '<div class="dir-modal-foot">' +
          '<span class="dir-modal-status"></span>' +
          '<button class="dir-btn" data-act="cancel" type="button">' + window.esc(opts.cancelLabel || 'Cancel') + '</button>' +
          '<button class="dir-btn dir-btn-primary" data-act="confirm" type="button">' + window.esc(opts.confirmLabel || 'Save') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(scrim);
    var body = scrim.querySelector('.dir-modal-body');
    var status = scrim.querySelector('.dir-modal-status');
    var confirm = scrim.querySelector('[data-act="confirm"]');
    if (opts.body) body.appendChild(opts.body);

    function close() {
      scrim.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { scrim.remove(); }, 180);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    scrim.querySelector('[data-act="cancel"]').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    var handle = {
      close: close,
      body: body,
      setStatus: function (msg, isError) {
        status.textContent = msg || '';
        status.classList.toggle('is-error', !!isError);
      },
      setBusy: function (busy) { confirm.disabled = !!busy; },
    };
    confirm.addEventListener('click', function () { opts.onConfirm(handle); });
    requestAnimationFrame(function () { scrim.classList.add('is-open'); });
    var focusable = body.querySelector('input, select, button');
    if (focusable) focusable.focus();
    return handle;
  };

  // Rows behave like a listbox: click or Enter opens, arrows walk the visible
  // rows with the panel following, Escape closes and returns focus to the row.
  window.wireRows = function (tbodyId, render) {
    rowRenderer = render;
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    function visibleRows() {
      return Array.prototype.filter.call(tbody.querySelectorAll('tr'), function (tr) { return tr.style.display !== 'none'; });
    }
    function open(tr) { if (tr) { tr.focus(); render(Number(tr.dataset.idx), tr); } }

    tbody.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;            // chips and mailto links keep their own behaviour
      var tr = e.target.closest('tr');
      if (tr) render(Number(tr.dataset.idx), tr);
    });
    tbody.addEventListener('keydown', function (e) {
      var tr = e.target.closest('tr');
      if (!tr) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); render(Number(tr.dataset.idx), tr); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var rows = visibleRows(), i = rows.indexOf(tr);
        var next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) { next.scrollIntoView({ block: 'nearest' }); open(next); }
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var row = selectedRow;
      window.closePanel();
      if (row) row.focus();
    });
  };
})();
