#!/usr/bin/env node
/** Phase 07 — Content generator tests (mocked AI) */
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
  require(path.join(ROOT, 'js', 'engine', 'prompts', 'blueprintPromptBinding.js'));
  require(path.join(ROOT, 'js', 'engine', 'validation', 'blueprintResolver.js'));
  require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js'));
  require(path.join(ROOT, 'js', 'engine', 'validation', 'ExamValidator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'chunkRunner.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'ExamGenerator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'ExerciseGenerator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'FlashcardGenerator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'StoryGenerator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'DialogueGenerator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'ContentGenerator.js'));
  return {
    KnowledgeEngine: require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js')),
    ExamGenerator: require(path.join(ROOT, 'js', 'engine', 'generators', 'ExamGenerator.js')),
    ExerciseGenerator: require(path.join(ROOT, 'js', 'engine', 'generators', 'ExerciseGenerator.js')),
    ContentGenerator: require(path.join(ROOT, 'js', 'engine', 'generators', 'ContentGenerator.js')),
    PromptBuilder: require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js')),
  };
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

const VALID_STUB = {
  goetheFormat: true,
  lesenParts: [
    {
      text: 'Ein kurzer Lesetext über Natur und Umwelt in der Stadt.',
      items: [
        {
          id: 'l1',
          question: 'Test?',
          options: ['a) One', 'b) Two', 'c) Three'],
          correct: 'b',
        },
      ],
    },
  ],
  horenParts: [
    {
      transcript: 'Moderator: Willkommen. Gast: Danke.',
      segments: [
        {
          id: 'h1',
          question: 'Topic?',
          options: ['a) X', 'b) Y', 'c) Z'],
          correct: 'b',
        },
      ],
    },
  ],
};

function mockHooks(responses) {
  let i = 0;
  return {
    callAI: async () => {
      const r = responses[i++] ?? responses[responses.length - 1];
      return typeof r === 'string' ? r : JSON.stringify(r);
    },
    onStep: () => {},
    startExamTicket: async () => 'mock-gen-ticket',
    parseExamJson: (raw) => JSON.parse(raw),
    validateChunkObj: (chunk, obj) => obj,
    mergeExamParts: (...args) => {
      const topic = args[args.length - 1];
      const parts = args.slice(0, -1);
      const merged = { topic };
      for (const part of parts) {
        for (const [k, v] of Object.entries(part)) {
          if (Array.isArray(v) && Array.isArray(merged[k])) merged[k] = [...merged[k], ...v];
          else if (Array.isArray(v)) merged[k] = [...v];
          else if (!(k in merged)) merged[k] = v;
        }
      }
      return merged;
    },
    commitExamQuota: async () => {},
    normalizeExam: (x) => x,
  };
}

async function testPersonalExamSkills() {
  const { KnowledgeEngine, ExamGenerator, PromptBuilder } = loadEngine();
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    provider: 'goethe',
    contentType: 'VocabularyExercise',
    targetWords: ['Haus', 'Garten', 'Baum'],
    skills: ['lesen', 'schreiben'],
    topic: 'Natur',
  });
  assert(spec.skills?.includes('schreiben'), 'skills merged into spec');
  const built = PromptBuilder.buildPrompt(spec);
  assert(built.mode === 'chunks', 'vocab chunked mode');
  assert(built.chunks.length === 8, 'lesen+schreiben B1 goethe uses 8 official Teile (5+3)');
  assert(built.chunks.some((c) => c.expectKey === 'schreibenParts'), 'schreiben module in vocab chunk');
  assert(!built.chunks.some((c) => c.expectKey === 'horenParts'), 'horen omitted when not selected');

  const lesenChunk = {
    topic: 'Natur',
    level: 'B1',
    lang: 'de',
    lesenParts: VALID_STUB.lesenParts,
  };
  const hooks = mockHooks([
    lesenChunk,
    lesenChunk,
    {
      topic: 'Natur',
      level: 'B1',
      lang: 'de',
      schreibenParts: [{ task: 'Write about nature.' }],
    },
  ]);
  const result = await ExamGenerator.generatePersonal(spec, hooks, {
    blueprint: null,
    useBlueprint: false,
  });
  assert(result.lesenParts?.length >= 1, 'personal exam parsed');
  console.log('OK   personalized exam with skills');
}

async function testQuickExercise() {
  const { KnowledgeEngine, ExerciseGenerator } = loadEngine();
  const spec = await KnowledgeEngine.buildSpec({
    language: 'english',
    level: 'B1',
    contentType: 'ReadingExercise',
    topic: 'Travel',
  });
  const hooks = mockHooks([
    {
      topic: 'Travel',
      level: 'B1',
      lang: 'en',
      quickMod: 'reading',
      readingParts: { textTitle: 'Trip', text: 'Hello', questions: [] },
    },
  ]);
  const result = await ExerciseGenerator.generate(spec, hooks, { quickMod: 'reading' });
  assert(result.quickMod === 'reading', 'quick reading result');
  console.log('OK   ExerciseGenerator quick module');
}

async function testExamChunked() {
  const { KnowledgeEngine, ExamGenerator } = loadEngine();
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    provider: 'goethe',
    contentType: 'Exam',
    topic: 'Umwelt',
  });
  const chunkPayload = {
    lesenParts: [
      {
        text: 'Lesetext über Umwelt und Nachhaltigkeit in der Region.',
        items: [{ id: 'l1', question: 'Q?', options: ['a) 1', 'b) 2', 'c) 3'], correct: 'a' }],
      },
    ],
    horenParts: [
      {
        transcript: 'Moderator: Guten Tag. Gast: Hallo.',
        segments: [{ id: 'h1', question: 'Q?', options: ['a) 1', 'b) 2'], correct: 'a' }],
      },
    ],
  };
  const hooks = mockHooks([chunkPayload, chunkPayload, chunkPayload, chunkPayload]);
  const legacyChunks = [
    { label: 'L1', expectKey: 'lesenParts', prompt: 'x', maxTokens: 1000 },
    { label: 'L2', expectKey: 'lesenParts', prompt: 'x', maxTokens: 1000 },
  ];
  const result = await ExamGenerator.generate(spec, hooks, { legacyChunks });
  assert(result.topic === 'Umwelt', 'merged exam topic');
  assert(result.lesenParts?.length >= 1, 'merged lesenParts');
  console.log('OK   ExamGenerator chunked merge');
}

async function testContentGeneratorRouting() {
  const { KnowledgeEngine, ContentGenerator } = loadEngine();
  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'A2',
    contentType: 'VocabularyExercise',
    targetWords: ['a', 'b', 'c', 'd'],
    topic: 'Test',
  });
  const hooks = mockHooks([{ topic: 'Test', level: 'A2', lang: 'de', ...VALID_STUB }]);
  const result = await ContentGenerator.generate(spec, hooks, {
    blueprint: null,
    useBlueprint: false,
  });
  assert(result.lesenParts, 'vocab 4+ words routed to personal exam');
  console.log('OK   ContentGenerator vocabulary routing');
}

async function run() {
  await testPersonalExamSkills();
  await testQuickExercise();
  await testExamChunked();
  await testContentGeneratorRouting();
  console.log('\nAll generator tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
