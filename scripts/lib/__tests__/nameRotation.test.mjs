/**
 * nameRotation.test.mjs — gender-safe guest name replacement.
 * Run: node scripts/lib/__tests__/nameRotation.test.mjs
 */
import {
  replaceGuestNamesInBatch,
  findTitleNameGenderMismatches,
  requiredGenderForNameInText,
  getNameGender,
} from '../nameRotation.mjs';

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

function assertThrows(desc, fn, re) {
  try {
    fn();
    console.error(`  ❌  ${desc} (expected throw)`);
    failed++;
  } catch (e) {
    if (re && !re.test(String(e.message || e))) {
      console.error(`  ❌  ${desc} (wrong error: ${e.message})`);
      failed++;
    } else {
      console.log(`  ✅  ${desc}`);
      passed++;
    }
  }
}

console.log('\n── gender helpers ──');
assert('Marie is f', getNameGender('Marie') === 'f');
assert('Florian is m', getNameGender('Florian') === 'm');
assert(
  'Herrn Marie mismatch detected',
  findTitleNameGenderMismatches('Ich begrüße Herrn Marie Weber.').length === 1,
);
assert(
  'Frau Hannah OK',
  findTitleNameGenderMismatches('Ich begrüße Frau Hannah Schneider.').length === 0,
);
assert(
  'required gender from Herrn Florian → m',
  requiredGenderForNameInText('Herrn Florian Weber', 'Florian') === 'm',
);

console.log('\n── replaceGuestNamesInBatch gender guard ──');

const badBatch = {
  passages: [
    {
      text: 'Ich begrüße Herrn Florian Weber, einen Vater.\nFlorian: Hallo.',
      audio: [{ speaker: 'Florian', text: 'Hallo.' }],
    },
  ],
  questions: [{ options: ['a) X', 'b) Hannah', 'c) Florian Weber'], explanation: 'Florian sagt…' }],
};

assertThrows(
  'blocks Florian→Marie under Herrn',
  () => replaceGuestNamesInBatch(badBatch, ['Florian'], ['Marie']),
  /gender mismatch/,
);

const fixed = replaceGuestNamesInBatch(badBatch, ['Florian'], ['Erik']);
assert('allows Florian→Erik', fixed.replacements > 0);
assert('no Marie left', !JSON.stringify(fixed.batch).includes('Florian'));
assert('Erik present', JSON.stringify(fixed.batch).includes('Erik'));
assert(
  'no title mismatch after fix',
  findTitleNameGenderMismatches(fixed.batch.passages[0].text).length === 0,
);

// Fixing an already-wrong Marie under Herrn: title requires m → Erik OK
const marieBug = {
  passages: [{ text: 'Herrn Marie Weber, einen Vater.\nMarie: Hallo.', audio: [{ speaker: 'Marie', text: 'Hallo.' }] }],
  questions: [{ options: ['c) Marie Weber'], explanation: 'Marie sagt' }],
};
assert(
  'required gender for Marie under Herrn is m',
  requiredGenderForNameInText(marieBug.passages[0].text, 'Marie') === 'm',
);
const marieFixed = replaceGuestNamesInBatch(marieBug, ['Marie'], ['Erik']);
assert('Marie→Erik under Herrn works', marieFixed.batch.passages[0].text.includes('Herrn Erik'));
assert(
  'Marie bug cleared',
  findTitleNameGenderMismatches(marieFixed.batch.passages[0].text).length === 0,
);

const genitive = {
  passages: [{ text: 'Ich verstehe Florians Bedenken. Florian sagt nein.' }],
  questions: [],
};
const genFixed = replaceGuestNamesInBatch(genitive, ['Florian'], ['Paul']);
assert('genitive Florians→Pauls', genFixed.batch.passages[0].text.includes('Pauls Bedenken'));
assert('bare Florian→Paul', genFixed.batch.passages[0].text.includes('Paul sagt'));
assert('no Florian left', !/\bFlorian/.test(genFixed.batch.passages[0].text));

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
