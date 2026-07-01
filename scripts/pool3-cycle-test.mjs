#!/usr/bin/env node
/**
 * pool3-cycle-test.mjs — POOL-3 cycle proof: batch → POOL-2 → SEM-1 → seed append.
 *
 * Runs 2 Schreiben batch files through the full gate chain and appends passing records
 * to library/reusable-seed/de_B1.json.  Schreiben was chosen because:
 *   - SEM-1 returns ok:true immediately (no MCQ → no LLM call needed).
 *   - Structural gate is well-understood (CHK-2 via short_answer rubric fields).
 *
 * Each batch contains T1 + T2 + T3 questions → 3 seed records per batch → 6 total.
 *
 * Usage:
 *   node scripts/pool3-cycle-test.mjs              # dry-run (no writes)
 *   node scripts/pool3-cycle-test.mjs --apply      # append to seed + report
 *   node scripts/pool3-cycle-test.mjs --batch1 batches/generated/schreiben-gemini-009.json \
 *                                     --batch2 batches/generated/schreiben-gemini-010.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { loadEnvFile } from './lib/loadEnv.mjs';
loadEnvFile();

import { isPartPoolReady } from './audit-pass-2.mjs';

// ─── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {
    batch1: null,
    batch2: null,
    apply: false,
    lang: 'de',
    level: 'B1',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--batch1') o.batch1 = argv[++i];
    else if (a === '--batch2') o.batch2 = argv[++i];
    else if (a === '--apply')  o.apply = true;
    else if (a === '--lang')   o.lang  = String(argv[++i]).toLowerCase();
    else if (a === '--level')  o.level = String(argv[++i]).toUpperCase();
  }
  return o;
}

const ARGS = parseArgs(process.argv.slice(2));

// Default: newest 2 schreiben batches in batches/generated/
function defaultBatches() {
  const dir = path.join(ROOT, 'batches', 'generated');
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('schreiben-') && f.endsWith('.json'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ f }) => path.join(dir, f));
  return files.slice(0, 2);
}

const [b1Path, b2Path] = [
  ARGS.batch1 ? (path.isAbsolute(ARGS.batch1) ? ARGS.batch1 : path.join(ROOT, ARGS.batch1)) : null,
  ARGS.batch2 ? (path.isAbsolute(ARGS.batch2) ? ARGS.batch2 : path.join(ROOT, ARGS.batch2)) : null,
].map((p, i) => {
  if (p) return p;
  const defs = defaultBatches();
  return defs[i] || null;
});

if (!b1Path || !b2Path) {
  console.error('Could not find 2 schreiben batches. Specify --batch1 and --batch2.');
  process.exit(1);
}

const SEED_FILE = path.join(ROOT, 'library', 'reusable-seed', `${ARGS.lang}_${ARGS.level}.json`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

const TASK_FORMAT = { 1: 'informal_email', 2: 'forum_post', 3: 'note' };
const MIN_WORDS   = { 1: 80, 2: 80, 3: 40 };

/**
 * Convert one question from a schreiben batch → seed record.
 * Mirrors the format of existing schreiben seed records.
 */
function batchQuestionToSeedRecord(q, lang, level) {
  const teil    = Number(q.teil);
  const task    = q.question || '';
  const hash    = shortHash(task);
  const topic   = (q.topicTags || ['daily_life'])[0];

  return {
    id         : `pool3-${lang}-${level}-schreiben-t${teil}-${hash}`,
    lang,
    level,
    module     : 'schreiben',
    teil,
    instruction: '',
    complete   : true,
    verified   : true,
    contributor: `pool3:${topic}`,
    task,
    minWords   : MIN_WORDS[teil] ?? 80,
    maxWords   : MIN_WORDS[teil] ?? 80,
    fieldId    : `write_bp_${teil}`,
    taskFormat : TASK_FORMAT[teil] ?? 'informal_email',
    passage    : { text: task, title: TASK_FORMAT[teil] ?? 'informal_email' },
    questions  : [{
      id           : q.id,
      module       : 'schreiben',
      teil,
      type         : 'short_answer',
      question     : task,
      correct      : 'rubric',
      correctAnswer: 'rubric',
    }],
    itemCount  : 1,
    targetCount: 1,
  };
}

