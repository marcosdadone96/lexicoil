/**
 * coverageRegistry topic-aligned word pick tests.
 * Run: node scripts/lib/__tests__/coverageRegistry.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const {
  pickTopicAlignedWeakWords,
  topicLemmaPool,
  topicKeywordPool,
  buildCoverageRegistry,
} = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/coverageRegistry.mjs')).href);

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅  ${msg}`);
    passed++;
  } else {
    console.error(`  ❌  ${msg}`);
    failed++;
  }
}

console.log('\n── topicLemmaPool ──');
const umwelt = topicKeywordPool('Umwelt', 'de', 'B1');
assert(umwelt.includes('umwelt') || umwelt.includes('nachhaltigkeit'), 'Umwelt pool has topic lemmas');
assert(topicLemmaPool('Umwelt', 'de', 'B1').length >= 5, 'Umwelt expanded pool has enough lemmas');

console.log('\n── pickTopicAlignedWeakWords ──');
const pick = pickTopicAlignedWeakWords({
  lang: 'de',
  level: 'B1',
  topic: 'Arbeit',
  count: 6,
  cursor: 0,
});
assert(pick.words.length >= 5 && pick.words.length <= 8, 'returns 5-8 words');
assert(new Set(pick.words).size === pick.words.length, 'no duplicate lemmas');
assert(pick.topic === 'Arbeit', 'topic normalized');

console.log('\n── buildCoverageRegistry ──');
const reg = buildCoverageRegistry('de', 'B1');
assert(reg.bankLemmaCount >= 600, 'bank has 600+ lemmas');
assert(reg.poolPartsMeasured > 0, 'pool has parts');
assert(Array.isArray(reg.weakDetail), 'weakDetail array');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
