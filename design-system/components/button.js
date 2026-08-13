// Button — a render module, which is this codebase's proven idiom for a shared
// component (titan-sidebar.js, form-render.js and form-builder.js all work this
// way and crm.html consumes them today). No build step, no framework, importable
// by a plain <script> tag.
//
//   dsButton({ label: 'Save', variant: 'primary' })
//   dsButton({ label: 'Delete', variant: 'destructive', size: 'sm' })
//   dsButton({ icon: SOME_SVG, variant: 'ghost', title: 'More' })
//
// Props map 1:1 onto the class names in button.css — variant → .ds-btn--<variant>,
// size → .ds-btn--<size> — so the registry, the CSS and this signature cannot
// drift apart without it being obvious.
(function () {
  var VARIANTS = ['primary', 'secondary', 'soft', 'ghost', 'destructive', 'destructive-quiet', 'add'];
  var SIZES = ['sm', 'md', 'lg'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.dsButton = function (opts) {
    var o = opts || {};
    var variant = VARIANTS.indexOf(o.variant) !== -1 ? o.variant : 'secondary';
    var size = SIZES.indexOf(o.size) !== -1 ? o.size : 'md';
    var iconOnly = !!o.icon && !o.label;

    var cls = ['ds-btn', 'ds-btn--' + variant];
    if (size !== 'md') cls.push('ds-btn--' + size);
    if (iconOnly) cls.push('ds-btn--icon');
    if (o.loading) cls.push('ds-btn--loading');
    if (o.className) cls.push(o.className);

    // Loading and disabled are different states that happen to share "you can't
    // click this". Only a truly disabled button gets the `disabled` attribute — a
    // loading one keeps its variant's fill (CSS :disabled would repaint it grey and
    // it would read as dead rather than busy) and is held back by aria-disabled plus
    // pointer-events. Either way an <a> in that state loses its href.
    var busy = !!o.loading;
    var disabled = !!o.disabled;
    var inert = disabled || busy;
    var attrs = [
      'class="' + cls.join(' ') + '"',
      o.title ? 'title="' + esc(o.title) + '"' : '',
      iconOnly && (o.title || o.ariaLabel) ? 'aria-label="' + esc(o.ariaLabel || o.title) + '"' : '',
      o.onclick ? 'onclick="' + esc(o.onclick) + '"' : '',
      o.id ? 'id="' + esc(o.id) + '"' : '',
      busy ? 'aria-busy="true" aria-disabled="true" tabindex="-1"' : '',
    ];

    var inner = (o.icon || '') + (o.label ? '<span>' + esc(o.label) + '</span>' : '');

    if (o.href && !inert) {
      attrs.push('href="' + esc(o.href) + '"');
      if (o.newTab) attrs.push('target="_blank" rel="noopener"');
      return '<a ' + attrs.filter(Boolean).join(' ') + '>' + inner + '</a>';
    }
    attrs.push('type="' + esc(o.type || 'button') + '"');
    if (disabled) attrs.push('disabled');
    return '<button ' + attrs.filter(Boolean).join(' ') + '>' + inner + '</button>';
  };

  window.dsButton.variants = VARIANTS;
  window.dsButton.sizes = SIZES;
})();
