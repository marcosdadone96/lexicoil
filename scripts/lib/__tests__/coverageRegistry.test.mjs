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

console.log('\n── resolveGenerationInput fromCoverage ──');
const { resolveGenerationVocab, resolveTargetWordsForArgs } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/resolveGenerationInput.mjs')).href
);
const technik = resolveGenerationVocab(
  { lang: 'de', level: 'B1', fromCoverage: true, wordCount: 8, topic: 'Technik', teil: 5 },
  { module: 'lesen', teil: 5 },
);
assert(technik.topic === 'Technik', 'fromCoverage respects --topic Technik');
const technikPool = new Set(topicKeywordPool('Technik', 'de', 'B1'));
const technikHits = technik.words.filter((w) => technikPool.has(w.toLowerCase())).length;
assert(technikHits >= 1, `Technik fromCoverage has topic bank hits (got ${technikHits}: ${technik.words.join(', ')})`);
const umweltArgs = { lang: 'de', level: 'B1', fromCoverage: true, wordCount: 8, topic: 'Umwelt', teil: 4 };
const umweltWords = resolveTargetWordsForArgs(umweltArgs, { module: 'lesen', teil: 4 });
const umweltPool = new Set(topicKeywordPool('Umwelt', 'de', 'B1'));
const umweltHits = umweltWords.filter((w) => umweltPool.has(w.toLowerCase())).length;
assert(umweltHits >= 1, `Umwelt fromCoverage final words topic-aligned (got ${umweltHits}: ${umweltWords.join(', ')})`);

console.log('\n── buildCoverageRegistry ──');
const reg = buildCoverageRegistry('de', 'B1');
assert(reg.bankLemmaCount >= 600, 'bank has 600+ lemmas');
assert(reg.poolPartsMeasured > 0, 'pool has parts');
assert(Array.isArray(reg.weakDetail), 'weakDetail array');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
