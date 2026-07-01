/**
 * capitalizeNouns.test.mjs
 * Simple assertion test — no framework required.
 * Run:  node scripts/lib/__tests__/capitalizeNouns.test.mjs
 * Exit: 0 if all pass, 1 on first failure.
 */

import { capitalizeNounsInText, capitalizeBatchNouns } from '../capitalizeNouns.mjs';

let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${description}`);
    passed++;
  } else {
    console.error(`  ❌  ${description}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertContains(description, haystack, needle) {
  if (String(haystack).includes(needle)) {
    console.log(`  ✅  ${description}`);
    passed++;
  } else {
    console.error(`  ❌  ${description}`);
    console.error(`       expected to contain: ${JSON.stringify(needle)}`);
    console.error(`       actual: ${JSON.stringify(haystack)}`);
    failed++;
  }
}

function assertNotContains(description, haystack, needle) {
  if (!String(haystack).includes(needle)) {
    console.log(`  ✅  ${description}`);
    passed++;
  } else {
    console.error(`  ❌  ${description}`);
    console.error(`       expected NOT to contain: ${JSON.stringify(needle)}`);
    console.error(`       actual: ${JSON.stringify(haystack)}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n── capitalizeNounsInText ──');

// Positive: "garten" and "freundin" are in the lexicon → must be capitalised
{
  const input = 'ich gehe in den garten mit meiner freundin';
  const { result } = capitalizeNounsInText(input);
  assertContains('garten → Garten', result, 'Garten');
  assertContains('freundin → Freundin', result, 'Freundin');
}

// Negative: "große" is an adjective NOT in the lexicon → must NOT be capitalised
{
  const input = 'der große hund läuft durch den park';
  const { result } = capitalizeNounsInText(input);
  assertNotContains('große stays lowercase', result, 'Große');
  // "hund" IS in the lexicon — it should be capitalised
  assertContains('hund → Hund', result, 'Hund');
}

// Already-capitalised words stay unchanged
{
  const { result } = capitalizeNounsInText('Der Garten ist schön.');
  assert('already-capital Garten unchanged', result, 'Der Garten ist schön.');
}

// Words not in lexicon are left as-is
{
  const { result } = capitalizeNounsInText('ein schönes wetter heute');
  assertNotContains('schönes stays lowercase', result, 'Schönes');
  // "wetter" IS a known noun
  assertContains('wetter → Wetter', result, 'Wetter');
  // "heute" is in the NON_NOUN blocklist → stays lowercase
  assertNotContains('heute stays lowercase', result, 'Heute');
}

// Non-noun function words explicitly excluded
{
  const { result } = capitalizeNounsInText('ich oder sie bleiben hier');
  assertNotContains('ich not capitalised', result, 'Ich');
  assertNotContains('oder not capitalised', result, 'Oder');
  assertNotContains('hier not capitalised', result, 'Hier');
}

// count is reported correctly
{
  const { count } = capitalizeNounsInText('das wetter und die arbeit sind wichtig');
  // wetter → Wetter, arbeit → Arbeit  (wichtig is adjective → blocked)
  assert('count returns 2 for wetter + arbeit', count, 2);
}

console.log('\n── capitalizeBatchNouns ──');

// Batch fix — passage text and question explanation
{
  const batch = {
    passages: [
      { id: 'p1', text: 'Die arbeit macht spaß. Das wetter ist schön.' },
    ],
    questions: [
      {
        id: 'q1',
        question: 'Wie ist die arbeit?',
        explanation: 'Der text sagt, dass die arbeit gut ist.',
        signText: 'Ich mag die arbeit.',
        options: ['a) die arbeit ist gut', 'b) die arbeit ist schlecht'],
        correct: 'a',
      },
    ],
  };

  const { batch: fixed, totalFixed } = capitalizeBatchNouns(batch);

  assertContains('passage text: arbeit→Arbeit', fixed.passages[0].text, 'Arbeit');
  assertContains('question: arbeit→Arbeit', fixed.questions[0].question, 'Arbeit');
  assertContains('explanation: arbeit→Arbeit', fixed.questions[0].explanation, 'Arbeit');
  assertContains('signText: arbeit→Arbeit', fixed.questions[0].signText, 'Arbeit');
  assertContains('options[0]: arbeit→Arbeit', fixed.questions[0].options[0], 'Arbeit');
  assert('totalFixed > 0', totalFixed > 0, true);
}

// Batch with no lowercase nouns → unchanged
{
  const batch = { passages: [], questions: [{ id: 'q2', question: 'Was ist das?', options: [] }] };
  const { batch: fixed, totalFixed } = capitalizeBatchNouns(batch);
  assert('no-op batch: question unchanged', fixed.questions[0].question, 'Was ist das?');
  assert('no-op batch: totalFixed = 0', totalFixed, 0);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) {
  process.exit(1);
}
