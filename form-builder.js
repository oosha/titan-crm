// The intake-form builder, as one embeddable thing.
//
//   titanFormBuilder.open({ pipeline, form, onSave })   → in a modal, over whatever page
//   titanFormBuilder.mount(hostEl, { … })               → inline, for the standalone route
//
// It is used from three places — the new-pipeline modal (where the pipeline does not
// exist yet), the Forms tab (editing a saved one), and /crm/pipeline/:id/form — so it
// lives here rather than in any of them. A second copy of a field editor would drift
// from the first, and the preview drifting from the real form is the one thing this
// feature cannot afford.
//
// It never saves anything itself. `onSave(form, pipeline)` hands the edited objects
// back and the caller decides what that means: POST /api/data for an existing
// pipeline, or hold it in memory until the pipeline is created.
//
// Requires form-render.js (the preview) and form.css + form-builder.css.
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Where a submitted value lands on the card. Mirrors TARGETS in api/_form.js; the
  // server is what enforces it, this is what the builder offers.
  const TARGETS = [
    { target: 'name',        label: 'Full name', type: 'text',     locked: true },
    { target: 'email',       label: 'Email',     type: 'email',    locked: true },
    { target: 'phone',       label: 'Phone',     type: 'tel' },
    { target: 'designation', label: 'Job title', type: 'text' },
    { target: 'company',     label: 'Company',   type: 'text' },
    { target: 'location',    label: 'Location',  type: 'text' },
    { target: 'linkedin',    label: 'LinkedIn',  type: 'url' },
    { target: 'note',        label: 'Message',   type: 'textarea' },
  ];
  const TYPES = ['text', 'email', 'tel', 'url', 'textarea', 'select'];

  function isLocked(f) { return f.target === 'name' || f.target === 'email'; }

  function newTokenSuffix() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, 10);
  }

  // What a new form starts with, by the kind of pipeline it feeds. Name and email are
  // always there because a record needs them; the rest is the shortest set that makes
  // the form useful without editing — a candidate is asked for a CV link and why the
  // role, an enquiry for its company and what it needs. Everything is removable.
  const PRESETS = {
    hiring: [
      { key: 'phone',    label: 'Phone',        type: 'tel',      target: 'phone' },
      { key: 'linkedin', label: 'LinkedIn or portfolio', type: 'url', target: 'linkedin' },
      { key: 'note',     label: 'Why this role?', type: 'textarea', target: 'note',
        placeholder: 'A few lines is plenty' },
    ],
    sales: [
      { key: 'company',  label: 'Company',      type: 'text',     target: 'company' },
      { key: 'phone',    label: 'Phone',        type: 'tel',      target: 'phone' },
      { key: 'note',     label: 'What do you need?', type: 'textarea', target: 'note',
        placeholder: 'A sentence or two about what you’re after' },
    ],
  };

  // A form that hasn't been set up yet. Starts paused: a link should not be live
  // while it is still being written.
  window.titanFormDefault = function (personaId, pipeline) {
    const pl = pipeline || {};
    const kind = pl.type === 'hiring' ? 'hiring' : 'sales';
    const heading = pl.name
      ? (kind === 'hiring' ? 'Apply — ' + pl.name : 'Get in touch about ' + pl.name)
      : '';
    return {
      token: (personaId || 'default') + '.' + newTokenSuffix(),
      enabled: false,
      heading: heading,
      blurb: '',
      logoUrl: '',
      submitLabel: kind === 'hiring' ? 'Send application' : 'Submit',
      thanks: kind === 'hiring'
        ? 'Thanks — your application is in. We’ll be in touch.'
        : 'Thanks — we have your details and will be in touch.',
      recordTitle: pl.name || '',
      sourceLabel: 'Form',
      fields: [
        { key: 'name', label: 'Full name', type: 'text', target: 'name', required: true },
        { key: 'email', label: 'Email', type: 'email', target: 'email', required: true },
      ].concat(JSON.parse(JSON.stringify(PRESETS[kind]))),
    };
  };

  // Two things to set — what the form is called and what it asks. Everything else
  // (submit label, thank-you text, the record's title, the source label) has a sane
  // default and is not worth a control: this panel is read while someone is trying to
  // get a link out, not while they are tuning copy.
  const SHELL = '' +
    '<div class="fb-cols">' +
      '<div class="fb-edit">' +
        '<div class="fb-card">' +
          '<div class="fb-row"><label>Form title</label>' +
            '<input class="fb-input fb-big" data-meta="heading" placeholder="e.g. Apply — Senior Frontend Engineer"></div>' +
          '<div class="fb-logo-row">' +
            '<div class="fb-logo-prev"></div>' +
            '<div class="fb-logo-acts">' +
              '<button type="button" class="fb-ghost fb-logo-pick">Upload logo</button>' +
              '<button type="button" class="fb-link-btn fb-logo-clear">Remove</button>' +
              '<input type="file" class="fb-logo-file" accept="image/*" hidden>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="fb-card">' +
          '<div class="fb-card-title">Fields</div>' +
          '<div class="fb-fields"></div>' +
          '<button type="button" class="fb-add-btn">+ Add field</button>' +
        '</div>' +

        '<label class="fb-toggle"><input type="checkbox" class="fb-enabled"> Accepting responses</label>' +
      '</div>' +

      '<div class="fb-preview">' +
        '<div class="fb-preview-head">Preview</div>' +
        '<div class="tf-sheet"><div class="tf-card fb-body"></div></div>' +
      '</div>' +
    '</div>';

  // One live editor over a form object. `host` is any element; the modal is just a
  // host with an overlay around it.
  function Builder(host, opts) {
    const self = this;
    this.host = host;
    this.pipeline = opts.pipeline || {};
    this.form = JSON.parse(JSON.stringify(opts.form || window.titanFormDefault(opts.personaId, this.pipeline)));
    this.onSave = opts.onSave || function () {};
    this.origin = opts.origin || location.origin;

    host.innerHTML = SHELL;
    this.$ = function (sel) { return host.querySelector(sel); };

    // Meta inputs bound straight onto the form object.
    host.querySelectorAll('[data-meta]').forEach(function (el) {
      const key = el.dataset.meta;
      el.value = self.form[key] || '';
      el.addEventListener('input', function () { self.form[key] = el.value; self.renderPreview(); });
    });
    this.$('.fb-enabled').checked = !!this.form.enabled;
    this.$('.fb-enabled').addEventListener('change', function (e) { self.form.enabled = e.target.checked; });
    this.$('.fb-add-btn').addEventListener('click', function () { self.addField(); });
    this.wireLogo();

    this.renderFields();
    this.renderPreview();
    this.renderLogo();
  }

  // The logo is stored on the form as a data URI, so it travels with the pipeline
  // document and needs no upload endpoint or asset host. That document is POSTed
  // whole on every save, so the image is downscaled hard before it goes in — a
  // full-size logo would be re-committed on every unrelated CRM edit.
  const LOGO_MAX_EDGE = 320;
  const LOGO_MAX_BYTES = 60 * 1024;

  Builder.prototype.renderLogo = function () {
    const prev = this.$('.fb-logo-prev');
    const clear = this.$('.fb-logo-clear');
    if (this.form.logoUrl) {
      prev.innerHTML = '<img src="' + esc(this.form.logoUrl) + '" alt="">';
      prev.classList.remove('is-empty');
      clear.style.display = '';
    } else {
      prev.innerHTML = '<span>No logo</span>';
      prev.classList.add('is-empty');
      clear.style.display = 'none';
    }
  };

  Builder.prototype.wireLogo = function () {
    const self = this;
    const file = this.$('.fb-logo-file');
    this.$('.fb-logo-pick').addEventListener('click', function () { file.click(); });
    this.$('.fb-logo-clear').addEventListener('click', function () {
      self.form.logoUrl = '';
      self.renderLogo(); self.renderPreview();
    });
    file.addEventListener('change', function () {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      const img = new Image();
      const reader = new FileReader();
      reader.onload = function () { img.src = reader.result; };
      img.onload = function () {
        const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // PNG keeps transparency, which most logos need; fall back to JPEG only if
        // the PNG comes out too heavy to sit inside the data document.
        let url = canvas.toDataURL('image/png');
        if (url.length > LOGO_MAX_BYTES) url = canvas.toDataURL('image/jpeg', 0.82);
        if (url.length > LOGO_MAX_BYTES) {
          alert('That image is too detailed to store inline. Try a simpler or smaller logo.');
          return;
        }
        self.form.logoUrl = url;
        self.renderLogo(); self.renderPreview();
      };
      img.onerror = function () { alert('That file didn\'t load as an image.'); };
      reader.readAsDataURL(f);
    });
  };

  Builder.prototype.renderPreview = function () {
    this.$('.fb-body').innerHTML = window.titanFormBodyHTML(this.form, { inert: true, idPrefix: 'fb-pv-' });
  };

  Builder.prototype.renderFields = function () {
    const self = this;
    const host = this.$('.fb-fields');
    host.innerHTML = this.form.fields.map(function (f, i) {
      const locked = isLocked(f);
      return '<div class="fb-field' + (locked ? ' is-locked' : '') + '" data-i="' + i + '"' + (locked ? '' : ' draggable="true"') + '>' +
        '<span class="fb-grip">⋮⋮</span>' +
        '<input class="fb-input" value="' + esc(f.label || '') + '" data-act="label" placeholder="Label">' +
        (locked
          ? '<span class="fb-lock">' + (f.target === 'name' ? 'Name' : 'Email') + '</span>'
          : '<select class="fb-select" data-act="type">' +
              TYPES.map(function (t) { return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
            '</select>') +
        '<label class="fb-req"><input type="checkbox" data-act="req"' + (f.required || locked ? ' checked' : '') +
          (locked ? ' disabled' : '') + '> required</label>' +
        '<button type="button" class="fb-del" data-act="del" title="Remove field">×</button>' +
      '</div>';
    }).join('');

    host.querySelectorAll('.fb-field').forEach(function (row) {
      const i = Number(row.dataset.i);
      const on = function (act, ev, fn) {
        const el = row.querySelector('[data-act="' + act + '"]');
        if (el) el.addEventListener(ev, fn);
      };
      on('label', 'input', function (e) {
        const f = self.form.fields[i];
        f.label = e.target.value;
        // A custom field's name on the pipeline is what the record page shows, so keep
        // the two in step rather than letting the form drift from the record.
        if (f.target === 'custom') {
          (self.pipeline.customFieldDefs || []).forEach(function (d) { if (d.key === f.key) d.name = e.target.value; });
        }
        self.renderPreview();
      });
      on('type', 'change', function (e) { self.form.fields[i].type = e.target.value; self.renderPreview(); });
      on('req', 'change', function (e) { self.form.fields[i].required = e.target.checked; self.renderPreview(); });
      on('del', 'click', function () {
        if (isLocked(self.form.fields[i])) return;
        self.form.fields.splice(i, 1);
        self.renderFields(); self.renderPreview();
      });
    });
    this.wireDrag(host);
  };

  Builder.prototype.wireDrag = function (host) {
    const self = this;
    let from = null;
    host.querySelectorAll('.fb-field[draggable]').forEach(function (row) {
      row.addEventListener('dragstart', function () { from = Number(row.dataset.i); row.style.opacity = '0.4'; });
      row.addEventListener('dragend', function () {
        row.style.opacity = '';
        host.querySelectorAll('.fb-field').forEach(function (r) { r.classList.remove('fb-drag-over'); });
      });
      row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('fb-drag-over'); });
      row.addEventListener('dragleave', function () { row.classList.remove('fb-drag-over'); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        const to = Number(row.dataset.i);
        if (from == null || from === to) return;
        const moved = self.form.fields.splice(from, 1)[0];
        self.form.fields.splice(to, 0, moved);
        // The locked pair stays at the front: a form opening with "LinkedIn" above
        // "Full name" reads as broken.
        const locked = self.form.fields.filter(isLocked).sort(function (a) { return a.target === 'name' ? -1 : 1; });
        self.form.fields = locked.concat(self.form.fields.filter(function (f) { return !isLocked(f); }));
        self.renderFields(); self.renderPreview();
      });
    });
  };

  // "Add field" makes a decision instead of asking one. It walks the mapped fields in
  // order — Phone, Job title, Company, Location, LinkedIn, Message — so each click
  // lands a field that already knows where its value belongs on the record. Once those
  // are used up it adds a plain custom field, registered on the pipeline so the record
  // page can render it too. Rename or retype it in the row; nothing here is a
  // commitment.
  Builder.prototype.addField = function () {
    const used = this.form.fields.map(function (f) { return f.key; });
    const next = TARGETS.filter(function (t) { return !t.locked && used.indexOf(t.target) === -1; })[0];

    if (next) {
      this.form.fields.push({ key: next.target, label: next.label, type: next.type, target: next.target, required: false });
    } else {
      if (!Array.isArray(this.pipeline.customFieldDefs)) this.pipeline.customFieldDefs = [];
      const taken = this.pipeline.customFieldDefs.map(function (d) { return d.key; });
      let n = 1; while (taken.indexOf('cf' + n) !== -1) n++;
      const key = 'cf' + n;
      const label = 'New field';
      this.pipeline.customFieldDefs.push({ key: key, name: label, type: 'text' });
      this.form.fields.push({ key: key, label: label, type: 'text', target: 'custom', required: false });
    }
    this.renderFields();
    this.renderPreview();
  };

  Builder.prototype.collect = function () {
    if (!String(this.form.heading || '').trim()) return { error: 'Give the form a title — it’s the first thing a reader sees.' };
    // The panel no longer asks for these, so they are filled in from what we know.
    if (!String(this.form.recordTitle || '').trim()) this.form.recordTitle = this.pipeline.name || 'New enquiry';
    if (!String(this.form.sourceLabel || '').trim()) this.form.sourceLabel = 'Form';
    if (!String(this.form.submitLabel || '').trim()) this.form.submitLabel = 'Submit';
    if (!String(this.form.thanks || '').trim()) this.form.thanks = 'Thanks — we have your details and will be in touch.';
    return { form: this.form, pipeline: this.pipeline };
  };

  // ── Inline mount ───────────────────────────────────────────────────────────
  window.titanFormBuilder = {
    mount: function (host, opts) { return new Builder(host, opts); },

    // ── Modal ────────────────────────────────────────────────────────────────
    // Opened over the page it was launched from, so setting up a form never costs
    // you your place — from the new-pipeline modal it stacks on top of it.
    open: function (opts) {
      const wrap = document.createElement('div');
      wrap.className = 'fb-overlay';
      wrap.innerHTML =
        '<div class="fb-modal" role="dialog" aria-modal="true">' +
          '<div class="fb-head">' +
            '<span class="fb-title">' + esc(opts.title || 'Form setup') + '</span>' +
            '<button type="button" class="fb-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="fb-scroll"></div>' +
          '<div class="fb-foot">' +
            '<span class="fb-err"></span>' +
            '<button type="button" class="fb-ghost fb-cancel">Cancel</button>' +
            '<button type="button" class="fb-primary fb-save">' + esc(opts.saveLabel || 'Save form') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      document.body.classList.add('fb-locked');

      const builder = new Builder(wrap.querySelector('.fb-scroll'), opts);

      function close() {
        wrap.remove();
        document.body.classList.remove('fb-locked');
        document.removeEventListener('keydown', onKey);
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);

      wrap.querySelector('.fb-close').addEventListener('click', close);
      wrap.querySelector('.fb-cancel').addEventListener('click', close);
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });

      const saveBtn = wrap.querySelector('.fb-save');
      saveBtn.addEventListener('click', async function () {
        const out = builder.collect();
        const err = wrap.querySelector('.fb-err');
        if (out.error) { err.textContent = out.error; return; }
        err.textContent = '';
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        try {
          await opts.onSave(out.form, out.pipeline);
          close();
        } catch (e2) {
          saveBtn.disabled = false; saveBtn.textContent = opts.saveLabel || 'Save form';
          err.textContent = 'Couldn’t save: ' + ((e2 && e2.message) || e2);
        }
      });

      return { close: close, builder: builder };
    },
  };
})();
