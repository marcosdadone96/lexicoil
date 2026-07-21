#!/usr/bin/env node
/**
 * Lesen T5 success rate by B1 topic from generation-cost.jsonl.
 *   node scripts/analyze-t5-topic-success.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { readGenerationCostLog, GENERATION_COST_LOG } from './lib/generationCostLog.mjs';

const require = createRequire(import.meta.url);
const { B1_TOPICS } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const entries = readGenerationCostLog(GENERATION_COST_LOG).filter(
  (e) => e.module === 'lesen' && Number(e.teil) === 5,
);

const byTopic = Object.fromEntries(B1_TOPICS.map((t) => [t, { ok: 0, fail: 0, calls: 0 }]));
for (const e of entries) {
  const t = e.topic || 'unknown';
  if (!byTopic[t]) byTopic[t] = { ok: 0, fail: 0, calls: 0 };
  byTopic[t].calls += 1;
  if (e.ok) byTopic[t].ok += 1;
  else byTopic[t].fail += 1;
}

const rows = Object.entries(byTopic)
  .map(([topic, v]) => ({
    topic,
    ...v,
    rate: v.calls ? v.ok / v.calls : null,
  }))
  .filter((r) => r.calls > 0)
  .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));

console.log('Lesen T5 éxito por tema (generation-cost.jsonl)\n');
console.log('topic        |  ok | fail | calls |  rate');
console.log('-------------|-----|------|-------|------');
for (const r of rows) {
  const rate = r.rate == null ? '  n/a' : `${(r.rate * 100).toFixed(1).padStart(5)}%`;
  console.log(
    `${r.topic.padEnd(12)} | ${String(r.ok).padStart(3)} | ${String(r.fail).padStart(4)} | ${String(r.calls).padStart(5)} | ${rate}`,
  );
}

const totalOk = entries.filter((e) => e.ok).length;
console.log(`\nTOTAL: ${totalOk}/${entries.length} (${((100 * totalOk) / entries.length).toFixed(1)}%)`);

const treatment = rows.filter((r) => r.calls >= 5 && (r.rate ?? 1) < 0.15);
console.log('\nCandidatos tratamiento especial (rate<15%, calls≥5):');
if (!treatment.length) console.log('  (ninguno aparte de muestras pequeñas)');
for (const r of treatment) {
  console.log(`  · ${r.topic}: ${(r.rate * 100).toFixed(1)}% (${r.ok}/${r.calls})`);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  /* noop */
}
