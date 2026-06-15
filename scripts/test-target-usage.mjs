#!/usr/bin/env node
/** Personal exam targetUsage — derive, verify, word-boundary safety */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TargetUsage = require(path.join(ROOT, 'js', 'engine', 'targetUsage.js'));
require(path.join(ROOT, 'js', 'engine', 'domain', 'lexicoilDomain.js'));
require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeLoader.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'goetheAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'cambridgeAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'deleAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'providerRegistry.js'));
require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));
require(path.join(ROOT, 'js', 'engine', 'prompts', 'promptShell.js'));
require(path.join(ROOT, 'js', 'engine', 'prompts', 'moduleInstructions.js'));
const PromptBuilder = require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js'));
const KnowledgeEngine = require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

const sampleExam = {
  topic: 'Test',
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      text: 'Die Nachhaltigkeit ist wichtig. Wir studieren Umweltfragen.',
      questions: [{ question: 'Was ist wichtig?', options: ['Nachhaltigkeit', 'Recycling', 'Politik'] }],
    },
  ],
  horenParts: [
    {
      transcript: 'Recycling hilft der Umwelt.',
      questions: [{ question: 'Worum geht es?', options: ['Recycling', 'Sport', 'Musik'] }],
    },
  ],
};

function testWordBoundary() {
  const text = 'Er beschreibt eine Studie zur Nachhaltigkeit.';
  assert(!TargetUsage.surfaceInText(text, 'die'), 'die must not match inside Studie');
  assert(TargetUsage.surfaceInText(text, 'Studie'), 'Studie matches as whole word');
  assert(TargetUsage.surfaceInText('Recycling hilft der Umwelt.', 'Umwelt'), 'Umwelt matches');
  console.log('OK   word-boundary verification');
}

function testVerifyDiscardsInvented() {
  const declared = [
    { word: 'Nachhaltigkeit', surfaces: ['Nachhaltigkeit', 'Nachhaltigkeits'] },
    { word: 'Umwelt', surfaces: ['Umwelt', 'Umweltfragen'] },
    { word: 'Recycling', surfaces: ['Recycling'] },
    { word: 'Phantom', surfaces: ['Phantomwort'] },
  ];
  const verified = TargetUsage.verifyTargetUsage(sampleExam, declared);
  assert(verified.some((e) => e.word === 'Nachhaltigkeit' && e.surfaces.includes('Nachhaltigkeit')), 'keeps real surface');
  assert(!verified.some((e) => e.word === 'Nachhaltigkeit' && e.surfaces.includes('Nachhaltigkeits')), 'drops invented inflection');
  assert(verified.some((e) => e.word === 'Umwelt' && e.surfaces.includes('Umweltfragen')), 'keeps compound surface');
  assert(!verified.some((e) => e.word === 'Phantom'), 'drops unused word');
  console.log('OK   verify discards over-declared surfaces');
}

function testDeriveFromExam() {
  const words = ['Nachhaltigkeit', 'Umwelt', 'Recycling', 'missing'];
  const derived = TargetUsage.deriveTargetUsage(sampleExam, words);
  const found = derived.map((d) => d.word);
  assert(found.includes('Nachhaltigkeit'), 'derives Nachhaltigkeit');
  assert(found.includes('Umwelt'), 'derives Umwelt via Umweltfragen');
  assert(found.includes('Recycling'), 'derives Recycling');
  assert(!found.includes('missing'), 'skips absent words');
  console.log('OK   derive targetUsage from exam text');
}

function testApplyVerified() {
  const exam = JSON.parse(JSON.stringify(sampleExam));
  exam.vocabPersonal = true;
  exam.vocabWords = ['Nachhaltigkeit', 'Umwelt', 'Recycling', 'missing'];
  TargetUsage.applyVerified(exam, exam.vocabWords);
  assert(Array.isArray(exam.targetUsageVerified), 'sets targetUsageVerified');
  assert(exam.targetUsageVerified.length === 3, 'three verified words');
  assert(exam.targetUsageVerified.every((e) => e.surfaces.length > 0), 'each entry has surfaces');
  console.log('OK   applyVerified on personal exam');
}

async function testPromptIncludesTargetUsage() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    contentType: 'VocabularyExercise',
    targetWords: ['Nachhaltigkeit', 'Umwelt'],
    topic: 'Umwelt',
  });
  const result = PromptBuilder.buildPrompt(spec);
  assert(result.prompt.includes('targetUsage'), 'prompt mentions targetUsage');
  assert(result.prompt.includes('Do not invent usage'), 'prompt forbids invented usage');
  console.log('OK   vocab prompt includes targetUsage contract');
}

async function run() {
  testWordBoundary();
  testVerifyDiscardsInvented();
  testDeriveFromExam();
  testApplyVerified();
  await testPromptIncludesTargetUsage();
  console.log('\nAll targetUsage tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
