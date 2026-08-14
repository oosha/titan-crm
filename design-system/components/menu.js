/* dsMenu — open/close behaviour for .ds-menu, and nothing else.
 *
 * The CSS can express a menu's looks but not its two hard parts: only one open at a time,
 * and closing on anything that means "never mind". Each hand-rolled copy in the product
 * re-solved those, and each stopped somewhere different — the card action menu closes on
 * outside click but not on Escape, and the pipeline nav menu leaves aria-expanded stale.
 *
 * Declarative use, which is all the CRM needs:
 *
 *   <div class="ds-split">
 *     <button class="ds-btn ds-btn--primary">Add opportunity</button>
 *     <button class="ds-btn ds-btn--primary" data-ds-menu="import-menu"
 *             aria-haspopup="menu" aria-expanded="false">…</button>
 *     <div class="ds-menu ds-menu--below-end" id="import-menu" role="menu">
 *       <button class="ds-menu__item" role="menuitem">Import records from sources</button>
 *     </div>
 *   </div>
 *
 * Binding is delegated on `document`, so markup rendered later — which is most of this
 * app's markup — works without anyone remembering to re-bind. Same reason the sidebar
 * does it (see CLAUDE.md § the sidebar is a component).
 */
(function () {
  'use strict';
  if (window.dsMenu) return;

  var open = null;   // the currently open .ds-menu, or null

  function panelFor(trigger) {
    var id = trigger.getAttribute('data-ds-menu');
    return id ? document.getElementById(id) : null;
  }
  function triggerFor(panel) {
    return document.querySelector('[data-ds-menu="' + panel.id + '"]');
  }

  function close(panel) {
    panel = panel || open;
    if (!panel) return;
    panel.classList.remove('is-open');
    var t = triggerFor(panel);
    if (t) t.setAttribute('aria-expanded', 'false');
    if (open === panel) open = null;
  }

  function show(panel) {
    if (open && open !== panel) close(open);
    panel.classList.add('is-open');
    var t = triggerFor(panel);
    if (t) t.setAttribute('aria-expanded', 'true');
    open = panel;
  }

  function toggle(panel) {
    if (!panel) return;
    if (panel.classList.contains('is-open')) close(panel); else show(panel);
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-ds-menu]');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      toggle(panelFor(trigger));
      return;
    }
    // A click on an item runs the item's own handler and then closes — a menu that stays
    // open after you have chosen from it reads as though the click missed.
    //
    // Only a menu dsMenu opened, though. A panel rendered inline and always visible (the
    // workbench shows one, so its states can be inspected without clicking) is not a
    // popup, and vanishing on click would be wrong there.
    var item = e.target.closest('.ds-menu__item');
    if (item && open && open.contains(item) &&
        !item.disabled && item.getAttribute('aria-disabled') !== 'true') {
      close(open);
      return;
    }
    // Anywhere else, including inside the panel's padding.
    if (open && !e.target.closest('.ds-menu')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') {
      var t = triggerFor(open);
      close();
      if (t) t.focus();   // Escape must not strand focus on a panel that is gone
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var items = Array.prototype.filter.call(
      open.querySelectorAll('.ds-menu__item'),
      function (el) { return !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
    );
    if (!items.length) return;
    e.preventDefault();
    var at = items.indexOf(document.activeElement);
    var step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
  });

  // Scrolling or resizing under an open menu leaves it pointing at nothing. Closing is
  // honest and cheap; re-anchoring would need to know how the consumer positioned it.
  window.addEventListener('resize', function () { close(); });
  window.addEventListener('scroll', function () { close(); }, true);

  window.dsMenu = {
    open: function (id) { show(document.getElementById(id)); },
    close: function (id) { close(id ? document.getElementById(id) : null); },
    toggle: function (id) { toggle(document.getElementById(id)); },
    current: function () { return open ? open.id : null; },
  };
})();
