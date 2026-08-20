#!/usr/bin/env node
/**
 * Smoke: Textos picks must never return official-reserved partIds (B1 Lesen).
 *
 *   node scripts/smoke-textos-pick-b1.mjs
 *   POOL_ALLOW_LOCAL_SEED=1 node scripts/smoke-textos-pick-b1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';

process.env.POOL_ALLOW_LOCAL_SEED = '1';

const require = createRequire(import.meta.url);
const { pickTextosReading } = require(path.join(ROOT, 'netlify/functions/lib/textosPick.js'));
const {
  loadOfficialReservedIndex,
  reservedPartIdSet,
} = require(path.join(ROOT, 'netlify/functions/lib/officialReservedIndex.js'));
const { clearAllPoolCaches } = require(path.join(
  ROOT,
  'netlify/functions/lib/poolSearchCache.js',
));
const { B1_TOPICS } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const index = loadOfficialReservedIndex({ lang: 'de', level: 'B1', root: ROOT, refresh: true });
if (!index) {
  console.error('FAIL: official index missing — run node scripts/build-official-reserved-index.mjs');
  process.exit(1);
}

const reserved = reservedPartIdSet(index);
const violations = [];
const picks = [];
const topics = [...B1_TOPICS].slice(0, 12);

clearAllPoolCaches();

for (const topicTag of topics) {
  for (const teil of [1, 2, 3, 4, 5]) {
    const result = await pickTextosReading(null, {
      lang: 'de',
      level: 'B1',
      module: 'lesen',
      topicTag,
      teil,
    });
    if (result.status !== 200) continue;
    const { id, reading } = result.body;
    if (reserved.has(id)) {
      violations.push({ topicTag, teil, id });
    }
    if (JSON.stringify(result.body).match(/"questions"|"correct"|"explanation"/)) {
      violations.push({ topicTag, teil, id, leak: 'answer_fields' });
    }
    if (!reading?.passageText) {
      violations.push({ topicTag, teil, id, leak: 'empty_passage' });
    }
    picks.push({ topicTag, teil, id, wordCount: reading.wordCount });
  }
}

const out = {
  script: 'smoke-textos-pick-b1.mjs',
  at: new Date().toISOString(),
  liveExamCount: index.liveExamCount,
  reservedPartCount: reserved.size,
  topicsTried: topics.length,
  successfulPicks: picks.length,
  violations,
  samplePicks: picks.slice(0, 8),
  ok: violations.length === 0 && picks.length > 0,
};

const outPath = path.join(
  ROOT,
  'batches/ready/gate-logs',
  `smoke-textos-pick-b1-${new Date().toISOString().slice(0, 10)}.json`,
);
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

console.log(JSON.stringify(out, null, 2));

if (!out.ok) {
  console.error('\nSMOKE FAILED');
  process.exit(1);
}

console.log(`\nSMOKE OK — gate log: ${path.relative(ROOT, outPath)}`);
