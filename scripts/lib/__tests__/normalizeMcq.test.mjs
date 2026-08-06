/**
 * normalizeMcq.test.mjs
 * Run: node scripts/lib/__tests__/normalizeMcq.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeBatchMcqOptionCapitalization,
  batchMcqOptionsConsistentlyLowercase,
  capitalizeMcqOptionBody,
  normalizeMcqOptionCapitalization,
  dedupeMcqOptionLetterPrefix,
  normalizeMcqOptions,
} from '../normalizeMcq.mjs';
import { normalizeBatch } from '../normalizeBatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}
function assertOk(desc, value) {
  if (value) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}: got ${JSON.stringify(value)}`);
    failed++;
  }
}

console.log('\n── capitalizeMcqOptionBody ──');
{
  assert('lowercase start', capitalizeMcqOptionBody('zehn Euro pro Medium'), 'Zehn Euro pro Medium');
  assert('already capitalized', capitalizeMcqOptionBody('Alle Studenten'), 'Alle Studenten');
}

console.log('\n── mixed batch → capitalize all option starts ──');
{
  const batch = {
    questions: [
      {
        type: 'multiple_choice',
        options: ['a) Alle Studenten.', 'b) Erwachsene.', 'c) Personen unter 18.'],
      },
      {
        type: 'multiple_choice',
        options: [
          'a) zehn Euro pro Medium, unabhängig von der Dauer.',
          'b) fünfzig Cent pro Tag, bis zu einer Mahnung.',
          'c) zehn Euro nach zehn Tagen Verspätung.',
        ],
      },
    ],
  };
  assertOk('batch is not consistently lowercase', !batchMcqOptionsConsistentlyLowercase(batch));
  const fixed = normalizeBatchMcqOptionCapitalization(batch);
  assert(
    'Q2 option a capitalized',
    fixed.questions[1].options[0],
    'a) Zehn Euro pro Medium, unabhängig von der Dauer.',
  );
  assert(
    'Q2 option b capitalized',
    fixed.questions[1].options[1],
    'b) Fünfzig Cent pro Tag, bis zu einer Mahnung.',
  );
}

console.log('\n── consistently lowercase batch → leave unchanged ──');
{
  const batch = {
    questions: [
      {
        type: 'multiple_choice',
        options: ['a) zehn euro', 'b) zwanzig euro', 'c) dreißig euro'],
      },
      {
        type: 'multiple_choice',
        options: ['a) nur werktags', 'b) am wochenende', 'c) nie'],
      },
    ],
  };
  assertOk('batch is consistently lowercase', batchMcqOptionsConsistentlyLowercase(batch));
  const fixed = normalizeBatchMcqOptionCapitalization(batch);
  assert('unchanged a', fixed.questions[0].options[0], 'a) zehn euro');
}

console.log('\n── lesen-t5-gemini-061 integration ──');
{
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'batches/generated/lesen-t5-gemini-061.json'), 'utf8'),
  );
  const normalized = normalizeBatch(raw, { module: 'lesen', teil: 5, lang: 'de', level: 'B1' });
  const q4 = normalized.questions.find((q) => String(q.question || '').includes('maximale Gebühr'));
  assertOk('Q4 option a starts with Zehn', /^a\) Zehn Euro/.test(q4?.options?.[0] || ''));
  assertOk('Q4 option b starts with Fünfzig', /^b\) Fünfzig Cent/.test(q4?.options?.[1] || ''));
  const allOpts = normalized.questions.flatMap((q) => q.options || []).join('\n');
  assertOk('Alle Studenten option preserved and capitalized', /[abc]\) Alle Studenten/.test(allOpts));
}

console.log('\n── normalizeMcqOptionCapitalization (single question) ──');
{
  const opts = normalizeMcqOptionCapitalization(['a) ein test', 'b) zwei test']);
  assert('single q a', opts[0], 'a) Ein test');
  assert('single q b', opts[1], 'b) Zwei test');
}

console.log('\n── dedupeMcqOptionLetterPrefix ──');
{
  assert(
    'strip double letter upper',
    dedupeMcqOptionLetterPrefix('a) A) Sie führt dazu.').text,
    'a) Sie führt dazu.',
  );
  assert(
    'strip double letter lower',
    dedupeMcqOptionLetterPrefix('b) b) Dass die Kosten steigen.').text,
    'b) Dass die Kosten steigen.',
  );
  assert(
    'normalizeMcqOptions strips double',
    normalizeMcqOptions(['a) A) Sie führt dazu.', 'b) B) Test', 'c) C) Mehr'])[0],
    'a) Sie führt dazu.',
  );
}

console.log('\n── dedupeBatchMcqOptionLetterPrefixes (lesen T2 + horen T4) ──');
{
  const { dedupeBatchMcqOptionLetterPrefixes } = await import('../normalizeMcq.mjs');
  const batch = {
    questions: [
      {
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        options: ['a) ok', 'b) b) Dup', 'c) c) Also dup'],
      },
      {
        module: 'horen',
        teil: 4,
        type: 'multiple_choice',
        options: ['a) a) Name', 'b) B) Other', 'c) fine'],
      },
    ],
  };
  const { batch: fixed, fixed: n } = dedupeBatchMcqOptionLetterPrefixes(batch);
  assert('batch fixed count', n, 4);
  assert('lesen b', fixed.questions[0].options[1], 'b) Dup');
  assert('horen a', fixed.questions[1].options[0], 'a) Name');
  assert('horen b upper', fixed.questions[1].options[1], 'b) Other');
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
