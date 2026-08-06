#!/usr/bin/env node
/**
 * Close A2 P0: pipeline test + seed + assemble + auto-publish + Hören T2 diversity.
 *   node scripts/run-a2-p0-close.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizePoolReady } from './lib/finalizePoolReady.mjs';
import { maybeAutoPublishExams } from './lib/autoPublishExamsLib.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYNC_LOG = path.join(ROOT, 'batches/ready/gate-logs/auto-sync-personal-pool.jsonl');

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 1;
}

function countSyncLogFor(file) {
  if (!fs.existsSync(SYNC_LOG)) return 0;
  const lines = fs.readFileSync(SYNC_LOG, 'utf8').trim().split('\n').filter(Boolean);
  return lines.filter((l) => l.includes(file) && l.includes('"ok":true')).length;
}

async function main() {
  console.log('\n=== P0-3 Hören T2 diversity ===');
  if (runNode('scripts/repair-horen-a2-t2-diversity.mjs', ['--apply']) !== 0) {
    process.exit(1);
  }

  console.log('\n=== P0-1 First batch → pool-verified/A2 ===');
  const genFile = 'horen-t2-gemini-040.json';
  const genPath = path.join(ROOT, 'batches/generated/A2', genFile);
  if (!fs.existsSync(genPath)) {
    console.error(`Missing ${genPath}`);
    process.exit(1);
  }
  const batch = JSON.parse(fs.readFileSync(genPath, 'utf8'));
  batch.level = 'A2';
  const beforeSync = countSyncLogFor(genFile);
  const promo = await finalizePoolReady(genPath, batch, {
    level: 'A2',
    skipMetadata: true,
  });
  console.log('finalizePoolReady:', promo.verdict, promo.poolPath || promo.reasons?.slice(0, 2));
  if (promo.verdict !== 'READY') {
    console.error('Batch did not reach READY — aborting');
    process.exit(1);
  }
  const pvPath = path.join(poolVerifiedDir('A2'), genFile);
  console.log('pool-verified exists:', fs.existsSync(pvPath));
  await new Promise((r) => setTimeout(r, 1500));
  const afterSync = countSyncLogFor(genFile);
  console.log(`auto-sync log entries for ${genFile}: ${afterSync - beforeSync} new (total ok refs: ${afterSync})`);

  console.log('\n=== Seed curated → pool-verified/A2 (assembly stock) ===');
  if (runNode('scripts/seed-a2-pool-verified-from-curated.mjs', ['--apply']) !== 0) {
    process.exit(1);
  }
  const pvCount = fs.readdirSync(poolVerifiedDir('A2')).filter((f) => f.endsWith('.json')).length;
  console.log(`pool-verified/A2 total files: ${pvCount}`);

  console.log('\n=== P0-2 Assemble + auto-publish A2 ===');
  if (runNode('scripts/assemble-from-pool-verified.mjs', ['--level', 'A2', '--max', '1']) !== 0) {
    console.warn('Assemble failed — check stock');
  }
  const pub = await maybeAutoPublishExams({
    lang: 'de',
    level: 'A2',
    trigger: 'run-a2-p0-close',
    skipAssemble: true,
  });
  console.log('auto-publish:', JSON.stringify(pub, null, 2));

  const catPath = path.join(ROOT, 'library/published-exams/de/A2/_catalog.json');
  console.log('published catalog exists:', fs.existsSync(catPath));
  if (fs.existsSync(catPath)) {
    const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    console.log('live exams:', (cat.exams || []).filter((e) => e.status === 'live').map((e) => e.examId));
  }

  console.log('\n=== Hören T2 unique check ===');
  runNode('-e', [
    "const b=require('./library/de/A2/questions.json');",
    "const p=b.passages.filter(x=>x.module==='horen'&&x.teil===2);",
    "console.log('unique', new Set(p.map(x=>x.text)).size, '/', p.length);",
  ].join(' '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
