#!/usr/bin/env node
/**
 * Spike ROI — bulk G2 (3 passes total, not per-file).
 *   node scripts/spike-pos-caps-repair-roi.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const HOLDOUT_DIR = path.join(ROOT, 'batches/ready/lesen');
const DRYRUN_PATH = path.join(ROOT, 'batches/ready/PHASE1-G2-DRYRUN.json');
const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/spike-pos-caps-repair-roi.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/SPIKE-POS-CAPS-REPAIR-ROI.md');

const PURE_REPAIR_REASONS = new Set([
  'adj_before_noun', 'quantifier_capitalized', 'adj_after_prep', 'adv_capitalized',
  'adv_after_pronoun', 'zu_adv_capitalized', 'lexicon_nn', 'modal_noun_object',
  'lexicon_after_adj', 'lexicon_override_tag', 'double_pass_after_prep', 'adv_before_verb',
]);

const RISKY_REPAIR_REASONS = new Set([
  'verb_census_no_finite', 'prose_strict_homograph', 'modal_final_infinitive',
]);

function listHoldoutFiles() {
  return fs.readdirSync(HOLDOUT_DIR)
    .filter((f) => f.endsWith('.json') && /lesen-t\d/i.test(f))
    .sort();
}

function loadAllItems(files) {
  const items = [];
  const batches = new Map();
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(HOLDOUT_DIR, file), 'utf8'));
    batches.set(file, batch);
    for (const { field, text } of collectStringsFromBatch(batch)) {
      items.push({ id: `${file}::${field}::${items.length}`, file, field, text });
    }
  }
  return { items, batches };
}

function runG2(items) {
  const bulk = runPosCapsBulk(items, { timeoutMs: 600_000, chunkSize: 200 });
  if (bulk.skipped) throw new Error(bulk.warning);
  const idToMeta = new Map(items.map((it) => [it.id, it]));
  return (bulk.findings || []).map((f) => ({
    ...f,
    file: idToMeta.get(String(f.id))?.file || f.file,
    field: f.field || idToMeta.get(String(f.id))?.field,
  }));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyMechanicalFix(text, finding) {
  const { word, type, context } = finding;
  const target = type === 'wrong_capitalized'
    ? word[0].toLowerCase() + word.slice(1)
    : word[0].toUpperCase() + word.slice(1);
  if (word === target) return text;
  const ctx = String(context || '');
  const idx = text.indexOf(ctx);
  if (idx >= 0 && ctx.includes(word)) {
    const wIdx = ctx.indexOf(word);
    const abs = idx + wIdx;
    return text.slice(0, abs) + target + text.slice(abs + word.length);
  }
  const re = new RegExp(`(?<![A-Za-zÄÖÜäöüß-])${escapeRe(word)}(?![A-Za-zÄÖÜäöüß-])`);
  const m = re.exec(text);
  if (!m) return text;
  return text.slice(0, m.index) + target + text.slice(m.index + word.length);
}

function setFieldText(batch, field, newText) {
  const b = structuredClone(batch);
  const pm = field.match(/^passages\[(\d+)\]\.(.+)$/);
  if (pm) {
    const p = b.passages[Number(pm[1])];
    const rest = pm[2];
    if (rest === 'text') p.text = newText;
    else if (rest === 'title') p.title = newText;
    else if (rest === 'transcript') p.transcript = newText;
    else if (rest.startsWith('ads[')) p.ads[Number(rest.match(/ads\[(\d+)\]/)?.[1])] = newText;
    else if (rest.startsWith('audio[')) p.audio[Number(rest.match(/audio\[(\d+)\]/)?.[1])].text = newText;
    return b;
  }
  const qm = field.match(/^questions\[(\d+)\]\.(.+)$/);
  if (qm) {
    const q = b.questions[Number(qm[1])];
    const rest = qm[2];
    if (rest === 'question') q.question = newText;
    else if (rest === 'signText') q.signText = newText;
    else if (rest === 'explanation') q.explanation = newText;
    else if (rest === 'statement') q.statement = newText;
    else if (rest.startsWith('options[')) {
      const oi = Number(rest.match(/options\[(\d+)\]/)?.[1]);
      if (typeof q.options[oi] === 'string') q.options[oi] = newText;
      else if (q.options[oi]) q.options[oi].text = newText;
    } else if (rest.startsWith('matchLabels[')) {
      q.matchLabels[Number(rest.match(/matchLabels\[(\d+)\]/)?.[1])] = newText;
    }
  }
  return b;
}

function applyMechanicalToBatches(batches, findings, items) {
  const textById = new Map(items.map((it) => [it.id, it.text]));
  const findingsById = new Map();
  for (const f of findings) {
    const id = f.id || `${f.file}::${f.field}`;
    if (!findingsById.has(id)) findingsById.set(id, []);
    findingsById.get(id).push(f);
  }
  const out = new Map(batches);
  for (const [id, flist] of findingsById) {
    let text = textById.get(String(id));
    if (text == null) continue;
    for (const f of flist) text = applyMechanicalFix(text, f);
    const meta = items.find((it) => it.id === String(id));
    if (!meta) continue;
    out.set(meta.file, setFieldText(out.get(meta.file), meta.field, text));
  }
  return out;
}

function classify(f) {
  if (PURE_REPAIR_REASONS.has(f.reason)) return 'repair-by-type';
  if (RISKY_REPAIR_REASONS.has(f.reason)) return 'repair-by-type-risky';
  return 'needs-review';
}

function countBy(arr, fn) {
  const m = {};
  for (const x of arr) m[fn(x)] = (m[fn(x)] || 0) + 1;
  return m;
}

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function diffFindings(before, after) {
  const key = (f) => `${f.file}::${f.field}::${f.word}::${f.reason}`;
  const afterSet = new Set(after.map(key));
  const beforeSet = new Set(before.map(key));
  return {
    resolved: before.filter((f) => !afterSet.has(key(f))),
    added: after.filter((f) => !beforeSet.has(key(f))),
  };
}

async function main() {
  const dryrun = JSON.parse(fs.readFileSync(DRYRUN_PATH, 'utf8'));
  const files = listHoldoutFiles();
  const { items, batches } = loadAllItems(files);

  console.log(`Bulk G2 pass 1/3 (before) — ${items.length} fields…`);
  const before = runG2(items);
  console.log(`Findings before: ${before.length} (dryrun: ${dryrun.summary.beforeFindings})`);

  const byClass = { 'repair-by-type': [], 'repair-by-type-risky': [], 'needs-review': [] };
  for (const f of before) byClass[classify(f)].push(f);

  console.log('Applying mechanical repair + bulk G2 pass 2/3…');
  const mechBatches = applyMechanicalToBatches(batches, before, items);
  const mechItems = [];
  for (const file of files) {
    for (const { field, text } of collectStringsFromBatch(mechBatches.get(file))) {
      mechItems.push({ id: `${file}::${field}::${mechItems.length}`, file, field, text });
    }
  }
  const afterMech = runG2(mechItems);
  const mechDiff = diffFindings(before, afterMech);
  console.log(`After mechanical: ${afterMech.length} (resolved ${mechDiff.resolved.length}, added ${mechDiff.added.length})`);

  console.log('Lists normalize + bulk G2 pass 3/3…');
  const listItems = [];
  for (const file of files) {
    const { batch } = applyGermanCapsNormalize(batches.get(file), { decapOnly: false });
    for (const { field, text } of collectStringsFromBatch(batch)) {
      listItems.push({ id: `${file}::${field}::${listItems.length}`, file, field, text });
    }
  }
  const afterLists = runG2(listItems);
  const listsDiff = diffFindings(before, afterLists);
  console.log(`After lists: ${afterLists.length} (dryrun: ${dryrun.summary.afterFindings})`);

  const report = {
    generatedAt: new Date().toISOString(),
    holdoutFiles: files.length,
    fields: items.length,
    dryrunRef: { before: dryrun.summary.beforeFindings, after: dryrun.summary.afterFindings },
    measured: {
      beforeFindings: before.length,
      afterMechanical: afterMech.length,
      afterListsNormalize: afterLists.length,
    },
    classification: {
      repairByTypePure: byClass['repair-by-type'].length,
      repairByTypeRisky: byClass['repair-by-type-risky'].length,
      needsReview: byClass['needs-review'].length,
      purePct: pct(byClass['repair-by-type'].length, before.length),
      riskyPct: pct(byClass['repair-by-type-risky'].length, before.length),
      byReasonBefore: countBy(before, (f) => f.reason),
      pureByReason: countBy(byClass['repair-by-type'], (f) => f.reason),
      riskyByReason: countBy(byClass['repair-by-type-risky'], (f) => f.reason),
    },
    mechanicalSimulation: {
      resolvedCount: mechDiff.resolved.length,
      remainingCount: afterMech.length,
      addedCount: mechDiff.added.length,
      resolvedPct: pct(mechDiff.resolved.length, before.length),
      addedFindings: mechDiff.added.slice(0, 20),
      unresolvedSample: afterMech.slice(0, 25),
    },
    listsComparison: {
      resolvedCount: listsDiff.resolved.length,
      remainingCount: afterLists.length,
      resolvedPct: pct(listsDiff.resolved.length, before.length),
      deltaMechVsLists: afterMech.length - afterLists.length,
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, renderMd(report));
  console.log(`Escrito: ${OUT_MD}`);
}

function renderMd(r) {
  const purePlusRisky = r.classification.repairByTypePure + r.classification.repairByTypeRisky;
  return [
    '# Spike ROI — pos-caps repair mecánico',
    '',
    `**Fecha:** ${r.generatedAt}`,
    `**Corpus:** ${r.holdoutFiles} archivos, ${r.fields} campos`,
    '',
    '## 1. Clasificación on-paper',
    '',
    '| Clase | N | % |',
    '|---|---:|---:|',
    `| repair-by-type (puro) | ${r.classification.repairByTypePure} | ${r.classification.purePct}% |`,
    `| repair-by-type-risky | ${r.classification.repairByTypeRisky} | ${r.classification.riskyPct}% |`,
    `| **Total candidatos mecánicos** | **${purePlusRisky}** | **${pct(purePlusRisky, r.measured.beforeFindings)}%** |`,
    '',
    '## 2. Simulación',
    '',
    '| Estrategia | Findings tras fix | Resueltos | addedFindings |',
    '|---|---:|---:|---:|',
    `| Baseline (sin fix) | ${r.measured.beforeFindings} | 0 | 0 |`,
    `| **Repair mecánico naive** | ${r.measured.afterMechanical} | ${r.mechanicalSimulation.resolvedCount} (${r.mechanicalSimulation.resolvedPct}%) | ${r.mechanicalSimulation.addedCount} |`,
    `| Lists normalize (v3.2) | ${r.measured.afterListsNormalize} | ${r.listsComparison.resolvedCount} (${r.listsComparison.resolvedPct}%) | — |`,
    '',
    `**Delta mecánico vs lists:** ${r.listsComparison.deltaMechVsLists} findings restantes (positivo = mecánico peor).`,
  ].join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
