(function () {
  'use strict';

  function attr(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  const categorical = Object.freeze([
    'var(--viz-primary)', 'var(--viz-categorical-2)', 'var(--viz-categorical-3)',
    'var(--viz-categorical-4)', 'var(--viz-categorical-5)', 'var(--viz-categorical-6)'
  ]);
  const highlights = Object.freeze([
    'var(--viz-primary-highlight)', 'var(--viz-categorical-2-highlight)', 'var(--viz-categorical-3-highlight)',
    'var(--viz-categorical-4-highlight)', 'var(--viz-categorical-5-highlight)', 'var(--viz-categorical-6-highlight)'
  ]);

  function sizeOf(options) {
    const size = String((options || {}).size || 'md');
    return ['sm', 'md', 'lg'].indexOf(size) === -1 ? 'md' : size;
  }

  function wrap(options, markup) {
    return '<div class="ds-viz ds-viz--' + sizeOf(options) + ((options || {}).fill ? ' ds-viz--fill' : '') + '">' + markup + '</div>';
  }

  function paletteItems(items) {
    return items.map(function (item, index) {
      const slot = index % categorical.length;
      return Object.assign({}, item, {
        color: item.color || categorical[slot],
        highlight: item.highlight || highlights[slot]
      });
    });
  }

  function polarPoint(cx, cy, radius, angle) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  function roundedRingPath(cx, cy, inner, outer, start, end, corner) {
    const outerInset = corner / outer, innerInset = corner / inner;
    const os = polarPoint(cx, cy, outer, start + outerInset);
    const oe = polarPoint(cx, cy, outer, end - outerInset);
    const ovEnd = polarPoint(cx, cy, outer, end);
    const oeEdge = polarPoint(cx, cy, outer - corner, end);
    const ieEdge = polarPoint(cx, cy, inner + corner, end);
    const ivEnd = polarPoint(cx, cy, inner, end);
    const ie = polarPoint(cx, cy, inner, end - innerInset);
    const is = polarPoint(cx, cy, inner, start + innerInset);
    const ivStart = polarPoint(cx, cy, inner, start);
    const isEdge = polarPoint(cx, cy, inner + corner, start);
    const osEdge = polarPoint(cx, cy, outer - corner, start);
    const ovStart = polarPoint(cx, cy, outer, start);
    const large = end - start > Math.PI ? 1 : 0;
    const p = function (point) { return point.x.toFixed(2) + ' ' + point.y.toFixed(2); };
    return 'M ' + p(os) + ' A ' + outer + ' ' + outer + ' 0 ' + large + ' 1 ' + p(oe) +
      ' Q ' + p(ovEnd) + ' ' + p(oeEdge) + ' L ' + p(ieEdge) + ' Q ' + p(ivEnd) + ' ' + p(ie) +
      ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + p(is) + ' Q ' + p(ivStart) + ' ' + p(isEdge) +
      ' L ' + p(osEdge) + ' Q ' + p(ovStart) + ' ' + p(os) + ' Z';
  }

  function ringMarkup(options) {
    const opts = options || {};
    const parts = (Array.isArray(opts.parts) ? opts.parts : []).filter(function (part) {
      return Number(part.value) > 0;
    });
    if (!parts.length) return '';

    const prefix = String(opts.idPrefix || 'ds-viz-ring').replace(/[^a-zA-Z0-9_-]/g, '-');
    const total = parts.reduce(function (sum, part) { return sum + Number(part.value); }, 0);
    // Canonical 100-unit geometry. Scaling the SVG scales every ring dimension
    // together, so the workbench and product can never drift proportionally.
    const cx = 50, cy = 50, inner = 34.35, outer = 44, band = outer - inner;
    const gapAngle = 0.045;
    let angle = -Math.PI / 2;

    const defs = parts.map(function (part, index) {
      const color = attr(part.color);
      const highlight = part.highlight ? attr(part.highlight) : 'color-mix(in srgb, ' + color + ' 72%, var(--surface-primary))';
      return '<linearGradient id="' + prefix + '-gradient-' + index + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + highlight + '"></stop>' +
        '<stop offset="1" stop-color="' + color + '"></stop></linearGradient>';
    }).join('');

    const paths = parts.map(function (part, index) {
      const span = Math.PI * 2 * Number(part.value) / total;
      const share = Math.round(Number(part.value) / total * 100);
      const displayValue = part.displayValue == null ? part.value : part.displayValue;
      const tooltip = part.tooltip || part.label + ' · ' + displayValue + ' · ' + share + '%';
      const gap = Math.min(gapAngle, span * 0.16);
      const start = angle + gap / 2, end = angle + span - gap / 2;
      const corner = Math.min(band * 0.15625, (end - start) * inner * 0.28);
      angle += span;
      return '<path class="ds-viz-ring-segment ' + attr(opts.segmentClass || '') + '" data-ds-viz-segment-tooltip="' + attr(tooltip) + '" d="' +
        roundedRingPath(cx, cy, inner, outer, start, end, corner) + '" fill="url(#' +
        prefix + '-gradient-' + index + ')"></path>';
    }).join('');

    return '<defs>' + defs + '</defs><circle class="ds-viz-ring-track" cx="50" cy="50" r="' +
      ((inner + outer) / 2).toFixed(2) + '" fill="none" stroke="var(--surface-sunken)" stroke-width="' +
      band.toFixed(2) + '"></circle>' + paths;
  }

  function partToWhole(options) {
    const opts = options || {};
    const parts = paletteItems((Array.isArray(opts.parts) ? opts.parts : []).filter(function (part) { return Number(part.value) > 0; }));
    if (!parts.length) return '';
    const total = parts.reduce(function (sum, part) { return sum + Number(part.value); }, 0);
    const showCenter = opts.center !== false;
    const compactLegend = opts.legendLayout === 'compact';
    const summary = opts.summary || parts.map(function (part) {
      return part.label + ' ' + (part.displayValue == null ? part.value : part.displayValue) + ', ' + Math.round(Number(part.value) / total * 100) + '%';
    }).join('; ');
    const ring = ringMarkup({ parts: parts, idPrefix: opts.idPrefix, segmentClass: opts.segmentClass });
    const center = showCenter ? '<div class="ds-viz-donut-center"><strong>' + attr(opts.centerValue == null ? total : opts.centerValue) + '</strong>' +
      '<span>' + attr(opts.centerLabel || 'TOTAL') + '</span></div>' : '';
    const legend = compactLegend
      ? '<div class="ds-viz-table ds-viz-table--compact" aria-label="' + attr(opts.legendTitle || 'CATEGORY') + '">' +
        parts.map(function (part) {
          const share = Math.round(Number(part.value) / total * 100);
          return '<div class="ds-viz-table-row"><i style="background:' + attr(part.color) + '"></i>' +
            '<span class="ds-viz-table-label" title="' + attr(part.label) + '">' + attr(part.label) + '</span>' +
            '<strong>' + attr(part.displayValue == null ? part.value : part.displayValue) + '</strong>' +
            '<span class="ds-viz-table-share">(' + share + '%)</span></div>';
        }).join('') + '</div>'
      : '<div class="ds-viz-table"><div class="ds-viz-table-head" aria-hidden="true"><span></span><span>' +
        attr(opts.legendTitle || 'CATEGORY') + '</span><span>' + attr(opts.valueTitle || 'VALUE') + '</span><span>SHARE</span></div>' +
        parts.map(function (part) {
          const share = Math.round(Number(part.value) / total * 100);
          return '<div class="ds-viz-table-row"><i style="background:' + attr(part.color) + '"></i>' +
            '<span class="ds-viz-table-label" title="' + attr(part.label) + '">' + attr(part.label) + '</span>' +
            '<strong>' + attr(part.displayValue == null ? part.value : part.displayValue) + '</strong><span>' + share + '%</span></div>';
        }).join('') + '</div>';
    return wrap(opts, '<div class="ds-viz-part-to-whole' + (showCenter ? '' : ' ds-viz-part-to-whole--no-center') +
      (compactLegend ? ' ds-viz-part-to-whole--compact' : '') + '" role="img" aria-label="' + attr(summary) + '">' +
      '<div class="ds-viz-donut-wrap"><div class="ds-viz-donut">' +
        '<svg class="ds-viz-donut-svg" viewBox="0 0 100 100" aria-hidden="true">' + ring + '</svg>' +
        center + '<div class="ds-viz-segment-tooltip" role="tooltip" aria-hidden="true"></div></div></div>' + legend + '</div>');
  }

  function binnedDistribution(options) {
    const opts = options || {};
    const bins = Array.isArray(opts.bins) ? opts.bins : [];
    if (!bins.length) return '';
    const max = Math.max(1, Math.max.apply(null, bins.map(function (bin) { return Number(bin.value) || 0; })));
    const summary = opts.summary || bins.map(function (bin) { return bin.label + ' ' + (Number(bin.value) || 0); }).join(', ');
    return wrap(opts, '<div class="ds-viz-distribution" role="img" aria-label="' + attr(summary) + '">' +
      (opts.meta ? '<div class="ds-viz-chart-meta">' + attr(opts.meta) + '</div>' : '') +
      '<div class="ds-viz-distribution-grid" style="--ds-viz-bin-count:' + bins.length + '">' +
      bins.map(function (bin) {
        const value = Number(bin.value) || 0;
        const height = value ? value / max * 78 : 0;
        return '<div class="ds-viz-bin"><div class="ds-viz-bin-mark"><span class="' + (value ? 'ds-viz-bin-value' : 'ds-viz-bin-value is-zero') + '">' + value + '</span>' +
          (value ? '<i style="--ds-viz-height:' + height.toFixed(2) + '%"></i>' : '') + '</div>' +
          '<span class="ds-viz-bin-label">' + attr(bin.label) + '</span></div>';
      }).join('') + '</div>' + (opts.axisLabel ? '<div class="ds-viz-axis-label">' + attr(opts.axisLabel) + '</div>' : '') + '</div>');
  }

  function conversionSteps(options) {
    const opts = options || {};
    const rows = Array.isArray(opts.rows) ? opts.rows : [];
    if (!rows.length) return '';
    const inline = opts.layout === 'inline';
    const comfortable = opts.density === 'comfortable';
    const summary = opts.summary || rows.map(function (row) { return row.label + ' ' + row.value + ', ' + row.percentage; }).join('; ');
    return wrap(opts, '<div class="ds-viz-conversion' + (inline ? ' ds-viz-conversion--inline' : '') +
      (comfortable ? ' ds-viz-conversion--comfortable' : '') + '" role="img" aria-label="' + attr(summary) + '">' +
      rows.map(function (row, index) {
        const width = Math.max(0, Math.min(100, Number(row.width) || 0));
        const opacity = row.opacity == null ? 1 - index * 0.12 : Number(row.opacity);
        if (inline) {
          return '<div class="ds-viz-conversion-row"><span class="ds-viz-inline-label"><b>' + attr(row.label) +
            '</b></span><div class="ds-viz-track"><i style="width:' + width.toFixed(2) + '%;opacity:' + opacity.toFixed(2) + '"></i></div>' +
            '<span class="ds-viz-inline-value"><strong>' + attr(row.value) + '</strong><small>(' + attr(row.percentage) +
            ')</small></span></div>';
        }
        return '<div class="ds-viz-conversion-row"><div class="ds-viz-row-head"><span><b>' + attr(row.label) + '</b><small>' +
          attr(row.percentage) + '</small></span><strong>' + attr(row.value) + '</strong></div>' +
          '<div class="ds-viz-track"><i style="width:' + width.toFixed(2) + '%;opacity:' + opacity.toFixed(2) + '"></i></div></div>';
      }).join('') + '</div>');
  }

  function rankedBars(options) {
    const opts = options || {};
    const rows = Array.isArray(opts.rows) ? opts.rows : [];
    if (!rows.length) return '';
    const summary = opts.summary || rows.map(function (row) { return row.label + ' ' + row.value; }).join('; ');
    const role = rows.some(function (row) { return row.href; }) ? 'group' : 'img';
    return wrap(opts, '<div class="ds-viz-ranked" role="' + role + '" aria-label="' + attr(summary) + '">' + rows.map(function (row) {
      const width = Math.max(0, Math.min(100, Number(row.width) || 0));
      const content = '<span class="ds-viz-ranked-label" title="' + attr(row.label) + '">' + attr(row.label) + '</span>' +
        '<span class="ds-viz-ranked-track"><i style="width:' + width.toFixed(2) + '%"></i></span><strong>' + attr(row.value) + '</strong>';
      return row.href ? '<a class="ds-viz-ranked-row" href="' + attr(row.href) + '" aria-label="' + attr(row.description || row.label + ' ' + row.value) + '">' + content + '</a>' :
        '<div class="ds-viz-ranked-row">' + content + '</div>';
    }).join('') + '</div>');
  }

  function stackedComposition(options) {
    const opts = options || {};
    const groups = Array.isArray(opts.groups) ? opts.groups : [];
    const series = paletteItems(Array.isArray(opts.series) ? opts.series : []);
    if (!groups.length || !series.length) return '';
    const maxTotal = Math.max(1, Math.max.apply(null, groups.map(function (group) {
      return (group.values || []).reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
    })));
    const summary = opts.summary || groups.map(function (group) { return group.label + ' ' + (group.values || []).join(', '); }).join('; ');
    const chart = '<div class="ds-viz-stacked" role="img" aria-label="' + attr(summary) + '">' + groups.map(function (group) {
        const values = Array.isArray(group.values) ? group.values : [];
        const total = values.reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
        const segments = values.map(function (value, seriesIndex) {
          const width = (Number(value) || 0) / maxTotal * 100;
          if (width <= 0 || !series[seriesIndex]) return '';
          return '<i title="' + attr(series[seriesIndex].label + ' ' + value) + '" style="width:' + width.toFixed(2) + '%;background:linear-gradient(90deg,' +
            attr(series[seriesIndex].highlight) + ',' + attr(series[seriesIndex].color) + ')"></i>';
        }).join('');
        return '<div class="ds-viz-stacked-row"><span>' + attr(group.label) + '</span><div>' + segments + '</div><strong>' +
          attr(group.totalLabel == null ? total : group.totalLabel) + '</strong></div>';
      }).join('') + '</div>';
    const legend = '<div class="ds-viz-legend" aria-hidden="true">' + series.map(function (item) {
      return '<span><i style="background:' + attr(item.color) + '"></i>' + attr(item.label) + '</span>';
    }).join('') + '</div>';
    return wrap(opts, chart + legend);
  }

  function tooltipParts(target) {
    const segment = target && target.closest ? target.closest('[data-ds-viz-segment-tooltip]') : null;
    if (!segment) return null;
    const donut = segment.closest('.ds-viz-donut');
    const tooltip = donut && donut.querySelector('.ds-viz-segment-tooltip');
    return donut && tooltip ? { segment: segment, donut: donut, tooltip: tooltip } : null;
  }

  function moveSegmentTooltip(parts, event) {
    const rect = parts.donut.getBoundingClientRect();
    const x = Math.max(varNumber('--space-300', 24), Math.min(rect.width - varNumber('--space-300', 24), event.clientX - rect.left));
    const y = Math.max(varNumber('--space-400', 32) + varNumber('--space-100', 8), event.clientY - rect.top);
    parts.tooltip.style.left = x + 'px';
    parts.tooltip.style.top = y + 'px';
  }

  function varNumber(name, fallback) {
    if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') return fallback;
    const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerover', function (event) {
      const parts = tooltipParts(event.target);
      if (!parts) return;
      parts.tooltip.textContent = parts.segment.getAttribute('data-ds-viz-segment-tooltip') || '';
      moveSegmentTooltip(parts, event);
      parts.tooltip.classList.add('is-visible');
      parts.tooltip.setAttribute('aria-hidden', 'false');
    });
    document.addEventListener('pointermove', function (event) {
      const parts = tooltipParts(event.target);
      if (parts) moveSegmentTooltip(parts, event);
    });
    document.addEventListener('pointerout', function (event) {
      const parts = tooltipParts(event.target);
      if (!parts) return;
      parts.tooltip.classList.remove('is-visible');
      parts.tooltip.setAttribute('aria-hidden', 'true');
    });
  }

  window.dsVisualization = Object.freeze({
    partToWhole: partToWhole,
    binnedDistribution: binnedDistribution,
    conversionSteps: conversionSteps,
    rankedBars: rankedBars,
    stackedComposition: stackedComposition,
    palette: Object.freeze({ categorical: categorical, highlights: highlights }),
    geometry: Object.freeze({ viewBox: '0 0 100 100', innerRadius: 34.35, outerRadius: 44 })
  });
})();
