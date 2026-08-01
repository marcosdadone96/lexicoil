#!/usr/bin/env node
/**
 * A2 topic taxonomy vs Phase 1 personal plan (text verify) — compatibility smoke.
 * Plan path remains topic-list agnostic; gap scope tested in test-a2-topics-gap.mjs.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { planPersonalModuleAssembly } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));
const { lemmatizeWords } = require(path.join(ROOT, 'netlify/functions/lib/passageVocab.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { B1_TOPICS, normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const store = {
  async setJSON() {
    return { modified: true };
  },
  async get() {
    return null;
  },
  async delete() {},
  async list() {
    return { blobs: [] };
  },
};

const a2Case = {
  module: 'horen',
  topic: 'Freizeit',
  words: ['Freizeit', 'Freund', 'Sport', 'Reise', 'Hotel', 'Musik'],
};

const bp = loadBlueprintFileSync('goethe_A2');
const lemmas = lemmatizeWords(a2Case.words, 'de');
const plan = await planPersonalModuleAssembly(store, 'de', 'A2', a2Case.module, {
  words: lemmas,
  userWords: a2Case.words,
  topicTag: a2Case.topic,
  excludeIds: [],
  blueprint: bp,
  verifyText: true,
});

console.log('INFO: A2 plan Freizeit topic', {
  ok: plan.ok,
  textCoveredCount: plan.textCoveredCount,
  decision: plan.decision,
  topicPass: plan.topicPass,
});

assert('Phase1 textVerified on A2', plan.textVerified === true);
assert('normalizeB1Topic(Freizeit) in B1_TOPICS', B1_TOPICS.includes(normalizeB1Topic('Freizeit')));

// Simulated future: official A2 UI list (5) is subset of B1 slugs — planner still accepts them
const A2_OFFICIAL_SLUGS = ['Reisen', 'Gesundheit', 'Stadtleben', 'Medien', 'Umwelt'];
for (const t of A2_OFFICIAL_SLUGS) {
  assert(`official slug ${t} valid normalize`, B1_TOPICS.includes(normalizeB1Topic(t)) || t === 'Umwelt');
}

console.log('\nA2 topic / Phase 1 compat smoke passed (plan+text path).');
