#!/usr/bin/env node
/**
 * E2E test for LexiCoil engine v2 (KnowledgeEngine → PromptBuilder → ExamGenerator).
 *
 * Dry run (no API key, default in test:engine):
 *   node scripts/test-exam-engine-e2e.mjs --dry
 *
 * Live generation (requires ANTHROPIC_API_KEY in .env):
 *   node scripts/test-exam-engine-e2e.mjs --live
 *   node scripts/test-exam-engine-e2e.mjs --live --provider=goethe
 *   node scripts/test-exam-engine-e2e.mjs --live --max-chunks=2   # cheap smoke
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  salvageJson,
  validateChunkObj,
  mergeExamParts,
  isValidExam,
  countParts,
  meetsPartMinimums,
} from './lib/examJsonUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const ARGS = process.argv.slice(2);
const LIVE = ARGS.includes('--live');
const DRY = ARGS.includes('--dry') || !LIVE;
const ALL_PROVIDERS = ARGS.includes('--all-providers');
const providerFilter = ARGS.find((a) => a.startsWith('--provider='))?.split('=')[1];
const maxChunksArg = ARGS.find((a) => a.startsWith('--max-chunks='));
const MAX_CHUNKS = maxChunksArg ? parseInt(maxChunksArg.split('=')[1], 10) : 0;

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_EXAM_MODEL || 'claude-sonnet-4-20250514';
const CHUNK_LIMIT_MS = parseInt(process.env.EXAM_CHUNK_LIMIT_MS || '26000', 10);

const PROVIDER_CASES = [
  {
    id: 'goethe',
    language: 'german',
    level: 'B1',
    topic: 'Umwelt und Gesundheit',
    chunkCount: 15,
    minimums: { lesenParts: 5, horenParts: 4, schreibenParts: 1, sprechenParts: 1 },
    firstKey: 'lesenParts',
  },
  {
    id: 'cambridge',
    language: 'english',
    level: 'B1',
    topic: 'Travel and Tourism',
    chunkCount: 11,
    minimums: { readingParts: 5, listeningParts: 4, writingParts: 2, speakingParts: 2 },
    firstKey: 'use_of_englishParts',
  },
  {
    id: 'dele',
    language: 'spanish',
    level: 'B1',
    topic: 'Medio ambiente y sostenibilidad',
    chunkCount: 10,
    minimums: { readingParts: 4, listeningParts: 4, writingParts: 2, speakingParts: 2 },
    firstKey: 'lesenParts',
  },
];

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
  require(path.join(ROOT, 'js', 'engine', 'validation', 'ExamValidator.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'chunkRunner.js'));
  require(path.join(ROOT, 'js', 'engine', 'generators', 'ExamGenerator.js'));
  return {
    KnowledgeEngine: require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js')),
    PromptBuilder: require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js')),
    ExamGenerator: require(path.join(ROOT, 'js', 'engine', 'generators', 'ExamGenerator.js')),
  };
}

function selectedCases() {
  let cases = PROVIDER_CASES;
  if (providerFilter) cases = cases.filter((c) => c.id === providerFilter);
  else if (LIVE && !ALL_PROVIDERS) cases = cases.filter((c) => c.id === 'goethe');
  return cases;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runDryCase(engine, testCase) {
  const spec = await engine.KnowledgeEngine.buildSpec({
    language: testCase.language,
    level: testCase.level,
    provider: testCase.id,
    contentType: 'Exam',
    topic: testCase.topic,
  });
  assert(spec.provider === testCase.id, `${testCase.id} provider on spec`);
  assert(spec.constraints?.chunkPlan?.length >= 4, `${testCase.id} chunk plan modules`);

  const built = engine.PromptBuilder.buildPrompt(spec);
  assert(built.mode === 'chunks', `${testCase.id} chunk mode`);
  assert(built.chunks.length === testCase.chunkCount, `${testCase.id} chunk count`);
  assert(built.chunks[0].expectKey === testCase.firstKey, `${testCase.id} first expectKey`);
  assert(built.chunks[0].prompt.length > 200, `${testCase.id} prompt non-trivial`);
  assert(!built.chunks.some((c) => /buildGoethe|buildCambridge|ExamModulePrompts/i.test(c.prompt)), `${testCase.id} no legacy fn names`);

  console.log(`OK   dry  ${testCase.id} B1 — ${built.chunks.length} chunks, key ${testCase.firstKey}`);
}

async function callAnthropic(prompt, maxTokens, retry) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY required for --live');
  const extra = retry
    ? '\n\nFIX: Return a JSON object with the required root key as an array. No markdown.'
    : '';
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt + extra }],
    }),
  });
  const data = await res.json();
  const ms = Date.now() - t0;
  const text = (data.content || []).map((p) => p.text || '').join('');
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  if (ms >= CHUNK_LIMIT_MS) throw new Error(`chunk too slow: ${ms}ms`);
  if (data.stop_reason && data.stop_reason !== 'end_turn') {
    throw new Error(`stop_reason: ${data.stop_reason}`);
  }
  return { text, ms };
}

async function runLiveCase(engine, testCase) {
  const spec = await engine.KnowledgeEngine.buildSpec({
    language: testCase.language,
    level: testCase.level,
    provider: testCase.id,
    contentType: 'Exam',
    topic: testCase.topic,
  });
  const built = engine.PromptBuilder.buildPrompt(spec);
  let chunks = built.chunks;
  const totalChunks = chunks.length;
  if (MAX_CHUNKS > 0) chunks = chunks.slice(0, MAX_CHUNKS);

  const hooks = {
    callAI: async (prompt, maxTokens, _opts) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await callAnthropic(prompt, maxTokens, attempt > 0);
          return r.text;
        } catch (e) {
          if (attempt === 2) throw e;
        }
      }
    },
    onStep: (msg) => process.stdout.write(`  · ${msg}\n`),
    parseExamJson: (raw) => salvageJson(raw),
    validateChunkObj,
    mergeExamParts,
    commitExamQuota: async () => {},
    normalizeExam: (x) => x,
  };

  console.log(`\nLIVE ${testCase.id} B1 — ${chunks.length}/${totalChunks} chunks`);
  const merged = await engine.ExamGenerator.generate(spec, hooks, { legacyChunks: chunks });
  const counts = countParts(merged);

  assert(isValidExam(merged), `${testCase.id} merged exam is valid`);
  const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
  const validation = new ExamValidator().validate(merged);
  assert(validation.valid, `${testCase.id} ExamValidator: ${validation.errors.join(', ')}`);
  if (MAX_CHUNKS === 0) {
    assert(meetsPartMinimums(counts, testCase.minimums), `${testCase.id} part minimums: ${JSON.stringify(counts)}`);
  } else {
    const generatedKeys = Object.keys(counts).filter((k) => counts[k] > 0);
    assert(generatedKeys.length > 0, `${testCase.id} at least one module generated`);
  }

  console.log(`OK   live ${testCase.id} B1 — parts:`, counts);
  return { counts, merged };
}

async function main() {
  const engine = loadEngine();
  const cases = selectedCases();
  assert(cases.length, 'no test cases selected');

  if (DRY) {
    console.log('Engine v2 E2E — dry (structure only, no API)\n');
    for (const testCase of PROVIDER_CASES) {
      await runDryCase(engine, testCase);
    }
    console.log('\nAll dry engine E2E checks passed.');
    return;
  }

  if (!API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY. Use --dry for structure-only tests.');
    process.exit(1);
  }

  console.log(`Engine v2 E2E — live (model: ${MODEL})`);
  let ok = true;
  for (const testCase of cases) {
    try {
      await runLiveCase(engine, testCase);
    } catch (e) {
      ok = false;
      console.error(`FAIL live ${testCase.id}:`, e.message);
    }
  }

  if (!ok) process.exit(1);
  console.log('\nAll live engine E2E checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
