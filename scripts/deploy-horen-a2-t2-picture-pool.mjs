#!/usr/bin/env node
/**
 * Deploy Hören A2 T2 picture_matching pool from verified generated batches.
 * Purges legacy MCQ-style horen T2 bank entries, merges 4 topic passages, syncs mirror.
 *
 * Usage:
 *   node scripts/deploy-horen-a2-t2-picture-pool.mjs [--dry-run]
 *   node scripts/deploy-horen-a2-t2-picture-pool.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
const HPM = require(path.join(ROOT, 'js/engine/horenPictureMatching.js'));

const apply = process.argv.includes('--apply');
const dryRun = !apply;

const SOURCE_BATCHES = {
  '040': path.join(ROOT, 'batches/generated/horen-t2-gemini-040.json'),
  '041': path.join(ROOT, 'batches/generated/horen-t2-gemini-041.json'),
};

/** 4 exam topics × 2 verified batches (cloned with unique passage ids). */
const DEPLOY_PLAN = [
  { examTopic: 'health', source: '040', passageId: 'de-a2-p-horen-t2-health-pic01', topicTag: 'Gesundheit' },
  { examTopic: 'work', source: '041', passageId: 'de-a2-p-horen-t2-work-pic01', topicTag: 'Arbeit' },
  { examTopic: 'society', source: '040', passageId: 'de-a2-p-horen-t2-society-pic01', topicTag: 'Gesellschaft' },
  { examTopic: 'education', source: '041', passageId: 'de-a2-p-horen-t2-education-pic01', topicTag: 'Bildung' },
];

const WEEKDAY_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cloneBatchForTopic(raw, { passageId, topicTag, examTopic }) {
  const srcPassage = raw.passages?.[0];
  if (!srcPassage) throw new Error('batch sin passage');
  const passage = JSON.parse(JSON.stringify(srcPassage));
  passage.id = passageId;
  passage.topicTag = topicTag;
  passage.examTopic = examTopic;

  const questions = (raw.questions || []).map((q, i) => {
    const out = JSON.parse(JSON.stringify(q));
    const day = WEEKDAY_ORDER[i] || out.question;
    out.id = `${passageId}-q${i + 1}`;
    out.passageId = passageId;
    out.question = day;
    out.topicTags = [topicTag];
    return out;
  });

  return { passages: [passage], questions };
}

function validateDeployedBatch(batch) {
  const normalized = normalizeBatch(batch, { module: 'horen', teil: 2, lang: 'de', level: 'A2' });
  const quality = checkHorenBatchQuality(normalized, 2, { level: 'A2' });
  if (!quality.ok) throw new Error(`quality: ${quality.issues.join('; ')}`);
  const struct = HPM.validatePictureMatchingBatch(normalized, { module: 'horen', teil: 2, level: 'A2' });
  if (struct.length) throw new Error(`structure: ${struct.join('; ')}`);
  return normalized;
}

function purgeHorenT2(bank) {
  const dropPassageIds = new Set(
    (bank.passages || [])
      .filter((p) => p.module === 'horen' && Number(p.teil) === 2)
      .map((p) => p.id),
  );
  const passages = (bank.passages || []).filter((p) => !dropPassageIds.has(p.id));
  const questions = (bank.questions || []).filter(
    (q) => !(q.module === 'horen' && Number(q.teil) === 2),
  );
  return { passages, questions, removedPassages: dropPassageIds.size, removedQuestions: (bank.questions || []).length - questions.length };
}

function syncPassagesMirror(lang, level) {
  const { execSync } = require('node:child_process');
  execSync(`node scripts/sync-passages-mirror.mjs --lang ${lang} --level ${level}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function main() {
  const sources = {};
  for (const [key, file] of Object.entries(SOURCE_BATCHES)) {
    if (!fs.existsSync(file)) throw new Error(`Missing source batch: ${file}`);
    sources[key] = loadJson(file);
  }

  const deployed = [];
  for (const plan of DEPLOY_PLAN) {
    const raw = cloneBatchForTopic(sources[plan.source], plan);
    const normalized = validateDeployedBatch(raw);
    deployed.push({ plan, batch: normalized });
    console.log(`✓ ${plan.examTopic} ← ${plan.source} → ${plan.passageId} (9 pictures, 5 matching)`);
  }

  const bank = loadJson(BANK_PATH);
  const purged = purgeHorenT2(bank);
  console.log(`\nPurge horen T2: −${purged.removedPassages} passages, −${purged.removedQuestions} questions`);

  const next = {
    ...bank,
    passages: [...purged.passages],
    questions: [...purged.questions],
  };
  for (const { batch } of deployed) {
    next.passages.push(...batch.passages);
    next.questions.push(...batch.questions);
  }
  if (next.meta) next.meta.version = (next.meta.version || 1) + 1;

  const h2Passages = next.passages.filter((p) => p.module === 'horen' && Number(p.teil) === 2);
  const h2Questions = next.questions.filter((q) => q.module === 'horen' && Number(q.teil) === 2);
  console.log(`\nBank after deploy: horen T2 = ${h2Passages.length} passages, ${h2Questions.length} questions`);
  console.log(`  picture_matching passages: ${h2Passages.filter((p) => p.pictures?.length >= 9).length}/${h2Passages.length}`);

  if (dryRun) {
    console.log('\n[dry-run] No writes. Re-run with --apply to deploy.');
    return;
  }

  const backup = BANK_PATH.replace('.json', `.backup-horen-t2-pic-${Date.now()}.json`);
  fs.copyFileSync(BANK_PATH, backup);
  fs.writeFileSync(BANK_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, BANK_PATH)}`);
  console.log(`Backup: ${path.relative(ROOT, backup)}`);

  syncPassagesMirror('de', 'A2');
  console.log('\nNext: node scripts/repair-de-a2-exams.mjs --apply');
}

main();
