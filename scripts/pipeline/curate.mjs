#!/usr/bin/env node
/**
 * Strategy B offline curation pipeline:
 *   generate (bank | composite | legacy-import) -> validate(strict + CefrGate) -> publish
 *
 * Usage:
 *   node scripts/pipeline/curate.mjs --lang de --level B1 --count 5 --source composite
 *   node scripts/pipeline/curate.mjs --lang de --level B1 --source bank --count 20
 *   node scripts/pipeline/curate.mjs --import data/exams/de_B1.json --lang de --level B1 --max 3
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { validateForPublish } from './lib/validateForPublish.js';
import { publishCuratedExam, loadCuratedIndex } from './lib/publishCurated.js';
import { normalizeStoredExam } from './lib/normalizeExamForPublish.js';
import { buildCompositeB1Exam } from './lib/sampleB1.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const { loadBlueprintFileSync, BLUEPRINT_INDEX } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    count: 5,
    source: 'composite',
    importFile: null,
    maxImport: 3,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--count') out.count = parseInt(argv[++i], 10);
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--import' || a === '--import-file') out.importFile = argv[++i];
    else if (a === '--max') out.maxImport = parseInt(argv[++i], 10);
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function loadBank(lang, level) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(file)) throw new Error(`Missing bank: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBlueprint(lang, level) {
  const fileId = BLUEPRINT_INDEX[`${lang}_${level}`];
  if (!fileId) throw new Error(`No blueprint for ${lang}/${level}`);
  return loadBlueprintFileSync(fileId);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom(seed, fn) {
  const rng = mulberry32(seed);
  const orig = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function generateFromBank(lang, level, bank, blueprint, attempt) {
  return withSeededRandom(attempt * 7919, () => {
    const assembled = ExamBlueprint.assemble(bank, blueprint);
    const exam = ExamBuilder.buildFromBlueprint(lang, level, bank, blueprint, { assembled });
    return { exam, sourceBankIds: assembled.selected.map((q) => q.id) };
  });
}

function useBlueprintForSource(source) {
  return source === 'bank';
}

const args = parseArgs(process.argv.slice(2));
const logDir = path.join(ROOT, 'docs', 'audit', '07_STRATEGY_B_PIPELINE');
fs.mkdirSync(logDir, { recursive: true });
const batchLog = {
  startedAt: new Date().toISOString(),
  args,
  published: [],
  rejected: [],
};

let published = 0;
const target = args.count;

function tryPublish(exam, meta) {
  const useBlueprint = meta.useBlueprint ?? useBlueprintForSource(args.source);
  const validation = validateForPublish(exam, {
    lang: args.lang,
    level: args.level,
    useBlueprint,
  });
  if (!validation.valid) {
    batchLog.rejected.push({
      topic: exam.topic,
      errors: validation.errors,
      generatedBy: meta.generatedBy,
    });
    console.log(`REJECT  ${exam.topic || meta.generatedBy}: ${validation.errors.slice(0, 2).join('; ')}`);
    return false;
  }
  if (args.dryRun) {
    console.log(`DRY-OK  ${exam.topic || meta.generatedBy} (${validation.cefr.metrics.wordCount} words)`);
    published++;
    return true;
  }
  const row = publishCuratedExam({
    lang: args.lang,
    level: args.level,
    topic: exam.topic,
    exam,
    generatedBy: meta.generatedBy,
    blueprintId: validation.blueprintId,
    cefrGate: validation.cefr,
    sourceBankIds: meta.sourceBankIds || [],
    validationResult: validation,
  });
  batchLog.published.push({ id: row.id, topic: exam.topic, generatedBy: meta.generatedBy });
  console.log(`PUBLISH ${row.id} — ${exam.topic || meta.generatedBy}`);
  published++;
  return true;
}

if (args.importFile) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(args.importFile), 'utf8'));
  const exams = Array.isArray(raw) ? raw : [raw.exam || raw];
  for (const src of exams.slice(0, args.maxImport)) {
    if (published >= target) break;
    const exam = normalizeStoredExam(src);
    exam.lang = args.lang;
    exam.level = args.level;
    tryPublish(exam, {
      generatedBy: `pipeline/legacy-import:${path.basename(args.importFile)}`,
      useBlueprint: false,
    });
  }
} else if (args.source === 'composite' && args.lang === 'de' && args.level === 'B1') {
  const bank = loadBank(args.lang, args.level);
  const blueprint = loadBlueprint(args.lang, args.level);
  ExamBlueprint.cacheBlueprint(args.lang, args.level, blueprint);
  for (let i = 1; published < target && i <= target * 5; i++) {
    const { exam, sourceBankIds } = buildCompositeB1Exam({
      ExamBlueprint,
      ExamBuilder,
      bank,
      blueprint,
      attempt: i,
    });
    exam.topic = `Umwelt und Nachhaltigkeit (${i})`;
    tryPublish(exam, {
      generatedBy: 'pipeline/composite-b1-bank',
      sourceBankIds,
      useBlueprint: false,
    });
  }
} else if (args.source === 'bank') {
  const bank = loadBank(args.lang, args.level);
  const blueprint = loadBlueprint(args.lang, args.level);
  ExamBlueprint.cacheBlueprint(args.lang, args.level, blueprint);
  for (let attempt = 1; published < target && attempt <= target * 50; attempt++) {
    const { exam, sourceBankIds } = generateFromBank(args.lang, args.level, bank, blueprint, attempt);
    tryPublish(exam, {
      generatedBy: 'pipeline/bank-assembler',
      sourceBankIds,
      useBlueprint: true,
    });
  }
} else {
  console.error(`Unknown --source ${args.source} for ${args.lang}/${args.level}`);
  process.exit(1);
}

batchLog.finishedAt = new Date().toISOString();
batchLog.publishedCount = published;
batchLog.rejectedCount = batchLog.rejected.length;
const logFile = path.join(logDir, `batch-${args.lang}_${args.level}-${Date.now()}.json`);
fs.writeFileSync(logFile, JSON.stringify(batchLog, null, 2) + '\n', 'utf8');

console.log(`\nBatch complete: ${published} published, ${batchLog.rejected.length} rejected`);
console.log(`Log: ${path.relative(ROOT, logFile)}`);
console.log(`Curated index: ${loadCuratedIndex(args.lang, args.level).length} entries`);

if (published === 0 && !args.dryRun) process.exit(1);
