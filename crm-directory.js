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

  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
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

  window.fetchPipelineData = async function () {
    var res = await fetch('/api/data?persona=' + encodeURIComponent(window.PERSONA_ID), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load data (' + res.status + ')');
    return res.json();
  };

  // Sidebar pipeline rows — same markup/behaviour crm.html builds at load time.
  window.rebuildPipelineNav = function (list) {
    var line = document.getElementById('pipeline-nav-line');
    if (!line) return;
    var n = line.nextElementSibling;
    while (n && !n.classList.contains('sidebar-line')) { var next = n.nextElementSibling; n.remove(); n = next; }
    var after = line;
    list.forEach(function (pl) {
      var item = document.createElement('div');
      item.className = 'nav-item';
      item.dataset.pipelineId = pl.id;
      item.onclick = function () { location.href = window.crmPath('/crm/pipeline/' + encodeURIComponent(pl.id)); };
      item.innerHTML =
        '<div class="nav-item-icon"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.2H9.6L12.4 7L9.6 10.8H2L4.4 7L2 3.2Z" fill="' + (pl.color || '#2170f4') + '"/></svg></div>' +
        '<span class="nav-item-label"></span>';
      item.querySelector('.nav-item-label').textContent = pl.name;
      after.after(item);
      after = item;
    });
  };

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
})();
