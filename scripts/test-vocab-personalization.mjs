#!/usr/bin/env node
/**
 * Tests for vocabulary personalization plan (problems 1–5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const bank = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'),
);
const passagesFile = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/de/B1/passages.json'), 'utf8'),
);
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
const TargetUsage = require(path.join(ROOT, 'js/engine/targetUsage.js'));
const { normalizeAiExamToBank } = require(path.join(ROOT, 'scripts/pipeline/lib/normalizeAiExamToBank.js'));

globalThis.ExamBlueprint = ExamBlueprint;

function ok(label, cond) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`OK   ${label}`);
}

const qs = bank.questions || [];
const ps = bank.passages || [];
ok('all questions have vocabularyTags', qs.every((q) => (q.vocabularyTags || []).length >= 3));
ok('all passages have passageVocab', ps.every((p) => (p.passageVocab || []).length >= 10));
ok('passages.json synced', (passagesFile.passages || []).length === ps.length);

const tagged = qs.filter((q) =>
  (q.vocabularyTags || []).some((t) => String(t).toLowerCase() === 'stadtgarten'),
);
ok('semantic tag Stadtgarten exists', tagged.length > 0);

const matchCount = qs.filter((q) =>
  ExamBuilder.questionContainsWords(q, bank, ['Stadtgarten', 'Nachhaltigkeit']),
).length;
ok('questionContainsWords matches vocabularyTags', matchCount >= 2);

const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
);
ExamBlueprint.cacheBlueprint('de', 'B1', blueprint);
const personalExam = ExamBuilder.buildFromBlueprint('de', 'B1', bank, blueprint, {
  mode: 'personal',
  targetWords: ['Stadtgarten'],
  skills: ['lesen'],
  vocabMatchCount: matchCount,
  vocabMatchFound: matchCount > 0,
});
ok('personal exam exposes vocabMatchFound', personalExam.vocabMatchFound === true);
ok('personal exam exposes vocabMatchCount', personalExam.vocabMatchCount >= 2);

const sampleExam = ExamBuilder.buildFromBlueprint('de', 'B1', bank, blueprint, {
  mode: 'standard',
  skills: ['lesen', 'horen'],
});
const usage = TargetUsage.deriveTargetUsage(sampleExam, ['Stadtgarten', 'kochen', 'xyznotaword']);
ok('deriveTargetUsage returns array', Array.isArray(usage));

const manualSrc = fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8');
ok('manualVocab has enrichFlashcardFromBank', manualSrc.includes('enrichFlashcardFromBank'));
ok('results.js has renderVocabGameSection', fs.readFileSync(path.join(ROOT, 'js/ui/exam/results.js'), 'utf8').includes('renderVocabGameSection'));

const mockExam = {
  lang: 'de',
  level: 'B1',
  lesenParts: [{
    teil: 1,
    text: 'Stadtgärten boomen in deutschen Städten wie Berlin. Viele Bewohner entscheiden sich für ein Gartenprojekt.',
    questions: [{
      type: 'multiple',
      question: 'Was ist der Hauptgrund?',
      correct: 'a',
      options: ['a) Essen', 'b) Sport'],
    }],
  }],
};
const normalized = normalizeAiExamToBank(mockExam);
ok('normalizeAiExamToBank extracts passages', normalized.passages.length >= 1);
ok('normalizeAiExamToBank extracts questions', normalized.questions.length >= 1);

console.log('\nVocabulary personalization tests passed.');
