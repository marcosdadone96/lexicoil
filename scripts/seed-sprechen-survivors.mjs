#!/usr/bin/env node
/**
 * Seed Sprechen survivors → library/reusable-seed/de_B1.json
 *
 * Reads F1a survivor list, runs POOL-2 per batch, appends per-Teil records.
 *
 *   node scripts/seed-sprechen-survivors.mjs           # dry-run
 *   node scripts/seed-sprechen-survivors.mjs --apply   # write seed
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

loadEnvFile();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
/** F1: pass --critical-only to soft-allow IMPORTANT (CHK-14/CHK-6 Sprechen FPs). CRITICAL still blocks. */
const CRITICAL_ONLY = process.argv.includes('--critical-only');
const LANG = 'de';
const LEVEL = 'B1';
const SEED_FILE = path.join(ROOT, 'library', 'reusable-seed', `${LANG}_${LEVEL}.json`);

/** F1a survivors — see batches/ready/SPRECHEN-F1A-DECISIONS-2026-07-10.md */
const SURVIVORS = [
  'batches/merged/sprechen-ehrenamt-thema-02.json',
  'batches/merged/sprechen-ehrenamt-thema-03.json',
  'batches/merged/sprechen-gesund-leben-02.json',
  'batches/merged/sprechen-onlineshopping-01.json',
  'batches/merged/sprechen-onlineshopping-02.json',
  'batches/merged/sprechen-onlineshopping-03.json',
  'batches/merged/sprechen-onlineshopping-04.json',
  'batches/merged/sprechen-reise-vorbereitung-01.json',
  'batches/merged/sprechen-reise-vorbereitung-03.json',
  'batches/merged/sprechen-sport-praesentation-01.json',
  'batches/merged/sprechen-sport-praesentation-03.json',
  'batches/merged/sprechen-sport-praesentation-04.json',
  'batches/merged/sprechen-sport-praesentation-05.json',
  'batches/merged/sprechen-stadtfest-planung-01.json',
  'batches/generated/sprechen-gemini-002.json',
  'batches/generated/sprechen-gemini-004.json',
  'batches/generated/sprechen-gemini-005.json',
  'batches/generated/sprechen-gemini-006.json',
  'batches/generated/sprechen-gemini-007.json',
  'batches/generated/sprechen-gemini-008.json',
];

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function batchQuestionToSeedRecord(q) {
  const teil = Number(q.teil);
  const task = String(q.question || '').trim();
  const hash = shortHash(task);
  const topic = (q.topicTags || ['daily_life'])[0];
  const type = q.type || (teil === 1 ? 'planungsaufgabe' : teil === 2 ? 'praesentation' : 'feedback_diskussion');

  return {
    id: `sp-f1-${LANG}-${LEVEL}-sprechen-t${teil}-${hash}`,
    lang: LANG,
    level: LEVEL,
    module: 'sprechen',
    teil,
    instruction: '',
    complete: true,
    verified: true,
    contributor: `sprechen-f1a:${topic}`,
    task,
    fieldId: `speak_bp_${teil}`,
    taskFormat: type,
    passage: { text: task, title: type },
    questions: [
      {
        id: q.id || `sp-t${teil}-${hash}`,
        module: 'sprechen',
        teil,
        type,
        question: task,
        correct: 'rubric',
        correctAnswer: 'rubric',
        topicTags: Array.isArray(q.topicTags) ? q.topicTags : [topic],
        grammarTags: Array.isArray(q.grammarTags) ? q.grammarTags : [],
        difficulty: q.difficulty ?? 5,
        skills: ['speaking'],
      },
    ],
    itemCount: 1,
    targetCount: 1,
    topicTags: Array.isArray(q.topicTags) ? q.topicTags : [topic],
  };
}

async function runGateOnBatch(rel) {
  const batchPath = path.join(ROOT, rel);
  console.log(`\n── ${rel}`);
  if (!fs.existsSync(batchPath)) {
    console.log('  ❌ missing file');
    return { ok: false, records: [] };
  }
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  } catch (err) {
    console.log(`  ❌ parse: ${err.message}`);
    return { ok: false, records: [] };
  }
  const questions = (batch.questions || []).filter((q) => String(q.module || '').toLowerCase() === 'sprechen');
  if (questions.length < 3) {
    console.log(`  ❌ expected 3 sprechen questions, got ${questions.length}`);
    return { ok: false, records: [] };
  }
  const gate = await isPartPoolReady(batch, { semantic: true });
  const blocking = CRITICAL_ONLY
    ? gate.blocking.filter((f) => f.severity === 'CRITICAL')
    : gate.blocking;
  const soft = CRITICAL_ONLY
    ? gate.blocking.filter((f) => f.severity !== 'CRITICAL')
    : [];
  if (blocking.length > 0) {
    console.log(`  ❌ POOL-2 REJECTED (${blocking.length} CRITICAL)`);
    for (const f of blocking.slice(0, 8)) {
      console.log(`     [${f.id}] ${f.severity} — ${f.message}`);
    }
    return { ok: false, records: [] };
  }
  if (soft.length) {
    console.log(`  ⚠ ${soft.length} IMPORTANT/MINOR soft-allowed (--critical-only)`);
    for (const f of soft.slice(0, 4)) {
      console.log(`     [${f.id}] ${f.severity} — ${f.message.slice(0, 100)}`);
    }
  }
  const records = questions.map((q) => batchQuestionToSeedRecord(q));
  console.log(`  ✅ POOL-2 OK → ${records.length} seed records`);
  return { ok: true, records };
}

const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const before = seedData.records || [];
const beforeSp = before.filter((r) => r.module === 'sprechen').length;
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Seed before: ${before.length} total, sprechen: ${beforeSp}`);

const allNew = [];
let passed = 0;
let rejected = 0;
for (const rel of SURVIVORS) {
  const r = await runGateOnBatch(rel);
  if (r.ok) {
    passed++;
    allNew.push(...r.records);
  } else rejected++;
}

const existingIds = new Set(before.map((r) => r.id));
const fresh = allNew.filter((r) => !existingIds.has(r.id));
const dupes = allNew.length - fresh.length;

console.log(`\n══ RESULTS ══`);
console.log(`  Batches passed: ${passed} / ${SURVIVORS.length} (rejected ${rejected})`);
console.log(`  Seed records: ${allNew.length} (${fresh.length} fresh, ${dupes} dupes)`);

if (!APPLY) {
  console.log('\n[DRY-RUN] Would append:');
  const byTeil = { 1: 0, 2: 0, 3: 0 };
  for (const r of fresh) byTeil[r.teil] = (byTeil[r.teil] || 0) + 1;
  console.log(`  sprechen T1:${byTeil[1]} T2:${byTeil[2]} T3:${byTeil[3]}`);
  console.log('Re-run with --apply to write.');
  process.exit(rejected ? 1 : 0);
}

const updated = { ...seedData, records: [...before, ...fresh], _updatedAt: new Date().toISOString() };
fs.writeFileSync(SEED_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
const afterSp = updated.records.filter((r) => r.module === 'sprechen').length;
console.log(`\n✅ Wrote seed: ${updated.records.length} total, sprechen ${beforeSp} → ${afterSp} (+${fresh.length})`);
process.exit(rejected ? 1 : 0);
