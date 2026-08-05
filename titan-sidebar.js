// Shared sidebar for standalone sub-pages (Add opportunity, Pipeline setting,
// Opportunity setting, ...). These pages navigate here in place (crm.html sets
// location.href, not window.open), so there's no window.opener to clone the
// sidebar from live — crm.html instead stashes its rendered sidebar as HTML in
// sessionStorage right before navigating away, and this just replays it.
// Pair with titan-sidebar.css for the matching visual styles, and set
// <body data-subpage="..."> so pipelineNavMenuAction() knows what to skip.
(function () {
  // Still used below by openNewPipeline / toggleSettingsModal, which hand off to
  // crm.html's own modals rather than reimplementing them here — those only work when
  // this page genuinely was opened as a popup (window.opener present); otherwise they
  // degrade gracefully (an alert, or a no-op) rather than erroring.
  function opener() { return window.opener; }

  window.mountTitanSidebar = function () {
    var mount = document.getElementById('sidebar-mount');
    if (!mount) return;
    var stashed = null;
    try { stashed = JSON.parse(sessionStorage.getItem('titan-crm-sidebar-html') || 'null'); } catch (e) {}
    if (stashed && stashed.sidebar) {
      mount.outerHTML = stashed.sidebar;
      if (stashed.menu && !document.getElementById('pipeline-nav-menu')) {
        document.body.insertAdjacentHTML('beforeend', stashed.menu);
      }
      return;
    }
    mount.outerHTML = '<div class="sidebar"></div>';
    var note = document.getElementById('ao-opener-note') || document.getElementById('ps-opener-note');
    if (note) {
      note.innerHTML = 'This page wasn’t opened from Titan CRM, so its sidebar isn’t available. ' +
        '<a href="crm.html">Open Titan CRM</a> and try again.';
    }
  };

  // ── Account switcher: purely local — the cloned dropdown markup already
  // lives in this page's DOM, so just toggle it here directly. ──
  window.toggleAccountMenu = function (evt) {
    if (evt) evt.stopPropagation();
    var header = document.getElementById('account-header');
    var menu = document.getElementById('account-menu');
    if (!header || !menu) return;
    var isOpen = menu.classList.toggle('open');
    header.classList.toggle('open', isOpen);
    if (isOpen) setTimeout(function () { document.addEventListener('click', closeAccountMenuOnce); }, 0);
  };
  function closeAccountMenuOnce() {
    var header = document.getElementById('account-header');
    var menu = document.getElementById('account-menu');
    if (menu) menu.classList.remove('open');
    if (header) header.classList.remove('open');
    document.removeEventListener('click', closeAccountMenuOnce);
  }
  window.selectAccount = function (evt, el) {
    if (evt) evt.stopPropagation();
    document.querySelectorAll('.account-menu-item').forEach(function (i) { i.classList.remove('active'); });
    if (el) el.classList.add('active');
    closeAccountMenuOnce();
  };

  // ── + New pipeline: that modal only exists in crm.html, so hand off there. ──
  window.openNewPipeline = function () {
    var o = opener();
    if (o && typeof o.openNewPipeline === 'function') {
      o.openNewPipeline();
      o.focus();
      window.close();
    } else {
      alert('Open Titan CRM to create a new pipeline.');
    }
  };

  // ── Switching pipeline from a sub-page: stay in the same kind of sub-page,
  // just re-target it at the newly-picked pipeline. ──
  window.switchPipeline = function (id) {
    var params = new URLSearchParams(location.search);
    params.set('pipeline', id);
    location.href = location.pathname + '?' + params.toString();
  };

  // ── Pipeline row's three-dot menu: reuse the cloned #pipeline-nav-menu,
  // navigate in place between sub-pages instead of stacking new windows. ──
  window.togglePipelineNavMenu = function (evt, pipelineKey) {
    evt.stopPropagation();
    var menu = document.getElementById('pipeline-nav-menu');
    if (!menu) return;
    var wasOpenForThis = menu.classList.contains('open') && menu.dataset.pipelineKey === pipelineKey;
    window.closePipelineNavMenu();
    if (wasOpenForThis) return;
    var rect = evt.currentTarget.getBoundingClientRect();
    var o = opener();
    var entity = (o && o.PIPELINES && o.PIPELINES[pipelineKey] && o.PIPELINES[pipelineKey].entity) || 'Opportunity';
    var entityItem = menu.querySelector('[data-action="entity-setting"]');
    if (entityItem) entityItem.textContent = entity + ' setting';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = Math.max(8, rect.right - 190) + 'px';
    menu.dataset.pipelineKey = pipelineKey;
    menu.classList.add('open');
    setTimeout(function () { document.addEventListener('click', window.closePipelineNavMenu); }, 0);
  };
  window.closePipelineNavMenu = function () {
    var menu = document.getElementById('pipeline-nav-menu');
    if (menu) menu.classList.remove('open');
    document.removeEventListener('click', window.closePipelineNavMenu);
  };
  window.pipelineNavMenuAction = function (kind) {
    var menu = document.getElementById('pipeline-nav-menu');
    var pipelineKey = menu.dataset.pipelineKey;
    window.closePipelineNavMenu();
    if (kind === 'pipeline-setting') { location.href = 'pipeline-settings.html?pipeline=' + pipelineKey; return; }
    if (kind === 'entity-setting') { location.href = 'opportunity-settings.html?pipeline=' + pipelineKey; return; }
    alert('Prototype only: "Add filter view" is not wired up yet.');
  };

  // ── Bug/Feature/Settings footer: settings modal only exists in crm.html. ──
  window.toggleSettingsModal = function () {
    var o = opener();
    if (o && typeof o.toggleSettingsModal === 'function') {
      o.toggleSettingsModal();
      o.focus();
      window.close();
    }
  };

  document.addEventListener('DOMContentLoaded', window.mountTitanSidebar);
})();
