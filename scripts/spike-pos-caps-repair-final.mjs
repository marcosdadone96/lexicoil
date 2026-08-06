#!/usr/bin/env node
/** Spike final: walk-all-strings mechanical fix, 37 files with findings only. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const HOLDOUT = path.join(ROOT, 'batches/ready/lesen');
const DRYRUN = JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/ready/PHASE1-G2-DRYRUN.json'), 'utf8'));
const OUT = path.join(ROOT, 'batches/ready/gate-logs/spike-pos-caps-repair-roi.json');

const PURE = new Set([
  'adj_before_noun', 'quantifier_capitalized', 'adj_after_prep', 'adv_capitalized',
  'adv_after_pronoun', 'zu_adv_capitalized', 'lexicon_nn', 'modal_noun_object',
  'lexicon_after_adj', 'lexicon_override_tag', 'double_pass_after_prep', 'adv_before_verb',
]);
const RISKY = new Set(['verb_census_no_finite', 'prose_strict_homograph', 'modal_final_infinitive']);

const FILES_WITH_FINDINGS = DRYRUN.files.filter((f) => f.beforeFindings > 0).map((f) => f.file);

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

function walkStrings(batch, fn) {
  for (const p of batch.passages || []) {
    if (typeof p.text === 'string') fn((t) => { p.text = t; }, () => p.text);
    if (typeof p.title === 'string') fn((t) => { p.title = t; }, () => p.title);
    if (typeof p.transcript === 'string') fn((t) => { p.transcript = t; }, () => p.transcript);
    for (const ad of p.ads || []) if (typeof ad === 'string') fn((t) => { const i = p.ads.indexOf(ad); p.ads[i] = t; }, () => ad);
    for (const a of p.audio || []) if (a?.text) fn((t) => { a.text = t; }, () => a.text);
  }
  for (const q of batch.questions || []) {
    for (const k of ['question', 'signText', 'explanation', 'statement']) {
      if (typeof q[k] === 'string') fn((t) => { q[k] = t; }, () => q[k]);
    }
    for (const l of q.matchLabels || []) if (typeof l === 'string') fn((t) => { const i = q.matchLabels.indexOf(l); q.matchLabels[i] = t; }, () => l);
    for (const opt of q.options || []) {
      if (typeof opt === 'string') fn((t) => { const i = q.options.indexOf(opt); q.options[i] = t; }, () => opt);
      else if (opt?.text) fn((t) => { opt.text = t; }, () => opt.text);
    }
  }
}

function applyMechBatch(batch, findings) {
  const b = structuredClone(batch);
  for (const f of findings) {
    walkStrings(b, (set, get) => {
      const t = get();
      if (!t || !t.includes(f.word)) return;
      const n = applyFix(t, f);
      if (n !== t) set(n);
    });
  }
  return b;
}

function itemsFromBatch(batch, file) {
  return collectStringsFromBatch(batch).map((f, i) => ({
    id: `${file}::${f.field}::${i}`,
    file,
    ...f,
  }));
}

function runG2(items) {
  const r = runPosCapsBulk(items, { timeoutMs: 300_000 });
  if (r.skipped) throw new Error(r.warning);
  const meta = new Map(items.map((it) => [it.id, it]));
  return r.findings.map((f) => ({ ...f, file: meta.get(f.id)?.file || f.file, field: f.field || meta.get(f.id)?.field }));
}

function fkey(f) { return `${f.file}::${f.field}::${f.word}::${f.reason}`; }

const batches = new Map();
const allBefore = [];
const allItems = [];

for (const file of FILES_WITH_FINDINGS) {
  const batch = JSON.parse(fs.readFileSync(path.join(HOLDOUT, file), 'utf8'));
  batches.set(file, batch);
  const items = itemsFromBatch(batch, file);
  allItems.push(...items);
}

console.log(`G2 before (${FILES_WITH_FINDINGS.length} files)…`);
allBefore.push(...runG2(allItems));
console.log(`Before subset: ${allBefore.length} (total holdout ref: ${DRYRUN.summary.beforeFindings})`);

const byClass = { pure: 0, risky: 0 };
for (const f of allBefore) {
  if (PURE.has(f.reason)) byClass.pure++;
  else if (RISKY.has(f.reason)) byClass.risky++;
}

const mechItems = [];
for (const file of FILES_WITH_FINDINGS) {
  const bf = allBefore.filter((x) => x.file === file);
  const mb = applyMechBatch(batches.get(file), bf);
  mechItems.push(...itemsFromBatch(mb, file));
}

console.log('G2 after mechanical…');
const afterMech = runG2(mechItems);
const bSet = new Set(allBefore.map(fkey));
const aSet = new Set(afterMech.map(fkey));
const resolved = allBefore.filter((f) => !aSet.has(fkey(f)));
const added = afterMech.filter((f) => !bSet.has(fkey(f)));

const listItems = [];
for (const file of FILES_WITH_FINDINGS) {
  const { batch } = applyGermanCapsNormalize(batches.get(file));
  listItems.push(...itemsFromBatch(batch, file));
}
const afterLists = runG2(listItems);

// Extrapolate to full 193: scale resolution rate
const mechResolvedPct = Math.round(1000 * resolved.length / allBefore.length) / 10;
const listsResolvedPct = Math.round(1000 * (allBefore.length - afterLists.length) / allBefore.length) / 10;

const report = {
  generatedAt: new Date().toISOString(),
  method: '37 files with findings; walk-all-strings mechanical fix',
  subset: { files: FILES_WITH_FINDINGS.length, beforeFindings: allBefore.length },
  holdoutRef: DRYRUN.summary,
  classification: {
    repairByTypePure: byClass.pure,
    repairByTypeRisky: byClass.risky,
    purePct: Math.round(1000 * byClass.pure / allBefore.length) / 10,
    riskyPct: Math.round(1000 * byClass.risky / allBefore.length) / 10,
    mechanicalCandidatePct: Math.round(1000 * (byClass.pure + byClass.risky) / allBefore.length) / 10,
    needsListFallbackPct: Math.round(1000 * (allBefore.length - byClass.pure - byClass.risky) / allBefore.length) / 10,
    byReason: Object.fromEntries(
      [...new Set(allBefore.map((f) => f.reason))].map((r) => [
        r,
        {
          n: allBefore.filter((f) => f.reason === r).length,
          class: PURE.has(r) ? 'repair-by-type' : RISKY.has(r) ? 'repair-by-type-risky' : 'needs-review',
        },
      ]),
    ),
  },
  mechanicalSimulation: {
    resolved: resolved.length,
    resolvedPct: mechResolvedPct,
    remaining: afterMech.length,
    added: added.length,
    resolvedSample: resolved.slice(0, 8).map((f) => ({ word: f.word, reason: f.reason, file: f.file })),
    addedSample: added.slice(0, 8).map((f) => ({ word: f.word, reason: f.reason, file: f.file })),
    stillFlaggedSample: afterMech.filter((f) => bSet.has(fkey(f))).slice(0, 8).map((f) => ({ word: f.word, reason: f.reason })),
  },
  listsOnSubset: {
    remaining: afterLists.length,
    resolved: allBefore.length - afterLists.length,
    resolvedPct: listsResolvedPct,
  },
  extrapolation: {
    note: 'If resolution rate holds on subset, full holdout mechanical would resolve ~' +
      Math.round(DRYRUN.summary.beforeFindings * resolved.length / allBefore.length) + ' findings',
    listsHoldoutRef: DRYRUN.summary.afterFindings,
  },
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
