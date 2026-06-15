#!/usr/bin/env node
/**
 * Sprint 2 — generate library candidates into staging (human review before promote).
 *
 * Usage:
 *   node scripts/generate-candidates.mjs --lang de --level B1 --source exam-import
 *   node scripts/generate-candidates.mjs --lang de --level B1 --source exam-import --exam data/exams/de_B1.json --max 5
 *   node scripts/generate-candidates.mjs --lang de --level B1 --source composite --count 3
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { saveCandidate, loadIndex, stagingRoot } from './pipeline/lib/stagingStore.mjs';
import { examToCandidates } from './pipeline/lib/candidateBuilder.mjs';
import { validateCandidate, resolveBlueprint } from './pipeline/lib/validateCandidate.mjs';
import { buildCompositeB1Exam } from './pipeline/lib/sampleB1.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    source: 'exam-import',
    examFile: path.join(ROOT, 'data/exams/de_B1.json'),
    count: 1,
    maxParts: 99,
    module: null,
    teil: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--exam') out.examFile = argv[++i];
    else if (a === '--count') out.count = parseInt(argv[++i], 10);
    else if (a === '--max') out.maxParts = parseInt(argv[++i], 10);
    else if (a === '--module') out.module = argv[++i];
    else if (a === '--teil') out.teil = parseInt(argv[++i], 10);
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function loadBank(lang, level) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(file)) throw new Error(`Missing bank: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fingerprint(candidate) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        module: candidate.module,
        teil: candidate.teil,
        passage: candidate.passage?.text?.slice(0, 120),
        q: (candidate.questions || []).map((q) => q.question).join('|'),
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

function isDuplicate(candidate, seen) {
  const fp = fingerprint(candidate);
  if (seen.has(fp)) return true;
  seen.add(fp);
  const index = loadIndex(candidate.lang, candidate.level);
  for (const row of index.candidates || []) {
    if (row.module === candidate.module && row.teil === candidate.teil && row.status !== 'rejected') {
      /* allow multiple bundles per teil with different content */
    }
  }
  return false;
}

function filterCandidates(candidates, args) {
  return candidates.filter((c) => {
    if (args.module && c.module !== args.module) return false;
    if (args.teil != null && c.teil !== args.teil) return false;
    return true;
  });
}

function writeCandidate(candidate, blueprint, args, stats) {
  candidate.validation = validateCandidate(candidate, blueprint);
  if (isDuplicate(candidate, stats.seen)) {
    stats.skippedDup++;
    console.log(`SKIP  dup ${candidate.module} teil ${candidate.teil}`);
    return;
  }
  if (!candidate.validation.valid) {
    stats.rejected++;
    console.log(
      `REJECT ${candidate.module} teil ${candidate.teil}: ${candidate.validation.errors.slice(0, 2).join('; ')}`,
    );
    if (args.dryRun) return;
  }
  if (args.dryRun) {
    stats.staged++;
    console.log(`DRY-OK ${candidate.module} teil ${candidate.teil} (${candidate.questions.length} q)`);
    return;
  }
  saveCandidate(candidate);
  stats.staged++;
  console.log(
    `${candidate.validation.valid ? 'STAGE' : 'STAGE*'} ${candidate.id} — ${candidate.module} teil ${candidate.teil} (${candidate.questions.length} q)`,
  );
}

const args = parseArgs(process.argv.slice(2));
const batchId = `batch-${Date.now()}`;
const blueprint = resolveBlueprint(args.lang, args.level);
if (!blueprint) {
  console.error(`No blueprint for ${args.lang}/${args.level}`);
  process.exit(1);
}

fs.mkdirSync(stagingRoot(args.lang, args.level), { recursive: true });

const stats = { staged: 0, rejected: 0, skippedDup: 0, seen: new Set() };

if (args.source === 'exam-import') {
  const raw = JSON.parse(fs.readFileSync(path.resolve(args.examFile), 'utf8'));
  const exams = Array.isArray(raw) ? raw : [raw];
  let partsWritten = 0;
  for (const src of exams.slice(0, args.count)) {
    const exam = { ...src, lang: args.lang, level: args.level, goetheFormat: true };
    let candidates = examToCandidates(exam, {
      lang: args.lang,
      level: args.level,
      blueprint,
      batchId,
      source: `generate-candidates/exam-import:${path.basename(args.examFile)}`,
    });
    candidates = filterCandidates(candidates, args);
    for (const c of candidates) {
      if (partsWritten >= args.maxParts) break;
      writeCandidate(c, blueprint, args, stats);
      partsWritten++;
    }
  }
} else if (args.source === 'composite' && args.lang === 'de' && args.level === 'B1') {
  const bank = loadBank(args.lang, args.level);
  ExamBlueprint.cacheBlueprint(args.lang, args.level, blueprint);
  for (let i = 1; i <= args.count; i++) {
    const { exam } = buildCompositeB1Exam({ ExamBlueprint, ExamBuilder, bank, blueprint, attempt: i * 17 });
    exam.topic = `Staging composite ${i}`;
    let candidates = examToCandidates(exam, {
      lang: args.lang,
      level: args.level,
      blueprint,
      batchId,
      source: 'generate-candidates/composite-b1',
    });
    candidates = filterCandidates(candidates, args);
    for (const c of candidates) {
      writeCandidate(c, blueprint, args, stats);
    }
  }
} else {
  console.error(`Unsupported --source ${args.source} for ${args.lang}/${args.level}`);
  process.exit(1);
}

console.log(`\nBatch ${batchId}: ${stats.staged} staged, ${stats.rejected} failed validation, ${stats.skippedDup} duplicates skipped`);
console.log(`Review: npm run review:workbench`);
console.log(`Promote: npm run pipeline:promote -- --lang ${args.lang} --level ${args.level}`);

if (stats.staged === 0 && !args.dryRun) process.exit(1);
