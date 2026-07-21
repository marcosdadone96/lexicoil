#!/usr/bin/env node
/**
 * reingest-l3-pool3.mjs — Replace 3 broken pool3 L3 records using buildLesenT3SeedRecord.
 *
 * Usage: node scripts/reingest-l3-pool3.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLesenT3SeedRecord } from './lib/buildLesenT3SeedRecord.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

const PAIRS = [
  {
    id: 'pool3-de-B1-lesen-t3-7217186ecff6',
    batch: 'batches/generated/lesen-t3-auto-009.json',
    label: 'E4',
  },
  {
    id: 'pool3-de-B1-lesen-t3-d3b8edd00953',
    batch: 'batches/generated/lesen-t3-auto-011.json',
    label: 'E5',
  },
  {
    id: 'pool3-de-B1-lesen-t3-fa88b9a0d707',
    batch: 'batches/generated/lesen-t3-auto-0krnpo.json',
    label: 'E3',
  },
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function snapshotCorrects(rec) {
  return (rec.questions || []).map((q) => ({
    id: q.id,
    correct: String(q.correct ?? q.correctAnswer ?? '').toUpperCase(),
  }));
}

function mergePreserved(oldRec, newRec) {
  const out = { ...newRec };
  if (oldRec._blobKey) out._blobKey = oldRec._blobKey;
  if (oldRec.createdAt) out.createdAt = oldRec.createdAt;
  if (oldRec.contributor && !String(oldRec.contributor).startsWith('pool3:daily_life')) {
    out.contributor = oldRec.contributor;
  }
  const oldById = Object.fromEntries((oldRec.questions || []).map((q) => [q.id, q]));
  out.questions = (newRec.questions || []).map((q) => {
    const prev = oldById[q.id] || {};
    return {
      ...q,
      ...(prev.module ? { module: prev.module } : {}),
      ...(prev.teil != null ? { teil: prev.teil } : {}),
    };
  });
  if (oldRec.passage?.transcript !== undefined && out.passage) {
    out.passage = { ...out.passage, transcript: oldRec.passage.transcript || '' };
  }
  return out;
}

function verifyRecord(rec, beforeCorrects) {
  const ads = rec.passage?.ads || rec.ads || [];
  const qs = rec.questions || [];
  const adsReal = ads.filter((a) => String(a.text || a.title || '').length > 10);
  const afterCorrects = snapshotCorrects(rec);
  const keysOk =
    beforeCorrects.length === afterCorrects.length &&
    beforeCorrects.every(
      (b, i) => b.id === afterCorrects[i].id && b.correct === afterCorrects[i].correct,
    );
  const optsOk = qs.every(
    (q) =>
      q.type === 'matching' &&
      Array.isArray(q.options) &&
      q.options.length === 11 &&
      q.options.slice(0, 10).every((o, i) => o.key === 'ABCDEFGHIJ'[i]),
  );
  return {
    adsCount: ads.length,
    adsReal: adsReal.length,
    qCount: qs.length,
    keysOk,
    optsOk,
    afterCorrects,
  };
}

// ── 1. Backup ───────────────────────────────────────────────────────────────
const seedRaw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const records = seedRaw.records || seedRaw;
const backupPath = path.join(ROOT, 'backups', `pre-l3-reingest-${stamp()}.json`);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.writeFileSync(backupPath, `${JSON.stringify(seedRaw, null, 2)}\n`, 'utf8');
console.log(`✅ Backup: ${path.relative(ROOT, backupPath)}`);

// ── 2. Replace ──────────────────────────────────────────────────────────────
const beforeById = {};
for (const { id } of PAIRS) {
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) {
    console.error(`FATAL: record not found: ${id}`);
    process.exit(1);
  }
  beforeById[id] = snapshotCorrects(records[idx]);
}

let replaced = 0;
for (const { id, batch, label } of PAIRS) {
  const batchPath = path.join(ROOT, batch);
  const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const built = buildLesenT3SeedRecord(batchData);
  if (built.id !== id) {
    console.error(`FATAL: ${label} batch ${batch} → ${built.id}, expected ${id}`);
    process.exit(1);
  }
  const idx = records.findIndex((r) => r.id === id);
  records[idx] = mergePreserved(records[idx], built);
  replaced++;
  console.log(`✅ Replaced ${label}: ${id} ← ${path.basename(batch)}`);
}

const updated = Array.isArray(seedRaw) ? records : { ...seedRaw, records };
fs.writeFileSync(SEED_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
console.log(`✅ Seed written (${replaced} records replaced)\n`);

// ── 3. Verify ───────────────────────────────────────────────────────────────
let allOk = true;
for (const { id, label } of PAIRS) {
  const rec = records.find((r) => r.id === id);
  const v = verifyRecord(rec, beforeById[id]);
  const gate = await isPartPoolReady(rec, { semantic: false });
  const ok =
    v.adsCount === 10 &&
    v.adsReal === 10 &&
    v.qCount === 7 &&
    v.keysOk &&
    v.optsOk &&
    gate.ok;
  if (!ok) allOk = false;
  console.log(`── ${label} ${id.slice(-12)} ──`);
  console.log(`  passage.ads: ${v.adsCount} (${v.adsReal} con texto real)`);
  console.log(`  questions: ${v.qCount} matching, options A–J+K/0: ${v.optsOk ? 'OK' : 'FAIL'}`);
  console.log(`  claves correct sin cambio: ${v.keysOk ? 'OK' : 'FAIL'}`);
  if (!v.keysOk) {
    console.log('    antes:', beforeById[id].map((x) => x.correct).join(','));
    console.log('    después:', v.afterCorrects.map((x) => x.correct).join(','));
  }
  console.log(`  POOL-2 isPartPoolReady: ${gate.ok ? 'ok:true' : 'FAIL'} (${gate.blocking.length} blocking)`);
  if (!gate.ok) {
    gate.blocking.slice(0, 3).forEach((f) => console.log(`    [${f.id}] ${f.message?.slice(0, 80)}`));
  }
  console.log('');
}

// ── 4. Spot-check E4 Q5 (correct A = TechDeal24 laptop shop) ────────────────
const e4 = records.find((r) => r.id === PAIRS[0].id);
const q5 = e4.questions.find((q) => q.id === 'gen-q-3-d8divf-5');
const adA = (e4.passage.ads || []).find((a) => a.key === 'A');
console.log('── Spot-check E4 pregunta 5 (correct=A, laptop hoy en tienda) ──');
console.log(`  Pregunta: ${q5.question.slice(0, 70)}…`);
console.log(`  correct: ${q5.correct}`);
console.log(`  Anuncio A: ${adA.title} — ${adA.text.slice(0, 80)}…`);
console.log(
  `  Coherencia: ${/TechDeal24|Shop sofort|Laptops/i.test(`${adA.title} ${adA.text}`) && q5.correct === 'A' ? 'OK — A es tienda con abholung inmediata' : 'REVISAR'}`,
);
console.log('');
console.log('── Spot-check E4 pregunta 1 (correct=I, router/drucker a domicilio) ──');
const q1 = e4.questions.find((q) => q.id === 'gen-q-3-d8divf-1');
const adI = (e4.passage.ads || []).find((a) => a.key === 'I');
console.log(`  Pregunta: ${q1.question.slice(0, 70)}…`);
console.log(`  correct: ${q1.correct}`);
console.log(`  Anuncio I: ${adI.title} — ${adI.text.slice(0, 80)}…`);
console.log(
  `  Coherencia: ${/PC-Hilfe|Router|Drucker|Hausbesuch/i.test(`${adI.title} ${adI.text}`) && q1.correct === 'I' ? 'OK — I encaja con situación 1' : 'REVISAR'}`,
);

if (!allOk) process.exit(1);
console.log('\n✅ Re-ingest L3 pool3 completado y verificado.');
