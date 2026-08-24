// The intake-form builder, mounted inline by the standalone full-page route.
//
//   titanFormBuilder.mount(hostEl, { … }) → /crm/pipeline/:id/form
//
// Every product entry point navigates to that cold-loadable route. The older `open()`
// modal adapter remains below only for compatibility with external prototype call sites;
// nothing in this repo calls it, and form creation/editing must not reintroduce one.
// Keeping the field editor here rather than in the route prevents a second copy from
// drifting, especially the preview shared with the public form.
//
// The mounted builder never saves anything itself. The full-page route collects its
// output and persists the form and any custom-field definitions together.
//
// Requires form-render.js (the preview) and form.css + form-builder.css.
(function () {
  // Pausing a form is built and works end to end — `enabled: false` makes
  // GET /api/form 404 exactly like a missing form (api/form.js) — but the control for
  // it is parked: a tickbox in the editor was the wrong home for it. Flip this back to
  // true to restore the checkbox and its wiring, both of which are kept below rather
  // than deleted. Nothing about the stored shape changes while it is off.
  //
  // While it is off the builder forces `enabled: true` on whatever it loads, because a
  // form stored as paused would otherwise have no way back — its link would 404 for
  // good with no control on any screen to explain it or undo it.
  const PAUSE_UI = false;
  const TITLE_MAX = 80;
  const PANE_EDITOR_MIN = 50;
  const PANE_EDITOR_MAX = 68;
  const PANE_EDITOR_DEFAULT = 60;
  const PANE_KEY_STEP = 2;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Where a submitted value lands on the card. Mirrors TARGETS in api/_form.js; the
  // server is what enforces it, this is what the builder offers.
  //
  // `type` is not a suggestion — it is the input type this destination implies, and the
  // only one it can have. A question routed to the record's Phone collects a phone
  // number; there is no version of that row where it collects a date. That is why the
  // builder no longer has a type picker: choosing the destination IS choosing the type,
  // and offering both invited a form that validated one thing into a record field
  // declared as another.
  //
  // `field` is the key the same thing has in crm-schema.js, so the row can be labelled in
  // the record's own words — "Current title" on a hiring board, "Delivery address" on an
  // orders one — instead of from a table in here that disagrees with both.
  const TARGETS = [
    { target: 'name',        label: 'Full name', type: 'text',     field: 'contact-name',        locked: true },
    { target: 'email',       label: 'Email',     type: 'email',    field: 'contact-email',       locked: true },
    { target: 'phone',       label: 'Phone',     type: 'tel',      field: 'contact-phone' },
    { target: 'designation', label: 'Job title', type: 'text',     field: 'contact-designation' },
    { target: 'company',     label: 'Company',   type: 'text',     field: 'company' },
    { target: 'location',    label: 'Location',  type: 'text',     field: 'contact-location' },
    { target: 'linkedin',    label: 'LinkedIn',  type: 'url',      field: 'contact-linkedin' },
    { target: 'note',        label: 'Message',   type: 'textarea', field: 'note' },
  ];
  const TARGET_BY = {};
  TARGETS.forEach(function (t) { TARGET_BY[t.target] = t; });

  // A question that isn't one of the record's own fields makes a new field on the record.
  // That new field needs a type, and this is the only place a type is chosen directly —
  // which is why the kinds live in the same list as the destinations above rather than in
  // a second dropdown beside it. One choice: where the answer goes, and what it is.
  //
  // `record` is the type the pipeline's customFieldDefs will carry, and it is a different
  // vocabulary from the form's input type (opportunity-view.html renders from it:
  // text | number | date | amount | select). Both halves are written from this one entry,
  // because a form validating a date into a field declared `text` is the exact mismatch
  // this list exists to make impossible.
  //
  // Only the kinds that survive the whole trip are offered. `time` is missing because the
  // record has no renderer for it, and `number`/`amount` because api/_form.js has no
  // validator for them — a question whose answer can't be shown or can't be checked is
  // worse than one that isn't offered.
  const CUSTOM_KINDS = [
    { kind: 'text',     label: 'Short text',    type: 'text',     record: 'text' },
    { kind: 'textarea', label: 'Long text',     type: 'textarea', record: 'text' },
    { kind: 'date',     label: 'Date',          type: 'date',     record: 'date' },
    { kind: 'select',   label: 'Choice list',   type: 'select',   record: 'select' },
  ];
  const KIND_BY_TYPE = {};
  CUSTOM_KINDS.forEach(function (k) { KIND_BY_TYPE[k.type] = k; });

  // The same correspondence read the other way, for pointing a question at a custom field
  // the record already has: its stored type decides what the form may ask for, not the
  // reverse. Types absent here (number, amount) have no form input that can be validated
  // into them — see the filter in destinationsFor().
  const RECORD_TO_FORM = { text: 'text', date: 'date', select: 'select' };

  // What the visitor is being asked for, said plainly. Not a control any more — a caption,
  // so the row can state the consequence of the one choice it does offer.
  const TYPE_LABEL = {
    text: 'Short text', textarea: 'Long text', email: 'Email address', tel: 'Phone number',
    url: 'Web link', date: 'Date', time: 'Time', select: 'Choice list',
  };

  function isLocked(f) { return f.target === 'name' || f.target === 'email'; }

  let BUILDER_SEQ = 0;

  // Labels for the record's fields come from crm-schema.js, which is what owns them —
  // three pages keeping their own tables is how an orders board came to show "Opportunity
  // name". The fallback is for a page that forgot the script: the builder should render a
  // slightly plainer row, not throw.
  function schemaFor(pipeline) {
    return (window.titanSchema && pipeline) ? window.titanSchema.resolve(pipeline) : null;
  }
  function fieldLabel(schema, t) {
    return (schema && t.field && schema.byKey[t.field]) ? schema.label(t.field) : t.label;
  }

  // The destinations this pipeline can actually offer, in the order TARGETS lists them.
  // A field the entity doesn't have at all (`none` in the schema — Instagram on a hiring
  // board) is absent from schema.fields and so is never offered: the answer would land
  // somewhere the record can't show. A field that merely defaults to off is still offered,
  // with the row saying it is currently hidden — that one is a toggle away, not impossible.
  function destinationsFor(pipeline, fields, current, created) {
    const schema = schemaFor(pipeline);
    const fresh = created || [];
    const currentTarget = current && current.target;
    const currentKey = current && current.key;
    const used = {};
    const usedKeys = {};
    (fields || []).forEach(function (f) {
      if (!f.target) return;
      if (f.target === 'custom') {
        // Custom destinations collide by key, not by target — every one of them shares
        // the target 'custom'.
        if (f.key && f.key !== currentKey) usedKeys[f.key] = true;
      } else if (f.target !== currentTarget) {
        used[f.target] = true;
      }
    });

    const own = TARGETS.filter(function (t) {
      if (t.locked) return false;
      return !schema || !!schema.byKey[t.field];
    }).map(function (t) {
      return {
        value: 'target:' + t.target,
        label: fieldLabel(schema, t),
        used: !!used[t.target],
        hidden: !!(schema && !schema.on(t.field)),
        selected: currentTarget === t.target,
      };
    });

    // The pipeline's own custom fields, which the record already has and the record page
    // already renders. Left out until now, so a question could not be pointed at a field
    // that existed — "Add custom field" was the only route, and it minted a duplicate
    // beside it. They are record fields for this pipeline, so they belong in that group.
    const defs = ((pipeline && pipeline.customFieldDefs) || []).filter(function (d) {
      // Fields this session invented are left out. Choosing "Save to a custom field" creates
      // the field on the pipeline immediately and renames it from the label as you type — so
      // listing it here meant your half-typed question appeared, letter by letter, in every
      // other row's list of the record's fields. It is already represented by the row that
      // made it, and two questions cannot usefully feed one new field anyway.
      if (fresh.indexOf(d.key) !== -1) return false;
      // `number` and `amount` are left out on purpose: api/_form.js has no validator for
      // either, so a question pointed at one could put letters in a field the record
      // renders as a number. Offering it would break the one guarantee this list makes —
      // that what a destination accepts is what the form collects.
      return RECORD_TO_FORM[d.type || 'text'];
    });
    const custom = defs.map(function (d) {
      return {
        value: 'existing:' + d.key,
        label: d.name || d.key,
        used: !!usedKeys[d.key],
        hidden: false,
        selected: currentTarget === 'custom' && currentKey === d.key,
      };
    });

    return own.concat(custom);
  }

  // One row of the picker. A tick on the right for a destination another question already
  // uses — the state, said once, in the place a list says states, instead of repeating
  // "already asked" in every label. Ticked rows are unpickable: one record field holds one
  // answer, and disabling it in place shows why rather than making it vanish.
  // `pipeline` marks the rows that are fields the record already has, so each one carries
  // the pipeline's own mark in the pipeline's own colour — the same glyph the sticky header
  // above them and the sidebar row use. It says "this answer lands on a field of that
  // record" at the row level, where the choice is actually made, rather than only once at
  // the top of the panel. The "Create a new field" kinds deliberately go without: those
  // are not fields of the pipeline yet, and marking them would erase the one distinction
  // the two groups exist to draw. dsPipelineTag.mark() is the registered way to take that
  // glyph on its own; the fallback is no mark rather than a hand-drawn path.
  function pipelineMark(pipeline) {
    return (pipeline && window.dsPipelineTag && window.dsPipelineTag.mark)
      ? '<span class="fb-dest-mark" style="--pipe: ' + esc(pipeline.color || '#2170f4') + '"' +
          ' aria-hidden="true">' + window.dsPipelineTag.mark(12) + '</span>'
      : '';
  }
  function destItemHTML(d, pipeline) {
    const mark = pipelineMark(pipeline);
    const meta = d.used
      ? '<span class="ds-menu__meta fb-dest-tick">' +
          (window.dsIcon ? window.dsIcon('check', { size: 13 }) : '✓') + '</span>'
      // Only when it isn't already spoken for: a row can't usefully say two things.
      : (d.hidden ? '<span class="ds-menu__meta">Hidden</span>' : '');
    return '<button type="button" role="menuitem"' +
      ' class="ds-menu__item' + (d.selected ? ' is-selected' : '') + '"' +
      ' data-pick="' + esc(d.value) + '"' +
      (d.used ? ' aria-disabled="true"' : '') +
      (d.selected ? ' aria-current="true"' : '') + '>' +
      mark + '<span class="fb-dest-label">' + esc(d.label) + '</span>' + meta +
    '</button>';
  }

  // Viewport coordinates for a `--fixed` panel: under its trigger, aligned to its left
  // edge, and flipped above when there isn't room below — a field near the bottom of a
  // long form would otherwise open a list you can't see.
  //
  // The height cap has to come from the space actually available, not from a constant.
  // The panel's CSS caps it at 440px, and flipping alone doesn't help when neither side
  // has 440px: the list then ran past the top or bottom of the viewport, and because it
  // is `position: fixed` there was no page scroll that could reach the part cut off —
  // its own overflow only scrolls within whatever box it was given. Clamping to the
  // chosen side's room is what makes that overflow usable.
  function placeMenu(trigger, panel) {
    if (!trigger || !panel) return;
    const r = trigger.getBoundingClientRect();
    const gap = 6;
    const edge = 8;                       // never sit flush against the viewport edge
    const floor = 160;                    // below this a list is worse than a cramped one
    panel.style.minWidth = Math.max(r.width, 240) + 'px';
    panel.style.left = Math.round(r.left) + 'px';
    // Measured with the panel laid out but not shown, so `display: none` doesn't report 0,
    // and with any previous clamp cleared so this reads the natural height.
    panel.style.maxHeight = '';
    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    const h = panel.offsetHeight;
    panel.style.display = '';
    panel.style.visibility = '';
    const below = window.innerHeight - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    // Flip up only when below cannot hold the list and above genuinely has more room.
    const flipUp = below < h && above > below;
    const room = Math.max(flipUp ? above : below, floor);
    const height = Math.min(h, room);
    panel.style.maxHeight = height + 'px';
    panel.style.top = Math.round(flipUp ? r.top - height - gap : r.bottom + gap) + 'px';
  }

  // The pipeline the panel's fields belong to, as the design system's Pipeline tag — the
  // one place that mark and that tint are now defined. The fallback is for a page that
  // hasn't added components/pipeline-tag.js: a plain name still names the pipeline, which
  // is the part that carries the meaning.
  function pipelineTag(pipeline) {
    const pl = pipeline || {};
    if (window.dsPipelineTag) return window.dsPipelineTag({ name: pl.name, color: pl.color });
    return '<span class="fb-dest-head-name">' + esc(pl.name || 'this pipeline') + '</span>';
  }

  function newTokenSuffix() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, 10);
  }

  // What a new form starts with, by the kind of pipeline it feeds. Name and email are
  // always present as the record's identity fields and default to required, but the user
  // may make either optional. The rest is the shortest set that makes the form useful
  // without editing — a candidate is asked for a CV link and why the role, an enquiry for
  // its company and what it needs. Everything except the identity fields is removable.
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
  // Pausing is parked (see PAUSE_UI), so accepting is now the only state a form is in.
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
      '<section class="fb-edit" aria-label="Edit form">' +
        '<div class="fb-edit-content">' +
        // The logo tile is the upload control, not a preview beside one. A separate
        // "Upload logo" button made branding look like a second task; here the thing you
        // click is the thing you get. It leads the card, above the title and flush left,
        // which is also the order they appear in on the form itself. DOM order is the
        // visual order, so tabbing goes logo then title.
        '<div class="ds-card ds-card--section fb-card">' +
          '<div class="fb-title-row">' +
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
            '<div class="ds-floating-field ds-floating-field--counted">' +
              '<input class="ds-input" id="fb-heading" data-meta="heading" placeholder=" "' +
                ' maxlength="' + TITLE_MAX + '">' +
              '<label class="ds-floating-field__label" for="fb-heading">Form title</label>' +
              '<span class="ds-floating-field__counter" aria-hidden="true"><span data-title-count>0</span>/' +
                TITLE_MAX + '</span>' +
            '</div>' +
            '<input type="file" class="fb-logo-file" accept="image/*" hidden>' +
          '</div>' +
        '</div>' +

        '<div class="ds-card ds-card--section fb-card">' +
          '<div class="fb-field-head">' +
            '<span class="fb-field-head-name">Field name</span>' +
            '<span class="fb-field-head-dest">Save to</span>' +
          '</div>' +
          '<div class="fb-fields"></div>' +
          '<button type="button" class="ds-btn ds-btn--add fb-add-btn">Add a new field</button>' +
        '</div>' +

        // Kept, not deleted — see PAUSE_UI at the top of this file.
        (PAUSE_UI ? '<label class="fb-toggle"><input type="checkbox" class="fb-enabled"> Accepting responses</label>' : '') +
        '</div>' +
      '</section>' +

      '<section class="fb-preview" aria-label="Form preview">' +
        '<div class="fb-pane-resizer" role="separator" tabindex="0"' +
          ' aria-label="Resize editor and preview panes" aria-orientation="vertical"' +
          ' aria-valuemin="' + PANE_EDITOR_MIN + '" aria-valuemax="' + PANE_EDITOR_MAX + '"' +
          ' aria-valuenow="' + PANE_EDITOR_DEFAULT + '"></div>' +
        '<div class="fb-preview-content">' +
        '<h2 class="fb-preview-title">Preview</h2>' +
        '<div class="fb-preview-stage">' +
        // The legacy modal keeps its compact badge on the form itself. The inline route
        // hides it in favour of the pane-level heading above.
        '<span class="ds-badge ds-badge--accent fb-preview-badge">Form Preview</span>' +
        '<div class="tf-sheet"><div class="tf-card fb-body"></div></div>' +
        '</div>' +
        '</div>' +
      '</section>' +

      // Filled only after a successful publish on the full-page route. Keeping it as a
      // sibling pane lets the preview move left while the sharing handoff arrives on the
      // right; the legacy modal continues to use its compact header result.
      '<section class="fb-share" aria-label="Share published form">' +
        '<div class="fb-share-content"></div>' +
      '</section>' +
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
    this.inline = host.classList.contains('fb-inline');
    // Custom-field keys this session invented, so switching such a row to one of the
    // record's own fields can take its definition back out again — see releaseCustom().
    // Only these are ever removed; a field that existed before may carry values.
    this.created = [];
    // Menu panels are found by id, so two builders on one page (the inline route plus a
    // modal over it) must not mint the same ones.
    this.uid = 'fb' + (++BUILDER_SEQ);

    host.innerHTML = SHELL;
    this.$ = function (sel) { return host.querySelector(sel); };

    // Meta inputs bound straight onto the form object.
    host.querySelectorAll('[data-meta]').forEach(function (el) {
      const key = el.dataset.meta;
      const count = key === 'heading' ? self.$('[data-title-count]') : null;
      const syncCount = function () { if (count) count.textContent = el.value.length; };
      el.value = self.form[key] || '';
      syncCount();
      el.addEventListener('input', function () {
        self.form[key] = el.value;
        syncCount();
        self.renderPreview();
      });
    });
    if (PAUSE_UI) {
      this.$('.fb-enabled').checked = !!this.form.enabled;
      this.$('.fb-enabled').addEventListener('change', function (e) { self.form.enabled = e.target.checked; });
    } else {
      // No control means no way back out of a pause, so don't let one persist.
      this.form.enabled = true;
    }
    this.$('.fb-add-btn').addEventListener('click', function () { self.addField(); });
    this.wireLogo();
    this.wirePaneResize();

    this.healCustomDefs();
    this.renderFields();
    this.renderPreview();
    this.renderLogo();
  }

  // The full-page form route owns a resizable two-pane workspace. The separator changes
  // the editor's share of one centred, width-bounded frame; the preview receives the
  // remainder, so dragging never makes the combined content rails wider than the pattern's
  // shared maximum. The stacked responsive layout hides the separator and ignores input.
  Builder.prototype.wirePaneResize = function () {
    if (!this.inline) return;
    const cols = this.$('.fb-cols');
    const handle = this.$('.fb-pane-resizer');
    if (!cols || !handle) return;

    let ratio = PANE_EDITOR_DEFAULT;
    let workspaceMax = 0;
    let dragging = false;

    function clamp(next) {
      return Math.min(PANE_EDITOR_MAX, Math.max(PANE_EDITOR_MIN, next));
    }
    function measureWorkspaceMax() {
      const probe = document.createElement('span');
      probe.className = 'fb-workspace-measure';
      cols.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width || cols.clientWidth;
    }
    function apply(next) {
      ratio = clamp(next);
      const boundedWidth = Math.min(cols.clientWidth, workspaceMax || cols.clientWidth);
      const editorWidth = boundedWidth * ratio / 100;
      const previewWidth = boundedWidth - editorWidth;
      cols.style.setProperty('--fb-editor-share', ratio + '%');
      cols.style.setProperty('--fb-preview-share', (100 - ratio) + '%');
      cols.style.setProperty('--fb-editor-max', editorWidth + 'px');
      cols.style.setProperty('--fb-preview-max', previewWidth + 'px');
      handle.setAttribute('aria-valuenow', String(Math.round(ratio)));
      handle.setAttribute('aria-valuetext',
        'Editor ' + Math.round(ratio) + '%, preview ' + Math.round(100 - ratio) + '%');
    }
    function frame() {
      const rect = cols.getBoundingClientRect();
      const width = Math.min(rect.width, workspaceMax || rect.width);
      return { left: rect.left + (rect.width - width) / 2, width: width };
    }
    function ratioAt(clientX) {
      const bounds = frame();
      return bounds.width ? (clientX - bounds.left) / bounds.width * 100 : ratio;
    }
    function finish(event) {
      if (!dragging) return;
      dragging = false;
      cols.classList.remove('is-resizing');
      if (event && handle.hasPointerCapture && handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }

    workspaceMax = measureWorkspaceMax();
    apply(ratio);

    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || window.matchMedia('(max-width: 1000px)').matches) return;
      event.preventDefault();
      dragging = true;
      cols.classList.add('is-resizing');
      handle.setPointerCapture(event.pointerId);
      apply(ratioAt(event.clientX));
    });
    handle.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      event.preventDefault();
      apply(ratioAt(event.clientX));
    });
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('keydown', function (event) {
      let next = ratio;
      if (event.key === 'ArrowLeft') next -= PANE_KEY_STEP;
      else if (event.key === 'ArrowRight') next += PANE_KEY_STEP;
      else if (event.key === 'Home') next = PANE_EDITOR_MIN;
      else if (event.key === 'End') next = PANE_EDITOR_MAX;
      else return;
      event.preventDefault();
      apply(next);
    });
    window.addEventListener('resize', function () {
      workspaceMax = measureWorkspaceMax();
      apply(ratio);
    });
  };

  // The mounted full-page route and legacy modal share the preview's FLIP movement. The
  // inline route adds a right-hand sharing pane; the compatibility modal keeps its compact
  // header result.
  Builder.prototype.setPublished = function (published) {
    const cols = this.$('.fb-cols');
    const editEl = cols && cols.querySelector('.fb-edit');
    const previewEl = cols && cols.querySelector('.fb-preview');
    if (!cols || !editEl || !previewEl) {
      if (cols) cols.classList.toggle('is-published', published);
      return;
    }

    const from = previewEl.getBoundingClientRect().left;
    if (published) {
      if (this.inline) this.renderSharePanel();
      // Pinned before it leaves the flow: an absolutely-positioned flex item with no
      // width of its own would collapse to its content and reflow while fading.
      editEl.style.width = editEl.getBoundingClientRect().width + 'px';
      cols.classList.add('is-published');
    } else {
      cols.classList.remove('is-published');
      editEl.style.width = '';
    }

    const dx = Math.round(from - previewEl.getBoundingClientRect().left);
    if (!dx) return;
    previewEl.style.transition = 'none';
    previewEl.style.transform = 'translateX(' + dx + 'px)';

    let released = false;
    const release = function () {
      if (released) return;
      released = true;
      previewEl.style.transition = '';
      previewEl.style.transform = '';
    };
    requestAnimationFrame(release);
    setTimeout(release, 50);
  };

  // The full-page success state is a handoff, not a toast: the published form remains
  // visible while the neighbouring pane gives the three useful ways to distribute it.
  Builder.prototype.renderSharePanel = function () {
    const host = this.$('.fb-share-content');
    if (!host || !this.form.token) return;
    const url = formUrl(this.origin, this.form.token);
    const shareTitle = this.form.heading || 'Form';
    const linkId = this.uid + '-share-link';
    const embedId = this.uid + '-embed-code';
    const icon = function (name, size) {
      return window.dsIcon ? window.dsIcon(name, { size: size }) : '';
    };
    // Brand marks are content rather than design-system icons. They stay monochrome so
    // the button keeps the system's own colour and state treatment.
    const socialMarks =
      '<span class="fb-social-marks" aria-hidden="true">' +
        '<span class="fb-social-mark" title="Facebook"><svg viewBox="0 0 16 16">' +
          '<path d="M9.5 14V8.5h1.9l.3-2.2H9.5V4.9c0-.7.2-1.1 1.1-1.1h1.2v-2c-.2 0-.9-.1-1.7-.1-1.7 0-2.9 1-2.9 3v1.6H5.3v2.2h1.9V14h2.3Z" fill="currentColor"/></svg></span>' +
        '<span class="fb-social-mark" title="Instagram"><svg viewBox="0 0 16 16" fill="none">' +
          '<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.1" stroke="currentColor" stroke-width="1.4"/>' +
          '<circle cx="8" cy="8" r="2.7" stroke="currentColor" stroke-width="1.4"/>' +
          '<circle cx="11.4" cy="4.7" r=".8" fill="currentColor"/></svg></span>' +
        '<span class="fb-social-mark" title="X"><svg viewBox="0 0 16 16" fill="none">' +
          '<path d="M3 2.5 13 13.5M12.5 2.5l-9 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>' +
      '</span>';

    host.innerHTML =
      '<div class="fb-share-confirm" role="status" aria-live="polite">' +
        '<span class="fb-share-tick">' + icon('check', 18) + '</span>' +
        '<div><h2>Your form was published.</h2>' +
          '<p>It is live and ready to share.</p></div>' +
      '</div>' +
      '<h3 class="fb-share-heading">Share your form</h3>' +
      '<div class="fb-share-methods">' +
        '<section class="ds-card fb-share-method">' +
          '<span class="fb-share-method-icon">' + icon('link-simple', 18) + '</span>' +
          '<div class="fb-share-method-body"><label class="ds-card-title" for="' + esc(linkId) + '">Link</label>' +
            '<div class="fb-share-control">' +
              '<input class="ds-input fb-share-link" id="' + esc(linkId) + '" readonly>' +
              '<button type="button" class="ds-btn ds-btn--secondary fb-share-copy">' +
                icon('copy', 15) + 'Copy link</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="ds-card fb-share-method">' +
          '<span class="fb-share-method-icon">' + icon('paper-plane-tilt', 18) + '</span>' +
          '<div class="fb-share-method-body"><span class="ds-card-title fb-share-method-label">Social media</span>' +
            '<p class="ds-card-sub">Choose Facebook, Instagram, X, or another available app.</p>' +
            '<button type="button" class="ds-btn ds-btn--secondary fb-share-social" aria-label="Share to social media">' +
              socialMarks + '<span class="fb-share-social-label">Share</span></button>' +
          '</div>' +
        '</section>' +
        '<section class="ds-card fb-share-method">' +
          '<span class="fb-share-method-icon">' + icon('file-text', 18) + '</span>' +
          '<div class="fb-share-method-body"><label class="ds-card-title" for="' + esc(embedId) + '">Embed code</label>' +
            '<textarea class="ds-input fb-share-code" id="' + esc(embedId) + '" readonly></textarea>' +
            '<button type="button" class="ds-btn ds-btn--secondary fb-share-embed-copy">' +
              icon('copy', 15) + 'Copy code</button>' +
          '</div>' +
        '</section>' +
      '</div>';

    const link = host.querySelector('.fb-share-link');
    const code = host.querySelector('.fb-share-code');
    const embed = '<iframe src="' + url + '" title="Contact form" loading="lazy"></iframe>';
    link.value = url;
    code.value = embed;
    wireCopy(host.querySelector('.fb-share-copy'), url);
    wireCopy(host.querySelector('.fb-share-embed-copy'), embed);

    host.querySelector('.fb-share-social').addEventListener('click', async function () {
      const btn = this;
      if (navigator.share) {
        try { await navigator.share({ title: shareTitle, url: url }); }
        catch (e) { /* Closing the native share sheet is not an error state. */ }
        return;
      }
      navigator.clipboard.writeText(url).then(function () {
        const label = btn.querySelector('.fb-share-social-label');
        label.textContent = 'Link copied';
        setTimeout(function () { label.textContent = 'Share'; }, 1400);
      }).catch(function () {
        btn.querySelector('.fb-share-social-label').textContent = 'Copy failed';
      });
    });
  };

  // Forms saved before the destination and the type were one choice can carry a custom
  // field with no definition on the pipeline, or one with no type — the record page then
  // has nothing to render it from. Fixed on open, but conservatively: an existing name or
  // type is left exactly as it is, because the record side is allowed to have set it.
  Builder.prototype.healCustomDefs = function () {
    const self = this;
    (this.form.fields || []).forEach(function (f) {
      if (f.target !== 'custom' || !f.key) return;
      if (!Array.isArray(self.pipeline.customFieldDefs)) self.pipeline.customFieldDefs = [];
      const def = self.pipeline.customFieldDefs.filter(function (d) { return d.key === f.key; })[0];
      if (!def) { self.syncCustomDef(f); return; }
      if (!def.type) def.type = (KIND_BY_TYPE[f.type] || CUSTOM_KINDS[0]).record;
      if (!def.name) def.name = f.label || 'New field';
    });
  };

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
      const isSelect = f.type === 'select';
      const dests = destinationsFor(self.pipeline, self.form.fields, f, self.created);
      const menuId = self.uid + '-dest-' + i;
      const schema = schemaFor(self.pipeline);

      // Is this field's current destination one this list can offer? A form saved before
      // the kinds were narrowed may hold something that isn't, and the select has to show
      // what the field really is rather than defaulting to whatever sits at the top.
      const selectedAbove = dests.filter(function (d) { return d.selected; })[0];
      let staleValue = '';
      let staleLabel = '';
      if (!locked && !selectedAbove) {
        if (f.target === 'custom' && !KIND_BY_TYPE[f.type]) {
          staleValue = 'custom:' + f.type;
          staleLabel = (TYPE_LABEL[f.type] || f.type) + ' — as saved';
        } else if (f.target && f.target !== 'custom') {
          staleValue = 'target:' + f.target;
          staleLabel = ((TARGET_BY[f.target] || {}).label || f.target) + ' — not on this record type';
        }
      }

      // What the closed control says: the destination's own name, because that is the whole
      // decision this row carries. Until one is picked it says what it wants, the way the
      // input beside it does.
      const kindNow = KIND_BY_TYPE[f.type];
      const isNewCustom = f.target === 'custom' && kindNow && !selectedAbove;
      const chosen = selectedAbove ? selectedAbove.label
        : (staleLabel || (isNewCustom ? kindNow.label : ''));
      const triggerLabel = chosen || 'Save to';

      return '<div class="fb-field' + (locked ? ' is-locked' : '') + '" data-i="' + i + '"' + (locked ? '' : ' draggable="true"') + '>' +
        '<span class="fb-grip">⋮⋮</span>' +
        '<input class="ds-input ds-input--lg" value="' + esc(f.label || '') + '" data-act="label" placeholder="Field label">' +
        // One control, not two. "Saves to" is the whole decision: a record field carries
        // its own type, and the kinds under "Add custom field" are the only case where a
        // type is picked at all — so they belong in this list rather than in a second
        // dropdown that could contradict it.
        //
        // A ds-menu rather than a <select>: the list needs a pipeline header, group
        // headings and a tick per row, and a native select can carry none of those.
        // dsMenu supplies the behaviour (one open at a time, outside click, Escape,
        // arrow keys) so this is a picker's markup, not a picker's mechanics.
        // Name and email are the same control as every other row's, permanently set and
        // disabled. A chip in this column said "this row is a different kind of thing", when
        // the truth is narrower: it is the same choice, already made and not yours to change.
        (locked
          ? '<button type="button" class="ds-input ds-input--lg fb-dest-trigger" disabled' +
              ' title="' + esc(f.target === 'name'
                  ? 'Always included — every record can carry a name'
                  : 'Always included — email is used to match contacts') + '">' +
              '<span class="fb-dest-value">' + pipelineMark(self.pipeline) +
                '<span class="fb-dest-current">' +
                esc(fieldLabel(schema, TARGET_BY[f.target])) + '</span></span>' +
              '<span class="ds-menu-caret">' +
                (window.dsIcon ? window.dsIcon('caret-down', { size: 12 }) : '▾') + '</span>' +
            '</button>'
          : '<div class="fb-dest-pick">' +
              '<button type="button" class="ds-input ds-input--lg fb-dest-trigger' +
                (chosen ? '' : ' is-empty') + '" data-act="dest"' +
                ' data-ds-menu="' + esc(menuId) + '" aria-haspopup="menu" aria-expanded="false">' +
                '<span class="fb-dest-value">' +
                  (selectedAbove ? pipelineMark(self.pipeline) : '') +
                  '<span class="fb-dest-current">' + esc(triggerLabel) + '</span>' +
                  (isNewCustom ? '<span class="fb-new-field-label">New field</span>' : '') +
                '</span>' +
                '<span class="ds-menu-caret">' +
                  (window.dsIcon ? window.dsIcon('caret-down', { size: 12 }) : '▾') + '</span>' +
              '</button>' +
              '<div class="ds-menu ds-menu--fixed fb-dest-menu" id="' + esc(menuId) + '" role="menu">' +
                // The pipeline alone, with no eyebrow over it: the control that opened this
                // panel already says "Saves to", so repeating it here spent the top of the
                // panel on a word. The field names still need the pipeline's name to mean
                // anything — "Location" is meaningless until you know whose record it is on.
                '<div class="fb-dest-head">' + pipelineTag(self.pipeline) + '</div>' +
                // Both groups are named, and named for what choosing from them does: point
                // the question at a field the record has, or make one it doesn't.
                '<div class="ds-menu__label">Existing fields</div>' +
                dests.map(function (d) { return destItemHTML(d, self.pipeline); }).join('') +
                // No rule between the groups — the label carries --menu-group-gap above it,
                // which is the Menu component's way of separating them. See DESIGN-SYSTEM.md,
                // "separate with space before you separate with a line".
                '<div class="ds-menu__label">Create a new field</div>' +
                CUSTOM_KINDS.map(function (k) {
                  return destItemHTML({
                    value: 'custom:' + k.kind, label: k.label,
                    // Only when the current destination isn't already one of the record's
                    // fields above: a custom field that exists is selected up there, and
                    // ticking its kind down here as well would show two selections.
                    selected: f.target === 'custom' && f.type === k.type && !selectedAbove,
                  });
                }).join('') +
                // A stored field this list can't offer — a `time` question from before the
                // kinds were narrowed, or a target the entity no longer has. Shown as
                // itself so the row can't claim a destination the field doesn't have.
                (staleValue
                  ? '<div class="ds-menu__label">As saved</div>' +
                    destItemHTML({ value: staleValue, label: staleLabel, selected: true }, self.pipeline)
                  : '') +
              '</div>' +
            '</div>') +
        '<label class="fb-req"><input type="checkbox" data-act="req"' + (f.required ? ' checked' : '') +
          '> Required</label>' +
        '<button type="button" class="ds-btn ds-btn--ghost ds-btn--icon ds-btn--sm fb-del" data-act="del" title="Remove this field">' +
          (window.dsIcon ? window.dsIcon('close', { size: 13 }) : '×') + '</button>' +
        // No caption under the row. The destination names itself in the control, and the
        // type is the destination's — restating "Phone number · saved to the record's
        // Phone" under a picker that says "Phone" was the old two-control confusion coming
        // back as prose. What the caption alone used to carry — that a destination is
        // switched off on this record type — is marked in the panel, where the choice is
        // actually made.

        // "Choose from a list" is the one type that needs more than a name. It was offered
        // in the picker with no way to enter the options, so picking it produced a dropdown
        // containing only "Choose…" — a type that could not work.
        (isSelect
          ? '<div class="fb-options">' +
              '<input class="ds-input ds-input--lg" data-act="options" placeholder="Options, separated by commas" ' +
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
        self.syncCustomDef(f);
        self.renderPreview();
      });
      // The panel is `--fixed`, so it needs viewport coordinates. Set on the trigger's own
      // click, which runs before dsMenu's delegated one — so it is positioned by the time
      // it opens, not a frame later. Fixed, rather than absolute, because .fb-scroll is a
      // scrolling ancestor and would clip it (see the Menu component's note); dsMenu
      // closes the panel on scroll, so it can't be left pointing at nothing.
      const trigger = row.querySelector('[data-act="dest"]');
      if (trigger) {
        trigger.addEventListener('click', function () {
          placeMenu(trigger, document.getElementById(trigger.getAttribute('data-ds-menu')));
        });
      }
      row.querySelectorAll('[data-pick]').forEach(function (item) {
        item.addEventListener('click', function () {
          if (item.getAttribute('aria-disabled') === 'true') return;
          // The options input and the caption both change with the destination, so the row
          // is redrawn rather than patched.
          self.setDestination(i, item.getAttribute('data-pick'));
          self.renderFields();
          self.renderPreview();
        });
      });
      on('options', 'input', function (e) {
        const f = self.form.fields[i];
        f.options = e.target.value.split(',')
          .map(function (s) { return s.trim(); }).filter(Boolean);
        // The record renders a choice field from its own def, so the two lists have to be
        // the same list — otherwise the form offers options the record can't show back.
        self.syncCustomDef(f);
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
  // ── Destination ──────────────────────────────────────────────────────────────
  // The one write path for "where does this answer go", so the form field and the
  // record's field definition can never be set from different places and disagree.
  //
  // Values are "target:<name>" for one of the record's own fields, "custom:<kind>" for a
  // new one. Both come from the same select.
  Builder.prototype.setDestination = function (i, value) {
    const f = this.form.fields[i];
    if (!f || isLocked(f)) return;
    const bits = String(value || '').split(':');

    if (bits[0] === 'target') {
      const t = TARGET_BY[bits[1]];
      if (!t) return;
      this.releaseCustom(f);
      f.target = t.target;
      // Mapped fields key by their target, the way the presets and every stored form do.
      f.key = t.target;
      f.type = t.type;          // implied, never chosen — see TARGETS
      delete f.options;
      return;
    }

    // A custom field the record already has: its stored type is the authority, so the
    // question takes the input type that fits it rather than redefining the field.
    if (bits[0] === 'existing') {
      const def = ((this.pipeline.customFieldDefs) || [])
        .filter(function (d) { return d.key === bits[1]; })[0];
      if (!def) return;
      this.releaseCustom(f);
      f.target = 'custom';
      f.key = def.key;
      f.type = RECORD_TO_FORM[def.type || 'text'] || 'text';
      if (f.type === 'select') f.options = (def.options || []).slice();
      else delete f.options;
      return;
    }

    const kind = CUSTOM_KINDS.filter(function (k) { return k.kind === bits[1]; })[0];
    if (!kind) return;
    if (f.target !== 'custom') {
      f.key = this.newCustomKey();
      f.target = 'custom';
      this.created.push(f.key);
    }
    f.type = kind.type;
    if (f.type !== 'select') delete f.options;
    else if (!Array.isArray(f.options)) f.options = [];
    this.syncCustomDef(f);
  };

  // The pipeline's own definition of a custom field: its name, its type in the record's
  // vocabulary, and its choices. Written from the form field every time one changes, which
  // is what stops a form that validates a date from feeding a field declared as text —
  // the mismatch that existed while the type was a separate control.
  Builder.prototype.syncCustomDef = function (f) {
    if (!f || f.target !== 'custom') return;
    if (!Array.isArray(this.pipeline.customFieldDefs)) this.pipeline.customFieldDefs = [];
    const kind = KIND_BY_TYPE[f.type] || CUSTOM_KINDS[0];
    let def = this.pipeline.customFieldDefs.filter(function (d) { return d.key === f.key; })[0];
    if (!def) { def = { key: f.key }; this.pipeline.customFieldDefs.push(def); }
    def.name = f.label || def.name || 'New field';

    // `number` and `amount` can only have been chosen on the record side — this list
    // doesn't offer them (no server-side validator). So don't flatten one back to `text`
    // just because a form field defaults there; only an explicit Date or Choice overrides
    // what the record already declares.
    const recordOnly = def.type === 'number' || def.type === 'amount';
    if (!recordOnly || kind.record !== 'text') def.type = kind.record;

    if (def.type === 'select') def.options = (f.options || []).slice();
    else delete def.options;
  };

  // Switching a field from "new field on the record" to one of the record's own leaves its
  // definition behind. Dropped only if this session created it: a field that existed
  // before may already carry values on records, and those would lose the column that
  // renders them.
  Builder.prototype.releaseCustom = function (f) {
    if (!f || f.target !== 'custom') return;
    const at = this.created.indexOf(f.key);
    if (at === -1) return;
    this.created.splice(at, 1);
    const key = f.key;
    this.pipeline.customFieldDefs = (this.pipeline.customFieldDefs || [])
      .filter(function (d) { return d.key !== key; });
  };

  Builder.prototype.newCustomKey = function () {
    const taken = (this.pipeline.customFieldDefs || []).map(function (d) { return d.key; });
    let n = 1; while (taken.indexOf('cf' + n) !== -1) n++;
    return 'cf' + n;
  };

  // A new row is blank: no question, no destination. It used to guess — the next record
  // field still unasked — which meant the two things you have to decide arrived already
  // decided, and wrongly more often than not. Both controls now show what they want
  // ("Field label", "Save to") and collect() won't save a row that never answered.
  Builder.prototype.addField = function () {
    this.form.fields.push({ key: '', label: '', type: 'text', target: '', required: false });
    this.renderFields();
    this.renderPreview();
  };

  Builder.prototype.collect = function () {
    if (!String(this.form.heading || '').trim()) return { error: 'Give the form a title — it’s the first thing a reader sees.' };
    if (String(this.form.heading || '').length > TITLE_MAX) {
      return { error: 'Keep the form title to ' + TITLE_MAX + ' characters or fewer.' };
    }

    // A row is blank when it is added, so saving has to be the thing that insists on both
    // halves. Neither can be guessed: an unnamed field renders as its key on the public
    // form, and one with no destination would collect an answer the record then drops.
    const blank = this.form.fields.filter(function (f) { return !String(f.label || '').trim(); })[0];
    if (blank) return { error: 'Give every field a label — one is still empty.' };
    const homeless = this.form.fields.filter(function (f) { return !f.target; })[0];
    if (homeless) {
      return { error: 'Choose where “' + (homeless.label || 'the new field') + '” is saved.' };
    }
    // The panel no longer asks for these, so they are filled in from what we know.
    if (!String(this.form.recordTitle || '').trim()) this.form.recordTitle = this.pipeline.name || 'New enquiry';
    if (!String(this.form.sourceLabel || '').trim()) this.form.sourceLabel = 'Form';
    if (!String(this.form.submitLabel || '').trim()) this.form.submitLabel = 'Submit';
    if (!String(this.form.thanks || '').trim()) this.form.thanks = 'Thanks — we have your details and will be in touch.';
    return { form: this.form, pipeline: this.pipeline };
  };

  // ── The link ─────────────────────────────────────────────────────────────────
  // The form's whole output is a URL, so the builder shows it rather than leaving you to
  // go and find it on /crm/forms.
  function formUrl(origin, token) {
    return (origin || location.origin) + '/f/' + encodeURIComponent(token || '');
  }

  // Copy, with the button reporting back on itself. No toast: the confirmation belongs on
  // the control you pressed, and a toast is gone before you've pasted anything.
  function wireCopy(btn, url) {
    btn.addEventListener('click', function () {
      const was = btn.textContent;
      navigator.clipboard.writeText(url).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = was; }, 1400);
      }).catch(function () { btn.textContent = 'Copy failed'; });
    });
  }

  // The link as it appears while editing a form that already exists: one quiet line, the
  // URL selectable in full. Not a share step — that is for the moment a form is created.
  function linkRowHTML(url) {
    return '<div class="fb-link">' +
      '<span class="fb-link-url">' + esc(url) + '</span>' +
      '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm fb-link-copy">Copy link</button>' +
      '<a class="ds-btn ds-btn--secondary ds-btn--sm" href="' + esc(url) + '" target="_blank" rel="noopener">Open</a>' +
      '</div>';
  }

  // The stronger link treatment shown immediately after publish. This used to live only
  // inside open(), which is why the full-page route regained the slide but not the green
  // confirmation, centred URL or Copy action when the interaction pattern changed.
  function publishedRowHTML(url) {
    return '<div class="fb-published">' +
      '<span class="fb-published-tick">' +
        (window.dsIcon ? window.dsIcon('check', { size: 11 }) : '&check;') + '</span>' +
      '<span class="fb-published-label">Form published</span>' +
      '<span class="fb-published-url" tabindex="0">' + esc(url) + '</span>' +
      '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm fb-published-copy">' +
        (window.dsIcon ? window.dsIcon('copy', { size: 14 }) : '') + 'Copy</button>' +
    '</div>';
  }

  function renderPublishedRow(host, token, origin, selectUrl) {
    if (!host || !token) return;
    const url = formUrl(origin, token);
    host.innerHTML = publishedRowHTML(url);
    wireCopy(host.querySelector('.fb-published-copy'), url);
    if (!selectUrl) return;
    const urlEl = host.querySelector('.fb-published-url');
    const range = document.createRange();
    range.selectNodeContents(urlEl);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }

  // One wording for "are you sure", wherever delete is offered. What it has to say is
  // the part people get wrong about this action: the link dies, the records don't.
  // Exported because /crm/pipeline/:id/form mounts the builder inline and owns its own
  // footer, so it can't reuse the modal's button.
  function confirmDelete(pipelineName) {
    return confirm('Delete the form on “' + (pipelineName || 'this pipeline') + '”?\n\n' +
      'Its link stops working immediately and cannot be restored — a new form gets a new link. ' +
      'Records that already came in through it stay where they are.');
  }

  // ── Inline mount ───────────────────────────────────────────────────────────
  window.titanFormBuilder = {
    mount: function (host, opts) { return new Builder(host, opts); },
    confirmDelete: confirmDelete,
    formUrl: formUrl,

    // The same link row the modal header uses, for the inline route — which owns its own
    // top bar and would otherwise hand-roll a second version of this.
    linkRow: function (host, token, origin) {
      if (!host) return;
      if (!token) { host.innerHTML = ''; return; }
      const url = formUrl(origin, token);
      host.innerHTML = linkRowHTML(url);
      wireCopy(host.querySelector('.fb-link-copy'), url);
    },
    publishedRow: renderPublishedRow,

    // ── Legacy modal adapter ─────────────────────────────────────────────────
    // Kept for compatibility only. Current product entry points follow the registered
    // Full-page settings pattern and use mount() above.
    open: function (opts) {
      const existing = !!(opts.form && opts.form.token);
      const canDelete = !!(opts.onDelete && existing);
      const origin = opts.origin || location.origin;
      const wrap = document.createElement('div');
      wrap.className = 'fb-overlay';

      // Every control lives in the header, in both states. Nothing sits at the bottom: the
      // editor is a list you read downwards, and a footer under it competed with "Add a
      // field" for the end of that list — the two most different actions on the screen,
      // adjacent. Publish and the way out belong to the frame instead.
      wrap.innerHTML =
        // A frame around the modal, so the pipeline can sit ON its top edge: the modal
        // itself clips its children (overflow: hidden, rounded corners), so a tab straddling
        // that edge has to be a sibling of it rather than a child.
        '<div class="fb-frame">' +
          (window.dsPipelineTag
            ? '<span class="fb-modal-pipe">' +
                window.dsPipelineTag({
                  name: (opts.pipeline || {}).name,
                  color: (opts.pipeline || {}).color,
                  variant: 'tab',
                }) +
              '</span>'
            : '') +
          '<div class="fb-modal" role="dialog" aria-modal="true">' +
            '<div class="fb-head"></div>' +
            '<div class="fb-scroll"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      document.body.classList.add('fb-locked');

      const builder = new Builder(wrap.querySelector('.fb-scroll'), opts);
      const head = wrap.querySelector('.fb-head');
      const publishLabel = opts.saveLabel || 'Publish Form';

      function close() {
        wrap.remove();
        document.body.classList.remove('fb-locked');
        document.removeEventListener('keydown', onKey);
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('click', function (e) {
        // The frame is the modal's own box plus the tab overhanging it, so a click landing
        // on the frame itself is a click on the scrim.
        if (e.target === wrap || e.target.classList.contains('fb-frame')) close();
      });


      // ── The editor's header ──────────────────────────────────────────────
      // Back on the left where a close button used to be — from here the way out is
      // backwards, to whatever opened this, not a dismissal. Publish on the right, because
      // that is where the action that finishes a screen goes.
      function renderEditHead() {
        head.className = 'fb-head';
        head.innerHTML =
          '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm fb-back">' +
            (window.dsIcon ? window.dsIcon('back', { size: 13 }) : '&lsaquo;') + 'Back</button>' +
          // What you are doing, then which record it is for. The pipeline used to be part of
          // the title string ("Form — Hiring Pipeline"), which made the heading a sentence
          // about two things; as a tag underneath it is the same object the destination
          // picker names, so the header and the fields agree on what this form belongs to.
          '<span class="fb-title">' + esc(opts.title || (existing ? 'Edit form' : 'Create a form')) + '</span>' +
          '<span class="fb-err"></span>' +
          // Copy, open and delete only mean something once the form exists, so a new one
          // gets no menu at all rather than one holding a single dead item.
          (existing
            ? '<div class="ds-menu-anchor">' +
                '<button type="button" class="ds-btn ds-btn--secondary ds-btn--icon fb-more"' +
                  ' data-ds-menu="' + esc(builder.uid) + '-more" aria-haspopup="menu"' +
                  ' aria-expanded="false" title="More">' +
                  (window.dsIcon ? window.dsIcon('dots-three-vertical', { size: 15 }) : '&hellip;') +
                '</button>' +
                '<div class="ds-menu ds-menu--below-end" id="' + esc(builder.uid) + '-more" role="menu">' +
                  '<button type="button" class="ds-menu__item" role="menuitem" data-act="copy">' +
                    (window.dsIcon ? window.dsIcon('copy', { size: 15 }) : '') + 'Copy link</button>' +
                  '<a class="ds-menu__item" role="menuitem" target="_blank" rel="noopener"' +
                    ' href="' + esc(formUrl(origin, opts.form.token)) + '">' +
                    (window.dsIcon ? window.dsIcon('open-external', { size: 15 }) : '') + 'Open form</a>' +
                  (canDelete
                    ? '<div class="ds-menu__sep"></div>' +
                      '<button type="button" class="ds-menu__item ds-menu__item--danger" role="menuitem"' +
                        ' data-act="delete">' +
                        (window.dsIcon ? window.dsIcon('trash', { size: 15 }) : '') + 'Delete form</button>'
                    : '') +
                '</div>' +
              '</div>'
            : '') +
          '<button type="button" class="ds-btn ds-btn--primary fb-publish">' + esc(publishLabel) + '</button>';

        head.querySelector('.fb-back').addEventListener('click', close);
        head.querySelector('.fb-publish').addEventListener('click', publish);

        const copyItem = head.querySelector('[data-act="copy"]');
        if (copyItem) wireCopy(copyItem, formUrl(origin, opts.form.token));

        const delItem = head.querySelector('[data-act="delete"]');
        if (delItem) {
          delItem.addEventListener('click', async function () {
            if (!confirmDelete(opts.pipeline && opts.pipeline.name)) return;
            const err = head.querySelector('.fb-err');
            err.textContent = '';
            try {
              // The caller unsets intakeForm and persists; the modal closes only once that
              // has landed, so a failed write leaves the editor open with the form still
              // in it rather than looking done.
              await opts.onDelete();
              close();
            } catch (e2) {
              err.textContent = 'Couldn’t delete: ' + ((e2 && e2.message) || e2);
            }
          });
        }
      }

      // ── Published ────────────────────────────────────────────────────────
      // The link is the form's whole output, so it takes the middle of the header — the
      // one place on this screen nothing else is using — while the preview it belongs to
      // slides into the middle of the body.
      function renderPublishedHead(form) {
        const url = formUrl(origin, form.token);
        head.className = 'fb-head is-published';
        head.innerHTML =
          '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm fb-reopen">' +
            (window.dsIcon ? window.dsIcon('back', { size: 13 }) : '&lsaquo;') + 'Back to Editing</button>' +
          publishedRowHTML(url) +
          '<button type="button" class="ds-btn ds-btn--primary fb-done">Done</button>';

        wireCopy(head.querySelector('.fb-published-copy'), url);
        head.querySelector('.fb-done').addEventListener('click', close);
        head.querySelector('.fb-reopen').addEventListener('click', backToEditing);

        // Selected on arrival, so ⌘C works without reaching for the button.
        const urlEl = head.querySelector('.fb-published-url');
        const range = document.createRange();
        range.selectNodeContents(urlEl);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }

      // The published/editing switch, animated as one movement rather than two.
      //
      // Delegates to the builder so the mounted full-page route gets this same transition.
      function slideTo(published) {
        builder.setPublished(published);
      }

      function backToEditing() {
        slideTo(false);
        renderEditHead();
      }

      async function publish() {
        const btn = head.querySelector('.fb-publish');
        const err = head.querySelector('.fb-err');
        const out = builder.collect();
        if (out.error) { err.textContent = out.error; return; }
        err.textContent = '';
        btn.disabled = true; btn.textContent = 'Publishing…';
        try {
          await opts.onSave(out.form, out.pipeline);
          // The editor leaves and the preview arrives in one movement, so the form you were
          // describing becomes the form you just published rather than a new screen.
          slideTo(true);
          renderPublishedHead(out.form);
        } catch (e2) {
          btn.disabled = false; btn.textContent = publishLabel;
          err.textContent = 'Couldn’t publish: ' + ((e2 && e2.message) || e2);
        }
      }

      renderEditHead();

      return { close: close, builder: builder };
    },
  };
})();
