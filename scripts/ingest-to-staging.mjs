#!/usr/bin/env node
/**
 * Ingest validated content into staging/{lang}/{level}/ (one candidate per module+teil).
 *
 * Sources:
 *   - Batch JSON (Gemini/manual): { passages, questions }
 *   - AI exam JSON: { lesenParts, horenParts, schreibenParts, sprechenParts }
 *
 * Usage:
 *   node scripts/ingest-to-staging.mjs --lang de --level B1 --file batches/merged/foo.json
 *   node scripts/ingest-to-staging.mjs --lang de --level B1 --file ai-exam.json --format exam
 *   node scripts/ingest-to-staging.mjs --lang de --level B1 --file batch.json --auto-approve
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { saveCandidate, loadIndex, stagingRoot } from './pipeline/lib/stagingStore.mjs';
import {
  examToCandidates,
  batchToCandidates,
} from './pipeline/lib/candidateBuilder.mjs';
import { validateCandidate, resolveBlueprint } from './pipeline/lib/validateCandidate.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    file: null,
    format: 'auto',
    autoApprove: false,
    dryRun: false,
    source: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--format') out.format = argv[++i];
    else if (a === '--auto-approve') out.autoApprove = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--source') out.source = argv[++i];
  }
  return out;
}

function detectFormat(raw) {
  if (raw.lesenParts || raw.horenParts || raw.schreibenParts || raw.sprechenParts) return 'exam';
  if (Array.isArray(raw.questions) || Array.isArray(raw.passages)) return 'batch';
  return 'unknown';
}

function fingerprint(candidate) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        module: candidate.module,
        teil: candidate.teil,
        passage: candidate.passage?.text?.slice(0, 120),
        q: (candidate.questions || []).map((q) => q.id || q.question).join('|'),
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

function isDuplicate(candidate, seen) {
  const fp = fingerprint(candidate);
  if (seen.has(fp)) return true;
  seen.add(fp);
  return false;
}

const args = parseArgs(process.argv.slice(2));
if (!args.file) {
  console.error('Usage: node scripts/ingest-to-staging.mjs --lang de --level B1 --file PATH');
  process.exit(1);
}

const filePath = path.resolve(args.file);
const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const format = args.format === 'auto' ? detectFormat(raw) : args.format;
const blueprint = resolveBlueprint(args.lang, args.level);
if (!blueprint) {
  console.error(`No blueprint for ${args.lang}/${args.level}`);
  process.exit(1);
}

const batchId = `ingest-${path.basename(filePath, path.extname(filePath))}-${Date.now()}`;
const sourceLabel =
  args.source || `ingest-to-staging/${format}:${path.basename(filePath)}`;

let candidates = [];
if (format === 'batch') {
  candidates = batchToCandidates(raw, {
    lang: args.lang,
    level: args.level,
    blueprint,
    batchId,
    source: sourceLabel,
  });
} else if (format === 'exam') {
  const exam = { ...raw, lang: raw.lang || args.lang, level: raw.level || args.level, goetheFormat: true };
  candidates = examToCandidates(exam, {
    lang: args.lang,
    level: args.level,
    blueprint,
    batchId,
    source: sourceLabel,
  });
} else {
  console.error('Unknown format — expected batch {passages,questions} or exam {lesenParts,...}');
  process.exit(1);
}

if (!candidates.length) {
  console.error('No candidates extracted from file.');
  process.exit(1);
}

fs.mkdirSync(stagingRoot(args.lang, args.level), { recursive: true });

const stats = { staged: 0, approved: 0, rejected: 0, skippedDup: 0, seen: new Set() };

console.log(`\n== Ingest to staging ${args.lang}/${args.level} ==`);
console.log(`File: ${path.relative(ROOT, filePath)} (${format}) → ${candidates.length} candidate(s)\n`);

for (const candidate of candidates) {
  candidate.validation = validateCandidate(candidate, blueprint);
  if (isDuplicate(candidate, stats.seen)) {
    stats.skippedDup++;
    console.log(`SKIP  dup ${candidate.module} teil ${candidate.teil}`);
    continue;
  }
  if (!candidate.validation.valid) {
    stats.rejected++;
    console.log(
      `REJECT ${candidate.module} teil ${candidate.teil}: ${candidate.validation.errors.slice(0, 2).join('; ')}`,
    );
    if (args.dryRun) continue;
  }
  if (args.autoApprove && candidate.validation.valid) {
    candidate.status = 'approved';
    candidate.review = { ...candidate.review, reviewedAt: new Date().toISOString(), autoApproved: true };
    stats.approved++;
  }
  if (args.dryRun) {
    stats.staged++;
    console.log(
      `DRY-OK ${candidate.module} teil ${candidate.teil} (${candidate.questions.length} q) valid=${candidate.validation.valid}`,
    );
    continue;
  }
  saveCandidate(candidate);
  stats.staged++;
  const tag = candidate.validation.valid ? (candidate.status === 'approved' ? 'APPROVE' : 'STAGE') : 'STAGE*';
  console.log(`${tag} ${candidate.id} — ${candidate.module} teil ${candidate.teil} (${candidate.questions.length} q)`);
}

console.log(
  `\nSummary: staged=${stats.staged} approved=${stats.approved} rejected=${stats.rejected} dup=${stats.skippedDup}`,
);
console.log(`Staging index: staging/${args.lang}/${args.level}/index.json`);
if (!args.dryRun && stats.approved) {
  console.log(`Next: node scripts/promote-approved.mjs --lang ${args.lang} --level ${args.level}`);
}
