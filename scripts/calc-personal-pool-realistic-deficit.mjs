#!/usr/bin/env node
/**
 * Realistic Personalizado pool deficit — Opción B launch criteria (6/celda Tier A),
 * NOT theoretical 30/60 single-topic ceiling.
 *
 * Assumptions (from personal-exam-pool-first-architecture.md §7.5):
 *   - 3–5 active Pro users/month
 *   - ~10 sessions/user/month (not full 30 quota)
 *   - 2–3 topics rotated (Lesen+Hören Track A)
 *   - Target: 6 clean parts per (topic × Teil) for Tier A themes
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
const LESEN_TEILS = [1, 2, 3, 4, 5];
const HOREN_TEILS = [1, 2, 3, 4];
const TARGET_PER_CELL = 6; // Option B full target
const LAUNCH_MIN = 3; // min viable (3–5 users, ~10 sess/user, 3 topics rotated)

const USERS = [3, 5];
const SESSIONS_PER_USER = 10;
const TOPICS_ROTATED = 3;

function cellStock(topic, mod, teil) {
  return summary.byTopic?.[topic]?.[mod]?.[teil] ?? 0;
}

const zeroCells = [];
const deficitCells = [];
const launchGaps = [];

for (const topic of TIER_A) {
  for (const teil of LESEN_TEILS) {
    const n = cellStock(topic, 'lesen', teil);
    if (n === 0) zeroCells.push({ topic, module: 'lesen', teil, stock: 0, need: 1 });
    else if (n < LAUNCH_MIN) launchGaps.push({ topic, module: 'lesen', teil, stock: n, need: LAUNCH_MIN - n });
    if (n > 0 && n < TARGET_PER_CELL) {
      deficitCells.push({ topic, module: 'lesen', teil, stock: n, need: TARGET_PER_CELL - n });
    }
  }
  for (const teil of HOREN_TEILS) {
    const n = cellStock(topic, 'horen', teil);
    if (n === 0) zeroCells.push({ topic, module: 'horen', teil, stock: 0, need: 1 });
    else if (n < LAUNCH_MIN) launchGaps.push({ topic, module: 'horen', teil, stock: n, need: LAUNCH_MIN - n });
    if (n > 0 && n < TARGET_PER_CELL) {
      deficitCells.push({ topic, module: 'horen', teil, stock: n, need: TARGET_PER_CELL - n });
    }
  }
}

const partsToFixZeros = zeroCells.length;
const partsToLaunchMin = launchGaps.reduce((s, c) => s + c.need, 0);
const totalRealisticParts = partsToFixZeros + partsToLaunchMin;
const totalPartsNeeded = [...zeroCells, ...deficitCells].reduce((s, c) => s + c.need, 0);
const zeroCount = zeroCells.length;

// Cost: ~$0.015/part Lesen+Hören blended (generation-cost + pool-fill history)
const COST_LOW = totalRealisticParts * 0.012;
const COST_HIGH = totalRealisticParts * 0.018;
const COST_FULL_LOW = totalPartsNeeded * 0.012;
const COST_FULL_HIGH = totalPartsNeeded * 0.018;

const report = {
  generatedAt: new Date().toISOString(),
  criteria: {
    targetPerCell: TARGET_PER_CELL,
    tierATopics: TIER_A.length,
    lesenCells: TIER_A.length * LESEN_TEILS.length,
    horenCells: TIER_A.length * HOREN_TEILS.length,
    userScenario: `${USERS[0]}-${USERS[1]} Pro users, ~${SESSIONS_PER_USER} sessions/user, ${TOPICS_ROTATED} topics rotated`,
    notUsing: '30/60 single-topic theoretical ceiling',
  },
  zeroCells: zeroCells.sort((a, b) => `${a.module}${a.teil}`.localeCompare(`${b.module}${b.teil}`)),
  zeroCellCount: zeroCount,
  partsToFixZeros,
  launchMinPerCell: LAUNCH_MIN,
  cellsBelowLaunchMin: launchGaps.length,
  partsToReachLaunchMin: partsToLaunchMin,
  totalRealisticParts,
  realisticCostUsd: {
    low: +COST_LOW.toFixed(2),
    high: +COST_HIGH.toFixed(2),
    perPart: '0.012–0.018',
  },
  deficitCellCount: deficitCells.length,
  totalPartsToFullOptionB6: totalPartsNeeded,
  fullOptionBCostUsd: { low: +COST_FULL_LOW.toFixed(2), high: +COST_FULL_HIGH.toFixed(2) },
  priorityZero: zeroCells.slice(0, 15),
};

const out = path.join(ROOT, 'batches/ready/gate-logs/personal-pool-realistic-deficit.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
