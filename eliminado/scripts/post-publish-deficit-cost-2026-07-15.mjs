#!/usr/bin/env node
/**
 * Post-publish deficit + generation cost estimate (no generation).
 * Run after publish + prelaunch-verify.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRELAUNCH = path.join(ROOT, 'batches/ready/gate-logs/prelaunch-verify-2026-07-15.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/post-publish-deficit-2026-07-15.json');

const COST_PER_OK = 0.1508; // pair-pool-viability-2026-07-13.json
const CALLS_PER_OK = 6; // 3 attempts × 2 modules avg for lesen/horen parts

const TARGETS = {
  free: { lesen: 13, horen: 13, schreiben: 5, sprechen: 5 },
  pro: { lesen: 42, horen: 42, schreiben: 12, sprechen: 12 },
  pro_max: { lesen: 72, horen: 72, schreiben: 12, sprechen: 12 },
};

const TEILE = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
  schreiben: [1, 2, 3],
  sprechen: [1, 2, 3],
};

function deficitForPlan(stock, planKey) {
  const plan = TARGETS[planKey];
  const byTeil = {};
  let totalDeficit = 0;
  let partsToGenerate = 0;

  for (const [mod, teile] of Object.entries(TEILE)) {
    byTeil[mod] = {};
    const target = plan[mod];
    for (const t of teile) {
      const have = stock[mod]?.[t] || 0;
      const need = target;
      const deficit = Math.max(0, need - have);
      byTeil[mod][t] = { have, need, deficit };
      if (deficit > 0) {
        totalDeficit += deficit;
        if (mod === 'lesen' || mod === 'horen') partsToGenerate += deficit;
      }
    }
  }

  return { byTeil, totalDeficit, partsToGenerate };
}

function main() {
  const pre = JSON.parse(fs.readFileSync(PRELAUNCH, 'utf8'));
  const stock = pre.stock.seedPractice;
  const sim = pre.simulation;

  const deficits = {};
  for (const plan of Object.keys(TARGETS)) {
    deficits[plan] = deficitForPlan(stock, plan);
  }

  // Binding plan = max deficit across all 3 plans per Teil
  const binding = {};
  for (const [mod, teile] of Object.entries(TEILE)) {
    binding[mod] = {};
    for (const t of teile) {
      const have = stock[mod]?.[t] || 0;
      const need = Math.max(
        TARGETS.free[mod],
        TARGETS.pro[mod],
        TARGETS.pro_max[mod],
      );
      const deficit = Math.max(0, need - have);
      binding[mod][t] = { have, need, deficit };
    }
  }

  const partsToGenerate = Object.entries(binding).reduce((sum, [mod, teils]) => {
    if (mod !== 'lesen' && mod !== 'horen') return sum;
    return sum + Object.values(teils).reduce((s, c) => s + c.deficit, 0);
  }, 0);

  const costUsd = partsToGenerate * COST_PER_OK;
  const costWithRetries = partsToGenerate * CALLS_PER_OK * (COST_PER_OK / 2);

  const report = {
    generatedAt: new Date().toISOString(),
    stockSource: 'prelaunch-verify seedPractice',
    stock,
    simulationAfterPublish: sim,
    targets: TARGETS,
    deficitByPlan: deficits,
    bindingDeficit: binding,
    priority: {
      horen_t3: binding.horen?.[3],
      bottlenecks: Object.entries(binding)
        .flatMap(([mod, teils]) =>
          Object.entries(teils)
            .filter(([, v]) => v.deficit > 0)
            .map(([t, v]) => ({ cell: `${mod}_t${t}`, ...v })),
        )
        .sort((a, b) => b.deficit - a.deficit),
    },
    generationEstimate: {
      partsToGenerateLesenHoren: partsToGenerate,
      costPerOkUsd: COST_PER_OK,
      estimatedCostUsd: Number(costUsd.toFixed(2)),
      estimatedCostWithRetriesUsd: Number(costWithRetries.toFixed(2)),
      note: 'Solo Lesen/Hören; Schreiben/Sprechen ya cubren los 3 planes.',
    },
  };

  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main();
