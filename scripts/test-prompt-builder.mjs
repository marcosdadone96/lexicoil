#!/usr/bin/env node
/** Phase 06 — PromptBuilder tests */
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
require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));
require(path.join(ROOT, 'js', 'engine', 'prompts', 'promptShell.js'));
require(path.join(ROOT, 'js', 'engine', 'prompts', 'moduleInstructions.js'));
require(path.join(ROOT, 'js', 'engine', 'prompts', 'blueprintPromptBinding.js'));
require(path.join(ROOT, 'js', 'engine', 'validation', 'blueprintResolver.js'));
require(path.join(ROOT, 'js', 'engine', 'personalLesenPoolFallback.js'));
const PromptBuilder = require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js'));
const KnowledgeEngine = require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));
const BlueprintPromptBinding = require(path.join(ROOT, 'js', 'engine', 'prompts', 'blueprintPromptBinding.js'));
const PersonalLesenPoolFallback = require(path.join(ROOT, 'js', 'engine', 'personalLesenPoolFallback.js'));
const { loadBlueprintFileSync } = require(path.join(ROOT, 'js', 'engine', 'validation', 'blueprintResolver.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

async function testGoetheB1Chunks() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    provider: 'goethe',
    contentType: 'Exam',
    topic: 'Umwelt',
  });
  const result = PromptBuilder.buildPrompt(spec);
  assert(result.mode === 'chunks', 'chunk mode');
  assert(result.chunks.length === 15, 'B1 goethe expands to 15 chunks (5+4+3+3 parts, no grammatik)');
  assert(result.chunks[0].expectKey === 'lesenParts', 'first chunk lesenParts');
  assert(result.chunks[0].prompt.includes('Umwelt'), 'topic in prompt');
  assert(result.chunks[0].prompt.includes('Nebensätze') || result.chunks[0].prompt.includes('Grammar'), 'grammar hint');
  assert(!result.chunks.some((c) => c.prompt.includes('buildGoethe')), 'no legacy fn names');
  console.log('OK   Goethe B1 chunked prompts');
}

async function testCambridgeB1Chunks() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'english',
    level: 'B1',
    provider: 'cambridge',
    contentType: 'Exam',
    topic: 'Travel',
  });
  const result = PromptBuilder.buildPrompt(spec);
  assert(result.chunks.some((c) => c.expectKey === 'readingParts'), 'readingParts');
  assert(result.chunks.length >= 4, 'at least 4 module chunks');
  console.log('OK   Cambridge B1 chunked prompts');
}

async function testQuickReading() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    contentType: 'ReadingExercise',
    topic: 'Arbeit',
  });
  const result = PromptBuilder.buildPrompt(spec);
  assert(result.mode === 'single', 'single mode');
  assert(result.prompt.includes('reading') || result.prompt.includes('lesen'), 'reading exercise');
  console.log('OK   quick reading single prompt');
}

async function testVocabExam() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    provider: 'goethe',
    contentType: 'VocabularyExercise',
    targetWords: ['Nachhaltigkeit', 'Umwelt', 'Recycling'],
    skills: ['lesen', 'horen'],
    topic: 'Umwelt',
  });
  const result = PromptBuilder.buildPrompt(spec);
  assert(result.mode === 'chunks', 'vocab chunked');
  assert(result.chunks.length === 6, 'B1 goethe lesen+horen AI plan: 6 non-pool Teile (L1,3,4,5 + H2,3)');

  const blueprint = loadBlueprintFileSync('goethe_B1');
  const fullPlan = BlueprintPromptBinding.chunkPlanFromBlueprint(blueprint, 'german').filter((c) =>
    /lesen|horen/i.test(String(c.expectKey || '')),
  );
  assert(fullPlan.length === 9, 'blueprint defines 9 official Lesen+Hören Teile (5+4)');

  const aiTeils = new Set(
    result.chunks.map((c) => `${c.expectKey}:T${c.teil}`),
  );
  const poolTeils = [
    ...PersonalLesenPoolFallback.LESEN_POOL_FIRST_TEILS.map((t) => `lesenParts:T${t}`),
    ...PersonalLesenPoolFallback.HOREN_POOL_FIRST_TEILS.map((t) => `horenParts:T${t}`),
  ];
  for (const key of poolTeils) {
    assert(!aiTeils.has(key), `pool Teil excluded from AI chunks: ${key}`);
  }

  const filteredPlan = PersonalLesenPoolFallback.filterPersonalAiChunks(fullPlan, spec);
  assert(filteredPlan.length === 6, 'filterPersonalAiChunks yields 6 Teile');
  const covered = new Set([
    ...filteredPlan.map((c) => `${c.expectKey}:T${c.teil}`),
    ...poolTeils,
  ]);
  assert(covered.size === 9, 'AI + pool covers all 9 Lesen/Hören Teile at runtime');

  assert(result.chunks[0].expectKey === 'lesenParts', 'first chunk lesenParts teil 1');
  assert(result.chunks.some((c) => c.prompt.includes('Nachhaltigkeit')), 'target word in prompt');
  assert(result.chunks.some((c) => c.prompt.includes('OFFICIAL BLUEPRINT PART')), 'blueprint binding');
  assert(result.chunks.some((c) => c.prompt.includes('targetUsage')), 'targetUsage in final chunk');
  console.log('OK   vocabulary exam chunked prompts (official blueprint)');
}

async function testVocabExamLesenOnly() {
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    provider: 'goethe',
    contentType: 'VocabularyExercise',
    targetWords: ['Haus', 'Garten'],
    skills: ['lesen'],
    topic: 'Natur',
  });
  const result = PromptBuilder.buildPrompt(spec);
  assert(result.chunks.length === 4, 'lesen-only B1 goethe AI plan: 4 non-pool Teile (L1,3,4,5; T2 from pool)');
  assert(!result.chunks.some((c) => c.expectKey === 'horenParts'), 'horen omitted');
  assert(!result.chunks.some((c) => c.teil === 2 && c.expectKey === 'lesenParts'), 'lesen T2 excluded (pool)');

  const blueprint = loadBlueprintFileSync('goethe_B1');
  const fullLesen = BlueprintPromptBinding.chunkPlanFromBlueprint(blueprint, 'german').filter((c) =>
    /lesen/i.test(String(c.expectKey || '')),
  );
  assert(fullLesen.length === 5, 'blueprint defines 5 Lesen Teile');
  const covered = new Set([
    ...result.chunks.map((c) => `lesenParts:T${c.teil}`),
    ...PersonalLesenPoolFallback.LESEN_POOL_FIRST_TEILS.map((t) => `lesenParts:T${t}`),
  ]);
  assert(covered.size === 5, 'AI + pool covers all 5 Lesen Teile at runtime');
  console.log('OK   vocabulary exam lesen-only blueprint');
}

async function run() {
  await testGoetheB1Chunks();
  await testCambridgeB1Chunks();
  await testQuickReading();
  await testVocabExam();
  await testVocabExamLesenOnly();
  console.log('\nAll PromptBuilder tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
