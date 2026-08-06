#!/usr/bin/env node
/**
 * Diagnose Lesen T5 failure causes by topic — compare vs Konsum retail×Regeltext pattern.
 *   node scripts/analyze-t5-topic-failure-causes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { readGenerationCostLog, GENERATION_COST_LOG } from './lib/generationCostLog.mjs';

const OUT = path.join(ROOT, 'batches/ready/gate-logs/t5-topic-failure-causes.json');

/** Topics with <15% success — candidate for Konsum-like treatment. */
const CANDIDATES = ['Konsum', 'Verkehr', 'Reisen', 'Stadtleben', 'Ernährung'];

function classifyReason(reason = '') {
  const r = String(reason).toLowerCase();
  if (/vocab|integrado|palabras no usadas|marke|supermarkt|retail/.test(r)) return 'vocab_integration';
  if (/sesgo de longitud|length bias|longitud mcq/.test(r)) return 'length_bias';
  if (/topic|tema|encaja|compatible|filter|ernährung|konsum/.test(r) && /subtype|subtipo|t5/.test(r)) {
    return 'topic_subtype_mismatch';
  }
  if (/chk-29|molde|mold|título idéntico/.test(r)) return 'structural_mold';
  if (/audit|chk-|explanation|capital|sustantivo/.test(r)) return 'audit2_quality';
  return 'other';
}

const entries = readGenerationCostLog(GENERATION_COST_LOG).filter(
  (e) => e.module === 'lesen' && Number(e.teil) === 5 && CANDIDATES.includes(e.topic),
);

const report = {
  generatedAt: new Date().toISOString(),
  candidates: {},
  konsumLikeTreatment: ['Konsum'],
  notSameCause: [],
};

for (const topic of CANDIDATES) {
  const rows = entries.filter((e) => e.topic === topic);
  const ok = rows.filter((e) => e.ok).length;
  const fail = rows.length - ok;
  const causes = {};
  for (const e of rows.filter((x) => !x.ok)) {
    const c = classifyReason(e.failReason);
    causes[c] = (causes[c] || 0) + 1;
  }
  const dominant = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
  const sameAsKonsum =
    topic === 'Konsum' ||
    (causes.vocab_integration >= 5 && causes.topic_subtype_mismatch >= 3);
  report.candidates[topic] = {
    ok,
    fail,
    rate: rows.length ? ok / rows.length : null,
    causes,
    dominantCause: dominant,
    sameCauseAsKonsum: sameAsKonsum,
    recommendedTreatment: sameAsKonsum ? 'forced_subtype_vocab_package' : 'none_konsum_package',
  };
  if (!sameAsKonsum && topic !== 'Konsum') report.notSameCause.push(topic);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log('T5 failure cause diagnosis:\n');
for (const [topic, v] of Object.entries(report.candidates)) {
  console.log(
    `${topic.padEnd(12)} rate=${((v.rate || 0) * 100).toFixed(1)}% dominant=${v.dominantCause} sameAsKonsum=${v.sameCauseAsKonsum}`,
  );
}
console.log(`\nKonsum package applies to: ${report.konsumLikeTreatment.join(', ')}`);
console.log(`Not same cause (no package): ${report.notSameCause.join(', ')}`);
console.log(`Wrote ${path.relative(ROOT, OUT)}`);

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  /* ran */
}
