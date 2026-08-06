#!/usr/bin/env node
import {
  topicKeywordPool,
  topicLemmaPool,
  pickTopicAlignedWeakWords,
} from '../coverageRegistry.mjs';
import { resetVocabBankCache } from '../vocabBank.mjs';

resetVocabBankCache();

const wPool = topicKeywordPool('Wohnen');
const fPool = topicKeywordPool('Freizeit');
const wFill = topicLemmaPool('Wohnen');

console.log('=== Wohnen strict pool ===', wPool.length, wPool);
console.log('=== Freizeit strict pool ===', fPool.length, fPool.slice(0, 15));
console.log('=== Wohnen fill pool (no cross-topic strict) ===');
for (const lemma of ['wochenende', 'hobby', 'urlaub', 'freizeit', 'miete', 'wohnung', 'umzug', 'nachbar']) {
  console.log(
    `  ${lemma}: strict-Wohnen=${wPool.includes(lemma)} fill-Wohnen=${wFill.includes(lemma)} strict-Freizeit=${fPool.includes(lemma)}`,
  );
}

let failed = false;
for (let cursor = 0; cursor <= 14; cursor += 7) {
  const p = pickTopicAlignedWeakWords({ lang: 'de', level: 'B1', topic: 'Wohnen', count: 7, cursor });
  const leak = p.words.filter((w) => ['wochenende', 'hobby', 'urlaub', 'freizeit'].includes(w));
  if (leak.length) failed = true;
  console.log(
    `\ncursor=${cursor} -> words=${p.words.join(', ')} (topicAligned=${p.topicAlignedCount}, poolSize=${p.topicPoolSize})${leak.length ? ' LEAK:' + leak.join(',') : ''}`,
  );
}

if (failed) {
  console.error('\nFAIL: Freizeit contamination still present in Wohnen pick');
  process.exit(1);
}
console.log('\nPASS: Wohnen pick sin contaminación Freizeit');
