#!/usr/bin/env node
/**
 * Estimate P(module plan >=3 lemmas) from reusable-seed vocabKeys (Monte Carlo).
 * Run: node scripts/simulate-personal-module-vocab-coverage.mjs [--trials=200] [--deck=55]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { planPersonalModuleAssembly } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));
const { vocabKeysFromPart } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));

function makeMockStore(records) {
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
    _records: records,
  };
}

function loadB1Records() {
  const p = path.join(ROOT, 'library/reusable-seed/de_B1.json');
  const data = JSON.parse(require('node:fs').readFileSync(p, 'utf8'));
  return (data.records || []).filter(
    (r) =>
      r.verified &&
      r.complete !== false &&
      (r.sem1VerifiedAt || r.sem1Skipped) &&
      String(r.module).toLowerCase() === 'lesen',
  );
}

function pickRandomLemmaSet(records, n) {
  const pool = new Set();
  for (const r of records) {
    for (const k of vocabKeysFromPart(r.part || r)) pool.add(k);
  }
  const arr = [...pool];
  const out = [];
  while (out.length < n && arr.length) {
    const i = crypto.randomInt(0, arr.length);
    out.push(arr[i]);
  }
  return out;
}

const args = process.argv.slice(2);
const trials = Number(args.find((a) => a.startsWith('--trials='))?.split('=')[1] || 150);
const deckSize = Number(args.find((a) => a.startsWith('--deck='))?.split('=')[1] || 55);
const topic = 'Gesundheit';

async function main() {
  const records = loadB1Records();
  if (!records.length) {
    console.error('No lesen B1 records in seed');
    process.exit(1);
  }
  const store = makeMockStore(records);
  const { addReusablePart } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
  for (const r of records.slice(0, 400)) {
    await addReusablePart(store, r);
  }

  let ok = 0;
  for (let t = 0; t < trials; t++) {
    const words = pickRandomLemmaSet(records, Math.min(deckSize, 12));
    const plan = await planPersonalModuleAssembly(store, 'de', 'B1', 'lesen', {
      words,
      topicTag: topic,
      excludeIds: [],
    });
    if (plan.ok && plan.coveredCount >= 3) ok++;
  }
  const rate = ok / trials;
  console.log(
    JSON.stringify(
      {
        module: 'lesen',
        level: 'B1',
        topic,
        deckSize,
        trials,
        successRate: +rate.toFixed(3),
        thresholdNote: 'Target ~0.70 for launch QA (deck 55); depends on seed stock',
      },
      null,
      2,
    ),
  );
  if (rate < 0.35) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
