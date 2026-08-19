// Ask Titan — the chat engine, shared.
//
// It began as ~400 lines inside dashboard.html, which was fine while the dashboard was
// the only place you could reach it. It is now also a floating button on every ordinary
// CRM page, and two copies of the transcript handling, the action cards and the undo
// path would be two things to fix every time one of them is wrong.
//
// Everything here is presentation-agnostic. The caller supplies the elements, the
// greeting, and what to do after a write:
//
//   var ai = titanAssistant.create({
//     els: { msgs, chips, form, text, send, newBtn },
//     greeting: function () { return {role:'bot', local:true, greeting:true, html:'…'}; },
//     onWrite:  function () { return refetchAndRedraw(); },
//   });
//
// The dashboard keeps its docked rail and passes a greeting computed from its tiles.
// The FAB passes a plain one, because no other page has those numbers to hand.
(function () {
  'use strict';

  var CHIPS = [
    'Summarize this pipeline',
    'What needs attention?',
    'Add a note to…',
    'Move a deal to the next stage',
  ];

  function esc(s) {
    return typeof window.esc === 'function' ? window.esc(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
  }
  function textToHtml(t) {
    return String(t || '').split(/\n{2,}/).map(function (para) {
      return '<p>' + esc(para.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function aiTable(head, rows) {
    if (!rows.length) return '';
    return '<table class="ai-table">' +
      (head ? '<thead><tr><th>' + esc(head[0]) + '</th><th>' + esc(head[1]) + '</th></tr></thead>' : '') +
      '<tbody>' + rows.map(function (r) {
        return '<tr><td title="' + esc(r[0]) + '">' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function accountName() {
    var p = (window.TITAN_PERSONAS || {})[window.PERSONA_ID];
    return (p && p.account && p.account.name) || 'Ella Henderson';
  }
  function crmPath(p) {
    return typeof window.crmPath === 'function' ? window.crmPath(p) : p;
  }

  function create(opts) {
    opts = opts || {};
    var els = opts.els || {};
    var greeting = typeof opts.greeting === 'function' ? opts.greeting : function () { return null; };
    var onWrite = typeof opts.onWrite === 'function' ? opts.onWrite : function () {};
    // Both are reassignable through configure() — see the instance returned below.
    var msgs = [];
    var busy = false;

    // Per persona and per tab. See the note in CLAUDE.md: a transcript has no server
    // that owns it, so /api/data is the wrong home twice over — every message would
    // become a commit, and the document is shared across a ?u= link.
    var CHAT_KEY = 'titan-crm-chat:' + window.PERSONA_ID;
    var CHAT_MAX = 60, CHAT_BYTES = 150000;

    function saveChat() {
      try {
        // Skips `local`: the greeting (rebuilt each load, so storing it would resurrect
        // stale figures) and the "couldn't reach" bubbles. Those are also the only
        // messages carrying pre-rendered HTML, so what is stored is plain text.
        var keep = msgs.filter(function (m) { return !m.local; }).slice(-CHAT_MAX);
        var blob = JSON.stringify(keep);
        while (blob.length > CHAT_BYTES && keep.length > 1) { keep = keep.slice(1); blob = JSON.stringify(keep); }
        sessionStorage.setItem(CHAT_KEY, blob);
      } catch (e) { /* private mode or quota — it still works, it just forgets */ }
    }
    function loadChat() {
      try {
        var raw = sessionStorage.getItem(CHAT_KEY);
        if (!raw) return [];
        var list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        // A card left mid-flight when the page went away is not still in flight.
        list.forEach(function (m) { if (m && m.state === 'busy') m.state = 'pending'; });
        return list.filter(function (m) { return m && typeof m.role === 'string'; });
      } catch (e) { return []; }
    }

    // One card per change. Changes arrive already written — the card shows what
    // happened and offers Undo. See the safety model in api/_assistant.js.
    //
    // The `pending` branch is unreachable from a new turn (the server stopped
    // producing that state when the confirmation gate went), but a transcript saved
    // before then can still hold one, and sessionStorage outlives a deploy.
    function actionCardHTML(m, idx) {
      var a = m.action;
      var isNote = a.type === 'add_note' || a.type === 'restore_note';
      var s = m.state;

      var body = isNote
        ? (a.note ? '<div class="ai-act-note">' + esc(a.note) + '</div>'
                  : '<div class="ai-act-note ai-act-old">(no note)</div>') +
          (a.existingNote ? '<div class="ai-act-row"><div class="ai-act-f">Replaces</div>' +
            '<div class="ai-act-v ai-act-old">' + esc(a.existingNote) + '</div></div>' : '')
        : (a.changes || []).map(function (c) {
            return '<div class="ai-act-row">' +
              '<div class="ai-act-f">' + esc(c.label) + '</div>' +
              '<div class="ai-act-v">' +
                (c.beforeText ? '<span class="ai-act-old">' + esc(c.beforeText) + '</span><span class="ai-act-arrow">→</span>' : '') +
                '<b>' + esc(c.afterText) + '</b>' +
              '</div></div>';
          }).join('');

      var kind;
      if (a.type === 'restore_note') kind = 'Note restored';
      else if (s === 'done' || s === 'undoing') kind = isNote ? 'Note added' : 'Record updated';
      else kind = isNote ? 'Add a note' : 'Update record';

      // A real link, not a scripted button: the card summarises the change, but seeing
      // it in place is the only way to check it landed on the right record.
      var view = (a.pipelineId && a.recordId)
        ? '<a class="ai-act-view ds-btn ds-btn--secondary ds-btn--sm" href="' + esc(crmPath('/crm/pipeline/' +
            encodeURIComponent(a.pipelineId) + '/record/' + encodeURIComponent(a.recordId))) + '">View</a>'
        : '';

      var foot;
      if (s === 'done') {
        foot = (a.undo ? '<button class="ai-act-undo ds-btn ds-btn--secondary ds-btn--sm" type="button" data-undo="' + idx + '">Undo</button>' : '') +
          view + (m.error
            ? '<div class="ai-act-state ds-badge ds-badge--danger">' + esc(m.error) + '</div>'
            : '<div class="ai-act-state ds-badge ds-badge--success">Saved</div>');
      } else if (s === 'undoing') { foot = '<div class="ai-act-state ds-badge">Undoing…</div>'; }
      else if (s === 'undone')   { foot = view + '<div class="ai-act-state ds-badge">Undone</div>'; }
      else if (s === 'dropped')  { foot = '<div class="ai-act-state ds-badge">Discarded</div>'; }
      else if (s === 'failed')   { foot = '<div class="ai-act-state ds-badge ds-badge--danger">' + esc(m.error || 'Couldn’t save that.') + '</div>'; }
      else {
        var b = s === 'busy';
        foot = '<button class="ds-btn ds-btn--primary ds-btn--sm" type="button" data-apply="' + idx + '"' + (b ? ' disabled' : '') + '>' +
            (b ? 'Saving…' : (isNote ? 'Add note' : 'Apply change')) + '</button>' +
          '<button class="ds-btn ds-btn--ghost ds-btn--sm" type="button" data-skip="' + idx + '">Discard</button>' +
          (m.error ? '<div class="ai-act-state ds-badge ds-badge--danger">' + esc(m.error) + '</div>' : '');
      }

      return '<div class="ai-msg ai-act">' +
        '<div class="ai-act-card' + (s === 'done' ? ' is-done' : '') +
          (s === 'dropped' || s === 'undone' ? ' is-dropped' : '') +
          (s === 'failed' ? ' is-failed' : '') + '">' +
          '<div class="ai-act-head">' +
            '<div class="ai-act-kind">' + kind + '</div>' +
            '<div class="ai-act-rec">' + esc(a.recordName) + '</div>' +
            '<div class="ai-act-where">' + esc(a.pipelineName) + '</div>' +
          '</div>' +
          '<div class="ai-act-body">' + body + '</div>' +
          '<div class="ai-act-foot">' + foot + '</div>' +
        '</div></div>';
    }

    // The assistant can't delete anything, so it hands over the screen that can. The
    // path comes from the server against the real routes — the model is never asked to
    // write a URL, because a plausible-looking 404 is worse than a refusal.
    function linkCardHTML(link) {
      return '<div class="ai-msg ai-link">' +
        '<a class="ds-btn ds-btn--secondary ds-btn--sm" href="' + esc(crmPath(link.path)) + '">' + esc(link.label) + ' →</a>' +
        (link.steps ? '<div class="ai-link-steps">' + esc(link.steps) + '</div>' : '') +
      '</div>';
    }

    function renderMsgs(typing) {
      if (!els.msgs) return;
      els.msgs.innerHTML = msgs.map(function (m, i) {
        if (m.role === 'act') return actionCardHTML(m, i);
        if (m.role === 'link') return linkCardHTML(m.link);
        var inner = m.role === 'me' ? '<p>' + esc(m.text) + '</p>' : (m.html || textToHtml(m.text));
        return '<div class="ai-msg ' + m.role + '"><div class="bubble">' + inner + '</div></div>';
      }).join('') + (typing ? '<div class="ai-msg bot"><div class="ai-typing"><i></i><i></i><i></i></div></div>' : '');
      els.msgs.scrollTop = els.msgs.scrollHeight;
    }
    function renderChips() {
      if (!els.chips) return;
      els.chips.innerHTML = CHIPS.map(function (c) {
        return '<button class="ai-chip ds-btn ds-btn--secondary ds-btn--sm" type="button">' + esc(c) + '</button>';
      }).join('');
    }
    // Only the spoken turns go back to the model — the greeting is computed locally and
    // the cards are interface state, not conversation.
    function apiHistory() {
      return msgs
        .filter(function (m) { return (m.role === 'me' || m.role === 'bot') && !m.local; })
        .map(function (m) { return { role: m.role === 'me' ? 'user' : 'assistant', content: m.text || '' }; })
        .filter(function (m) { return m.content; });
    }

    async function ask(text) {
      text = String(text || '').trim();
      if (!text || busy) return;
      busy = true;
      msgs.push({ role: 'me', text: text });
      renderMsgs(true);
      try {
        var res = await fetch('/api/assistant?persona=' + encodeURIComponent(window.PERSONA_ID), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiHistory(), account: accountName() }),
        });
        var body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          // Server messages are already written as instructions, so show as-is.
          msgs.push({ role: 'bot', local: true, html: '<p>' + esc(body.error || 'Something went wrong. Try again in a moment.') + '</p>' });
        } else {
          if (body.reply) msgs.push({ role: 'bot', text: body.reply });
          (body.links || []).forEach(function (l) { msgs.push({ role: 'link', link: l }); });
          var wrote = false;
          (body.actions || []).forEach(function (a) {
            // The server decides the state: anything it already applied comes back as
            // "done", so a local default would offer Apply for a done change.
            msgs.push({ role: 'act', action: a, state: a.state || 'pending', error: a.error || '' });
            if (a.state === 'done') wrote = true;
          });
          if (wrote) { try { await onWrite(); } catch (e) {} }
        }
      } catch (e) {
        msgs.push({ role: 'bot', local: true, html: '<p>Couldn’t reach the assistant. Check your connection and try again.</p>' });
      } finally {
        busy = false;
        renderMsgs(false);
        saveChat();
        syncNewChat();
      }
    }

    async function post(action) {
      var res = await fetch('/api/assistant-apply?persona=' + encodeURIComponent(window.PERSONA_ID), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action }),
      });
      return { ok: res.ok, body: await res.json().catch(function () { return {}; }) };
    }

    async function applyAction(idx) {
      var m = msgs[idx];
      if (!m || m.role !== 'act' || m.state !== 'pending') return;
      m.state = 'busy'; m.error = ''; renderMsgs(false);
      try {
        var r = await post(m.action);
        if (!r.ok) { m.state = 'pending'; m.error = r.body.error || 'Couldn’t save that.'; }
        else { m.state = 'done'; try { await onWrite(); } catch (e) {} }
      } catch (e) { m.state = 'pending'; m.error = 'Couldn’t reach the server.'; }
      renderMsgs(false); saveChat();
    }

    // Undo posts the inverse action the server handed back with the change, through the
    // same endpoint and the same validation — an undo is an ordinary edit that happens
    // to restore old values, not a privileged rewind.
    async function undoAction(idx) {
      var m = msgs[idx];
      if (!m || m.role !== 'act' || m.state !== 'done' || !m.action.undo) return;
      m.state = 'undoing'; m.error = ''; renderMsgs(false);
      try {
        var r = await post(m.action.undo);
        if (!r.ok) { m.state = 'done'; m.error = r.body.error || 'Couldn’t undo that.'; }
        else { m.state = 'undone'; try { await onWrite(); } catch (e) {} }
      } catch (e) { m.state = 'done'; m.error = 'Couldn’t reach the server.'; }
      renderMsgs(false); saveChat();
    }

    function syncNewChat() {
      if (els.newBtn) els.newBtn.hidden = !msgs.some(function (m) { return !m.greeting; });
    }
    function reset() {
      var g = greeting();
      msgs = g ? [g] : [];
      saveChat(); renderMsgs(false); syncNewChat();
    }
    // Swaps the greeting for one with current numbers and leaves the conversation
    // alone — changing the dashboard's scope shouldn't cost the transcript.
    function refreshGreeting() {
      var g = greeting();
      if (!g) return;
      msgs = [g].concat(msgs.filter(function (m) { return !m.greeting; }));
      renderMsgs(false);
    }

    function wire() {
      renderChips();
      var g = greeting();
      msgs = (g ? [g] : []).concat(loadChat());
      renderMsgs(false);
      syncNewChat();

      var text = els.text, send = els.send, form = els.form;
      function sync() {
        send.disabled = !text.value.trim();
        text.style.height = 'auto';
        text.style.height = Math.min(text.scrollHeight, 96) + 'px';
      }
      text.addEventListener('input', sync);
      text.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (text.value.trim()) { ask(text.value); text.value = ''; sync(); }
        }
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (text.value.trim()) { ask(text.value); text.value = ''; sync(); }
      });
      if (els.chips) els.chips.addEventListener('click', function (e) {
        var chip = e.target.closest('.ai-chip');
        if (!chip) return;
        // The two write chips are openers, not questions — drop them in the box so the
        // user finishes the sentence rather than sending a half-formed ask.
        if (/…$/.test(chip.textContent) || /^Move a deal/.test(chip.textContent)) {
          text.value = chip.textContent.replace(/…$/, ''); text.focus(); sync(); return;
        }
        ask(chip.textContent);
      });
      // Delegated, so cards re-rendered on every message keep working.
      els.msgs.addEventListener('click', function (e) {
        var apply = e.target.closest('[data-apply]');
        if (apply) { applyAction(Number(apply.dataset.apply)); return; }
        var undo = e.target.closest('[data-undo]');
        if (undo) { undoAction(Number(undo.dataset.undo)); return; }
        var skip = e.target.closest('[data-skip]');
        if (skip) {
          var m = msgs[Number(skip.dataset.skip)];
          if (m && m.state === 'pending') { m.state = 'dropped'; renderMsgs(false); saveChat(); }
        }
      });
      if (els.newBtn) els.newBtn.addEventListener('click', reset);
    }

    wire();
    return {
      ask: ask, reset: reset, refreshGreeting: refreshGreeting,
      focus: function () { if (els.text) els.text.focus(); },
      count: function () { return msgs.length; },
      // The dashboard mounts like every other page, then hands over a greeting built
      // from its tiles once its data has arrived. Swapping it in redraws the opener
      // and leaves the conversation alone.
      configure: function (next) {
        if (next && typeof next.greeting === 'function') { greeting = next.greeting; refreshGreeting(); }
        if (next && typeof next.onWrite === 'function') onWrite = next.onWrite;
      },
    };
  }

  // ── The floating button ────────────────────────────────────────────────────
  // Mounted wherever the sidebar is, and nowhere else. That is not a coincidence: the
  // pages without a sidebar are the full-page settings screens, which own the whole
  // viewport by the pattern's own rule, plus the public form and the mailbox. Keying
  // off #sidebar-mount means a new page gets the right answer without this list
  // needing to know it exists.
  //
  // The dashboard is the one exception in the other direction — it has the room for a
  // docked rail and already shows one, so a FAB there would be the same assistant twice.
  var mounted = null;
  function mountFab() {
    if (document.getElementById('ai-fab')) return null;
    // Either the placeholder or the rendered sidebar counts. titan-sidebar.js fills
    // #sidebar-mount and the id goes with it, so checking only for the placeholder
    // answered "no sidebar" on every page that had one.
    if (!document.getElementById('sidebar-mount') && !document.querySelector('.sidebar')) return null;

    var fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.className = 'ai-fab';
    fab.type = 'button';
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'ai-panel');
    fab.setAttribute('aria-label', 'Ask Titan');
    fab.title = 'Ask Titan';
    fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<path d="M8 1.6l1.5 3.9 3.9 1.5-3.9 1.5L8 12.4 6.5 8.5 2.6 7l3.9-1.5L8 1.6z" fill="currentColor"/></svg>';

    var panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.className = 'ai-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ask Titan');
    panel.innerHTML =
      '<div class="ai-head">' +
        '<span class="ai-mark"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
          '<path d="M8 1.6l1.5 3.9 3.9 1.5-3.9 1.5L8 12.4 6.5 8.5 2.6 7l3.9-1.5L8 1.6z" fill="currentColor"/></svg></span>' +
        '<div class="ai-id">' +
          '<div class="ai-name">Ask Titan <span class="ds-badge ds-badge--purple">Beta</span></div>' +
          '<div class="ai-sub">Your pipeline copilot</div>' +
        '</div>' +
        '<button class="ai-new ds-btn ds-btn--ghost ds-btn--sm" id="ai-fab-new" type="button" title="Start a new chat">New chat</button>' +
        '<button class="ai-close ds-btn ds-btn--ghost ds-btn--icon ds-btn--sm" id="ai-fab-close" type="button" aria-label="Close">' +
          '<span data-ds-icon="close" data-size="13"></span></button>' +
      '</div>' +
      '<div class="ai-msgs" id="ai-fab-msgs"></div>' +
      '<div class="ai-chips" id="ai-fab-chips"></div>' +
      '<form class="ai-input" id="ai-fab-form">' +
        '<textarea id="ai-fab-text" rows="1" placeholder="Ask about your pipeline…" aria-label="Message Titan"></textarea>' +
        '<button class="ai-send ds-btn ds-btn--primary ds-btn--icon" id="ai-fab-send" type="submit" aria-label="Send" disabled>' +
          '<span data-ds-icon="forward" data-size="16"></span></button>' +
      '</form>';

    document.body.appendChild(panel);
    document.body.appendChild(fab);
    if (window.dsIcon) window.dsIcon.hydrate(panel);

    var api = create({
      els: {
        msgs: panel.querySelector('#ai-fab-msgs'), chips: panel.querySelector('#ai-fab-chips'),
        form: panel.querySelector('#ai-fab-form'), text: panel.querySelector('#ai-fab-text'),
        send: panel.querySelector('#ai-fab-send'), newBtn: panel.querySelector('#ai-fab-new'),
      },
      // No tiles to read on these pages, so the opener is a plain one rather than
      // figures this page cannot compute. `local` keeps it out of the model history.
      greeting: function () {
        return { role: 'bot', local: true, greeting: true,
          html: '<p>Hi ' + esc(accountName().split(/\s+/)[0]) + ' — ask me about your pipelines, ' +
                'or tell me to update a record.</p>' };
      },
      // A write from here changes data this page rendered at load. Reloading would
      // throw away what the person was doing, so say it instead and let them choose.
      onWrite: function () {
        var note = panel.querySelector('.ai-stale');
        if (note) return;
        var bar = document.createElement('div');
        bar.className = 'ai-stale';
        bar.innerHTML = 'This page was loaded before that change. ' +
          '<button type="button" class="ai-stale-reload">Refresh</button>';
        bar.querySelector('button').addEventListener('click', function () { location.reload(); });
        panel.insertBefore(bar, panel.querySelector('.ai-chips'));
      },
    });

    function setOpen(open) {
      panel.classList.toggle('is-open', open);
      fab.classList.toggle('is-open', open);
      fab.setAttribute('aria-expanded', String(open));
      if (open) api.focus();
    }
    fab.addEventListener('click', function () { setOpen(!panel.classList.contains('is-open')); });
    panel.querySelector('#ai-fab-close').addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
    });
    mounted = api;
    return api;
  }

  // Most pages have #sidebar-mount in their markup, so one attempt at DOMContentLoaded
  // is enough. sequences.html builds its sidebar from script afterwards, though, and a
  // single attempt finds nothing — so keep watching for a few seconds rather than
  // picking a delay and hoping.
  function tryMount() {
    if (mountFab()) return true;
    if (document.getElementById('ai-fab')) return true;
    return false;
  }
  function startMounting() {
    if (tryMount()) return;
    var obs = new MutationObserver(function () { if (tryMount()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    // A page that never grows a sidebar (the settings screens, the public form) would
    // otherwise leave this observing for the life of the document.
    setTimeout(function () { obs.disconnect(); }, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMounting);
  else startMounting();

  window.titanAssistant = { create: create, mountFab: mountFab,
                            instance: function () { return mounted; }, CHIPS: CHIPS,
                            aiTable: aiTable, textToHtml: textToHtml, accountName: accountName };
})();
