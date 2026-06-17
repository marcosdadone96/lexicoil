#!/usr/bin/env node
/** Phase 03 — AI path blueprint binding */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/engine/domain/lexicoilDomain.js'));
require(path.join(ROOT, 'js/engine/knowledge/KnowledgeLoader.js'));
require(path.join(ROOT, 'js/engine/providers/baseProviderAdapter.js'));
require(path.join(ROOT, 'js/engine/providers/goetheAdapter.js'));
require(path.join(ROOT, 'js/engine/providers/cambridgeAdapter.js'));
require(path.join(ROOT, 'js/engine/providers/deleAdapter.js'));
require(path.join(ROOT, 'js/engine/providers/providerRegistry.js'));
require(path.join(ROOT, 'js/engine/knowledge/KnowledgeEngine.js'));
require(path.join(ROOT, 'js/engine/prompts/promptShell.js'));
require(path.join(ROOT, 'js/engine/prompts/moduleInstructions.js'));
require(path.join(ROOT, 'js/engine/prompts/blueprintPromptBinding.js'));
require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
require(path.join(ROOT, 'js/engine/prompts/PromptBuilder.js'));

const {
  resolveBlueprintByType,
  resolveBlueprintForSpec,
} = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const BlueprintPromptBinding = require(path.join(ROOT, 'js/engine/prompts/blueprintPromptBinding.js'));
const PromptBuilder = require(path.join(ROOT, 'js/engine/prompts/PromptBuilder.js'));
const KnowledgeEngine = require(path.join(ROOT, 'js/engine/knowledge/KnowledgeEngine.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function run() {
  const bp = resolveBlueprintByType('goethe', 'B1');
  assert(bp.id === 'goethe-b1', 'resolveBlueprintByType loads goethe_B1');

  try {
    resolveBlueprintByType('goethe', 'Z9');
    assert(false, 'missing blueprint should throw');
  } catch (e) {
    assert(e.code === 'blueprint_not_found', 'missing blueprint throws blueprint_not_found');
  }

  const spec = await KnowledgeEngine.buildSpec({
    language: 'german',
    level: 'B1',
    provider: 'goethe',
    contentType: 'Exam',
    topic: 'Umwelt',
  });
  const resolved = resolveBlueprintForSpec(spec);
  assert(resolved?.level === 'B1', 'resolveBlueprintForSpec from KnowledgeEngine spec');

  const plan = BlueprintPromptBinding.chunkPlanFromBlueprint(bp, 'german');
  assert(plan.length === 15, 'chunk plan has 15 parts (5 lesen + 4 horen + 3 schreiben + 3 sprechen)');
  assert(plan.some((c) => c.blueprintPart?.slotType === 'blog_richtig_falsch'), 'plan includes Teil 1 R/F');
  assert(
    plan.some((c) => c.blueprintPart?.questionsTotal?.min === 7 && c.blueprintPart?.slotType === 'ads_matching'),
    'plan includes ads matching teil with 7 items',
  );

  process.env.AI_PATH_BLUEPRINTS = '1';
  const built = PromptBuilder.buildExamChunks({ ...spec, metadata: { blueprint: bp } });
  assert(built.mode === 'chunks', 'buildExamChunks uses blueprint when flag on');
  assert(built.chunks.length === plan.length, 'chunk count matches blueprint plan');
  const firstPrompt = built.chunks[0].prompt;
  assert(firstPrompt.includes('slotType'), 'prompt includes slotType from blueprint');
  assert(firstPrompt.includes('questionsTotal') || firstPrompt.includes('EXACTLY'), 'prompt includes item count');
  assert(firstPrompt.includes('STRUCTURED OUTPUT'), 'prompt includes structured output rules');
  delete process.env.AI_PATH_BLUEPRINTS;

  const legacy = PromptBuilder.buildExamChunks(spec);
  assert(legacy.chunks.length === 15, 'legacy provider plan uses official 15 parts (5+4+3+3)');
  assert(built.chunks.length === legacy.chunks.length, 'blueprint path one chunk per official Teil');

  const mockGood = {
    goetheFormat: true,
    level: 'B1',
    lang: 'de',
    topic: 'Umwelt',
    lesenParts: bp.modules
      .find((m) => m.id === 'lesen')
      .parts.map((part) => ({
        teil: part.teil,
        instruction: part.instruction,
        text: 'Nachhaltigkeit '.repeat(160),
        questions: Array.from({ length: part.itemsTotal }, (_, i) => ({
          id: `l${part.teil}_${i}`,
          type: part.questionTypes?.includes('richtig_falsch') ? 'richtig_falsch' : 'multiple',
          question: `Frage ${i + 1}?`,
          options: part.questionTypes?.includes('richtig_falsch') ? undefined : ['a) Eins', 'b) Zwei', 'c) Drei'],
          correct: part.questionTypes?.includes('richtig_falsch') ? 'R' : 'a',
        })),
      })),
    horenParts: bp.modules
      .find((m) => m.id === 'horen')
      .parts.map((part) => ({
        teil: part.teil,
        instruction: part.instruction,
        segments: [
          {
            label: 'Audio',
            transcript: 'Moderator: Willkommen. Gast: Danke.',
            questions: Array.from({ length: part.itemsTotal }, (_, i) => ({
              id: `h${part.teil}_${i}`,
              type: 'multiple',
              question: `Hörfrage ${i + 1}?`,
              options: ['a) Eins', 'b) Zwei'],
              correct: 'a',
            })),
          },
        ],
      })),
    schreibenParts: [{ teil: 1, task: 'Schreiben Sie eine E-Mail.', minWords: 80 }],
    sprechenParts: [
      { teil: 1, situation: 'Diskussion', points: ['A', 'B'] },
      { teil: 2, situation: 'Präsentation', points: ['C', 'D'] },
    ],
  };

  const v = new ExamValidator().validate(mockGood, { blueprint: bp, strict: true });
  assert(v.valid, `mock blueprint-conform exam passes strict validation (${v.errors.join(', ')})`);
  const longest = Math.max(...mockGood.lesenParts.map((p) => wordCount(p.text)));
  assert(longest >= 150, `longest reading passage ${longest} words >= B1 min 150`);

  console.log('\nBefore (legacy provider B1): chunks=', legacy.chunks.length, ', generic taskTypes only');
  console.log('After  (blueprint B1):       chunks=', built.chunks.length, ', longest passage target >= 150 words');
  console.log('\nAll blueprint AI path tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
