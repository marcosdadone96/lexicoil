#!/usr/bin/env node
/**
 * Backfill pool-verified orphans → reusable-seed (+ Blobs when available).
 *   node scripts/backfill-orphan-pool-sync.mjs [--level B1|A2|B2] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';

const require = createRequire(import.meta.url);

function parseLevel(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--level') return String(argv[++i] || 'B1').toUpperCase();
  }
  return 'B1';
}

const level = parseLevel(process.argv.slice(2));
const dryRun = process.argv.includes('--dry-run');
const SEED_FILE = path.join(ROOT, `library/reusable-seed/de_${level}.json`);
const OUT = path.join(ROOT, `batches/ready/gate-logs/backfill-orphan-pool-sync-${level}.json`);

function loadLinkedPvFiles() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const linked = new Set();
  for (const r of seed.records || []) {
    const id = String(r.id || '');
    if (id) linked.add(`${id}.json`);
    const bundle = id.match(/^(schreiben|sprechen)-gemini-(\d+)-t\d+$/i);
    if (bundle) linked.add(`${bundle[1].toLowerCase()}-gemini-${bundle[2]}.json`);
    const sf = String(r.sourceFile || '').replace(/\\/g, '/');
    const m = sf.match(/pool-verified\/(?:B1|A2|B2\/)?([^/]+\.json)/i);
    if (m) linked.add(m[1]);
  }
  return linked;
}

function listLevelPoolVerified(level) {
  const dir = poolVerifiedDir(level);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

const linked = loadLinkedPvFiles();
const pvPaths = listLevelPoolVerified(level);
const orphans = pvPaths.filter((abs) => !linked.has(path.basename(abs)));

console.log(`pool-verified/${level}: ${pvPaths.length} | linked: ${linked.size} refs | orphans to sync: ${orphans.length}`);

const results = [];
let ok = 0;
let fail = 0;

for (const abs of orphans) {
  const file = path.basename(abs);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (dryRun) {
    results.push({ file, dryRun: true });
    ok++;
    continue;
  }
  const res = await syncPoolVerifiedBatch({
    file,
    batch,
    level,
    opts: { trigger: 'backfill-orphan', skipLock: false },
  });
  results.push({ file, ok: res.ok, duplicate: res.duplicate, results: res.results });
  if (res.ok) ok++;
  else fail++;
  process.stdout.write(res.ok ? '.' : 'x');
}

console.log(`\nDone: ${ok} ok, ${fail} fail${dryRun ? ' (dry-run)' : ''}`);

const summary = {
  at: new Date().toISOString(),
  dryRun,
  total: pvPaths.length,
  orphans: orphans.length,
  synced: ok,
  failed: fail,
  results,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Log: ${path.relative(ROOT, OUT)}`);
