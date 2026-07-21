#!/usr/bin/env node
/**
 * Regen Hören T4 Wohnen con Opción A (vocab sin cross-topic) + B (triple hint T4).
 */
import { loadEnvFile } from '../loadEnv.mjs';
import { generateExamPartSingle } from '../generatePartGeminiLib.mjs';
import { pickTopicAlignedWeakWords } from '../coverageRegistry.mjs';
import { resetVocabBankCache } from '../vocabBank.mjs';

loadEnvFile();
resetVocabBankCache();

const FREIZEIT_LEAK = ['wochenende', 'hobby', 'urlaub', 'freizeit', 'ausflug'];
const pick = pickTopicAlignedWeakWords({ topic: 'Wohnen', count: 7, cursor: 0 });
const contaminated = pick.words.filter((w) => FREIZEIT_LEAK.includes(w));
if (contaminated.length) {
  console.error('FAIL vocab pick still has Freizeit lemmas:', contaminated.join(', '));
  process.exit(2);
}

const words = pick.words;
console.log('Regen Hören T4 Wohnen (A+B aplicado)');
console.log(`Palabras (pick limpio): ${words.join(', ')}`);
console.log(`Strict pool size: ${pick.topicPoolSize}, topicAligned weak: ${pick.topicAlignedCount}`);

const result = await generateExamPartSingle({
  module: 'horen',
  teil: 4,
  topic: 'Wohnen',
  words,
  fixRetries: 2,
  skipPoolReady: true,
  keepFailed: true,
  maxApiCalls: 12,
});

console.log('\n--- Resultado A+B ---');
console.log(
  JSON.stringify(
    {
      ok: result.ok,
      file: result.file,
      reason: result.reason,
      gate: result.gate,
      apiCalls: result.apiCalls,
      issues: result.issues?.slice?.(0, 8),
    },
    null,
    2,
  ),
);

process.exit(result.ok ? 0 : 1);
