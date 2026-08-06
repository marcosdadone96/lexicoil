/**
 * scan-exclusion-scope-gap.mjs — Audit mold/premise exclusion scope vs bank (Part 2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { resolveT4GenerationMolds, resolveT5GenerationMolds } from './lib/lesenSubtypeRotation.mjs';
import { loadGlobalT5BlocklistEntries } from './lib/lesenT5BankBlocklist.mjs';
import { scanHorenPremises } from './lib/horenPremiseDedup.mjs';

const LESEN_TEILE = [
  { teil: 1, moldSystem: false, format: 'open article', regurgRisk: 'low' },
  { teil: 2, moldSystem: false, format: 'dual passage MCQ', regurgRisk: 'low-medium' },
  { teil: 3, moldSystem: 'names-only', format: 'matching ads (rigid)', regurgRisk: 'medium' },
  { teil: 4, moldSystem: 'cell-pool-only', format: 'debate forum (22 seeds)', regurgRisk: 'medium-high' },
  { teil: 5, moldSystem: 'cell-pool+bank (fixed)', format: 'normative Regelwerk (7 subtypes)', regurgRisk: 'high' },
];

const HOREN = [
  { teil: 1, system: 'premise-dedup pool dirs only', bank: false, regurgRisk: 'medium' },
  { teil: 2, system: 'premise-dedup + openings bank', bank: false, regurgRisk: 'medium-high' },
  { teil: 3, system: 'openings bank only', bank: false, regurgRisk: 'low-medium' },
  { teil: 4, system: 'openings bank only', bank: false, regurgRisk: 'low-medium' },
];

const OTHER = [
  { module: 'schreiben', system: 'T3 premise dedup pool only', bank: false, regurgRisk: 'low-medium' },
  { module: 'sprechen', system: 'no mold exclusion', bank: false, regurgRisk: 'low' },
];

function countBankLesenPassages(teil) {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'));
  return (bank.passages || []).filter((p) => {
    if (String(p.module || '').toLowerCase() !== 'lesen') return false;
    if (Number(teil) === 5) return String(p.id || '').startsWith('gen-l5-');
    const qs = (bank.questions || []).filter((q) => q.passageId === p.id && Number(q.teil) === teil);
    return qs.length > 0 || Number(p.teil) === teil;
  }).length;
}

console.log('══ Exclusion scope gap audit (de B1) ══\n');

console.log('Lesen:');
for (const row of LESEN_TEILE) {
  const bankCount = countBankLesenPassages(row.teil);
  let gap = 'no mold exclusion — POOL-2 Q1a only';
  if (row.moldSystem === 'cell-pool-only') gap = 'exclude molds: pool-verified cell ONLY (no bank)';
  if (row.moldSystem === 'cell-pool+bank (fixed)') gap = 'exclude molds: pool cell + global bank blocklist (FIXED)';
  if (row.moldSystem === 'names-only') gap = 'T3 name rotation; no passage blocklist';
  console.log(
    `  T${row.teil}: ${gap} | bank passages ~${bankCount} | format=${row.format} | regurg=${row.regurgRisk}`,
  );
}

const t4m = resolveT4GenerationMolds({ topicTag: 'Kultur' });
console.log(`  T4 sample: excludeSeeds=${t4m.excludeMolds.subtypes.length} (cell only), bank not in prompt`);

const t5m = resolveT5GenerationMolds({ topicTag: 'Familie' });
console.log(
  `  T5 sample: publishedBlocklist=${t5m.excludeMolds.publishedPassages.length}, institution=${t5m.institutionSeed.institutionName}`,
);

console.log('\nHören:');
for (const row of HOREN) {
  const scan = scanHorenPremises(row.teil);
  const scenarios = [...scan.byScenario.keys()].filter((k) => !k.startsWith('free:')).length;
  console.log(
    `  T${row.teil}: ${row.system} | bank in dedup=${row.bank} | pool scenarios=${scenarios} | regurg=${row.regurgRisk}`,
  );
}

console.log('\nSchreiben / Sprechen:');
for (const row of OTHER) {
  console.log(`  ${row.module}: ${row.system} | regurg=${row.regurgRisk}`);
}

console.log(`\nT5 global blocklist entries: ${loadGlobalT5BlocklistEntries({ lang: 'de', level: 'B1' }).length}`);
