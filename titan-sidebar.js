// The CRM sidebar, as one component.
//
// Every page under /crm gets its nav from here: this file owns the markup, the
// account switcher, the pipeline rows, the three-dot menu and the footer.
// Pair it with titan-sidebar.css, which owns all of the matching styles.
//
// A page's whole involvement is:
//
//   <link rel="stylesheet" href="/titan-sidebar.css">
//   <div id="sidebar-mount"></div>
//   <script src="/titan-sidebar.js"></script>
//
// Rules that keep this from forking again — it already forked four ways once:
//
//   1. A page must not contain sidebar markup or sidebar CSS. If the nav needs
//      to change, it changes here, once.
//   2. Active state is derived from location.pathname, in here. A page never
//      announces "I am the dashboard" — that is how the copies drifted, each
//      marking a different item and hanging its separators in a different slot.
//   3. Nothing about the sidebar is stored except a pipeline-row *data* cache,
//      which is safe to be stale for one paint and is reconciled on fetch. This
//      replaces stashing crm.html's rendered sidebar HTML in sessionStorage and
//      replaying it, which is what made sub-pages show a frozen sidebar — or, on
//      a deep link with nothing stashed, an empty black column.
//   4. No window.opener dependencies. Sub-pages navigate in place, so there is no
//      opener to call into; actions only crm.html can perform travel as an
//      ?intent= parameter instead of degrading to an alert().
//
// Data: pages that already fetch /api/data declare <body data-sidebar-data="page">
// and hand the list over with titanSidebar.setPipelines(). Pages that fetch
// nothing (the settings and add-record pages) get a self-fetch from here, so a
// deep link into one of them still has a real sidebar.
(function () {

  // ── Environment ────────────────────────────────────────────────────────────
  // crm-directory.js defines these too and runs first where it is loaded at all;
  // these fallbacks are for the pages that don't load it.
  if (typeof window.PERSONA_ID !== 'string') {
    window.PERSONA_ID = (function () {
      var raw = new URLSearchParams(location.search).get('u');
      var u = (raw && /^[a-z0-9_-]{1,32}$/.test(raw)) ? raw.toLowerCase() : null;
      return u || 'default';
    })();
  }
  // The sidebar navigates through its own helper, under its own name. It must not
  // call a page-defined one: crm.html has a crmPath(pipelineId, suffix) that builds
  // /crm/pipeline/<id>…, while crm-directory.js has a crmPath(suffix) that prefixes
  // a whole path. Same name, incompatible meanings — the shared markup calling
  // crmPath('/crm/dashboard') therefore sent the board to
  // /crm/pipeline/%2Fcrm%2Fdashboard. Anything the component links to goes through
  // titanSidebarGo, which nothing else defines.
  // Merges rather than concatenates. This appended the current query wholesale, which
  // was fine while every destination was a bare path — the moment one carried its own
  // (?view=), it produced "/crm/pipeline/neo?view=a?view=b" and the param was lost.
  // A destination that names no view does not inherit the one we are leaving.
  window.titanSidebarGo = function (path) {
    var at = path.indexOf('?');
    var base = at === -1 ? path : path.slice(0, at);
    var q = new URLSearchParams(location.search);          // ?u=<persona> travels
    if (at === -1) {
      q.delete('view');
    } else {
      new URLSearchParams(path.slice(at + 1)).forEach(function (v, k) { q.set(k, v); });
    }
    var qs = q.toString();
    location.href = base + (qs ? '?' + qs : '');
  };
  function esc(s) {
    return typeof window.esc === 'function' ? window.esc(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
  }
  function attr(s) { return esc(s).replace(/'/g, '&#39;'); }

  var NAV_CACHE = 'titan-crm-pipeline-nav:' + window.PERSONA_ID;
  var pipelines = [];          // [{ id, name, color, entity, views }]
  var renderedSig = null;
  var activePipelineId = null;

  // ── Which nav item is current ──────────────────────────────────────────────
  // Derived, never passed in. /crm/pipeline/<id>/... marks that pipeline's row;
  // the flat destinations mark themselves.
  function route() {
    var segs = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (segs[0] !== 'crm') return { kind: 'other' };
    if (segs[1] === 'activities') return { kind: 'activities' };
    if (segs[1] === 'sequences') return { kind: 'sequences' };
    if (segs[1] === 'dashboard') return { kind: 'dashboard' };
    if (segs[1] === 'contacts') return { kind: 'contacts' };
    if (segs[1] === 'companies') return { kind: 'companies' };
    if (segs[1] === 'forms') return { kind: 'forms' };
    if (segs[1] === 'pipeline' && segs[2] && segs[3] === 'form') return { kind: 'forms' };
    if (segs[1] === 'integrations') return { kind: 'integrations' };
    if (segs[1] === 'pipeline' && segs[2]) return { kind: 'pipeline', id: decodeURIComponent(segs[2]) };
    return { kind: 'board' };
  }

  // ── Account switcher ───────────────────────────────────────────────────────
  // A persona's own account replaces the demo one, and its menu lists only that
  // account. Only crm.html used to do this substitution, so every other page
  // showed the default persona's email no matter whose data was on screen.
  function account() {
    var p = (window.TITAN_PERSONAS || {})[window.PERSONA_ID];
    if (p && p.account) {
      return {
        email: p.account.email || '',
        initial: p.account.avatar || (p.account.name || '?').charAt(0),
        brand: p.account.brand || '',
        sole: true,
      };
    }
    return { email: 'ella.henderson@avontechlabs.com', initial: 'E', brand: 'Avontech Labs', sole: false };
  }

  function accountItem(email, brand, initial, colour, active) {
    return '<div class="account-menu-item' + (active ? ' active' : '') + '"' +
      ' onclick="selectAccount(event, this, \'' + attr(email) + '\', \'' + attr(initial) + '\', \'' + colour + '\')">' +
      '<span class="account-menu-avatar" style="background:' + colour + ';">' + esc(initial) + '</span>' +
      '<div class="account-menu-text">' +
        '<div class="account-menu-email">' + esc(email) + '</div>' +
        '<div class="account-menu-sub">' + esc(brand) + '</div>' +
      '</div>' +
      '<span class="account-menu-check">' + ico('check', 14) + '</span>' +
    '</div>';
  }

  function accountMenuHtml(acc) {
    if (acc.sole) {
      return '<div class="account-menu-label">Titan account</div>' +
        accountItem(acc.email, acc.brand, acc.initial, '#3f6ea5', true);
    }
    return '<div class="account-menu-label">Titan accounts</div>' +
      accountItem(acc.email, acc.brand, acc.initial, '#3f6ea5', true) +
      accountItem('ella@brightpath.co', 'BrightPath Co', 'B', '#9a6b3f', false) +
      '<div class="account-menu-sep"></div>' +
      '<div class="account-menu-add" onclick="event.stopPropagation(); closeAccountMenu(); ' +
        'alert(\'Prototype only: adding an account is not wired up yet.\');">' +
        '<span class="account-menu-add-icon">' +
          ico('plus', 12) +
        '</span>Add another account</div>';
  }

  // ── Icons ──────────────────────────────────────────────────────────────────
  // Nav glyphs, from the icon module. White ink comes from the sidebar's own colour, so
  // these no longer hardcode #fff the way the hand-drawn versions did.
  function ico(name, size) {
    return window.dsIcon ? window.dsIcon(name, { size: size || 15 }) : '';
  }
  var ICON = {
    get activities() { return ico('clock'); },
    get sequences() { return ico('paper-plane-tilt'); },
    get dashboard() { return ico('dashboard'); },
    get contacts() { return ico('contacts'); },
    get companies() { return ico('companies'); },
    get forms() { return ico('forms'); },
    get integrations() { return ico('integrations'); },
    get kebab() { return ico('menu', 14); },
  };

  // The pipeline chevron is a Titan shape, not a Phosphor one, so it is registered with
  // the icon module rather than drawn here: one definition, swappable in one place. It
  // keeps its own 14-unit grid, and takes the pipeline's colour through `currentColor`
  // on a wrapper rather than a baked-in fill.
  if (window.dsIcon && !window.dsIcon.hasPipeline) {
    window.dsIcon.register('pipeline', '<path d="M2 3.2H9.6L12.4 7L9.6 10.8H2L4.4 7L2 3.2Z" fill="currentColor"/>', '0 0 14 14');
    window.dsIcon.hasPipeline = true;
  }

  function pipelineGlyph(colour) {
    return '<span style="color:' + (colour || '#2170f4') + '; display:inline-flex;">' +
      (window.dsIcon ? window.dsIcon('pipeline', { size: 13 })
                     : '<svg width="13" height="13" viewBox="0 0 14 14"><path d="M2 3.2H9.6L12.4 7L9.6 10.8H2L4.4 7L2 3.2Z" fill="currentColor"/></svg>') +
      '</span>';
  }

  // ── The shell ──────────────────────────────────────────────────────────────
  // One separator above the nav items, one below the pipeline rows. The rows are
  // inserted after #pipeline-nav-line, a hidden anchor rather than a rule —
  // crm.html made the anchor itself a visible rule, which is why the separator
  // appeared to jump a slot from page to page.
  function shellHtml() {
    var r = route(), acc = account();
    var on = function (kind) { return r.kind === kind ? ' active' : ''; };
    return '' +
    '<div class="sidebar">' +
      '<div class="sidebar-header">' +
        '<div class="tab-switch">' +
          '<img src="/app_switcher_assets/grid_icons/crm.svg" alt="CRM">' +
          '<div class="tab-switch-arrow"><img src="/assets/1c88a1be-2a78-4065-86f7-8eb060dbb526.svg" alt=""></div>' +
        '</div>' +
        '<div class="titan-logo"><img src="/assets/fa36f613-977c-444a-bef5-e1b5f5f1b340.svg" alt="Titan"></div>' +
      '</div>' +

      '<div class="nav-scroll">' +
        '<div class="sidebar-line" style="margin-top:2px;"></div>' +
        '<div class="account-header" id="account-header" onclick="toggleAccountMenu(event)">' +
          '<div class="account-avatar" style="background:#3f6ea5;">' +
            '<span id="account-active-initial">' + esc(acc.initial) + '</span>' +
          '</div>' +
          '<span class="account-email-text" id="account-active-email">' + esc(acc.email) + '</span>' +
          '<div class="account-chevron">' +
            ico('expand', 11) +
          '</div>' +
          '<div class="account-menu" id="account-menu">' + accountMenuHtml(acc) + '</div>' +
        '</div>' +

        '<div class="sidebar-line"></div>' +

        '<div class="nav-item' + on('dashboard') + '" onclick="titanSidebarGo(\'/crm/dashboard\')">' +
          '<div class="nav-item-icon">' + ICON.dashboard + '</div>' +
          '<span class="nav-item-label' + on('dashboard') + '">Dashboard</span>' +
        '</div>' +

        // Dashboard is the whole account; the pipeline rows below it are the parts.
        '<div class="sidebar-line"></div>' +

        '<div id="pipeline-nav-line" class="nav-anchor"></div>' +
        '<div id="pipeline-nav-end" class="nav-anchor"></div>' +

        // "New pipeline" sits after the list it adds to, so the rows read as a list
        // rather than being interrupted by the button that extends them.
        '<div class="nav-item" onclick="openNewPipeline()">' +
          '<div class="nav-item-icon" style="color:var(--accent-primary); font-weight:700; font-size:16px;">+</div>' +
          '<span class="nav-item-label" style="color:var(--accent-primary); font-weight:600;">New pipeline</span>' +
        '</div>' +

        '<div class="sidebar-line"></div>' +

        '<div class="nav-item' + on('activities') + '" onclick="titanSidebarGo(\'/crm/activities\')">' +
          '<div class="nav-item-icon">' + ICON.activities + '</div>' +
          '<span class="nav-item-label' + on('activities') + '">Upcoming activities</span>' +
        '</div>' +
        '<div class="nav-item' + on('sequences') + '" onclick="titanSidebarGo(\'/crm/sequences\')">' +
          '<div class="nav-item-icon">' + ICON.sequences + '</div>' +
          '<span class="nav-item-label' + on('sequences') + '">Sequences</span>' +
        '</div>' +
        '<div class="nav-item' + on('contacts') + '" onclick="titanSidebarGo(\'/crm/contacts\')">' +
          '<div class="nav-item-icon">' + ICON.contacts + '</div>' +
          '<span class="nav-item-label' + on('contacts') + '">Contacts</span>' +
        '</div>' +
        '<div class="nav-item' + on('companies') + '" onclick="titanSidebarGo(\'/crm/companies\')">' +
          '<div class="nav-item-icon">' + ICON.companies + '</div>' +
          '<span class="nav-item-label' + on('companies') + '">Companies</span>' +
        '</div>' +
        '<div class="nav-item' + on('forms') + '" onclick="titanSidebarGo(\'/crm/forms\')">' +
          '<div class="nav-item-icon">' + ICON.forms + '</div>' +
          '<span class="nav-item-label' + on('forms') + '">Forms</span>' +
        '</div>' +
        '<div class="nav-item' + on('integrations') + '" onclick="titanSidebarGo(\'/crm/integrations\')">' +
          '<div class="nav-item-icon">' + ICON.integrations + '</div>' +
          '<span class="nav-item-label' + on('integrations') + '">Integrations</span>' +
        '</div>' +
      '</div>' +

      '<div style="position:relative; flex-shrink:0;">' +
        '<div style="height:1px; position:relative; overflow:visible;">' +
          '<img src="/assets/0d00b891-46d6-4063-acc9-0db4c8c41036.svg" alt="" style="position:absolute; inset:-1px 0; width:100%; height:2px; object-fit:fill;">' +
        '</div>' +
        '<div class="sidebar-footer">' +
          '<div class="footer-btn"><div class="footer-btn-icon"><img src="/assets/34686e57-21d5-4bf6-82c4-1c6e474d25d3.svg" alt=""></div><span>Bug</span></div>' +
          '<div class="footer-divider"></div>' +
          '<div class="footer-btn"><div class="footer-btn-icon"><img src="/assets/03a449fb-b16b-4b26-8eec-0fa033eff13e.svg" alt=""></div><span>Feature</span></div>' +
          '<div class="footer-divider"></div>' +
          '<div class="footer-btn" onclick="toggleSettingsModal()">' +
            '<div class="footer-btn-icon settings-icon"><img src="/assets/6ea52e57-1d75-47b1-97cd-e416a5d2372d.svg" alt=""></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // The board's full menu. The sub-pages used to render a reduced four-item copy
  // of it, so the same row offered different actions depending on where you were.
  function navMenuHtml() {
    // Two groups: what you add to the pipeline, then who and how it's configured.
    // The standalone "Form" item is gone — a form is one of the intake paths the
    // Sources screen offers, so it was a second door into the same place (and the
    // board header has its own Form button either way).
    // Labels carrying data-action are rewritten per pipeline on open — see
    // titanSidebarMenuEntityLabels.
    return '<div class="pipeline-nav-menu" id="pipeline-nav-menu">' +
      '<div class="pipeline-nav-menu-item" onclick="pipelineNavMenuAction(\'filter\')">Add filter view</div>' +
      '<div class="pipeline-nav-menu-item" data-action="add-records" onclick="pipelineNavMenuAction(\'add-records\')">Add opportunity sources</div>' +
      '<div class="pipeline-nav-menu-sep"></div>' +
      '<div class="pipeline-nav-menu-item" onclick="pipelineNavMenuAction(\'add-team\')">Invite team</div>' +
      '<div class="pipeline-nav-menu-item" onclick="pipelineNavMenuAction(\'pipeline-setting\')">Pipeline setting</div>' +
      '<div class="pipeline-nav-menu-item" data-action="entity-setting" onclick="pipelineNavMenuAction(\'entity-setting\')">Opportunity setting</div>' +
    '</div>';
  }

  // ── Pipeline rows ──────────────────────────────────────────────────────────
  // Saved filter views come off the pipeline itself. The two the prototype ships
  // were hardcoded in crm.html's markup and re-attached only when a pipeline's id
  // was literally "neo", so they existed on exactly one page and could never
  // belong to any other pipeline. Reading pl.views lets any pipeline carry them
  // and renders them the same everywhere; the "neo" pair below stands in until
  // the views move into the stored document.
  // crm-views.js owns what a view is, including the two the prototype has always
  // shown. This used to hold their names and nothing else, which is why clicking one
  // did nothing for so long.
  function viewObjectsOf(pl) {
    return (window.titanViews && window.titanViews.list) ? window.titanViews.list(pl) : [];
  }
  function viewsOf(pl) {
    return viewObjectsOf(pl).map(function (v) { return v.name; }).filter(Boolean);
  }
  function activeViewId() {
    try { return new URLSearchParams(location.search).get('view') || ''; } catch (e) { return ''; }
  }

  // The per-view menu. crm.html owns what Edit and Delete do — it has the editor and
  // the cards — so from anywhere else these travel as ?intent=.
  function viewNavMenuHtml() {
    return '<div class="pipeline-nav-menu" id="view-nav-menu">' +
      '<div class="pipeline-nav-menu-item" onclick="viewNavMenuAction(\'edit-view\')">Edit view</div>' +
      '<div class="pipeline-nav-menu-sep"></div>' +
      '<div class="pipeline-nav-menu-item danger" onclick="viewNavMenuAction(\'delete-view\')">Delete view</div>' +
    '</div>';
  }
  window.toggleViewNavMenu = function (evt, pipelineId, viewId) {
    var menu = document.getElementById('view-nav-menu');
    if (!menu) { document.body.insertAdjacentHTML('beforeend', viewNavMenuHtml()); menu = document.getElementById('view-nav-menu'); }
    var wasFor = menu.dataset.viewId;
    var isOpen = menu.classList.contains('open');
    window.closePipelineNavMenu();
    if (isOpen && wasFor === viewId) return;
    menu.dataset.pipelineId = pipelineId;
    menu.dataset.viewId = viewId;
    var r = evt.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, r.right - 168) + 'px';
    menu.classList.add('open');
  };
  window.viewNavMenuAction = function (kind) {
    var menu = document.getElementById('view-nav-menu');
    if (!menu) return;
    var pipelineId = menu.dataset.pipelineId, viewId = menu.dataset.viewId;
    menu.classList.remove('open');
    if (kind === 'edit-view' && typeof window.openViewEditor === 'function') {
      window.openViewEditor(pipelineId, viewId); return;
    }
    if (kind === 'delete-view' && typeof window.deleteViewById === 'function') {
      window.deleteViewById(pipelineId, viewId); return;
    }
    titanSidebarGo('/crm/pipeline/' + encodeURIComponent(pipelineId) +
      '?intent=' + encodeURIComponent(kind) + '&viewId=' + encodeURIComponent(viewId));
  };
  document.addEventListener('click', function (e) {
    var menu = document.getElementById('view-nav-menu');
    if (menu && menu.classList.contains('open') &&
        !e.target.closest('#view-nav-menu') && !e.target.closest('.nav-item-menu-btn')) {
      menu.classList.remove('open');
    }
  });

  function currentPipelineId() {
    var r = route();
    return activePipelineId || (r.kind === 'pipeline' ? r.id : null);
  }

  function renderRows(opts) {
    var line = document.getElementById('pipeline-nav-line');
    if (!line) return;

    var current = currentPipelineId();
    var sig = JSON.stringify([current, activeViewId(),
      pipelines.map(function (p) { return [p.id, p.name, p.color, viewsOf(p)]; })]);
    if (sig === renderedSig) return;
    renderedSig = sig;

    // Clear only what sits between the two anchors — never up to the next
    // separator, which would take "New pipeline" with it now that it sits below
    // the rows, and never to the end, which would take Contacts and Companies.
    var n = line.nextElementSibling, had = 0;
    while (n && n.id !== 'pipeline-nav-end' && !n.classList.contains('sidebar-line')) {
      var next = n.nextElementSibling; n.remove(); had++; n = next;
    }
    // Animate only rows genuinely arriving for the first time. Rows restored from
    // the cache fading in on every navigation is the same blink, just prettier.
    var animate = (opts && opts.animate === false) ? false : had === 0;

    var after = line;
    pipelines.forEach(function (pl, i) {
      var isActive = pl.id === current;
      var item = document.createElement('div');
      item.className = 'nav-item' + (isActive ? ' active' : '') + (animate ? ' is-entering' : '');
      if (animate) item.style.animationDelay = Math.min(i * 45, 270) + 'ms';
      item.dataset.pipelineId = pl.id;
      item.onclick = function () { window.switchPipeline(pl.id); };
      item.innerHTML =
        '<div class="nav-item-icon">' + pipelineGlyph(pl.color) + '</div>' +
        '<span class="nav-item-label' + (isActive ? ' active' : '') + '"></span>' +
        '<span class="nav-item-menu-btn" onclick="event.stopPropagation(); togglePipelineNavMenu(event, \'' + attr(pl.id) + '\')" title="Pipeline actions">' + ICON.kebab + '</span>';
      item.querySelector('.nav-item-label').textContent = pl.name;
      item.addEventListener('animationend', function () {
        item.classList.remove('is-entering');
        item.style.animationDelay = '';
      }, { once: true });
      after.after(item);
      after = item;

      viewObjectsOf(pl).forEach(function (v) {
        var view = document.createElement('div');
        // Active when the board is showing this pipeline with this view applied —
        // derived from the URL, like every other active state in this component.
        var on = current === pl.id && activeViewId() === v.id;
        view.className = 'nav-item' + (on ? ' active' : '');
        view.style.paddingLeft = '52px';
        view.innerHTML = '<span class="nav-item-label secondary"></span>';
        view.querySelector('.nav-item-label').textContent = v.name;
        view.title = (window.titanViews && window.titanViews.describe)
          ? window.titanViews.describe(v, pl) : v.name;
        view.insertAdjacentHTML('beforeend',
          '<span class="nav-item-menu-btn" title="View actions">' + ICON.kebab + '</span>');
        view.addEventListener('click', function (e) {
          if (e.target.closest('.nav-item-menu-btn')) {
            e.stopPropagation();
            toggleViewNavMenu(e, pl.id, v.id);
            return;
          }
          titanSidebarGo('/crm/pipeline/' + encodeURIComponent(pl.id) + '?view=' + encodeURIComponent(v.id));
        });
        after.after(view);
        after = view;
      });
    });

    // Remembered for the next page in this tab, so its rows are on screen at
    // paint time instead of after that page's own /api/data round-trip.
    try {
      sessionStorage.setItem(NAV_CACHE, JSON.stringify(pipelines.map(function (p) {
        return { id: p.id, name: p.name, color: p.color, entity: p.entity, views: viewObjectsOf(p) };
      })));
    } catch (e) { /* private mode or quota — the nav just loads late */ }
  }

  // ── Public surface ─────────────────────────────────────────────────────────
  window.titanSidebar = {
    // The list may arrive as an array or as the pipelines map from /api/data.
    setPipelines: function (list, opts) {
      pipelines = normalise(list);
      renderRows(opts);
    },
    // crm.html switches pipeline without navigating, so it re-marks the row.
    setActivePipeline: function (id) {
      activePipelineId = id;
      renderedSig = null;
      renderRows({ animate: false });
    },
    pipelines: function () { return pipelines.slice(); },
  };
  // The name the existing pages already call.
  window.rebuildPipelineNav = window.titanSidebar.setPipelines;

  function normalise(list) {
    var arr = Array.isArray(list) ? list
      : Object.keys(list || {}).map(function (k) {
          var pl = list[k]; return pl && typeof pl === 'object' ? (pl.id ? pl : Object.assign({ id: k }, pl)) : null;
        }).filter(Boolean);
    return arr.map(function (pl) {
      return { id: pl.id, name: pl.name, color: pl.color, entity: pl.entity, views: viewObjectsOf(pl) };
    });
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  // The app switcher in the sidebar header. crm.html and index.html each ship the full
  // app-switcher dropdown and bind it themselves; every other CRM page shows the same
  // control with nothing behind it, which read as broken. Here it falls back to what a
  // person actually wants from it — going back to the mailbox.
  document.addEventListener('click', function (e) {
    const onTab = e.target.closest && e.target.closest('.tab-switch');
    if (!onTab) return;
    if (document.getElementById('app-switcher')) return;   // the page owns it
    window.titanSidebarGo('/mail');
  });

  window.toggleAccountMenu = function (evt) {
    if (evt) evt.stopPropagation();
    var header = document.getElementById('account-header');
    var menu = document.getElementById('account-menu');
    if (!header || !menu) return;
    var isOpen = menu.classList.toggle('open');
    header.classList.toggle('open', isOpen);
    if (isOpen) setTimeout(function () { document.addEventListener('click', window.closeAccountMenu); }, 0);
  };
  window.closeAccountMenu = function () {
    var header = document.getElementById('account-header');
    var menu = document.getElementById('account-menu');
    if (menu) menu.classList.remove('open');
    if (header) header.classList.remove('open');
    document.removeEventListener('click', window.closeAccountMenu);
  };
  window.selectAccount = function (evt, el, email, initial, colour) {
    if (evt) evt.stopPropagation();
    document.querySelectorAll('.account-menu-item').forEach(function (i) { i.classList.remove('active'); });
    if (el) el.classList.add('active');
    var emailEl = document.getElementById('account-active-email');
    var initialEl = document.getElementById('account-active-initial');
    if (email && emailEl) emailEl.textContent = email;
    if (initial && initialEl) initialEl.textContent = initial;
    if (colour) {
      var avatar = document.querySelector('.account-header .account-avatar');
      if (avatar) avatar.style.background = colour;
    }
    window.closeAccountMenu();
  };

  // Sub-pages navigate in place, so there is no opener to call into. Anything
  // only the board can do travels there as an intent instead.
  function goToBoard(intent) {
    var q = new URLSearchParams(location.search);
    if (intent) q.set('intent', intent);
    var s = q.toString();
    location.href = '/crm' + (s ? '?' + s : '');
  }
  window.openNewPipeline = function () { goToBoard('new-pipeline'); };
  window.toggleSettingsModal = function () { goToBoard('settings'); };

  // Switching pipeline from a sub-page keeps you in the same kind of sub-page
  // (/setting, /record-setting, ...) and just re-targets the id segment.
  window.switchPipeline = function (id) {
    var segs = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (segs[0] === 'crm' && segs[1] === 'pipeline' && segs[2]) segs[2] = encodeURIComponent(id);
    else segs = ['crm', 'pipeline', encodeURIComponent(id)];
    location.href = '/' + segs.join('/') + location.search;
  };

  // Menu labels that name the record type, applied on open because one menu element is
  // shared by every pipeline row. Exported because crm.html overrides
  // togglePipelineNavMenu wholesale — without a single owner for the wording the board's
  // copy and this one drift, which is the bug the shared sidebar exists to prevent.
  window.titanSidebarMenuEntityLabels = function (menu, entity) {
    if (!menu) return;
    var one = entity || 'Opportunity';
    var setting = menu.querySelector('[data-action="entity-setting"]');
    if (setting) setting.textContent = one + ' setting';
    var sources = menu.querySelector('[data-action="add-records"]');
    if (sources) sources.textContent = 'Add ' + one.toLowerCase() + ' sources';
  };

  window.togglePipelineNavMenu = function (evt, pipelineKey) {
    evt.stopPropagation();
    var menu = document.getElementById('pipeline-nav-menu');
    if (!menu) return;
    var wasOpenForThis = menu.classList.contains('open') && menu.dataset.pipelineKey === pipelineKey;
    window.closePipelineNavMenu();
    if (wasOpenForThis) return;
    // The entity name comes from the pipeline list the sidebar already holds,
    // rather than reaching through window.opener for it.
    var pl = pipelines.filter(function (p) { return p.id === pipelineKey; })[0];
    window.titanSidebarMenuEntityLabels(menu, pl && pl.entity);
    var rect = evt.currentTarget.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = Math.max(8, rect.right - 190) + 'px';
    menu.dataset.pipelineKey = pipelineKey;
    menu.classList.add('open');
    setTimeout(function () { document.addEventListener('click', window.closePipelineNavMenu); }, 0);
  };
  // Closes both nav menus, not just this one. Every toggle calls this before it opens
  // anything, so one owner of "shut whatever is open" is what stops a pipeline menu and
  // a view menu being on screen together. crm.html overrides this; its copy does the
  // same, and this comment is why.
  window.closePipelineNavMenu = function () {
    var menu = document.getElementById('pipeline-nav-menu');
    if (menu) menu.classList.remove('open');
    var view = document.getElementById('view-nav-menu');
    if (view) view.classList.remove('open');
    document.removeEventListener('click', window.closePipelineNavMenu);
  };
  window.pipelineNavMenuAction = function (kind) {
    var menu = document.getElementById('pipeline-nav-menu');
    var pipelineKey = menu && menu.dataset.pipelineKey;
    window.closePipelineNavMenu();
    if (!pipelineKey) return;
    var base = '/crm/pipeline/' + encodeURIComponent(pipelineKey);
    if (kind === 'pipeline-setting') { location.href = base + '/setting' + location.search; return; }
    if (kind === 'entity-setting') { location.href = base + '/record-setting' + location.search; return; }
    if (kind === 'form') { location.href = base + '/form' + location.search; return; }
    // The sources modal only exists on the board, so travel there and ask for it —
    // same ?intent= convention the new-pipeline and settings modals use. Unlike those
    // it must land on *this* pipeline, not just /crm, so it keeps the base path.
    if (kind === 'add-records') {
      var q = new URLSearchParams(location.search);
      q.set('intent', 'add-records');
      location.href = base + '?' + q.toString();
      return;
    }
    if (kind === 'filter') {
      // Only crm.html can open the editor — it holds the modal shell and the cards the
      // live match count is computed from. Elsewhere, travel there as an intent.
      if (typeof window.openViewEditor === 'function') { window.openViewEditor(id, null); return; }
      titanSidebarGo('/crm/pipeline/' + encodeURIComponent(id) + '?intent=new-view');
      return;
    }
    if (kind === 'add-team') { alert('Prototype only: "Invite team" is not wired up yet.'); return; }
    // No 'delete-pipeline' here: deleting a pipeline takes its records with it, so it
    // shouldn't sit one hover-and-click away in the nav. It lives on the pipeline
    // settings page, behind the confirmation there.
  };

  // ── Mount ──────────────────────────────────────────────────────────────────
  async function selfFetch() {
    try {
      var res = await fetch('/api/data?persona=' + encodeURIComponent(window.PERSONA_ID), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load data (' + res.status + ')');
      var data = await res.json();
      window.titanSidebar.setPipelines(data.pipelines || {}, { animate: false });
    } catch (e) {
      console.error('titan-sidebar: could not load pipelines for the nav.', e);
    }
  }

  window.mountTitanSidebar = function () {
    var mount = document.getElementById('sidebar-mount');
    if (mount) mount.outerHTML = shellHtml();
    if (!document.getElementById('pipeline-nav-menu')) {
      document.body.insertAdjacentHTML('beforeend', navMenuHtml());
    }

    // Paint the rows this tab saw last so they are on screen immediately, then
    // let the real data reconcile them.
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(NAV_CACHE) || 'null'); } catch (e) {}
    if (cached && cached.length) window.titanSidebar.setPipelines(cached, { animate: false });

    // A page that fetches /api/data for its own content supplies the list itself.
    if (document.body.dataset.sidebarData !== 'page') selfFetch();

    startFormWatch();
  };

  // ── Watching for new form submissions ──────────────────────────────────────
  // Lives here because titan-sidebar.js is the only script loaded on every CRM
  // page, so submissions keep arriving while someone is on the board rather than
  // only while the integrations page happens to be open. (index.html/mail loads
  // no shared scripts and is the mocked half, so it stays out of this.)
  //
  // /api/hubspot-sync deliberately does not write when nothing new arrived — see
  // the note in api/_hubspot.js. That is what makes a 60s poll safe here: writes
  // are GitHub commits, and a "last checked" stamp on every pass would commit to
  // the repo once a minute from every open tab.
  // ── The browser-held HubSpot key ───────────────────────────────────────────
  // A TEMPORARY fallback, and a deliberate exception to the rule in CLAUDE.md
  // that sessionStorage carries nothing but couriered page state.
  //
  // The key belongs in a secret store on the server — see api/_secrets.js. That
  // needs one environment variable set on the deployment, and until whoever owns
  // the Vercel project does it, there is nowhere server-side to put a key: the
  // data files are committed to a public repo and GitHub rejects credentials
  // outright. So the key stays in the tab instead and rides along on a request
  // header.
  //
  // What that costs, stated plainly: it is re-entered every session, it is gone
  // when the tab closes, and any script running on the page can read it. It is
  // here so production is demoable in the meantime, not because it is right.
  //
  // Retiring it is automatic, not a chore: resolveKey() on the server checks the
  // store first, so once a store exists the stored key wins and this stops being
  // consulted. Deleting this block is then pure cleanup.
  //
  // sessionStorage rather than localStorage on purpose — per tab, and cleared on
  // close, so a shared or forgotten browser doesn't keep it around.
  window.titanHubspotKey = {
    name: function () { return 'titan-hubspot-key:' + window.PERSONA_ID; },
    get: function () {
      try { return sessionStorage.getItem(this.name()) || ''; } catch (e) { return ''; }
    },
    set: function (v) {
      try { sessionStorage.setItem(this.name(), v); } catch (e) {}
    },
    clear: function () {
      try { sessionStorage.removeItem(this.name()); } catch (e) {}
    },
    // Attaches the key to a request only when there is one to attach.
    headers: function (base) {
      var h = base || {};
      var k = this.get();
      if (k) h['X-HubSpot-Key'] = k;
      return h;
    },
  };

  var WATCH_MS = 60000;
  var watchTimer = null;

  function startFormWatch() {
    if (watchTimer) return;
    checkForSubmissions();                                  // catch up on load
    watchTimer = setInterval(checkForSubmissions, WATCH_MS);
  }

  function stopFormWatch() {
    clearInterval(watchTimer);
    watchTimer = null;
  }

  async function checkForSubmissions() {
    // A background tab has nobody to show results to, and polling from every
    // stale tab someone left open is pure waste.
    if (document.visibilityState === 'hidden') return;
    try {
      var res = await fetch('/api/hubspot-sync?persona=' + encodeURIComponent(window.PERSONA_ID), {
        method: 'POST',
        headers: window.titanHubspotKey.headers(),
      });
      // 400 here means "not connected" or "no forms yet" — the normal state for
      // most installs. Stop asking for the rest of this page's life rather than
      // making the same pointless request every minute.
      if (res.status === 400) { stopFormWatch(); return; }
      if (!res.ok) return;                                  // transient; try again next tick
      var body = await res.json();
      if (body.added) showImportToast(body.added);
    } catch (e) {
      // Offline or the API is down. Silent by design: this runs unprompted in the
      // background, so it must never interrupt someone who didn't ask for it.
    }
  }

  // The board renders from data fetched at load, so newly imported records won't
  // be on screen. Offering a refresh is honest about that; silently doing nothing
  // would make the feature look broken.
  function showImportToast(n) {
    var existing = document.getElementById('int-toast');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'int-toast';
    el.id = 'int-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + n + ' new ' + (n === 1 ? 'record' : 'records') + ' from your forms</span>' +
                   '<button type="button">Refresh</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-open'); });

    el.querySelector('button').addEventListener('click', function () { location.reload(); });
    setTimeout(function () {
      el.classList.remove('is-open');
      setTimeout(function () { el.remove(); }, 200);
    }, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.mountTitanSidebar);
  } else {
    window.mountTitanSidebar();
  }
})();