// ─── POOL-2 gate per batch ────────────────────────────────────────────────────

async function runGateOnBatch(batchPath) {
  const rel  = path.relative(ROOT, batchPath);
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Batch: ${rel}`);
  console.log('─'.repeat(64));

  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  } catch (err) {
    console.error(`  ❌ JSON parse error: ${err.message}`);
    return { ok: false, batchPath, records: [] };
  }

  const questions = batch.questions || [];
  if (!questions.length) {
    console.error('  ❌ No questions found in batch.');
    return { ok: false, batchPath, records: [] };
  }

  console.log(`  Module: schreiben | Questions: ${questions.length} (T${[...new Set(questions.map((q) => q.teil))].sort().join(', T')})`);

  // ── POOL-2 structural + SEM-1 ─────────────────────────────────────────────
  console.log('\n  ── POOL-2 gate (isPartPoolReady, structural + SEM-1) ──');
  const gate = await isPartPoolReady(batch, { semantic: true });

  if (gate.blocking.length > 0) {
    const crit = gate.blocking.filter((f) => f.severity === 'CRITICAL').length;
    const imp  = gate.blocking.filter((f) => f.severity === 'IMPORTANT').length;
    const semIssues = gate.blocking.filter((f) => f.id?.startsWith('SEM-'));
    console.log(`  ❌ POOL-2 REJECTED: ${crit} CRITICAL / ${imp} IMPORTANT`);
    for (const f of gate.blocking) {
      console.log(`     [${f.id}] ${f.severity} — ${f.message}`);
    }
    if (semIssues.length) console.log(`  (${semIssues.length} of these are SEM-1 semantic issues)`);
    return { ok: false, batchPath, records: [] };
  }

  const semNote = '(SEM-1: ok — schreiben has no MCQ, skipped automatically)';
  console.log(`  ✅ POOL-2: 0 CRITICAL, 0 IMPORTANT  ${semNote}`);

  // ── Build seed records ─────────────────────────────────────────────────────
  const records = questions.map((q) => batchQuestionToSeedRecord(q, ARGS.lang, ARGS.level));
  console.log(`\n  Seed records produced: ${records.length}`);
  records.forEach((r) => console.log(`    ${r.id}  (T${r.teil}, ${r.contributor})`));

  return { ok: true, batchPath, records };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  POOL-3 CYCLE TEST — E2E: batch → POOL-2 → SEM-1 → seed    ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`Mode: ${ARGS.apply ? '⚡ --apply (writes to seed)' : '🔍 DRY-RUN (no writes)'}`);

// ── Before state ─────────────────────────────────────────────────────────────
const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const before   = seedData.records || [];

function countSchreiben(records) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const r of records) {
    if (r.module === 'schreiben') counts[r.teil] = (counts[r.teil] || 0) + 1;
  }
  return counts;
}

const beforeCounts = countSchreiben(before);
console.log(`\nSeed before: ${before.length} total records`);
console.log(`  schreiben T1: ${beforeCounts[1]}  T2: ${beforeCounts[2]}  T3: ${beforeCounts[3]}`);

// ── Run gate on both batches ──────────────────────────────────────────────────
const r1 = await runGateOnBatch(b1Path);
const r2 = await runGateOnBatch(b2Path);

const allNewRecords = [...r1.records, ...r2.records];
const passed        = (r1.ok ? 1 : 0) + (r2.ok ? 1 : 0);

console.log(`\n${'═'.repeat(64)}`);
console.log('POOL-2 + SEM-1 RESULTS');
console.log('═'.repeat(64));
console.log(`  Batches:   2`);
console.log(`  Passed:    ${passed}  (${allNewRecords.length} seed records to add)`);
console.log(`  Rejected:  ${2 - passed}`);

if (allNewRecords.length === 0) {
  console.log('\nNothing to ingest. Exiting.');
  process.exit(passed === 2 ? 0 : 1);
}

// ── Dedup check ───────────────────────────────────────────────────────────────
const existingIds = new Set(before.map((r) => r.id));
const dupes       = allNewRecords.filter((r) => existingIds.has(r.id));
const fresh       = allNewRecords.filter((r) => !existingIds.has(r.id));

if (dupes.length) {
  console.log(`\n  ⚠  ${dupes.length} duplicate(s) (already in seed, skipped):`);
  dupes.forEach((r) => console.log(`    ${r.id}`));
}
console.log(`  Fresh new records: ${fresh.length}`);

if (!ARGS.apply) {
  console.log('\n[DRY-RUN] Would append these records to seed:');
  fresh.forEach((r) => console.log(`  + ${r.id}  (schreiben T${r.teil})`));
  console.log(`\nRe-run with --apply to write to seed.`);
  process.exit(0);
}

// ── Apply: append to seed ─────────────────────────────────────────────────────
const updated = { ...seedData, records: [...before, ...fresh] };
fs.writeFileSync(SEED_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

const afterCounts  = countSchreiben(updated.records);
const totalAfter   = updated.records.length;

console.log(`\n✅ Seed written: ${totalAfter} records (was ${before.length}, added ${fresh.length})`);
console.log(`  schreiben T1: ${beforeCounts[1]} → ${afterCounts[1]}`);
console.log(`  schreiben T2: ${beforeCounts[2]} → ${afterCounts[2]}`);
console.log(`  schreiben T3: ${beforeCounts[3]} → ${afterCounts[3]}`);

// ── Pool health spot-check (inline, no subprocess) ───────────────────────────
console.log('\n─── Pool-health spot check (schreiben) ───');
const { auditExam } = await import('./audit-pass-2.mjs');

const MODULE_PARTS_KEY = {
  schreiben: 'schreibenParts',
};

function quickAudit(record) {
  const teil  = Number(record.teil);
  const part  = {
    teil,
    task    : record.task || '',
    questions: (record.questions || []),
  };
  const wrapper = { exam: { schreibenParts: [part] } };
  const audit   = auditExam(wrapper, record.id);
  const findings = audit.findings.filter(
    (f) => f.severity !== 'INFO' && !(f.id === 'CHK-3' && String(f.message).includes('Teil ausente')),
  );
  return findings.filter((f) => f.severity === 'IMPORTANT').length === 0;
}

const schreibenRecords = updated.records.filter((r) => r.module === 'schreiben');
const cleanByTeil      = {};
for (const r of schreibenRecords) {
  const isClean = quickAudit(r);
  cleanByTeil[r.teil] = (cleanByTeil[r.teil] || { clean: 0, total: 0 });
  cleanByTeil[r.teil].total++;
  if (isClean) cleanByTeil[r.teil].clean++;
}

console.log('  module     teil   total  clean  dirty');
for (const [teil, s] of Object.entries(cleanByTeil).sort()) {
  const dirty = s.total - s.clean;
  const ok    = dirty === 0 ? '✅' : '⚠ ';
  console.log(`  schreiben  T${teil}     ${String(s.total).padStart(3)}    ${String(s.clean).padStart(3)}    ${String(dirty).padStart(3)}  ${ok}`);
}

const newClean = fresh.filter((r) => quickAudit(r)).length;
console.log(`\n  New records added: ${fresh.length}  |  Pass audit: ${newClean}  |  Fail: ${fresh.length - newClean}`);

if (fresh.length === newClean) {
  console.log('\n✅ POOL-3 cycle complete:');
  console.log('   generate → POOL-2 (structural) → SEM-1 (semantic, ok) → seed → pool-health counts them clean');
} else {
  console.log('\n⚠  Some new records failed the audit — check above.');
}
