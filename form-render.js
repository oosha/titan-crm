// The form's visible shape, in one place.
//
// Both the public page (form.html) and the builder's live preview
// (form-settings.html) draw from this. Two copies would drift, and a preview that
// drifts from the real form is worse than no preview — you'd be designing against
// a lie. The styles that go with it live in form.css, loaded by both.
//
// Pure markup from a definition object: no fetching, no submitting, no state.
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fieldHTML(f, opts) {
    const id = (opts && opts.idPrefix ? opts.idPrefix : 'fld-') + f.key;
    const disabled = (opts && opts.inert) ? ' disabled' : '';
    const req = f.required ? '<span class="req">*</span>' : '';
    const ph = esc(f.placeholder || '');
    let control;
    if (f.type === 'textarea') {
      control = '<textarea id="' + esc(id) + '" name="' + esc(f.key) + '" placeholder="' + ph + '"' + disabled + '></textarea>';
    } else if (f.type === 'select') {
      control = '<select id="' + esc(id) + '" name="' + esc(f.key) + '"' + disabled + '>' +
        '<option value="">Choose…</option>' +
        (f.options || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') +
        '</select>';
    } else {
      control = '<input id="' + esc(id) + '" name="' + esc(f.key) + '" type="' + esc(f.type || 'text') +
        '" placeholder="' + ph + '"' + disabled + '>';
    }
    return '<div class="tf-field" data-key="' + esc(f.key) + '">' +
      '<label for="' + esc(id) + '">' + esc(f.label || f.key) + req + '</label>' + control + '</div>';
  }

  // A logo if there is one, and nothing otherwise. There used to be a gradient
  // banner across the top whether or not the form was branded — a big block of
  // colour that said nothing, on a page whose whole job is two fields and a button.
  window.titanFormLogoHTML = function (def) {
    if (!def.logoUrl) return '';
    return '<div class="tf-logo"><img src="' + esc(def.logoUrl) + '" alt=""' +
      ' onerror="this.parentNode.remove()"></div>';
  };

  // The card body. `inert: true` renders controls the reader can see but not use —
  // what the builder's preview wants.
  window.titanFormBodyHTML = function (def, opts) {
    const fields = (def.fields || []).map(function (f) { return fieldHTML(f, opts); }).join('');
    const heading = def.heading || 'Untitled form';
    return window.titanFormLogoHTML(def) +
      '<h1>' + esc(heading) + '</h1>' +
      (def.blurb ? '<div class="tf-blurb">' + esc(def.blurb) + '</div>' : '') +
      '<div class="tf-rule"></div>' +
      (fields || '<div class="tf-empty">No fields yet.</div>') +
      '<button class="tf-submit" type="submit"' + ((opts && opts.inert) ? ' disabled' : '') + '>' +
        esc(def.submitLabel || 'Submit') + '</button>';
  };

  window.titanFormEsc = esc;
})();
