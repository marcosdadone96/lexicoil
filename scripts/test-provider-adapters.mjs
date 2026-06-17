#!/usr/bin/env node
/** Phase 08 — Provider adapter acceptance tests */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEngine() {
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
  require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js'));
  return {
    KnowledgeEngine: require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js')),
    ProviderRegistry: require(path.join(ROOT, 'js', 'engine', 'providers', 'providerRegistry.js')),
    BaseProviderAdapter: require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js')),
    KnowledgeLoader: require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeLoader.js')),
    PromptBuilder: require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js')),
  };
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

function chunkCount(spec) {
  return spec.constraints?.chunkPlan?.reduce((s, m) => s + (m.parts || 1), 0) || 0;
}

async function testProviderJsonHasNoPrompts() {
  const { KnowledgeLoader, BaseProviderAdapter } = loadEngine();
  for (const id of ['goethe', 'cambridge', 'dele']) {
    const data = await KnowledgeLoader.loadProvider(id);
    BaseProviderAdapter.assertNoPrompts(data, id);
  }
  console.log('OK   provider JSON files contain no prompts');
}

async function testThreeProvidersSamePipeline() {
  const { KnowledgeEngine, PromptBuilder } = loadEngine();
  const inputs = [
    { language: 'german', provider: 'goethe', topic: 'Umwelt' },
    { language: 'english', provider: 'cambridge', topic: 'Travel' },
    { language: 'spanish', provider: 'dele', topic: 'Viajes' },
  ];

  const specs = [];
  for (const input of inputs) {
    const spec = await KnowledgeEngine.buildSpec({
      ...input,
      level: 'B1',
      contentType: 'Exam',
    });
    specs.push(spec);
    assert(spec.examStructure?.board, `${input.provider} board from adapter`);
    assert(spec.constraints?.chunkPlan?.length >= 4, `${input.provider} chunk plan modules`);
  }

  const counts = specs.map(chunkCount);
  assert(counts[0] === 15, 'Goethe B1 → 15 chunks (5+4+3+3, official modules)');
  assert(counts[1] === 11, 'Cambridge B1 → 11 chunks');
  assert(counts[2] === 10, 'DELE B1 → 10 chunks');
  assert(counts[0] !== counts[1], 'Goethe vs Cambridge chunk totals differ');

  const prompts = specs.map((spec) => PromptBuilder.buildPrompt(spec));
  assert(prompts.every((p) => p.mode === 'chunks'), 'all B1 exams use chunk mode');
  assert(prompts[0].chunks[0].expectKey === 'lesenParts', 'Goethe uses German keys');
  assert(prompts[1].chunks.some((c) => c.expectKey === 'readingParts'), 'Cambridge uses English reading key');
  assert(
    prompts[2].chunks.some((c) => c.expectKey === 'readingParts' || c.expectKey === 'lesenParts'),
    'DELE uses reading chunk key',
  );

  const fn = PromptBuilder.buildPrompt;
  assert(prompts[0].chunks[0].prompt.includes('Goethe-Institut'), 'Goethe board in prompt meta');
  assert(prompts[1].chunks[0].prompt.includes('Cambridge'), 'Cambridge board in prompt meta');
  assert(prompts[2].chunks[0].prompt.includes('Cervantes'), 'DELE board in prompt meta');
  assert(typeof fn === 'function', 'single buildPrompt function for all providers');
  console.log('OK   B1 Exam: three providers, one pipeline');
}

async function testRegistryLanguageGuard() {
  const { ProviderRegistry, KnowledgeLoader } = loadEngine();
  const goethe = await KnowledgeLoader.loadProvider('goethe');
  let threw = false;
  try {
    ProviderRegistry.apply('goethe', goethe, 'B1', 'english');
  } catch (e) {
    threw = e.code === 'provider_language_mismatch';
  }
  assert(threw, 'goethe adapter rejects english language');
  console.log('OK   registry language guard');
}

async function run() {
  await testProviderJsonHasNoPrompts();
  await testThreeProvidersSamePipeline();
  await testRegistryLanguageGuard();
  console.log('\nAll provider adapter tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
