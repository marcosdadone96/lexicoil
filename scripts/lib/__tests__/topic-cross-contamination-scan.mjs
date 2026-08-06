#!/usr/bin/env node
/**
 * Escaneo de pares temáticos: strict pool pequeño + contaminación cruzada en pick.
 */
import {
  allTopicStrictLemmaSets,
  crossTopicStrictLemmas,
  pickTopicAlignedWeakWords,
  topicLemmaPool,
} from '../coverageRegistry.mjs';
import { resetVocabBankCache } from '../vocabBank.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

resetVocabBankCache();

const strictSets = allTopicStrictLemmaSets('de', 'B1');
const topics = Object.keys(TOPIC_KEYWORDS);

function strictOwners(lemma) {
  return topics.filter((t) => strictSets[t]?.has(lemma));
}

const SMALL_STRICT = 4;
const risks = [];

console.log('=== Strict pool sizes (B1 bank ∩ TOPIC_KEYWORDS) ===\n');
for (const topic of topics) {
  const lemmas = [...strictSets[topic]].sort();
  const small = lemmas.length <= SMALL_STRICT;
  console.log(
    `${topic.padEnd(12)} strict=${String(lemmas.length).padStart(2)}${small ? ' ⚠ small' : ''}  ${lemmas.slice(0, 12).join(', ')}${lemmas.length > 12 ? '…' : ''}`,
  );
  if (small) {
    risks.push({ topic, kind: 'small_strict_pool', strictSize: lemmas.length, lemmas });
  }
}

console.log('\n=== Cross-topic contamination in pickTopicAlignedWeakWords (7 words, cursor 0/7/14) ===\n');
for (const topic of topics) {
  const crossHits = new Set();
  for (const cursor of [0, 7, 14]) {
    const pick = pickTopicAlignedWeakWords({ topic, count: 7, cursor });
    for (const w of pick.words) {
      const owners = strictOwners(w);
      if (owners.length && !owners.includes(topic)) crossHits.add(`${w}→${owners.join('/')}`);
    }
  }
  const fillHasFreizeitOnWohnen =
    topic === 'Wohnen' &&
    ['wochenende', 'hobby', 'urlaub', 'freizeit'].some((w) => topicLemmaPool('Wohnen').includes(w));
  if (crossHits.size || fillHasFreizeitOnWohnen) {
    console.log(`${topic}: CONTAMINATION ${[...crossHits].join('; ') || '(fill pool Freizeit leak)'}`);
    risks.push({
      topic,
      kind: 'pick_contamination',
      hits: [...crossHits],
      fillFreizeitLeak: fillHasFreizeitOnWohnen,
    });
  } else {
    console.log(`${topic}: OK`);
  }
}

console.log('\n=== Pares cercanos (overlap strict keywords en bank) ===\n');
const PAIRS = [
  ['Wohnen', 'Freizeit'],
  ['Wohnen', 'Ernährung'],
  ['Arbeit', 'Bildung'],
  ['Umwelt', 'Reisen'],
  ['Umwelt', 'Stadtleben'],
  ['Sport', 'Freizeit'],
  ['Kultur', 'Freizeit'],
];
for (const [a, b] of PAIRS) {
  const sa = strictSets[a];
  const sb = strictSets[b];
  const overlap = [...sa].filter((l) => sb.has(l));
  const minSize = Math.min(sa.size, sb.size);
  console.log(
    `${a} vs ${b}: strict ${sa.size}/${sb.size}, overlap=[${overlap.join(', ')}], min=${minSize}${minSize <= SMALL_STRICT ? ' ⚠' : ''}`,
  );
  if (minSize <= SMALL_STRICT) {
    risks.push({ topic: `${a}/${b}`, kind: 'pair_small_min', minSize, overlap });
  }
}

console.log('\n=== Resumen riesgo ===');
if (!risks.length) {
  console.log('Sin riesgos detectados.');
} else {
  for (const r of risks) {
    console.log(JSON.stringify(r));
  }
}

process.exit(risks.some((r) => r.kind === 'pick_contamination' || r.fillFreizeitLeak) ? 1 : 0);
