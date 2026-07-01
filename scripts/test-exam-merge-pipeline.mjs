#!/usr/bin/env node
/**
 * Deterministic merge/assembly test — NO AI calls.
 * Simulates: merge chunks → normalize → repair → postprocess → validate → staging.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const PartPostprocess = require(path.join(ROOT, 'js/engine/prompts/partPostprocess.js'));
const { examPartsToStagingRecords } = require(path.join(ROOT, 'netlify/functions/lib/stagingFromExam.js'));
const blueprint = require(path.join(ROOT, 'library/blueprints/goethe_B1.json'));
const LesenTeil4Split = require(path.join(ROOT, 'js/engine/generators/lesenTeil4Split.js'));

function loadExamPipeline() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8');
  const start = src.indexOf('function inferQuestionCorrect');
  const end = src.indexOf('async function lcValidateExamOnServer');
  const fnBlock = src.slice(start, end);
  const sandbox = {
    console,
    window: {},
    S: { level: 'B1', subject: 'de' },
    lcDebug: { log() {}, warn() {} },
    sanitizeExamText: (t) => (t == null ? '' : String(t)),
    PartPostprocess,
    ExamRenumber,
    AdsMatching: null,
    resolveExamLang: () => 'de',
    normalizeSpanishExam: (d) => d,
    normalizeCambridgeExam: (d) => d,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${fnBlock}
     this.runPipeline = function(exam, opts) {
       opts = opts || {};
       if (opts._skipAnswerBalance !== false) exam._skipAnswerBalance = true;
       exam = normalizeExam(exam, { skipPostprocess: true }) || exam;
       exam = repairPersonalExamAnswerability(exam);
       if (!opts.skipPostprocess) exam = applyPersonalExamPostprocess(exam);
       return exam;
     };
     this.mergeChunks = mergeExamParts;
    `,
    sandbox,
  );
  return sandbox;
}

function ok(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function countTeilItems(exam, teil) {
  const part = (exam.lesenParts || []).find((p) => Number(p.teil) === teil);
  if (!part) return 0;
  return (part.items?.length || 0) + (part.questions?.length || 0);
}

function makeAds(n = 10) {
  return Array.from({ length: n }, (_, i) => ({
    key: String.fromCharCode(97 + i),
    title: `Anzeige ${String.fromCharCode(65 + i)}`,
    text: `Text der Anzeige ${String.fromCharCode(65 + i)} mit genug Inhalt.`,
  }));
}

function makeTeil3Items() {
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  return keys.map((k, i) => ({
    id: String(13 + i),
    type: 'matching',
    question: `Situation ${13 + i}: Ich suche ein Angebot für Thema ${i + 1}.`,
    correct: k,
  }));
}

function makeTeil4Items() {
  return Array.from({ length: 7 }, (_, i) => ({
    id: String(20 + i),
    type: 'ja_nein',
    signText: `Meinung ${20 + i}: Das ist meine ausführliche Meinung zum Forumthema mit mindestens ein paar Sätzen.`,
    correct: i % 2 === 0 ? 'J' : 'N',
  }));
}

function makeTeil3Part(extra = {}) {
  return {
    teil: 3,
    blueprintSlot: 'ads_matching',
    slotType: 'ads_matching',
    instruction: 'Lesen Sie die Situationen 13 bis 19 und die Anzeigen a bis j.',
    ads: makeAds(),
    items: makeTeil3Items(),
    questions: [],
    ...extra,
  };
}

function makeTeil4Part(extra = {}) {
  return {
    teil: 4,
    blueprintSlot: 'forum_opinions',
    slotType: 'forum_opinions',
    instruction: 'Lesen Sie die Meinungen 20 bis 26 zu einem Thema.',
    textTitle: 'Sollen Handys in der Schule erlaubt sein?',
    items: makeTeil4Items(),
    questions: [],
    ...extra,
  };
}

const pipeline = loadExamPipeline();

// ── Fixture: merged exam with duplicate Teil 4 (2 stale + 7 fresh) ──
const staleT4 = makeTeil4Part({
  items: makeTeil4Items().slice(0, 2),
});
const freshT4Chunk = { lesenParts: [makeTeil4Part()] };
const baseExam = {
  topic: 'Test merge',
  level: 'B1',
  lang: 'de',
  goetheFormat: true,
  vocabPersonal: true,
  _skipAnswerBalance: true,
  lesenParts: [makeTeil3Part(), staleT4],
};

const merged = pipeline.mergeChunks(baseExam, freshT4Chunk, 'Test merge');
ok('merge dedupes Teil 4 to one part', (merged.lesenParts || []).filter((p) => Number(p.teil) === 4).length === 1);
ok('merge Teil 4 has 7 items', countTeilItems(merged, 4) === 7);

// ── Full pipeline (normalize + repair + postprocess) ──
let exam = JSON.parse(JSON.stringify(merged));
exam = pipeline.runPipeline(exam, { skipPostprocess: false });

const t3 = exam.lesenParts.find((p) => Number(p.teil) === 3);
const t4 = exam.lesenParts.find((p) => Number(p.teil) === 4);

ok('Teil 3 keeps 7 items after pipeline', (t3?.items?.length || 0) === 7);
ok('Teil 3 has ads after pipeline', (t3?.ads?.length || 0) >= 2);
ok('Teil 3 not empty after ads dedupe', (t3?.items?.length || 0) > 0);
ok('Teil 4 keeps 7 items after pipeline', (t4?.items?.length || 0) === 7);
ok('Teil 4 has no stray ads', !t4?.ads?.length);

ExamRenumber.renumberExam(exam, blueprint);
ok('Teil 3 _itemCount is 7', t3._itemCount === 7);
ok('Teil 4 _itemCount is 7', t4._itemCount === 7);

const deficits = ExamRenumber.collectDeficits(exam, blueprint);
const t4def = deficits.find((d) => d.module === 'lesen' && d.teil === 4);
const t3def = deficits.find((d) => d.module === 'lesen' && d.teil === 3);
ok('no Teil 3 deficit', !t3def);
ok('no Teil 4 deficit', !t4def);

const validation = new ExamValidator().validate(exam, { strict: false, blueprint });
ok('ExamValidator accepts merged exam', validation.valid);
ok('no exam_no_answer_keys', !validation.errors.some((e) => e.includes('exam_no_answer_keys')));
ok(
  'no item_count_mismatch teil 4',
  !validation.errors.some((e) => e.includes('item_count_mismatch') && e.includes('teil=4')),
);

// ── Duplicate ad key: only one item removed, six remain ──
const dupExam = {
  topic: 'Dup ads',
  level: 'B1',
  lang: 'de',
  goetheFormat: true,
  _skipAnswerBalance: true,
  lesenParts: [
    makeTeil3Part({
      items: [
        ...makeTeil3Items().slice(0, 6),
        { id: '19', type: 'matching', question: 'Situation dup', correct: 'G' },
        { id: '19b', type: 'matching', question: 'Situation dup 2', correct: 'G' },
      ],
    }),
  ],
};
const dupOut = pipeline.runPipeline(JSON.parse(JSON.stringify(dupExam)), { skipPostprocess: false });
const dupT3 = dupOut.lesenParts.find((p) => Number(p.teil) === 3);
ok('duplicate ad key strips only duplicate', (dupT3?.items?.length || 0) === 7);
ok('ads duplicate strip count is 1', (dupT3?._adsDuplicatesStripped || 0) === 1);

// ── LesenTeil4Split merge unit ──
const shell = { teil: 4, instruction: 'x', textTitle: 'Topic?', items: [] };
const batches = LesenTeil4Split.itemIdBatches({ instruction: '20 bis 26', questionsTotal: { min: 7, max: 7 } });
ok('split batches are 20-22, 23-25, 26', batches.length === 3 && batches[2].join(',') === '26');
const splitMerged = LesenTeil4Split.mergeParts(
  'lesenParts',
  shell,
  makeTeil4Items(),
  { questionsTotal: { min: 7, max: 7 }, instruction: '20 bis 26' },
);
ok('split mergeParts yields 7', splitMerged.lesenParts[0].items.length === 7);

// ── Staging ingest ──
const staging = examPartsToStagingRecords(exam, {
  lang: 'de',
  level: 'B1',
  source: 'test-fixture',
  batchId: 'test-batch',
});
ok('staging ingests lesen parts', staging.length >= 2);
ok('staging includes Teil 3', staging.some((r) => r.module === 'lesen' && r.teil === 3 && r.questions.length >= 7));
ok('staging includes Teil 4', staging.some((r) => r.module === 'lesen' && r.teil === 4 && r.questions.length >= 7));

console.log('\nExam merge pipeline tests passed (no AI).');
