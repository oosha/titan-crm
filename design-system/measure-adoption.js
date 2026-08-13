#!/usr/bin/env node
/*
  measure-adoption.js — how much of the product actually calls the design system.
  Run:  node design-system/measure-adoption.js          (print a report)
        node design-system/measure-adoption.js --write  (also update registry.json)

  Why this exists
  ───────────────
  The registry could say a block was `built` while the product ignored it, and the
  workbench would paint a full green bar. Icon was the worked example: a real Phosphor
  module, 196 variants of duplication nominally absorbed, and six actual call sites
  against 185 inline <svg> blocks still in the pages. "A component exists" and "the
  product uses it" are different facts and the ledger was only tracking the first.

  What it counts
  ──────────────
  Per built block, two numbers over the shipped pages:
    adopted — call sites that go through the design system
    legacy  — call sites that still hand-roll the same thing

  The patterns below are deliberately coarse and stated in the open, because the useful
  property is not precision — it is that the same rule runs every time, so the delta
  between two runs is real movement rather than a change of definition. A count that is
  10% off but consistent tells you migration is working; a hand-tallied "about half done"
  tells you nothing.

  design-system/ itself is excluded: it is the system, not a consumer of it. Counting the
  workbench's own ds-btn demos as adoption would flatter every number.
*/

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Scope: the CRM and its modules. Deliberately NOT the mailbox.
//
// index.html is the mocked half of the prototype — static demo threads, its own .nav-item
// rules, 275 hand-rolled call sites — and it is not where the system is being adopted. Left
// in the scan it dominated every figure and made CRM progress unreadable: converting all 19
// of crm.html's icons moved the headline from 2% to 4%, because the denominator was mostly
// mail. Exclusions are here, in one place, rather than as an allowlist, so a new CRM page is
// in scope the moment it exists.
const MAILBOX = new Set(['index.html']);
const SKIP_DIRS = new Set(['design-system', 'api', 'node_modules', '.git', 'data',
                           'scratchpad', 'App Redesign',
                           'personas']);   // persona identity + mailbox threads, not CRM UI
const SKIP_FILES = new Set(['dev-server.js', ...MAILBOX]);

function surfaces() {
  const out = [];
  (function walk(dir, depth) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.relative(ROOT, p);
      if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
      if (/\.(html|js)$/.test(name)) out.push(rel);
    }
  })(ROOT, 0);
  return out.sort();
}

// A class-attribute token matcher. Class lists appear both as real attributes and inside
// JS template strings; both are call sites, so matching the text is right, not a bug.
const classTokens = (src) => {
  const out = [];
  for (const m of src.matchAll(/class="([^"]*)"/g)) out.push(...m[1].split(/\s+/).filter(Boolean));
  for (const m of src.matchAll(/className\s*=\s*['"]([^'"]*)['"]/g)) out.push(...m[1].split(/\s+/).filter(Boolean));
  return out;
};

const count = (src, re) => (src.match(re) || []).length;

