#!/usr/bin/env node
/**
 * Monte Carlo-ish sample: planPersonalModuleAssembly against local seed (dev).
 * Run: node scripts/simulate-personal-module-vocab-plan.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeMockStore() {
  const blobs = new Map();
  return {
    async setJSON(key, value) {
      blobs.set(key, JSON.parse(JSON.stringify(value)));
      return { modified: true };
    },
    async get(key, opts = {}) {
      const v = blobs.get(key) ?? null;
      if (opts.type === 'json' && v != null && typeof v !== 'object') return JSON.parse(v);
      return v;
    },
    async getWithMetadata(key, opts = {}) {
      const data = await this.get(key, opts);
      if (data == null) return null;
      return { data, etag: 'e1' };
    },
    async delete() {},
  };
}

const sharedStore = makeMockStore();
require.cache[path.join(ROOT, 'netlify/functions/lib/blobStore.js')] = {
  id: 'blob',
  filename: 'blob',
  loaded: true,
  exports: { getStoreForEvent: () => sharedStore, STORE_NAME: 'test' },
};

const { planPersonalModuleAssembly } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));
const { addReusablePart } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));

async function seedMinimalLesen() {
  const words = ['fitness', 'training', 'sport', 'gesund', 'arzt'];
  for (let teil = 1; teil <= 5; teil++) {
    for (let i = 0; i < 3; i++) {
      const w = words[(teil + i) % words.length];
      await addReusablePart(sharedStore, {
        lang: 'de',
        level: 'B1',
        module: 'lesen',
        teil,
        topicTag: 'Gesundheit',
        part: {
          teil,
          topicTag: 'Gesundheit',
          instruction: 'Test',
          text: `Text über ${w} und Gesundheit.`,
          questions: [{ question: `Frage zu ${w}?`, options: ['A', 'B', 'C'], correct: 0 }],
          vocabKeys: [w, 'gesundheit'],
        },
        verified: true,
        complete: true,
      });
    }
  }
}

async function main() {
  await seedMinimalLesen();
  const plan = await planPersonalModuleAssembly(sharedStore, 'de', 'B1', 'lesen', {
    words: ['fitness', 'training', 'sport'],
    topicTag: 'Gesundheit',
    excludeIds: [],
    assembleMode: 'practice',
    blueprint: null,
  });
  console.log(JSON.stringify({ ok: plan.ok, coveredCount: plan.coveredCount, picks: plan.picks?.length, reason: plan.reason }, null, 2));
  if (!plan.ok) process.exit(1);
  if (plan.coveredCount < 3) process.exit(1);
  console.log('simulate-personal-module-vocab-plan: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
