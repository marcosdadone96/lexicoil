#!/usr/bin/env node
/**
 * Sprint 4 — library-first activation tests (servability + Strategy B + assembly).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const ContentServable = require(path.join(ROOT, 'js/library/contentServable.js'));
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const { strategyBEnabled, isLevelServable } = require(path.join(ROOT, 'js/engine/strategyBFlags.js'));
const { runExamSourceCascade } = require(path.join(ROOT, 'js/ui/exam/examSources.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const LANG = 'de';
const LEVEL = 'B1';

ContentServable.loadThresholdsSync(fs.readFileSync, ROOT);
const bpId = LibraryCatalog.blueprintId(LANG, LEVEL);
const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${bpId}.json`), 'utf8'));
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', LANG, LEVEL, 'questions.json'), 'utf8'));
const wsFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', LANG, LEVEL, 'writing-speaking.json'), 'utf8'));

const report = ContentServable.assessLevel({
  lang: LANG,
  level: LEVEL,
  questions: bank.questions,
  passages: ContentServable.mergePassages(bank.passages, []),
  writingSpeaking: wsFile,
  blueprint,
});

assert(report.servable, `de/B1 servable (${report.deficits.map((d) => d.message).join('; ') || 'ok'})`);
assert(
  report.counts.questions.lesen >= 24 && report.counts.questions.horen >= 16,
  `item counts lesen=${report.counts.questions.lesen} horen=${report.counts.questions.horen}`,
);

assert(isLevelServable(LANG, LEVEL), 'isLevelServable(de,B1)');
assert(strategyBEnabled({ subject: LANG, level: LEVEL }), 'strategyBEnabled per-level without STRATEGY_B env');
delete process.env.STRATEGY_B;
assert(strategyBEnabled({ subject: LANG, level: LEVEL }), 'Strategy B auto ON for servable de/B1');
assert(strategyBEnabled({ subject: 'en', level: 'A1' }) === false, 'Strategy B OFF for non-servable en/A1');

ExamBlueprint.cacheBlueprint(LANG, LEVEL, blueprint);
const assembled = ExamBlueprint.assemble(bank, blueprint);
const exam = ExamBuilder.buildFromBlueprint(LANG, LEVEL, bank, blueprint, { mode: 'standard', assembled });
assert(exam.lesenParts?.length >= 1, 'assembled exam has lesen parts');
assert(exam.horenParts?.length >= 1, 'assembled exam has horen parts');

const validation = new ExamValidator().validate(exam, { strict: false, blueprint, cefrGate: false });
assert(validation.valid, `assembled exam valid (${(validation.errors || []).join(', ')})`);

const cascadeBlocked = await runExamSourceCascade(
  { subject: LANG, level: LEVEL, seenIds: [] },
  {
    fetchExamFromPool: async () => null,
    QuestionLibrary: { hasLibrary: () => false, buildExam: async () => null },
    ExamLibrary: { hasLibrary: () => false },
    normalizeExam: (x) => x,
    validateExamCandidate: () => ({ ok: false }),
    isExamRenderable: () => true,
    lcStrategyBEnabled: () => strategyBEnabled({ subject: LANG, level: LEVEL }),
    setLoaderStep: () => {},
    lcDebug: { warn: () => {} },
  },
);
assert(cascadeBlocked.status === 'blocked', 'cascade blocks AI when servable and no library hit');

const cascadeHit = await runExamSourceCascade(
  { subject: LANG, level: LEVEL, seenIds: [] },
  {
    fetchExamFromPool: async () => null,
    QuestionLibrary: {
      hasLibrary: () => true,
      buildExam: async () => ({ ...exam, topic: 'Library exam' }),
    },
    ExamLibrary: { hasLibrary: () => false },
    normalizeExam: (x) => x,
    validateExamCandidate: () => ({ ok: true, normalized: exam }),
    isExamRenderable: () => true,
    lcStrategyBEnabled: () => strategyBEnabled({ subject: LANG, level: LEVEL }),
    setLoaderStep: () => {},
    lcDebug: { warn: () => {} },
  },
);
assert(cascadeHit.status === 'hit' && cascadeHit.result.source === 'question-library', 'cascade uses question library');

console.log('\nSprint 4 library-first tests passed.');
