#!/usr/bin/env node
/** Re-run mechanical simulation with correct field matching. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const HOLDOUT = path.join(ROOT, 'batches/ready/lesen');
const DRYRUN = path.join(ROOT, 'batches/ready/PHASE1-G2-DRYRUN.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/spike-pos-caps-repair-roi.json');

const PURE = new Set([
  'adj_before_noun', 'quantifier_capitalized', 'adj_after_prep', 'adv_capitalized',
  'adv_after_pronoun', 'zu_adv_capitalized', 'lexicon_nn', 'modal_noun_object',
  'lexicon_after_adj', 'lexicon_override_tag', 'double_pass_after_prep', 'adv_before_verb',
]);
const RISKY = new Set(['verb_census_no_finite', 'prose_strict_homograph', 'modal_final_infinitive']);

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function applyFix(text, f) {
  const target = f.type === 'wrong_capitalized'
    ? f.word[0].toLowerCase() + f.word.slice(1)
    : f.word[0].toUpperCase() + f.word.slice(1);
  if (f.word === target) return text;
  const ctx = f.context || '';
  const idx = text.indexOf(ctx);
  if (idx >= 0 && ctx.includes(f.word)) {
    const abs = idx + ctx.indexOf(f.word);
    return text.slice(0, abs) + target + text.slice(abs + f.word.length);
  }
  const re = new RegExp(`(?<![A-Za-zÄÖÜäöüß-])${escapeRe(f.word)}(?![A-Za-zÄÖÜäöüß-])`);
  const m = re.exec(text);
  return m ? text.slice(0, m.index) + target + text.slice(m.index + f.word.length) : text;
}

function setField(batch, field, text) {
  const b = structuredClone(batch);
  const pm = field.match(/^passages\[(\d+)\]\.(.+)$/);
  if (pm) {
    const p = b.passages[+pm[1]];
    const r = pm[2];
    if (r === 'text') p.text = text;
    else if (r === 'transcript') p.transcript = text;
    else if (r.startsWith('ads[')) p.ads[+r.match(/ads\[(\d+)\]/)[1]] = text;
    return b;
  }
  const qm = field.match(/^questions\[(\d+)\]\.(.+)$/);
  if (qm) {
    const q = b.questions[+qm[1]];
    const r = qm[2];
    if (['question', 'signText', 'explanation', 'statement'].includes(r)) q[r] = text;
    else if (r.startsWith('options[')) {
      const oi = +r.match(/options\[(\d+)\]/)[1];
      if (typeof q.options[oi] === 'string') q.options[oi] = text;
      else q.options[oi].text = text;
    }
    return b;
  }
  return b;
}

function runG2(items) {
  const r = runPosCapsBulk(items, { timeoutMs: 600_000 });
  if (r.skipped) throw new Error(r.warning);
  const meta = new Map(items.map((it) => [it.id, it]));
  return r.findings.map((f) => ({ ...f, file: meta.get(f.id)?.file, field: f.field || meta.get(f.id)?.field }));
}

function fkey(f) { return `${f.file}::${f.field}::${f.word}::${f.reason}`; }

const files = fs.readdirSync(HOLDOUT).filter((f) => /lesen-t\d/.test(f)).sort();
const items = [];
const batches = new Map();
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(HOLDOUT, file), 'utf8'));
  batches.set(file, batch);
  for (const { field, text } of collectStringsFromBatch(batch)) {
    items.push({ id: `${file}::${field}`, file, field, text });
  }
}

console.log('G2 before…');
const before = runG2(items);
console.log(`Before: ${before.length}`);

const byClass = { pure: 0, risky: 0 };
for (const f of before) {
  if (PURE.has(f.reason)) byClass.pure++;
  else if (RISKY.has(f.reason)) byClass.risky++;
}

// Apply mechanical per file+field
const mechBatches = new Map(batches);
for (const [file, batch] of batches) {
  let b = batch;
  const fields = collectStringsFromBatch(b);
  for (const { field, text } of fields) {
    const fl = before.filter((x) => x.file === file && x.field === field);
    let t = text;
    for (const f of fl) t = applyFix(t, f);
    if (t !== text) b = setField(b, field, t);
  }
  mechBatches.set(file, b);
}

const mechItems = [];
for (const file of files) {
  for (const { field, text } of collectStringsFromBatch(mechBatches.get(file))) {
    mechItems.push({ id: `${file}::${field}`, file, field, text });
  }
}

console.log('G2 after mechanical…');
const afterMech = runG2(mechItems);
const beforeSet = new Set(before.map(fkey));
const afterSet = new Set(afterMech.map(fkey));
const resolved = before.filter((f) => !afterSet.has(fkey(f)));
const added = afterMech.filter((f) => !beforeSet.has(fkey(f)));
const shifted = before.filter((f) => !afterSet.has(fkey(f)) && afterMech.some((a) => a.file === f.file && a.field === f.field && a.word.toLowerCase() === f.word.toLowerCase()));

console.log(`After mech: ${afterMech.length} resolved=${resolved.length} added=${added.length} shifted=${shifted.length}`);

const listItems = [];
for (const file of files) {
  const { batch } = applyGermanCapsNormalize(batches.get(file));
  for (const { field, text } of collectStringsFromBatch(batch)) {
    listItems.push({ id: `${file}::${field}`, file, field, text });
  }
}
const afterLists = runG2(listItems);
console.log(`After lists: ${afterLists.length}`);

const dryrun = JSON.parse(fs.readFileSync(DRYRUN, 'utf8'));
const report = {
  generatedAt: new Date().toISOString(),
  measured: { before: before.length, afterMech: afterMech.length, afterLists: afterLists.length },
  classification: {
    repairByTypePure: byClass.pure,
    repairByTypeRisky: byClass.risky,
    purePct: Math.round(1000 * byClass.pure / before.length) / 10,
    riskyPct: Math.round(1000 * byClass.risky / before.length) / 10,
    mechanicalCandidatePct: Math.round(1000 * (byClass.pure + byClass.risky) / before.length) / 10,
  },
  mechanicalSimulation: {
    resolved: resolved.length,
    resolvedPct: Math.round(1000 * resolved.length / before.length) / 10,
    added: added.length,
    shiftedSameToken: shifted.length,
    remaining: afterMech.length,
    addedSample: added.slice(0, 10),
    unresolvedSample: afterMech.slice(0, 10),
  },
  listsComparison: {
    remaining: afterLists.length,
    resolved: before.length - afterLists.length,
    resolvedPct: Math.round(1000 * (before.length - afterLists.length) / before.length) / 10,
    dryrunRef: dryrun.summary.afterFindings,
  },
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
