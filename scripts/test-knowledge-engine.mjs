#!/usr/bin/env node
/** Phase 05 — KnowledgeEngine merge tests (no LLM) */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js', 'engine', 'domain', 'lexicoilDomain.js'));
require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeLoader.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'goetheAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'cambridgeAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'deleAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'providerRegistry.js'));
const KnowledgeEngine = require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

async function testGoetheB1() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'German',
    level: 'B1',
    provider: 'Goethe',
    contentType: 'Exam',
    topic: 'Umwelt und Nachhaltigkeit',
  });

  assert(spec.language === 'german', 'language german');
  assert(spec.provider === 'goethe', 'provider goethe');
  assert(spec.level === 'B1', 'level B1');
  assert(spec.topic === 'Umwelt und Nachhaltigkeit', 'topic preserved');
  assert(spec.canDoStatements?.length > 0, 'canDoStatements merged');
  assert(spec.grammarTopics?.includes('Nebensätze'), 'grammar from language file');
  assert(spec.vocabularyDomains?.includes('Umwelt'), 'vocab domains');
  assert(spec.examStructure?.modules?.length === 4, 'four modules');
  assert(spec.examStructure?.board?.includes('Goethe'), 'board from adapter');
  assert(spec.constraints?.chunkPlan?.some((c) => c.expectKey === 'lesenParts'), 'lesenParts chunk');
  assert(spec.constraints?.readingWordCount?.min === 150, 'CEFR reading bounds');
  console.log('OK   Goethe B1 Exam merge');
}

async function testCambridgeB1() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'english',
    level: 'B1',
    provider: 'cambridge',
    contentType: 'Exam',
  });

  assert(spec.provider === 'cambridge', 'provider cambridge');
  assert(spec.constraints?.chunkPlan?.some((c) => c.expectKey === 'readingParts'), 'readingParts chunk');
  assert(!spec.constraints?.chunkPlan?.some((c) => c.expectKey === 'lesenParts'), 'no german keys');
  console.log('OK   Cambridge B1 Exam merge');
}

async function testDeleB1() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'es',
    level: 'B1',
    provider: 'DELE',
    contentType: 'Exam',
  });

  assert(spec.language === 'spanish', 'language spanish');
  assert(spec.provider === 'dele', 'provider dele');
  assert(spec.examStructure?.certificate?.includes('DELE'), 'DELE certificate');
  console.log('OK   DELE B1 Exam merge');
}

async function testTargetWords() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    contentType: 'VocabularyExercise',
    targetWords: ['Nachhaltigkeit', 'Umwelt'],
  });

  assert(spec.contentType === 'VocabularyExercise', 'vocab exercise type');
  assert(spec.targetWords?.length === 2, 'target words attached');
  assert(!spec.provider, 'provider omitted for generic exercise');
  assert(!spec.examStructure, 'no exam structure for VocabularyExercise');
  assert(spec.grammarTopics?.length > 0, 'CEFR+language grammar still merged');
  console.log('OK   targetWords + generic exercise');
}

async function testSpanishExam() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'spanish',
    level: 'B1',
    provider: 'dele',
    contentType: 'Exam',
    topic: 'Viajes',
  });

  assert(spec.provider === 'dele', 'dele provider');
  assert(spec.examStructure?.board?.includes('Cervantes'), 'DELE board');
  assert(
    spec.constraints?.chunkPlan?.some((c) => c.expectKey === 'readingParts' || c.expectKey === 'lesenParts'),
    'spanish exam chunk plan',
  );
  assert(spec.topic === 'Viajes', 'topic preserved');
  console.log('OK   Spanish DELE B1 Exam merge');
}

async function testListTopics() {
  const deB1 = await KnowledgeEngine.listTopics('de', 'B1');
  assert(deB1.includes('Umwelt und Nachhaltigkeit'), 'german B1 topic from knowledge');
  assert(deB1.length >= 4, 'german B1 has multiple topics');

  const enB1 = await KnowledgeEngine.listTopics('english', 'B1');
  assert(enB1.some((t) => /Environment|Travel/i.test(t)), 'english B1 topics');

  const esB1 = await KnowledgeEngine.listTopics('es', 'B1');
  assert(esB1.some((t) => /Medio ambiente/i.test(t)), 'spanish B1 topics');
  console.log('OK   listTopics from knowledge/languages');
}

async function testPickRandomTopic() {
  const topic = await KnowledgeEngine.pickRandomTopic('de', 'B1');
  const allowed = await KnowledgeEngine.listTopics('de', 'B1');
  assert(allowed.includes(topic), 'pickRandomTopic returns knowledge topic');
  console.log('OK   pickRandomTopic');
}

async function testAutoProvider() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'de',
    level: 'B1',
    contentType: 'Exam',
  });

  assert(spec.provider === 'goethe', 'auto-inferred goethe for german Exam');
  console.log('OK   auto provider inference');
}

async function run() {
  await testGoetheB1();
  await testCambridgeB1();
  await testDeleB1();
  await testSpanishExam();
  await testTargetWords();
  await testListTopics();
  await testPickRandomTopic();
  await testAutoProvider();
  console.log('\nAll KnowledgeEngine tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
