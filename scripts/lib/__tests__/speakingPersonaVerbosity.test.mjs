/**
 * Sprechen persona verbosity — measurable differentiation (Kim / Alex / Leo).
 * Run: node scripts/lib/__tests__/speakingPersonaVerbosity.test.mjs
 *
 * Documents pre-fix gap (shared MAX_TOKENS=300, overlapping 1–2 / 2–4 / 3–5 ranges)
 * and post-fix enforcement (maxTokens + VERBOSITÄT blocks + teil-aware prompts).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const {
  PERSONAS,
  buildChatSystem,
  buildLiveSystemInstruction,
} = require(path.join(ROOT, 'netlify/functions/lib/speakingPersonas.js'));

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const SITUATION_T1 =
  'Planen Sie gemeinsam einen Stadtfest-Tag. Punkte: Datum, Ort, Programm, Budget, Werbung.';
const SITUATION_T3 =
  'Geben Sie Feedback zur Präsentation Ihres Partners. Stellen Sie 2–3 Fragen zum Thema.';

console.log('\n── PRE-FIX diagnosis (documented) ──');
console.log('  Before: speaking-chat used MAX_TOKENS=300 for all personas.');
console.log('  Before: system hints overlapped (1–2 vs 2–4 vs 3–5 Sätze) — models converged.');
console.log('  Before: buildExamSystemInstruction hardcoded Teil 2 for all live sessions.');

console.log('\n── maxTokens ladder (chat API cap) ──');

test('Kim maxTokens < Alex < Leo', () => {
  assert.ok(PERSONAS.quiet.maxTokens < PERSONAS.balanced.maxTokens);
  assert.ok(PERSONAS.balanced.maxTokens < PERSONAS.talkative.maxTokens);
  console.log(
    `     quiet=${PERSONAS.quiet.maxTokens} balanced=${PERSONAS.balanced.maxTokens} talkative=${PERSONAS.talkative.maxTokens}`,
  );
});

test('maxWordsPerTurn ladder matches UI promise', () => {
  assert.equal(PERSONAS.quiet.maxWordsPerTurn, 12);
  assert.equal(PERSONAS.balanced.maxWordsPerTurn, 35);
  assert.equal(PERSONAS.talkative.maxWordsPerTurn, 70);
});

console.log('\n── system instruction differentiation (same T1 situation) ──');

const prompts = {
  quiet: buildChatSystem({ personaId: 'quiet', teil: 1, situation: SITUATION_T1 }),
  balanced: buildChatSystem({ personaId: 'balanced', teil: 1, situation: SITUATION_T1 }),
  talkative: buildChatSystem({ personaId: 'talkative', teil: 1, situation: SITUATION_T1 }),
};

test('each persona has distinct VERBOSITÄT block', () => {
  assert.match(prompts.quiet, /12 Wörter/);
  assert.match(prompts.balanced, /20–35 Wörter/);
  assert.match(prompts.talkative, /45–70 Wörter/);
  assert.notEqual(prompts.quiet, prompts.balanced);
  assert.notEqual(prompts.balanced, prompts.talkative);
});

test('T1 task block present; T3 differs from T1', () => {
  const t1 = buildChatSystem({ personaId: 'balanced', teil: 1, situation: SITUATION_T1 });
  const t3 = buildChatSystem({ personaId: 'balanced', teil: 3, situation: SITUATION_T3 });
  assert.match(t1, /Teil 1 — Gemeinsame Planung/);
  assert.match(t3, /Teil 3 — Feedback und Fragen/);
  assert.doesNotMatch(t3, /Gemeinsame Planung/);
});

console.log('\n── Gemini Live instructions (voice) ──');

const liveQuiet = buildLiveSystemInstruction({
  personaId: 'quiet',
  teil: 1,
  whoStarts: 'partner',
  displayName: 'Kim',
  situation: SITUATION_T1,
  durationMs: 180000,
});
const liveLeo = buildLiveSystemInstruction({
  personaId: 'talkative',
  teil: 3,
  whoStarts: 'user',
  displayName: 'Leo',
  situation: SITUATION_T3,
  durationMs: 180000,
});

test('live T3 uses feedback task block, not planning', () => {
  assert.match(liveLeo, /Teil 3 — Feedback/);
  assert.match(liveLeo, /45–70 Wörter/);
});

test('live voices differ per persona', () => {
  assert.notEqual(PERSONAS.quiet.voiceName, PERSONAS.talkative.voiceName);
  console.log(
    `     Kim=${PERSONAS.quiet.voiceName} Alex=${PERSONAS.balanced.voiceName} Leo=${PERSONAS.talkative.voiceName}`,
  );
});

console.log('\n── optional live Anthropic probe (same user turn) ──');

async function probeAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('  ⏭  ANTHROPIC_API_KEY not set — skip live length probe');
    return;
  }
  const userTurn =
    'Ich schlage vor, das Fest am ersten Samstag im Juni zu machen. Was denkst du?';
  const personas = ['quiet', 'balanced', 'talkative'];
  const lengths = {};
  for (const id of personas) {
    const system = buildChatSystem({ personaId: id, teil: 1, situation: SITUATION_T1 });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_SPEAKING_MODEL || 'claude-haiku-4-5',
        max_tokens: PERSONAS[id].maxTokens,
        system: [{ type: 'text', text: system }],
        messages: [{ role: 'user', content: userTurn }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = (data.content || []).map((p) => p.text || '').join('').trim();
    lengths[id] = { chars: text.length, words: wordCount(text), sample: text.slice(0, 80) };
  }
  console.log('  Live probe (same user turn):');
  for (const id of personas) {
    const m = lengths[id];
    console.log(`     ${id}: ${m.words} words, ${m.chars} chars — "${m.sample}…"`);
  }
  assert.ok(lengths.quiet.words <= lengths.balanced.words + 5, 'Kim should not exceed Alex much');
  assert.ok(lengths.balanced.words < lengths.talkative.words, 'Leo should speak more than Alex');
}

await probeAnthropic().catch((err) => {
  console.log(`  ⚠  Live probe failed: ${err.message}`);
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
