#!/usr/bin/env node
/**
 * Integration — planPersonalModuleAssembly with textVerified (Phase 1).
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

async function runLevel(level, caseRow) {
  const bp = loadBlueprintFileSync(`goethe_${level}`);
  const lemmas = lemmatizeWords(caseRow.words, 'de');
  const plan = await planPersonalModuleAssembly(store, 'de', level, caseRow.module, {
    words: lemmas,
    userWords: caseRow.words,
    topicTag: caseRow.topic,
    excludeIds: [],
    blueprint: bp,
    verifyText: true,
  });
  console.log(
    `INFO [${level} ${caseRow.id}]: index=${plan.coveredCount} text=${plan.textCoveredCount} decision=${plan.decision} ok=${plan.ok}`,
  );
  assert(`${level} ${caseRow.id} textVerified flag`, plan.textVerified === true);
  assert(`${level} ${caseRow.id} decision string`, typeof plan.decision === 'string');
  if (level === 'B1' && caseRow.id === 'M15') {
    assert('B1 M15 textMeetsMin', plan.textMeetsMin === true);
    assert('B1 M15 serve_now', plan.decision === 'serve_now');
  }
}

const m15 = {
  id: 'M15',
  module: 'horen',
  topic: 'Bildung',
  words: ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'],
};

await runLevel('B1', m15);

const a2Case = {
  id: 'A2-SMOKE',
  module: 'horen',
  topic: 'Freizeit',
  words: ['Freizeit', 'Freund', 'Sport', 'Reise', 'Hotel', 'Musik'],
};
await runLevel('A2', a2Case);

console.log('\nAll personal-module textVerified integration tests passed.');
