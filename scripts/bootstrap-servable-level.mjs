#!/usr/bin/env node
/**
 * Sprint 4 — bootstrap a level to catalog servability (merge exam import + writing/speaking prompts).
 *
 * Usage:
 *   node scripts/bootstrap-servable-level.mjs --lang de --level B1 --source data/exams/de_B1.json
 *   node scripts/bootstrap-servable-level.mjs --lang de --level B1 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { examToCandidates } from './pipeline/lib/candidateBuilder.mjs';
import { resolveBlueprint } from './pipeline/lib/validateCandidate.mjs';
import { writingSpeakingFromBlueprint } from './lib/bootstrapWritingSpeaking.mjs';
import { writePassagesMirror } from './lib/syncPassagesMirror.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ContentServable = require(path.join(ROOT, 'js/library/contentServable.js'));
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    source: path.join(ROOT, 'data/exams/de_B1.json'),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function libraryPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'questions.json');
}

function wsPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'writing-speaking.json');
}

function loadBank(lang, level) {
  const file = libraryPath(lang, level);
  if (!fs.existsSync(file)) {
    return {
      meta: { language: lang, level, version: 1, generatedAt: new Date().toISOString().slice(0, 10) },
      passages: [],
      questions: [],
    };
  }
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

function mergeCandidate(bank, candidate, seen) {
  const fp = fingerprint(candidate);
  if (seen.has(fp)) return { addedP: 0, addedQ: 0 };
  seen.add(fp);

  let addedP = 0;
  let addedQ = 0;
  if (candidate.passage?.id && candidate.passage.text) {
    if (!bank.passages.some((p) => p.id === candidate.passage.id)) {
      bank.passages.push({
        id: candidate.passage.id,
        module: candidate.passage.module || candidate.module,
        title: candidate.passage.title || '',
        text: candidate.passage.text,
      });
      addedP++;
    }
  }
  const qIds = new Set(bank.questions.map((q) => q.id));
  for (const q of candidate.questions || []) {
    if (qIds.has(q.id)) {
      const existing = bank.questions.find((x) => x.id === q.id);
      if (existing) {
        if (!existing.options?.length && q.options?.length) existing.options = q.options;
        if (!existing.signText && q.signText) existing.signText = q.signText;
      }
      continue;
    }
    bank.questions.push(q);
    qIds.add(q.id);
    addedQ++;
  }
  return { addedP, addedQ };
}

function assess(lang, level, bank, wsFile, blueprint) {
  ContentServable.loadThresholdsSync(fs.readFileSync, ROOT);
  const passages = ContentServable.mergePassages(bank.passages, []);
  return ContentServable.assessLevel({
    lang,
    level,
    questions: bank.questions,
    passages,
    writingSpeaking: wsFile,
    blueprint,
  });
}

const args = parseArgs(process.argv.slice(2));
const blueprint = resolveBlueprint(args.lang, args.level);
if (!blueprint) {
  console.error(`No blueprint for ${args.lang}/${args.level}`);
  process.exit(1);
}

const bank = loadBank(args.lang, args.level);
const seen = new Set();
let totalP = 0;
let totalQ = 0;

if (fs.existsSync(path.resolve(args.source))) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(args.source), 'utf8'));
  const exams = Array.isArray(raw) ? raw : [raw];
  const batchId = `bootstrap-${Date.now()}`;
  for (const src of exams) {
    const exam = { ...src, lang: args.lang, level: args.level, goetheFormat: true };
    const candidates = examToCandidates(exam, {
      lang: args.lang,
      level: args.level,
      blueprint,
      batchId,
      source: `bootstrap-servable:${path.basename(args.source)}`,
    });
    for (const c of candidates) {
      const { addedP, addedQ } = mergeCandidate(bank, c, seen);
      totalP += addedP;
      totalQ += addedQ;
    }
  }
  console.log(`Merged exam import: +${totalP} passages, +${totalQ} questions`);
} else {
  console.log(`No source file ${args.source} — skipping exam merge`);
}

const wsFile = writingSpeakingFromBlueprint(blueprint, args.lang, args.level);
const reportBefore = assess(args.lang, args.level, bank, wsFile, blueprint);

console.log(`\nServability: ${reportBefore.servable ? 'YES' : 'NO'}`);
if (reportBefore.deficits.length) {
  for (const d of reportBefore.deficits) console.log(`  - ${d.message}`);
} else {
  console.log(`  counts: lesen ${reportBefore.counts.questions.lesen}/${reportBefore.counts.passages.lesen}, horen ${reportBefore.counts.questions.horen}/${reportBefore.counts.passages.horen}, writing ${reportBefore.counts.writing}, speaking ${reportBefore.counts.speaking}`);
}

if (args.dryRun) {
  console.log('\nDry-run — no files written.');
  process.exit(reportBefore.servable ? 0 : 1);
}

bank.meta.version = (bank.meta.version || 1) + 1;
bank.meta.generatedAt = new Date().toISOString().slice(0, 10);
bank.meta.bootstrap = { at: new Date().toISOString(), source: args.source };

fs.writeFileSync(libraryPath(args.lang, args.level), JSON.stringify(bank, null, 2) + '\n', 'utf8');
fs.writeFileSync(wsPath(args.lang, args.level), JSON.stringify(wsFile, null, 2) + '\n', 'utf8');
writePassagesMirror(bank, args.lang, args.level, path.join(ROOT, 'library', args.lang, args.level, 'passages.json'), fs);
console.log(`\nWrote library/${args.lang}/${args.level}/questions.json (${bank.passages.length} passages, ${bank.questions.length} questions)`);
console.log(`Wrote library/${args.lang}/${args.level}/writing-speaking.json (${wsFile.writing.length} writing, ${wsFile.speaking.length} speaking)`);

if (!reportBefore.servable) process.exit(1);
console.log('\nLevel is servable — library-first (Strategy B) will activate for this level.');
