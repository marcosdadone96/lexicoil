/**
 * Passage translation — truncation root cause + token budget vs pool worst case.
 * Run: node scripts/lib/__tests__/passageTranslate.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const {
  isPassageText,
  passageOutputMaxTokens,
  isCompletePassageTranslation,
  buildPassagePrompt,
  PASSAGE_WORD_LOOKUP_MAX,
} = require(path.join(ROOT, 'js/engine/passageTranslate.js'));

const { cleanTranslation } = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));

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

function loadPassage(rel) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  return j.passages?.[0]?.text || '';
}

const capture = loadPassage('batches/ready/pool-verified/lesen-t1-gemini-136.json');
let longest = { text: '', file: '', chars: 0 };
for (const dir of ['batches/ready/pool-verified', 'batches/merged', 'batches/ready/pool-content-ok']) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!f.startsWith('lesen') || !f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'));
    for (const p of j.passages || []) {
      const t = String(p.text || '');
      if (t.length > longest.chars) longest = { text: t, file: f, chars: t.length };
    }
  }
}

console.log('\n── Root cause: word cache path on full passage ──');

test('capture passage is treated as passage (>120 chars)', () => {
  assert.equal(isPassageText(capture), true);
  assert.ok(capture.length > 1000);
});

test('freeTranslate cleanTranslation truncates to 200 chars (reproduces operator cut)', () => {
  const fakeEn =
    'I made an interesting decision half a year ago. I wanted to use my free time more meaningfully and do something good for the community. So I signed up as a volunteer at the neighborhood center. My main task is to help older residents with their computer problems. Many of them have questions about the internet or their mobile phone. It is nice to see how grateful people are.';
  const truncated = cleanTranslation(fakeEn);
  assert.equal(truncated.length, 200);
  assert.match(truncated, /My mai/);
  assert.ok(!truncated.includes('computer problems'));
});

test('stale 200-char cache hit is rejected → forces AI path', () => {
  const poison = cleanTranslation(capture.slice(0, 500));
  assert.ok(poison.length <= 200);
  assert.equal(isCompletePassageTranslation(capture, poison), false);
});

console.log('\n── Token budget vs pool worst case ──');

test(`capture (${capture.length} chars) maxTokens >= 1200`, () => {
  const tok = passageOutputMaxTokens(capture.length);
  assert.ok(tok >= 1200);
  console.log(`     capture → ${tok} maxTokens`);
});

test(`longest pool (${longest.file}, ${longest.chars} chars) maxTokens <= 4096 and >= 1200`, () => {
  const tok = passageOutputMaxTokens(longest.chars);
  assert.ok(tok >= 1200);
  assert.ok(tok <= 4096);
  console.log(`     longest → ${tok} maxTokens`);
});

test('buildPassagePrompt asks for full translation', () => {
  const p = buildPassagePrompt(capture, 'de', 'en');
  assert.match(p, /full translation/i);
  assert.match(p, /every sentence/i);
  assert.ok(p.includes(capture.slice(0, 40)));
});

console.log('\n── Optional live AI (ANTHROPIC_API_KEY) ──');

async function liveAiTest() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('  ⏭  skip live AI (no ANTHROPIC_API_KEY)');
    return;
  }
  for (const [label, text] of [
    ['capture Ehrenamt', capture],
    [`longest ${longest.file}`, longest.text],
  ]) {
    const maxTok = passageOutputMaxTokens(text.length);
    const prompt = buildPassagePrompt(text, 'de', 'en');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
        max_tokens: maxTok,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const out = (data.content || []).map((p) => p.text || '').join('').trim();
    const stop = data.stop_reason || data.stopReason;
    try {
      assert.ok(res.ok, data?.error?.message || res.statusText);
      assert.equal(stop, 'end_turn', `truncated at max_tokens (${stop})`);
      assert.ok(isCompletePassageTranslation(text, out), `incomplete: ${out.length}c vs ${text.length}c`);
      if (label.includes('Ehrenamt')) {
        assert.match(out, /computer|Computer|mobile|phone/i);
      }
      console.log(`  ✅  live ${label}: ${out.length} chars (src ${text.length}), stop=${stop}`);
      passed++;
    } catch (err) {
      console.error(`  ❌  live ${label}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }
}

await liveAiTest();

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
