#!/usr/bin/env node
/**
 * fill-pool-deficit-b1.mjs — Ingest only deficit cells to reach 5 clean parts/exam.
 * L2: scan batches/generated (POOL-2 + SEM-1). L3: make-t3 (deterministic).
 *
 * Usage:
 *   node scripts/fill-pool-deficit-b1.mjs
 *   node scripts/fill-pool-deficit-b1.mjs --apply
 *   node scripts/fill-pool-deficit-b1.mjs --dry-run   # POOL-2 only, no SEM-1, no write
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { buildValidatedT3Part } from './make-t3.mjs';
import { nextOutputBasename } from './lib/lesenTemplatePrompt.mjs';
import { buildLesenT3SeedRecord } from './lib/buildLesenT3SeedRecord.mjs';

loadEnvFile();

const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const TARGET_PER_CELL = 5;
const MARGIN = { lesen_2: 2, lesen_3: 3 }; // SEM-1 may reject some

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

function normOptions(opts) {
  return (opts || []).map((o) => {
    if (typeof o === 'string') {
      const m = o.match(/^([a-d])\)\s*(.*)$/i);
      return m ? { key: m[1].toUpperCase(), text: m[2] } : { key: 'A', text: o };
    }
    return {
      key: String(o.key || o.label || 'A').toUpperCase(),
      text: o.text || o.body || '',
    };
  });
}

function buildLesenT2Record(batch, lang = 'de', level = 'B1') {
  const passages = batch.passages || [];
  const qs = batch.questions || [];
  const hash = shortHash(passages.map((p) => p.text).join('|'));
  return {
    id: `bank-de-B1-lesen-t2-${hash}`,
    lang,
    level,
    module: 'lesen',
    teil: 2,
    passage: {
      title: passages[0]?.title || '',
      passages: passages.map((p, i) => ({
        passageId: p.id || `gen-l2-${hash}-${i ? 'b' : 'a'}`,
        textTitle: p.title || '',
        text: p.text || '',
      })),
      text: passages[0]?.text || '',
      transcript: '',
    },
    questions: qs.map((q) => ({
      id: q.id,
      type: 'multiple',
      question: q.question,
      options: normOptions(q.options),
      correct: String(q.correct || q.correctAnswer || '').toLowerCase(),
      correctAnswer: String(q.correct || q.correctAnswer || '').toLowerCase(),
      explanation: q.explanation || '',
      passageId: q.passageId,
    })),
    complete: true,
    verified: true,
    itemCount: qs.length,
    targetCount: qs.length,
    contributor: `bank:${hash}`,
    createdAt: Date.now(),
  };
}

async function countClean(seed) {
  const counts = { lesen_2: 0, lesen_3: 0 };
  for (const rec of seed) {
    const key = `${String(rec.module).toLowerCase()}_${Number(rec.teil)}`;
    if (!counts.hasOwnProperty(key)) continue;
    const gate = await isPartPoolReady(rec, { semantic: false });
    if (gate.ok) counts[key]++;
  }
  return counts;
}

function seedPassageFingerprints(seed, teil) {
  const fps = new Set();
  for (const rec of seed.filter((r) => r.module === 'lesen' && Number(r.teil) === teil)) {
    const texts = (rec.passage?.passages || []).map((p) => p.text);
    if (texts.length) fps.add(texts.join('|').slice(0, 200));
    else if (rec.passage?.text) fps.add(rec.passage.text.slice(0, 200));
  }
  return fps;
}

async function gateBatch(batch, label, buildRecord) {
  const struct = await isPartPoolReady(batch, { semantic: false });
  if (!struct.ok) {
    console.log(`  ❌ ${label} POOL-2 FAIL (${struct.blocking.length})`);
    struct.blocking.slice(0, 2).forEach((f) => console.log(`     [${f.id}] ${f.message?.slice(0, 80)}`));
    return null;
  }
  if (dryRun) {
    const record = buildRecord(batch);
    console.log(`  ✅ ${label} POOL-2 OK (SEM-1 skipped dry-run) → ${record.id}`);
    return record;
  }
  const sem = await isPartPoolReady(batch, { semantic: true });
  const semFindings = sem.blocking.filter((f) => f.id?.startsWith('SEM-'));
  if (semFindings.length) {
    console.log(`  ❌ ${label} SEM-1 FAIL (${semFindings.length})`);
    semFindings.slice(0, 2).forEach((f) => console.log(`     [${f.id}] ${f.message?.slice(0, 80)}`));
    return null;
  }
  const record = buildRecord(batch);
  const recGate = await isPartPoolReady(record, { semantic: false });
  if (!recGate.ok) {
    console.log(`  ❌ ${label} record POOL-2 FAIL after build`);
    return null;
  }
  console.log(`  ✅ ${label} POOL-2 + SEM-1 → ${record.id}`);
  return record;
}

async function tryL2Batches(need, existingIds, seedFps) {
  const dir = path.join(ROOT, 'batches/generated');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('lesen-t2-')).sort().reverse();
  const added = [];
  for (const f of files) {
    if (added.length >= need) break;
    const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const fp = (batch.passages || []).map((p) => p.text).join('|').slice(0, 200);
    if (seedFps.has(fp)) continue;
    const record = await gateBatch(batch, `L2 ${f}`, (b) => buildLesenT2Record(b));
    if (!record || existingIds.has(record.id)) continue;
    added.push(record);
    existingIds.add(record.id);
    seedFps.add(fp);
  }
  return added;
}

async function generateL3(need, existingIds, excludeSlugs) {
  const outDir = path.join(ROOT, 'batches/generated');
  fs.mkdirSync(outDir, { recursive: true });
  const added = [];
  let attempts = 0;
  while (added.length < need && attempts < need * 6) {
    attempts++;
    let batch;
    try {
      batch = buildValidatedT3Part({ exclude: excludeSlugs, maxAttempts: 8 });
    } catch {
      continue;
    }
    if (batch._blueprintSlug) excludeSlugs.add(batch._blueprintSlug);
    const file = path.join(outDir, nextOutputBasename(3, 'auto'));
    fs.writeFileSync(file, `${JSON.stringify({ passages: batch.passages, questions: batch.questions }, null, 2)}\n`, 'utf8');
    const record = await gateBatch(
      { passages: batch.passages, questions: batch.questions },
      `L3 ${path.basename(file)}`,
      (b) => buildLesenT3SeedRecord(b, { lang: 'de', level: 'B1' }),
    );
    if (!record || existingIds.has(record.id)) continue;
    added.push(record);
    existingIds.add(record.id);
  }
  return added;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const before = seedData.records || seedData;
const existingIds = new Set(before.map((r) => r.id));

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('  FILL POOL DEFICIT — B1 (solo L2 + L3)');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'preview (add --apply)'}\n`);

const countsBefore = await countClean(before);
console.log('Stock clean antes:');
for (const k of ['lesen_2', 'lesen_3']) {
  const deficit = Math.max(0, TARGET_PER_CELL - countsBefore[k]);
  console.log(`  ${k.padEnd(10)} ${countsBefore[k]}  (necesita +${deficit}, generará hasta +${MARGIN[k]})`);
}

const needL2 = Math.max(0, TARGET_PER_CELL - countsBefore.lesen_2);
const needL3 = Math.max(0, TARGET_PER_CELL - countsBefore.lesen_3);
const targetL2 = needL2 ? Math.min(MARGIN.lesen_2, needL2 + 1) : 0;
const targetL3 = needL3 ? MARGIN.lesen_3 : 0;

const newRecords = [];

if (targetL2) {
  console.log(`\n── L2: buscando ${targetL2} batch(es) ──`);
  const l2 = await tryL2Batches(targetL2, existingIds, seedPassageFingerprints(before, 2));
  newRecords.push(...l2);
  console.log(`  Añadidas candidatas L2: ${l2.length}/${targetL2}`);
}

if (targetL3) {
  console.log(`\n── L3: generando hasta ${targetL3} parte(s) ──`);
  const excludeSlugs = new Set();
  const l3 = await generateL3(targetL3, existingIds, excludeSlugs);
  newRecords.push(...l3);
  console.log(`  Añadidas candidatas L3: ${l3.length}/${targetL3}`);
}

console.log('\n── Resumen ingestión ──');
for (const r of newRecords) console.log(`  + ${r.id}  (lesen T${r.teil})`);

if (!newRecords.length) {
  console.log('\nNada que añadir.\n');
  process.exit(0);
}

if (!apply && !dryRun) {
  console.log('\nRe-run con --apply para escribir al seed.\n');
  process.exit(0);
}

if (dryRun) {
  console.log('\n[DRY-RUN] No se escribió al seed.\n');
  process.exit(0);
}

const updated = { ...seedData, records: [...before, ...newRecords] };
fs.writeFileSync(SEED_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

const countsAfter = await countClean(updated.records);
console.log('\nStock clean después:');
for (const k of ['lesen_2', 'lesen_3']) {
  const ok = countsAfter[k] >= TARGET_PER_CELL ? '✅' : `⚠ falta ${TARGET_PER_CELL - countsAfter[k]}`;
  console.log(`  ${k.padEnd(10)} ${countsBefore[k]} → ${countsAfter[k]}  ${ok}`);
}
console.log(`\n✅ Seed: ${before.length} → ${updated.records.length} (+${newRecords.length})\n`);
