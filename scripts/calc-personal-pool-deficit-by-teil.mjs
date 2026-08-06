#!/usr/bin/env node
/**
 * Lesen/Hören B1 deficit by topic×Teil — Opción B launch min 3/cell.
 * Run after: node scripts/build-pool-stock-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const summary = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/pool-stock/de_B1-summary.json'), 'utf8'),
);
const TIER_A = [
  'Umwelt', 'Gesundheit', 'Reisen', 'Arbeit', 'Wohnen', 'Medien',
  'Verkehr', 'Stadtleben', 'Ernährung', 'Freizeit', 'Sport', 'Kultur',
  'Familie', 'Konsum', 'Technik', 'Bildung',
];
const LAUNCH_MIN = 3;

function cellStock(topic, mod, teil) {
  return summary.byTopic?.[topic]?.[mod]?.[String(teil)] ?? 0;
}

const zeroCells = [];
const belowLaunchMin = [];

for (const topic of TIER_A) {
  for (const mod of ['lesen', 'horen']) {
    const teils = mod === 'lesen' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
    for (const teil of teils) {
      const stock = cellStock(topic, mod, teil);
      if (stock === 0) {
        zeroCells.push({ topic, module: mod, teil, stock: 0, need: LAUNCH_MIN });
      } else if (stock < LAUNCH_MIN) {
        belowLaunchMin.push({ topic, module: mod, teil, stock, need: LAUNCH_MIN - stock });
      }
    }
  }
}

function aggregateByTeil(mod, rows) {
  const teils = mod === 'lesen' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
  const out = {};
  for (const teil of teils) {
    const z = zeroCells.filter((r) => r.module === mod && r.teil === teil);
    const b = belowLaunchMin.filter((r) => r.module === mod && r.teil === teil);
    out[`T${teil}`] = {
      zeroCells: z.length,
      belowMinCells: b.length,
      partsNeeded: z.reduce((s, r) => s + r.need, 0) + b.reduce((s, r) => s + r.need, 0),
      cellsAtOrAboveMin:
        TIER_A.length - z.length - b.length,
    };
  }
  return out;
}

function moduleTotals(mod) {
  const z = zeroCells.filter((r) => r.module === mod);
  const b = belowLaunchMin.filter((r) => r.module === mod);
  return {
    zeroCells: z.length,
    belowMinCells: b.length,
    partsNeeded: z.reduce((s, r) => s + r.need, 0) + b.reduce((s, r) => s + r.need, 0),
    cellsTotal: mod === 'lesen' ? TIER_A.length * 5 : TIER_A.length * 4,
    cellsAtOrAboveMin:
      (mod === 'lesen' ? TIER_A.length * 5 : TIER_A.length * 4) - z.length - b.length,
  };
}

const PRIOR_AUDIT = [
  ['Bildung', 'lesen', 1],
  ['Bildung', 'lesen', 4],
  ['Kultur', 'lesen', 2],
  ['Verkehr', 'lesen', 3],
].map(([topic, module, teil]) => {
  const stock = cellStock(topic, module, teil);
  let status = 'STILL_ZERO';
  if (stock >= LAUNCH_MIN) status = `OK (${stock}≥3)`;
  else if (stock > 0) status = `PARTIAL (${stock}/3)`;
  return { topic, module, teil, stock, status };
});

const lesen = moduleTotals('lesen');
const horen = moduleTotals('horen');
const totalParts = lesen.partsNeeded + horen.partsNeeded;

const report = {
  generatedAt: new Date().toISOString(),
  summaryGeneratedAt: summary.generatedAt,
  seedGate: 'verified + sem1VerifiedAt (reusable-seed/de_B1.json)',
  criteria: {
    launchMinPerCell: LAUNCH_MIN,
    tierATopics: TIER_A.length,
    scenario: '3–5 Pro users, ~10 sessions/user/month, 3–4 topics rotated',
    lesenCells: TIER_A.length * 5,
    horenCells: TIER_A.length * 4,
  },
  stockTotals: {
    lesen: summary.modules?.lesen,
    horen: summary.modules?.horen,
  },
  deficit: {
    zeroCells: zeroCells.length,
    belowLaunchMinCells: belowLaunchMin.length,
    totalPartsToLaunchMin: totalParts,
    lesen,
    horen,
  },
  byTeil: {
    lesen: aggregateByTeil('lesen'),
    horen: aggregateByTeil('horen'),
  },
  priorAuditCells: PRIOR_AUDIT,
  zeroCells,
  belowLaunchMin: belowLaunchMin.sort(
    (a, b) => a.stock - b.stock || `${a.module}${a.teil}`.localeCompare(`${b.module}${b.teil}`),
  ),
};

const out = path.join(ROOT, 'batches/ready/gate-logs/personal-pool-realistic-deficit-2026-07-23.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
