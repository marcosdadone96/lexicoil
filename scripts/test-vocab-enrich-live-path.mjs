#!/usr/bin/env node
/**
 * Simulates finalizePoolReady metadata step (live generation path).
 */
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';

export function finalizePathEnrich(batch) {
  return enrichBatchMetadata(structuredClone(batch), {
    fillGrammarDefaults: false,
    vocab: true,
    grammar: false,
    topic: false,
  }).batch;
}

if (process.argv[1]?.includes('test-vocab-enrich-live-path')) {
  const sample = finalizePathEnrich({
    lang: 'de',
    level: 'B1',
    module: 'horen',
    teil: 4,
    passages: [
      {
        id: 'p1',
        text: 'Diskussion: Wir sollten den Nahverkehr fördern, Staus verhindern und schlechte Planung vermeiden.',
      },
    ],
    questions: [
      {
        id: 'q1',
        question: 'Was sagt Paul über Verkehr, fördern und verhindern?',
        vocabularyTags: [],
      },
      {
        id: 'q2',
        question: 'Warum ist die Planung schlecht für die Bewohner?',
        vocabularyTags: [],
      },
    ],
  });
  console.log(JSON.stringify(sample.questions.map((q) => q.vocabularyTags), null, 2));
}
