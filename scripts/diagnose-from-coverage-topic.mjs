#!/usr/bin/env node
/**
 * Diagnose --from-coverage topic alignment vs global weak pick.
 * Run: node scripts/diagnose-from-coverage-topic.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGenerationVocab, resolveTargetWordsForArgs } from './lib/resolveGenerationInput.mjs';
import { pickTopicAlignedWeakWords, topicKeywordPool } from './lib/coverageRegistry.mjs';
import { loadWeakLemmas, pickRandomWords } from './lib/lesenTemplatePrompt.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

const CASES = [
  { topic: 'Technik', teil: 5, module: 'lesen' },
  { topic: 'Umwelt', teil: 4, module: 'lesen' },
  { topic: 'Arbeit', teil: 1, module: 'lesen' },
  { topic: 'Freizeit', teil: 2, module: 'horen' },
];

function topicPool(topic) {
  return new Set((TOPIC_KEYWORDS[topic] || []).map((w) => w.toLowerCase()));
}

function scoreWords(words, topic) {
  const pool = topicPool(topic);
  const bankTopic = new Set(topicKeywordPool(topic, 'de', 'B1'));
  let strict = 0;
  let expanded = 0;
  for (const w of words) {
    const l = w.toLowerCase();
    if (pool.has(l) || [...pool].some((k) => l.includes(k) || k.includes(l))) strict++;
    if (bankTopic.has(l)) expanded++;
  }
  return { strict, expanded, total: words.length };
}

console.log('\n══ Diagnóstico --from-coverage vs tema ══\n');

const weak = loadWeakLemmas('de', 'B1');
console.log(`weak-de_B1.json: ${weak?.length ?? 0} lemas globales\n`);

for (const c of CASES) {
  const args = {
    lang: 'de',
    level: 'B1',
    fromCoverage: true,
    wordCount: 8,
    topic: c.topic,
    teil: c.teil,
    module: c.module,
  };

  const broken = pickRandomWords(weak, args.wordCount, args.wordCount);
  const aligned = pickTopicAlignedWeakWords({
    lang: 'de',
    level: 'B1',
    topic: c.topic,
    count: args.wordCount,
    cursor: 0,
  });

  let resolved;
  try {
    resolved = resolveGenerationVocab(args, { module: c.module, teil: c.teil });
  } catch (e) {
    resolved = { error: e.message };
  }

  let sanitized;
  try {
    sanitized = resolveTargetWordsForArgs({ ...args }, { module: c.module, teil: c.teil });
  } catch (e) {
    sanitized = { error: e.message };
  }

  const sBroken = scoreWords(broken, c.topic);
  const sAligned = scoreWords(aligned.words, c.topic);
  const sResolved = resolved.words ? scoreWords(resolved.words, c.topic) : null;
  const sSan = Array.isArray(sanitized) ? scoreWords(sanitized, c.topic) : null;

  console.log(`── ${c.topic} × ${c.module} T${c.teil} ──`);
  console.log(`  pickRandomWords (global weak):     [${broken.join(', ')}]`);
  console.log(`    alineación strict/expanded: ${sBroken.strict}/${sBroken.expanded} de ${sBroken.total}`);
  console.log(`  pickTopicAlignedWeakWords:         [${aligned.words.join(', ')}]`);
  console.log(`    alineación strict/expanded: ${sAligned.strict}/${sAligned.expanded} de ${sAligned.total} (topicFirst=${aligned.topicAlignedCount})`);
  if (resolved.words) {
    console.log(`  resolveGenerationVocab (actual):   [${resolved.words.join(', ')}]`);
    console.log(`    alineación strict/expanded: ${sResolved.strict}/${sResolved.expanded} de ${sResolved.total}`);
  } else {
    console.log(`  resolveGenerationVocab ERROR: ${resolved.error}`);
  }
  if (Array.isArray(sanitized)) {
    console.log(`  resolveTargetWordsForArgs (final): [${sanitized.join(', ')}]`);
    console.log(`    alineación strict/expanded: ${sSan.strict}/${sSan.expanded} de ${sSan.total}`);
  }
  console.log('');
}