const BLOCKS = {
  Icon: {
    // dsIcon() calls and declarative placeholders vs raw inline SVG.
    adopted: (src) => count(src, /dsIcon\s*\(/g) + count(src, /data-ds-icon/g),
    legacy:  (src) => count(src, /<svg\b/g),
    unit: 'icon',
  },
  Button: {
    adopted: (src) => classTokens(src).filter((c) => c === 'ds-btn').length,
    legacy:  (src) => classTokens(src).filter((c) =>
               /(?:^|-)(?:btn|button)s?(?:-|$)/.test(c) && !c.startsWith('ds-')).length,
    unit: 'button class use',
  },
  'Input / field': {
    adopted: (src) => classTokens(src).filter((c) => c === 'ds-input' || c === 'ds-field').length,
    legacy:  (src) => count(src, /<(?:input|textarea|select)\b(?![^>]*\bds-input\b)/g),
    unit: 'form control',
  },
  'Badge / chip / pill': {
    adopted: (src) => classTokens(src).filter((c) => c === 'ds-badge').length,
    legacy:  (src) => classTokens(src).filter((c) =>
               /(?:^|-)(?:badge|chip|pill|tag)s?(?:-|$)/.test(c) && !c.startsWith('ds-')).length,
    unit: 'badge class use',
  },
  'Card / panel': {
    adopted: (src) => classTokens(src).filter((c) => c === 'ds-card').length,
    legacy:  (src) => classTokens(src).filter((c) =>
               /(?:^|-)cards?(?:-|$)/.test(c) && !c.startsWith('ds-') && !c.startsWith('kanban-')).length,
    unit: 'card class use',
  },
};

// A ds- class only counts if the rules that style it can actually reach the page. Without
// this check the metric rewards typing class names: opportunity-view.html was migrated to
// .ds-input / .ds-card / .ds-badge while no page linked primitives.css at all, so 34 call
// sites scored as adopted and the screen rendered unstyled. Inert uses are reported
// separately — silently scoring them zero would hide the mistake instead of naming it.
const LINKED = /design-system\/components\.css|design-system\/components\//;
function wiredUp(rel, src) {
  if (/\.js$/.test(rel)) return true;          // a script has no <link> of its own
  return LINKED.test(src);
}

const files = surfaces();
const totals = {};
const perFile = {};
const inert = {};
for (const name of Object.keys(BLOCKS)) totals[name] = { adopted: 0, legacy: 0, inert: 0 };

for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const wired = wiredUp(rel, src);
  perFile[rel] = {};
  for (const [name, spec] of Object.entries(BLOCKS)) {
    const a = spec.adopted(src);
    const l = spec.legacy(src);
    if (wired) totals[name].adopted += a;
    else { totals[name].inert += a; if (a) inert[rel] = (inert[rel] || 0) + a; }
    totals[name].legacy += l;
    if (a || l) perFile[rel][name] = { adopted: wired ? a : 0, legacy: l };
  }
}

const pct = (a, l) => (a + l === 0 ? 0 : Math.round((a / (a + l)) * 100));

console.log(`\nDesign-system adoption — ${files.length} CRM surfaces (mailbox out of scope)\n`);
console.log('  block                     adopted   legacy    share');
console.log('  ' + '─'.repeat(52));
let ta = 0, tl = 0;
for (const [name, t] of Object.entries(totals)) {
  ta += t.adopted; tl += t.legacy;
  console.log(`  ${name.padEnd(24)} ${String(t.adopted).padStart(6)} ${String(t.legacy).padStart(8)} ${String(pct(t.adopted, t.legacy) + '%').padStart(8)}`);
}
console.log('  ' + '─'.repeat(52));
console.log(`  ${'ALL'.padEnd(24)} ${String(ta).padStart(6)} ${String(tl).padStart(8)} ${String(pct(ta, tl) + '%').padStart(8)}\n`);

const inertTotal = Object.values(totals).reduce((n, t) => n + t.inert, 0);
if (inertTotal) {
  console.log(`  !! ${inertTotal} ds- class use(s) are INERT — the page does not link`);
  console.log('     design-system/components.css, so those rules never reach it:');
  for (const [f, n] of Object.entries(inert)) console.log(`       ${String(n).padStart(4)}  ${f}`);
  console.log('     Not counted as adopted. Fix the <link>, not the number.\n');
}

// The worst offenders, because that is where the next hour goes.
const worst = Object.entries(perFile)
  .map(([f, b]) => [f, Object.values(b).reduce((n, x) => n + x.legacy, 0)])
  .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('  most hand-rolled call sites remaining:');
for (const [f, n] of worst) console.log(`    ${String(n).padStart(4)}  ${f}`);
console.log();

if (process.argv.includes('--write')) {
  const p = path.join(__dirname, 'registry.json');
  const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const b of reg.inventory.blocks) {
    const t = totals[b.name];
    if (!t) continue;
    b.adopted = t.adopted;
    b.legacy = t.legacy;
  }
  reg.inventory.adoptionMeasuredBy = 'design-system/measure-adoption.js';
  fs.writeFileSync(p, JSON.stringify(reg, null, 2) + '\n');
  console.log('  registry.json updated (adopted / legacy per block)\n');
}
