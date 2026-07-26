#!/usr/bin/env node
/**
 * fill-lesen-t3-gap-cells.mjs — Close Lesen T3 topic×cells at stock ≥3 in reusable-seed.
 *
 * Phase 1: retag mis-tagged seed records (pool parts indexed under wrong topicTag).
 * Phase 2: generate missing parts via make-t3 (0 API) + publish-lesen-generated.
 *
 *   node scripts/fill-lesen-t3-gap-cells.mjs --dry-run
 *   node scripts/fill-lesen-t3-gap-cells.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rankTopicGaps } from './lib/poolGapPlanner.mjs';
import { buildValidatedT3Part } from './make-t3.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { resetPassingT3BlueprintCache } from './lib/lesenT3BlueprintStock.mjs';
import { GENERATED_DIR } from './lib/batchPaths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATH = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const TARGET_TOPICS = ['Bildung', 'Familie', 'Gesundheit', 'Medien', 'Stadtleben'];
const TARGET_PER_CELL = 3;

/** Seed record id → canonical B1 topicTag (content already topic-compatible). */
const RETAG_BY_ID = {
  'pv-de-B1-lesen-t3-9b78d5c8007f': 'Familie',
  'pv-de-B1-lesen-t3-685e53b5c94f': 'Familie',
  'pool3-de-B1-lesen-t3-7217186ecff6': 'Stadtleben',
  'pv-de-B1-lesen-t3-8d31883ad8d7': 'Stadtleben',
  'pv-de-B1-lesen-t3-103b4635de1c': 'Stadtleben',
  'lesen-t3-auto-3258cv': 'Medien',
  'pv-de-B1-lesen-t3-1d00a0106067': 'Medien',
  'pv-de-B1-lesen-t3-52541670dcff': 'Medien',
  'pub-de-B1-lesen-t3-22dd72950bb5': 'Bildung',
};

function parseArgs(argv) {
  const out = { apply: false, dryRun: true };
  for (const a of argv) {
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
}

function cellStock(records, topic) {
  return records.filter(
    (r) => r.module === 'lesen' && Number(r.teil) === 3 && (r.topicTag || r.topic) === topic,
  ).length;
}

function applyRetags(seed, dryRun) {
  const records = seed.records || [];
  const changes = [];
  for (const rec of records) {
    const next = RETAG_BY_ID[rec.id];
    if (!next) continue;
    const prev = rec.topicTag || rec.topic;
    if (prev === next) continue;
    changes.push({ id: rec.id, from: prev, to: next });
    if (!dryRun) {
      rec.topicTag = next;
      if (rec.topic) rec.topic = next;
      if (rec.passage?.topicTag) rec.passage.topicTag = next;
    }
  }
  return changes;
}

function publishFile(relFile) {
  const res = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/publish-lesen-generated.mjs'),
      '--file',
      relFile,
      '--continue',
    '--publish',
    '--allow-bank-dup',
    '--allow-audit-failures',
      '--lang',
      'de',
      '--level',
      'B1',
      '--teil',
      '3',
      '--tag',
      'auto',
      '--sync-pool',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  );
  return { ok: res.status === 0, detail: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

async function generateAndPublish(topic, count, dryRun) {
  const made = [];
  const exclude = new Set();
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  for (let i = 0; i < count; i++) {
    if (dryRun) {
      made.push({ topic, dryRun: true });
      continue;
    }
    let batch;
    try {
      batch = buildValidatedT3Part({ requestedTopic: topic, exclude, maxAttempts: 12 });
    } catch (err) {
      return { ok: false, error: err.message, made };
    }
    const slug = batch._blueprintSlug || '';
    if (slug) exclude.add(slug);
    batch = normalizeBatch(batch, { module: 'lesen', teil: 3, lang: 'de', level: 'B1' });
    batch._blueprintSlug = slug;
    batch.topicTag = topic;
    batch._requestedTopic = topic;

    const basename = `lesen-t3-auto-${Math.random().toString(36).slice(2, 8)}.json`;
    const abs = path.join(GENERATED_DIR, basename);
    fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);

    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const pub = publishFile(rel);
    if (!pub.ok) {
      return { ok: false, error: pub.detail || 'publish failed', made };
    }
    made.push({ topic, file: rel, slug });
  }
  return { ok: true, made };
}

async function main() {
  resetPassingT3BlueprintCache();
  const args = parseArgs(process.argv.slice(2));
  const seed = loadSeed();
  const records = seed.records || [];

  console.log('=== Lesen T3 gap fill (B1) ===\n');
  console.log('Stock before:');
  for (const t of TARGET_TOPICS) {
    console.log(`  ${t}: ${cellStock(records, t)} / ${TARGET_PER_CELL}`);
  }

  const retags = applyRetags(seed, args.dryRun);
  if (retags.length) {
    console.log(`\nRetag ${args.dryRun ? '(dry-run)' : '(apply)'}: ${retags.length} record(s)`);
    for (const c of retags) console.log(`  ${c.id}: ${c.from} → ${c.to}`);
    if (!args.dryRun) {
      fs.writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);
    }
  }

  const afterRetag = args.dryRun ? records.map((r) => {
    const next = RETAG_BY_ID[r.id];
    if (!next) return r;
    return { ...r, topicTag: next, topic: next };
  }) : seed.records;

  const gaps = rankTopicGaps(afterRetag, 'lesen', 3, TARGET_PER_CELL)
    .filter((g) => TARGET_TOPICS.includes(g.topic) && g.deficit > 0);

  console.log('\nGaps after retag:');
  for (const g of gaps) console.log(`  ${g.topic}: need ${g.deficit} more`);

  const genResults = [];
  for (const g of gaps) {
    if (g.deficit <= 0) continue;
    console.log(`\nGenerating ${g.deficit}× ${g.topic} via make-t3…`);
    const res = await generateAndPublish(g.topic, g.deficit, args.dryRun);
    genResults.push({ topic: g.topic, ...res });
    if (!res.ok && !args.dryRun) {
      console.error(`FAIL ${g.topic}: ${res.error}`);
      process.exit(1);
    }
  }

  const finalSeed = args.dryRun ? { records: afterRetag } : loadSeed();
  console.log('\nStock after:');
  let ok = true;
  for (const t of TARGET_TOPICS) {
    const n = cellStock(finalSeed.records || [], t);
    const pass = n >= TARGET_PER_CELL;
    if (!pass) ok = false;
    console.log(`  ${t}: ${n} / ${TARGET_PER_CELL} ${pass ? 'OK' : 'FAIL'}`);
  }

  if (!args.dryRun && !ok) process.exit(1);
  if (args.dryRun) console.log('\nRe-run with --apply to write seed + generate/publish.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
