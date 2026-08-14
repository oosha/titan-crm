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
  // What a field collects, named the way the person building the form thinks about it.
  //
  // These used to be the raw HTML input types, lowercase, straight out of the markup —
  // `text`, `tel`, `url`, `textarea`. Nobody setting up an intake form thinks "I need a
  // tel"; they think "I need their phone number". The stored value is unchanged and still
  // the input type, so this is a label map and nothing more; api/_form.js keeps validating
  // the same strings.
  //
  // Ordered by how often a form needs them, not alphabetically: the two text fields first,
  // then the three that describe a way of reaching someone, then the two about when.
  const TYPES = [
    { value: 'text',     label: 'Short text',        hint: 'One line' },
    { value: 'textarea', label: 'Long text',         hint: 'A paragraph' },
    { value: 'email',    label: 'Email address',     hint: 'Checked before it is accepted' },
    { value: 'tel',      label: 'Phone number',      hint: '' },
    { value: 'url',      label: 'Web link',          hint: '' },
    { value: 'date',     label: 'Date',              hint: '' },
    { value: 'time',     label: 'Time',              hint: '' },
    { value: 'select',   label: 'Choose from a list', hint: 'You set the options' },
  ];
  const TYPE_LABEL = {};
  TYPES.forEach(function (t) { TYPE_LABEL[t.value] = t.label; });

  function isLocked(f) { return f.target === 'name' || f.target === 'email'; }

  // The record field a target writes to, in the words the record screen uses. `designation`
  // and `note` are storage names; nobody reading this row calls them that.
  const DEST_LABEL = {
    name: 'name', email: 'email', phone: 'phone', designation: 'job title',
    company: 'company', location: 'location', linkedin: 'LinkedIn', note: 'notes',
  };
  function destLabel(target) { return DEST_LABEL[target] || target; }

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

  // A form that hasn't been set up yet. It starts accepting responses: the token is random
  // and unguessable, so nothing is reachable until someone shares the link — and setting a
  // form up only to find it silently dropping submissions is the worse failure of the two.
  // Untick "Accepting responses" to pause it.
  window.titanFormDefault = function (personaId, pipeline) {
    const pl = pipeline || {};
    const kind = pl.type === 'hiring' ? 'hiring' : 'sales';
    const heading = pl.name
      ? (kind === 'hiring' ? 'Apply — ' + pl.name : 'Get in touch about ' + pl.name)
      : '';
    return {
      token: (personaId || 'default') + '.' + newTokenSuffix(),
      enabled: true,
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
        // The logo tile is the upload control, not a preview beside one. A separate
        // "Upload logo" button made branding look like a second task; here the thing you
        // click is the thing you get, and it sits where it sits on the form itself —
        // to the left of the title.
        '<div class="fb-card">' +
          '<div class="fb-title-row">' +
            '<div class="fb-row"><label for="fb-heading">Form title</label>' +
              '<input class="ds-input fb-big" id="fb-heading" data-meta="heading" placeholder="e.g. Apply — Senior Frontend Engineer"></div>' +
            '<div class="fb-logo-slot">' +
              '<button type="button" class="fb-logo-drop" title="Add a logo">' +
                '<span class="fb-logo-empty">' +
                  (window.dsIcon ? window.dsIcon('upload', { size: 17 }) : '') +
                  '<span>Logo</span>' +
                '</span>' +
              '</button>' +
              '<button type="button" class="fb-logo-clear" title="Remove logo" aria-label="Remove logo">' +
                (window.dsIcon ? window.dsIcon('close', { size: 11 }) : '&times;') +
              '</button>' +
            '</div>' +
            '<input type="file" class="fb-logo-file" accept="image/*" hidden>' +
          '</div>' +
        '</div>' +

        '<div class="fb-card">' +
          '<div class="fb-card-title">Fields</div>' +
          '<div class="fb-fields"></div>' +
          '<button type="button" class="ds-btn ds-btn--add fb-add-btn">Add a field</button>' +
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
    const drop = this.$('.fb-logo-drop');
    const clear = this.$('.fb-logo-clear');
    const has = !!this.form.logoUrl;
    // The empty prompt stays in the markup and is hidden, rather than being rebuilt, so the
    // icon inside it is hydrated once instead of on every keystroke in the title field.
    drop.classList.toggle('has-logo', has);
    drop.title = has ? 'Change logo' : 'Add a logo';
    const img = drop.querySelector('img');
    if (has) {
      if (img) img.src = this.form.logoUrl;
      else drop.insertAdjacentHTML('beforeend', '<img src="' + esc(this.form.logoUrl) + '" alt="">');
    } else if (img) {
      img.remove();
    }
    clear.style.display = has ? '' : 'none';
  };

  Builder.prototype.wireLogo = function () {
    const self = this;
    const file = this.$('.fb-logo-file');
    this.$('.fb-logo-drop').addEventListener('click', function () { file.click(); });
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
      // Where a value lands on the record, said out loud. "Company" writes to the card's
      // company field — which is what the directory pages and contact dedupe read — while
      // a custom field is only ever stored. Those are different things and the row used to
      // look identical either way.
      const dest = locked
        ? (f.target === 'name' ? 'Always asked' : 'Always asked')
        : (f.target === 'custom' ? 'Custom field' : 'Saved to ' + destLabel(f.target));
      const isSelect = f.type === 'select';
      return '<div class="fb-field' + (locked ? ' is-locked' : '') + '" data-i="' + i + '"' + (locked ? '' : ' draggable="true"') + '>' +
        '<span class="fb-grip">⋮⋮</span>' +
        '<input class="ds-input" value="' + esc(f.label || '') + '" data-act="label" placeholder="What to ask for">' +
        (locked
          ? '<span class="ds-badge">' + (f.target === 'name' ? 'Name' : 'Email') + '</span>'
          : '<select class="ds-input" data-act="type">' +
              TYPES.map(function (t) {
                return '<option value="' + t.value + '"' + (f.type === t.value ? ' selected' : '') + '>' + esc(t.label) + '</option>';
              }).join('') +
            '</select>') +
        '<label class="fb-req"><input type="checkbox" data-act="req"' + (f.required || locked ? ' checked' : '') +
          (locked ? ' disabled' : '') + '> Required</label>' +
        '<button type="button" class="ds-btn ds-btn--ghost ds-btn--icon ds-btn--sm fb-del" data-act="del" title="Remove this field">' +
          (window.dsIcon ? window.dsIcon('close', { size: 13 }) : '×') + '</button>' +
        // Wraps onto its own grid row, under the label it describes — so the controls above
        // it all sit on one line instead of centring against a two-line column.
        '<span class="fb-dest">' + esc(dest) + '</span>' +
        // "Choose from a list" is the one type that needs more than a name. It was offered
        // in the picker with no way to enter the options, so picking it produced a dropdown
        // containing only "Choose…" — a type that could not work.
        (isSelect
          ? '<div class="fb-options">' +
              '<input class="ds-input" data-act="options" placeholder="Options, separated by commas" ' +
                'value="' + esc((f.options || []).join(', ')) + '">' +
            '</div>'
          : '') +
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
      on('type', 'change', function (e) {
        const f = self.form.fields[i];
        f.type = e.target.value;
        // Switching away from a list leaves its options behind as dead data on the stored
        // form; switching back would silently resurrect them.
        if (f.type !== 'select') delete f.options;
        // The options input appears and disappears with the type, so this row is redrawn
        // rather than patched.
        self.renderFields();
        self.renderPreview();
      });
      on('options', 'input', function (e) {
        self.form.fields[i].options = e.target.value.split(',')
          .map(function (s) { return s.trim(); }).filter(Boolean);
        self.renderPreview();
      });
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
            '<button type="button" class="ds-btn ds-btn--ghost ds-btn--icon fb-close" aria-label="Close">' +
              (window.dsIcon ? window.dsIcon('close', { size: 15 }) : '&times;') + '</button>' +
          '</div>' +
          '<div class="fb-scroll"></div>' +
          '<div class="fb-foot">' +
            '<span class="fb-err"></span>' +
            '<button type="button" class="ds-btn ds-btn--ghost fb-cancel">Cancel</button>' +
            '<button type="button" class="ds-btn ds-btn--primary fb-save">' + esc(opts.saveLabel || 'Save form') + '</button>' +
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
