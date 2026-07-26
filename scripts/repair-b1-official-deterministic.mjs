#!/usr/bin/env node
/**
 * Deterministic audit fixes on B1 official-catalog parts (14 exams).
 * CHK-14 caps, CHK-13/19 MCQ balance, intra-file normalize — $0 LLM.
 *
 *   node scripts/repair-b1-official-deterministic.mjs --dry-run
 *   node scripts/repair-b1-official-deterministic.mjs --apply [--sync-seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { spawnSync } from 'node:child_process';

loadEnvFile();

const apply = process.argv.includes('--apply');
const syncSeed = process.argv.includes('--sync-seed');
const poolDir = poolVerifiedDir('B1');

function officialPartBasenames() {
  const out = new Set();
  const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
  for (let s = 1; s <= 14; s++) {
    const p = path.join(asmDir, `assembled-exam-b1-verified-e${s}.json`);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const id of Object.values(j._meta?.partIds || {})) {
      if (id) out.add(String(id));
    }
  }
  return out;
}

function inferMeta(basename) {
  const m = String(basename).match(/^(lesen|horen|schreiben|sprechen)-t(\d+)/i);
  if (m) return { module: m[1].toLowerCase(), teil: Number(m[2]) };
  if (/^schreiben-/i.test(basename)) return { module: 'schreiben', teil: 1 };
  if (/^sprechen-/i.test(basename)) return { module: 'sprechen', teil: 1 };
  return { module: 'lesen', teil: 1 };
}

const official = officialPartBasenames();
const touched = [];

for (const base of [...official].sort()) {
  const file = `${base}.json`;
  const abs = path.join(poolDir, file);
  if (!fs.existsSync(abs)) {
    console.warn(`  skip missing: ${file}`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { module, teil } = inferMeta(base);
  let batch = normalizeBatch(raw, { module, teil, lang: 'de', level: 'B1' });
  batch = applyGermanCapsNormalize(batch, { log: false }).batch;
  batch._b1OfficialDeterministicRepairAt = new Date().toISOString();
  batch._b1OfficialDeterministicRepairNote = 'normalizeBatch + germanCaps ($0)';

  const before = JSON.stringify(raw);
  const after = JSON.stringify(batch);
  if (before !== after) {
    touched.push(file);
    if (apply) {
      fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
      if (syncSeed) {
        await syncPoolVerifiedBatch({
          file,
          batch,
          level: 'B1',
          opts: { trigger: 'repair-b1-official-deterministic', skipLock: true },
        });
      }
    }
  }
}

console.log(`\n══ repair-b1-official-deterministic ${apply ? 'APPLY' : 'DRY-RUN'} ══`);
console.log(`  official parts: ${official.size}`);
console.log(`  touched: ${touched.length}`);
touched.forEach((f) => console.log(`    ${f}`));

if (apply && touched.length) {
  const audit = spawnSync(
    process.execPath,
    ['scripts/audit-pass-2.mjs', poolDir, '--json', '--summary-only'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const m = audit.stdout.match(/"critical"\s*:\s*(\d+)/);
  const imp = audit.stdout.match(/"important"\s*:\s*(\d+)/);
  if (m) console.log(`  post-audit critical: ${m[1]}  important: ${imp?.[1] ?? '?'}`);
}

process.exit(0);
