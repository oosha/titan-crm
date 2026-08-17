/* dsPipelineTag — the markup for one Pipeline tag, and the one copy of the pipeline mark.
 *
 *   dsPipelineTag({ name: 'Hiring Pipeline', color: '#7b5ea7' })
 *   dsPipelineTag({ name: pl.name, color: pl.color, size: 'sm' })
 *
 * The mark is not in dsIcon on purpose. That set is Phosphor's regular/bold/fill families
 * on a 256 grid, and every icon in it can be swapped by refetching the matching weight;
 * this glyph is the product's own drawing on a 14 grid and has no weights, so putting it
 * there would quietly break that contract. It lives with the component that needs it — and
 * dsIcon.register() stays the route for anyone who wants it as an icon too.
 *
 * Styles: components/pipeline-tag.css, reached through components.css.
 */
(function () {
  'use strict';

  // The pipeline glyph. index.html, titan-sidebar.js and forms.html each draw this path by
  // hand today; this is the copy new code should use.
  var MARK = 'M2 3.2H9.6L12.4 7L9.6 10.8H2L4.4 7L2 3.2Z';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.dsPipelineTag = function (opts) {
    var o = opts || {};
    var px = o.size === 'sm' ? 11 : 13;
    return '<span class="ds-pipeline-tag' +
        (o.size === 'sm' ? ' ds-pipeline-tag--sm' : '') +
        // 'tab' is the folder-tab shape, for a tag that sits on a container's top edge.
        // Where it sits is the caller's to say; this only makes it the right shape.
        (o.variant === 'tab' ? ' ds-pipeline-tag--tab' : '') +
        (o.className ? ' ' + esc(o.className) : '') + '"' +
        // The colour is a custom property rather than a class: it is data, not a variant.
        (o.color ? ' style="--pipe: ' + esc(o.color) + '"' : '') + '>' +
        '<svg class="ds-pipeline-tag__mark" width="' + px + '" height="' + px + '"' +
          ' viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
          '<path d="' + MARK + '" fill="currentColor"/></svg>' +
        '<span class="ds-pipeline-tag__name">' + esc(o.name || 'Untitled pipeline') + '</span>' +
      '</span>';
  };

  // For a caller that wants the mark on its own — a nav row, a legend dot.
  window.dsPipelineTag.mark = function (px) {
    var s = px || 13;
    return '<svg class="ds-pipeline-tag__mark" width="' + s + '" height="' + s + '"' +
      ' viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
      '<path d="' + MARK + '" fill="currentColor"/></svg>';
  };
})();
