#!/usr/bin/env node
/*
  measure-inventory.js — how much duplication each block actually carries, in the CRM.
  Run:  node design-system/measure-inventory.js          (print a report)
        node design-system/measure-inventory.js --write  (also update registry.json)

  Why this exists
  ───────────────
  The inventory's variant counts came from a one-off survey of all 756 class-rule roots in
  the product — including index.html. Once the mailbox went out of scope those figures
  overstated the CRM: `List row` led the ledger at 88 variants while its headline example,
  `email-tile`, is a mailbox class, and `comp-*` (the composer) was padding Divider, Link,
  Meter and Checkbox.

  Method, and its one honest limitation
  ─────────────────────────────────────
  It does NOT re-cluster the CSS by role — that was human judgement and a regex would do it
  worse while looking more precise. Instead it reuses the prefixes that survey already
  identified, which are recorded per block in the registry's `whereToday`, and counts how
  many top-level CSS rules each prefix actually has in CRM files versus the mailbox.

  So the clustering is still the original human call; only the counting is mechanical, and
  it is mechanical the same way every run. A prefix that turns out to be mailbox-only drops
  out of the block by scoring zero, which is exactly what should happen.
*/

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAILBOX = ['index.html'];
const SKIP_DIRS = new Set(['design-system', 'api', 'node_modules', '.git', 'data',
                           'scratchpad', 'App Redesign', 'personas']);

function collect(onlyMailbox) {
  const out = [];
  (function walk(dir, depth) {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name === 'dev-server.js') continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
      if (!/\.(html|css|js)$/.test(name)) continue;
      const isMail = MAILBOX.includes(path.relative(ROOT, p));
      if (isMail === !!onlyMailbox) out.push(path.relative(ROOT, p));
    }
  })(ROOT, 0);
  return out;
}

const src = (files) => files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const CRM = src(collect(false));
const MAIL = src(collect(true));

// Top-level rules whose selector begins with `.<prefix>`, e.g. `.dir-row:hover td {`.
function rulesFor(text, prefix) {
  const re = new RegExp('^[ \\t]*\\.' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                        '[\\w-]*[^{\\n]*\\{', 'gm');
  return (text.match(re) || []).length;
}

// The prefixes each block was found under, parsed from `whereToday` — where the original
// survey wrote them down.
//
// `whereToday` is prose as much as data: "dir-table, ai-table, kanban col grid" and
// "dash bars" and "fl tabs" all appear. A first pass that accepted any bare word read
// "kanban" out of Table's entry and counted all 26 kanban rules against Table, and read
// "dash" out of Tabs' entry and counted every dashboard class. Both looked rigorous and were
// nonsense. So a prefix must be hyphenated — which every real class here is — unless it is
// one of the few genuine single-word classes, named explicitly.
const SINGLE_WORD_CLASSES = new Set(['tile', 'meter', 'ring', 'thread']);
function prefixesOf(block) {
  return block.whereToday
    .split(',')
    .map((s) => s.trim())
    .flatMap((s) => s.split(/\s+/))
    .map((s) => s.replace(/^\./, '').replace(/[*…]+$/, ''))
    .filter((s) => /^[a-z][\w-]*$/.test(s))
    .filter((s) => !/\.(html|css|js)$/.test(s))
    .filter((s) => s.includes('-') || SINGLE_WORD_CLASSES.has(s));
}

const regPath = path.join(__dirname, 'registry.json');
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));

console.log('\nDuplication per block — CRM only (mailbox shown for comparison)\n');
console.log('  block                       crm   mail   prefixes kept');
console.log('  ' + '─'.repeat(74));

const results = {};
for (const b of reg.inventory.blocks) {
  if (b.status === 'excluded' || b.status === 'built') continue;
  const pre = prefixesOf(b);
  let crm = 0, mail = 0;
  // A prefix with no CRM rules is one of two different things, and conflating them was a
  // wrong claim in generated data: `comp-link` exists nowhere at all — the hand survey
  // recorded a stem that was never a real class — while a genuinely mailbox-only prefix has
  // rules in index.html. Only the latter is "out of scope"; the former is just noise.
  const kept = [], mailOnly = [], phantom = [];
  for (const p of pre) {
    const c = rulesFor(CRM, p);
    const m = rulesFor(MAIL, p);
    crm += c; mail += m;
    if (c > 0) kept.push(p);
    else if (m > 0) mailOnly.push(p);
    else phantom.push(p);
  }
  results[b.name] = { variants: crm, prefixes: kept.length, surveyed: pre.length,
                      dropped: mailOnly.concat(phantom), mailOnly: mailOnly, phantom: phantom };
  console.log(`  ${b.name.padEnd(26)} ${String(crm).padStart(4)} ${String(mail).padStart(6)}   ` +
              `${kept.length}/${pre.length}` +
              (mailOnly.length ? `  (${mailOnly.length} mailbox-only)` : '') +
              (phantom.length ? `  (${phantom.length} phantom: ${phantom.join(',')})` : ''));
}
console.log();

if (process.argv.includes('--write')) {
  for (const b of reg.inventory.blocks) {
    const r = results[b.name];
    if (!r) continue;
    // No prefixes parsed means the survey never wrote any down for this block — that is
    // "not measured", not "measured as zero", and the ledger draws no bar for it.
    if (r.surveyed === 0) {
      b.variants = null;
      b.prefixes = null;
      b.evidence = 'no class prefixes recorded by the survey; scale unmeasured';
      continue;
    }
    b.variants = r.variants;
    b.prefixes = r.prefixes || null;
    const plural = (n) => (n === 1 ? 'prefix' : 'prefixes');
    const notes = [];
    if (r.mailOnly.length) notes.push(`${r.mailOnly.length} ${plural(r.mailOnly.length)} mailbox-only, out of scope`);
    if (r.phantom.length) notes.push(`${r.phantom.length} surveyed ${plural(r.phantom.length)} match no rule anywhere (${r.phantom.join(', ')})`);
    b.evidence = `${r.variants} CRM rules across ${r.prefixes} ${plural(r.prefixes)}` +
      (notes.length ? '; ' + notes.join('; ') : '');
    // Drop mailbox-only prefixes from whereToday too, or the ledger's "Today" column keeps
    // naming an out-of-scope class as the block's representative — List row led the list
    // citing `email-tile`, which is mail.
    for (const d of r.dropped) {
      b.whereToday = b.whereToday
        .replace(new RegExp('\\.?\\b' + d + '\\b(-\\*)?,\\s*', 'g'), '')
        .replace(new RegExp(',\\s*\\.?\\b' + d + '\\b(-\\*)?', 'g'), '');
    }
  }
  // A built block's scale comes from measure-adoption.js instead: its call sites are
  // countable directly, and mixing a CRM-only figure for planned blocks with a
  // whole-product one for built blocks would make the bars incomparable — Icon claimed
  // 196 while only 85 of those sites are in the CRM at all.
  for (const b of reg.inventory.blocks) {
    if (b.status !== 'built' || typeof b.adopted !== 'number') continue;
    b.variants = b.adopted + b.legacy;
    b.evidence = `${b.variants} CRM call sites, ${b.adopted} of them on the component`;
  }
  reg.inventory.scope = 'The CRM and its modules. index.html (the mailbox) is out of scope.';
  reg.inventory.variantsMeasuredBy = 'design-system/measure-inventory.js';
  fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
  console.log('  registry.json updated (variants / prefixes / evidence per block)\n');
}
