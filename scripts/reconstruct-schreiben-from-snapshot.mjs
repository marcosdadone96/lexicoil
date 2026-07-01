#!/usr/bin/env node
/**
 * reconstruct-schreiben-from-snapshot.mjs
 *
 * Lee el snapshot B1 más reciente (2026-06-22), extrae todos los schreibenParts,
 * los convierte al formato de seed record, los pasa por isPartPoolReady (0/0),
 * e ingesta los limpios en library/reusable-seed/de_B1.json.
 *
 * Usage:
 *   node scripts/reconstruct-schreiben-from-snapshot.mjs           # dry-run
 *   node scripts/reconstruct-schreiben-from-snapshot.mjs --apply   # escribe
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isPartPoolReady } from './audit-pass-2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const SNAPSHOT_DIR = path.join(ROOT, '_archive', 'data-exams-_snapshots');
const SEED_PATH = path.join(ROOT, 'library', 'reusable-seed', 'de_B1.json');
const LANG = 'de';
const LEVEL = 'B1';

// ─── Snapshot selection ───────────────────────────────────────────────────────
function pickMostRecentSnapshot() {
  const files = fs
    .readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.startsWith('de_B1.') && f.endsWith('.json'))
    .sort(); // ISO timestamps sort lexicographically
  if (!files.length) throw new Error('No B1 snapshots found in ' + SNAPSHOT_DIR);
  return path.join(SNAPSHOT_DIR, files[files.length - 1]);
}

// ─── Seed record builder (mirrors seed-reusable-from-curated.mjs logic) ──────
function contentHash(teil, task, minWords) {
  const h = crypto.createHash('sha256');
  h.update(`schreiben:${teil}:${task}:${minWords}`);
  return h.digest('hex').slice(0, 16);
}

function buildSchreibenRecord(part, examIdx, topic) {
  const teilN = Number(part.teil ?? part.aufgabe);
  if (!teilN) return null;
  const task = String(part.task || part.instruction || '').trim();
  if (!task) return null;

  const minWords = Number(part.minWords ?? part.targetWords) || (teilN === 3 ? 40 : 80);
  const maxWords = Number(part.maxWords) || minWords;
  const hash = contentHash(teilN, task, minWords);
  const id = `snap-${LANG}-${LEVEL}-e${String(examIdx).padStart(2, '0')}-schreiben-t${teilN}-${hash}`;

  return {
    id,
    lang: LANG,
    level: LEVEL,
    module: 'schreiben',
    teil: teilN,
    instruction: String(part.instruction || '').trim(),
    complete: true,
    verified: true,
    contributor: `snapshot:${topic || 'unknown'}`,
    task,
    minWords,
    maxWords,
    fieldId: part.fieldId || `write_bp_${teilN}`,
    taskFormat: part.taskType || part.taskFormat || null,
    passage: { text: task, title: part.taskType || `Schreiben Teil ${teilN}` },
    // CHK-2 expects correct='rubric'/correctAnswer='rubric' for short_answer.
    // CHK-8 expects module, teil, type, question, correct, correctAnswer on every question.
    questions: [{
      id: `${LANG}-schreiben-t${teilN}-${hash}`,
      module: 'schreiben',
      teil: teilN,
      type: 'short_answer',
      question: task,
      correct: 'rubric',
      correctAnswer: 'rubric',
    }],
    itemCount: 1,
    targetCount: 1,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const snapshotPath = pickMostRecentSnapshot();
console.log(`\nSnapshot: ${path.relative(ROOT, snapshotPath)}`);

const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const exams = Array.isArray(raw) ? raw : (raw.exams || [raw]);
console.log(`Exams found: ${exams.length}`);

// Extract + convert all schreiben parts
const candidates = [];
exams.forEach((exam, examIdx) => {
  const topic = exam.topic || `exam-${examIdx}`;
  for (const part of exam.schreibenParts || []) {
    const rec = buildSchreibenRecord(part, examIdx, topic);
    if (rec) candidates.push({ rec, topic, examIdx });
    else console.warn(`  SKIP exam ${examIdx} T${part.teil ?? part.aufgabe}: empty task`);
  }
});
console.log(`\nConverted to seed records: ${candidates.length}`);
console.log(`  T1: ${candidates.filter((c) => c.rec.teil === 1).length}`);
console.log(`  T2: ${candidates.filter((c) => c.rec.teil === 2).length}`);
console.log(`  T3: ${candidates.filter((c) => c.rec.teil === 3).length}`);

// Audit each via isPartPoolReady
console.log('\n=== Auditing via isPartPoolReady ===');
const clean = [];
const dirty = [];

for (const { rec, topic, examIdx } of candidates) {
  const label = `exam${examIdx}(${topic}) T${rec.teil}`;
  const result = isPartPoolReady(rec);
  if (result.ok) {
    clean.push(rec);
    if (VERBOSE) console.log(`  ✓  ${label} → OK`);
  } else {
    dirty.push({ rec, label, findings: result.blocking });
    const ids = [...new Set(result.blocking.map((f) => f.id))].join(', ');
    console.warn(`  ✗  ${label} → BLOCKED [${ids}]`);
    if (VERBOSE) {
      result.blocking.forEach((f) => console.warn(`      [${f.severity}][${f.id}] ${f.message}`));
    }
  }
}

console.log('\n=== Results ===');
console.log(`  Clean (ready to ingest): ${clean.length}`);
console.log(`    T1: ${clean.filter((r) => r.teil === 1).length}`);
console.log(`    T2: ${clean.filter((r) => r.teil === 2).length}`);
console.log(`    T3: ${clean.filter((r) => r.teil === 3).length}`);
console.log(`  Rejected (dirty):        ${dirty.length}`);
if (dirty.length) {
  const byCheck = {};
  for (const { findings } of dirty) {
    for (const f of findings) {
      byCheck[f.id] = (byCheck[f.id] || 0) + 1;
    }
  }
  console.log('  Rejection reasons:', byCheck);
  console.log('\n  To regenerate (rejected records):');
  dirty.forEach(({ label, findings }) => {
    const ids = [...new Set(findings.map((f) => f.id))].join(', ');
    console.log(`    - ${label}: ${ids}`);
  });
}

if (!APPLY) {
  console.log('\n[DRY-RUN] Re-ejecuta con --apply para ingestar los limpios en de_B1.json.');
  process.exit(0);
}

// ─── Ingest clean records into seed ──────────────────────────────────────────
const seedData = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const existing = Array.isArray(seedData.records) ? seedData.records : [];

// Dedup by id
const existingIds = new Set(existing.map((r) => r.id));
// Also dedup by content hash to avoid schreiben task duplicates from different exams
const existingTaskHashes = new Set(
  existing
    .filter((r) => r.module === 'schreiben')
    .map((r) => crypto.createHash('sha256').update(String(r.task || '')).digest('hex').slice(0, 16)),
);

let added = 0;
let skippedDup = 0;
for (const rec of clean) {
  if (existingIds.has(rec.id)) { skippedDup++; continue; }
  const taskHash = crypto.createHash('sha256').update(String(rec.task || '')).digest('hex').slice(0, 16);
  if (existingTaskHashes.has(taskHash)) { skippedDup++; continue; }
  existing.push(rec);
  existingIds.add(rec.id);
  existingTaskHashes.add(taskHash);
  added++;
}

seedData.records = existing;
fs.writeFileSync(SEED_PATH, `${JSON.stringify(seedData, null, 2)}\n`, 'utf8');

console.log(`\n[APPLY] Wrote ${path.relative(ROOT, SEED_PATH)}`);
console.log(`  Added: ${added} new Schreiben records`);
console.log(`  Skipped (duplicates): ${skippedDup}`);
console.log(`  Total records in seed: ${existing.length}`);
console.log(`  Schreiben in seed: ${existing.filter((r) => r.module === 'schreiben').length}`);
