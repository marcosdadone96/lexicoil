#!/usr/bin/env node
/**
 * audit-lesen-t3-blueprint-stock.mjs — Catálogo disponible por tema B1 (Lesen T3).
 *
 *   node scripts/audit-lesen-t3-blueprint-stock.mjs
 *   node scripts/audit-lesen-t3-blueprint-stock.mjs --topics Bildung,Familie --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listT3BlueprintStockForTopic, loadPassingT3Blueprints } from './lib/lesenT3BlueprintStock.mjs';
import { loadPoolVerifiedT3Index, T3_SHARED_MOLD_FAMILY } from './lib/t3PoolDedupGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TOPICS = [
  'Bildung',
  'Familie',
  'Gesundheit',
  'Medien',
  'Stadtleben',
  'Ernährung',
  'Kultur',
  'Reisen',
  'Umwelt',
  'Arbeit',
];

function parseArgs(argv) {
  const out = { topics: DEFAULT_TOPICS, json: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--topics') out.topics = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--json') out.json = true;
    else if (a === '--out') out.out = String(argv[++i] || '').trim();
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const poolIdx = loadPoolVerifiedT3Index({ reload: true, level: 'B1' });
  const report = {
    scannedAt: new Date().toISOString(),
    passingBlueprints: loadPassingT3Blueprints().length,
    poolVerifiedSlugs: Object.fromEntries(poolIdx.bySlug),
    sharedMoldFamilyInPool: poolIdx.familyFiles.map((r) => ({ file: r.file, slug: r.slug })),
    topics: {},
    generatable: [],
    blocked: [],
  };

  for (const topic of args.topics) {
    const stock = listT3BlueprintStockForTopic(topic, new Set());
    const row = {
      topic,
      preference: stock.preference,
      compatibleTotal: stock.compatibleTotal,
      availableTotal: stock.availableTotal,
      availableSlugs: stock.availableSlugs,
      compatibleSlugs: stock.rows.map((r) => r.slug),
      blocks: stock.rows
        .filter((r) => !r.available)
        .map((r) => ({
          slug: r.slug,
          detected: r.detected,
          reason: r.excluded ? 'session_exclude' : r.dedupBlock?.code || 'unknown',
          detail: r.dedupBlock?.detail || null,
        })),
      generatable: stock.generatable,
    };
    report.topics[topic] = row;
    if (stock.generatable) report.generatable.push(topic);
    else report.blocked.push(topic);
  }

  if (args.json) {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (args.out) {
      fs.mkdirSync(path.dirname(path.resolve(ROOT, args.out)), { recursive: true });
      fs.writeFileSync(path.resolve(ROOT, args.out), text);
      console.log(`Escrito ${args.out}`);
    } else {
      process.stdout.write(text);
    }
    return;
  }

  console.log(`Lesen T3 blueprint stock · ${report.passingBlueprints} esqueletos válidos · pool B1`);
  console.log(`Familia molde compartido (${T3_SHARED_MOLD_FAMILY.join(', ')}): ${report.sharedMoldFamilyInPool.length} en pool`);
  console.log('');
  console.log(`${'Tema'.padEnd(14)} ${'Compat'.padStart(6)} ${'Disp'.padStart(5)}  Disponibles / bloqueo`);
  for (const topic of args.topics) {
    const row = report.topics[topic];
    const avail = row.availableSlugs.join(', ') || '—';
    const status = row.generatable ? 'OK' : 'BLOQUEADO';
    console.log(
      `${topic.padEnd(14)} ${String(row.compatibleTotal).padStart(6)} ${String(row.availableTotal).padStart(5)}  ${status}: ${avail}`,
    );
    if (!row.generatable && row.blocks.length) {
      const sample = row.blocks.slice(0, 2).map((b) => `${b.slug}(${b.reason})`).join(', ');
      console.log(`${''.padEnd(14)} ${''.padStart(6)} ${''.padStart(5)}  → ${sample}${row.blocks.length > 2 ? '…' : ''}`);
    }
  }
  console.log('');
  console.log(`Generables hoy (${report.generatable.length}): ${report.generatable.join(', ') || '(ninguno)'}`);
  console.log(`Bloqueados (${report.blocked.length}): ${report.blocked.join(', ') || '(ninguno)'}`);

  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, args.out), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nJSON: ${args.out}`);
  }
}

main();
