#!/usr/bin/env node
/**
 * audit-lesen-t4-seed-stock.mjs — Stock de semillas T4 por tema B1 (preflight + pool).
 *
 *   node scripts/audit-lesen-t4-seed-stock.mjs
 *   node scripts/audit-lesen-t4-seed-stock.mjs --json
 */
import { B1_TOPICS } from './lib/b1Topics.mjs';
import { listT4SeedStockForTopic } from './lib/lesenT4SeedStock.mjs';

function parseArgs(argv) {
  const out = { json: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = {
    scannedAt: new Date().toISOString(),
    topics: {},
    generatable: [],
    blocked: [],
  };

  for (const topic of B1_TOPICS) {
    const stock = listT4SeedStockForTopic(topic);
    const row = {
      topic,
      totalSeeds: stock.totalSeeds,
      preflightOkCount: stock.preflightOkCount,
      freshCount: stock.freshCount,
      cellCount: stock.cellCount,
      pickTier: stock.pickTier,
      generatable: stock.generatable,
    };
    report.topics[topic] = row;
    if (stock.generatable) report.generatable.push(topic);
    else report.blocked.push(topic);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Lesen T4 seed stock · ${report.generatable.length}/${B1_TOPICS.length} temas generables (fresh)`);
  for (const topic of B1_TOPICS) {
    const r = report.topics[topic];
    const flag = r.generatable ? 'OK' : 'BLOCK';
    console.log(
      `  [${flag}] ${topic.padEnd(12)} seeds=${r.totalSeeds} preflight=${r.preflightOkCount} fresh=${r.freshCount} pick=${r.pickTier}`,
    );
  }
  if (report.blocked.length) {
    console.log(`\nBloqueados: ${report.blocked.join(', ')}`);
    process.exitCode = 1;
  }
}

main();
