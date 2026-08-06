/**
 * make-t3-fixT3OptionCaps.test.mjs
 * Run: node scripts/lib/__tests__/make-t3-fixT3OptionCaps.test.mjs
 */
import { fixT3OptionCaps } from '../../make-t3.mjs';

let passed = 0;
let failed = 0;

function assertEq(desc, actual, expected) {
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

console.log('\n── fixT3OptionCaps: idiomas tras «in» intactos ──');

assertEq(
  'Nachhilfe in Chinesisch',
  fixT3OptionCaps('Nachhilfe in Chinesisch, Mo–Mi ab 18 Uhr.'),
  'Nachhilfe in Chinesisch, Mo–Mi ab 18 Uhr.',
);

assertEq(
  'Nachhilfe in Spanisch',
  fixT3OptionCaps('Nachhilfe in Spanisch und Deutsch.'),
  'Nachhilfe in Spanisch und Deutsch.',
);

assertEq(
  'in Englisch from blueprint',
  fixT3OptionCaps('D) Wortschatz — Nachhilfe in Englisch, auch zur Prüfung.'),
  'D) Wortschatz — Nachhilfe in Englisch, auch zur Prüfung.',
);

console.log('\n── fixT3OptionCaps: ordinales «Zwei- und …» still decap ──');

assertEq(
  'Zwei- und … ordinal (first compound only)',
  fixT3OptionCaps('Zwei- und Drei-Stunden-Kurse verfügbar.'),
  'zwei- und Drei-Stunden-Kurse verfügbar.',
);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
