/**
 * chk25Severity.test.mjs — CHK-25 cross-part collision severity thresholds
 *
 * Run: node scripts/lib/__tests__/chk25Severity.test.mjs
 */

import { chk25Severity } from '../../audit-pass-2.mjs';

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

console.log('\nCHK-25 severity thresholds\n');

assert('1 part (no finding)', chk25Severity(1), 'INFO');
assert('2 parts → INFO', chk25Severity(2), 'INFO');
assert('3 parts → INFO', chk25Severity(3), 'INFO');
assert('4 parts → IMPORTANT', chk25Severity(4), 'IMPORTANT');
assert('6 parts → IMPORTANT', chk25Severity(6), 'IMPORTANT');
assert('7 parts → CRITICAL', chk25Severity(7), 'CRITICAL');
assert('20 parts → CRITICAL', chk25Severity(20), 'CRITICAL');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
