#!/usr/bin/env node
/**
 * Verify vocab-bg / pool-verified dual-use: personal seed + official assemble index.
 *   node scripts/test-vocab-bg-dual-use.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson, poolVerifiedDir } from './lib/batchPaths.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';

const require = createRequire(import.meta.url);
const { pickFromLocalSeed } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));
const { partPassesAssembleMode } = require(path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'));

const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

function loadSeedIds() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  return new Set((seed.records || []).map((r) => r.id));
}

function batchToPartRecord(batch, file) {
  const base = path.basename(file, '.json');
  const m = base.match(/^(lesen|horen)-t(\d+)/i);
  if (m) return { id: base, module: m[1].toLowerCase(), teil: Number(m[2]), ...batch };
  return { id: base, module: 'lesen', teil: 1, ...batch };
}

// Pick a bg-generated seed record with pool-verified sourceFile
const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const bgRecord = (seed.records || []).find(
  (r) => r.bgGenerated && String(r.sourceFile || '').includes('pool-verified'),
);

let targetFile = null;
let targetBatch = null;
let partId = null;
let module = null;
let teil = null;

if (bgRecord) {
  partId = bgRecord.id;
  module = bgRecord.module;
  teil = bgRecord.teil;
  const m = String(bgRecord.sourceFile).match(/([^/]+\.json)$/);
  targetFile = m ? m[1] : `${partId}.json`;
  const abs = path.join(poolVerifiedDir('B1'), targetFile);
  if (fs.existsSync(abs)) targetBatch = JSON.parse(fs.readFileSync(abs, 'utf8'));
}

if (!targetBatch) {
  const pvPaths = listPoolVerifiedJson('B1');
  const pick = pvPaths.find((abs) => /lesen-t1-gemini-\d+\.json$/i.test(abs));
  if (!pick) {
    console.error('FAIL: no suitable pool-verified sample');
    process.exit(1);
  }
  targetFile = path.basename(pick);
  targetBatch = JSON.parse(fs.readFileSync(pick, 'utf8'));
  partId = path.basename(targetFile, '.json');
  module = 'lesen';
  teil = 1;
  await syncPoolVerifiedBatch({
    file: targetFile,
    batch: targetBatch,
    level: 'B1',
    opts: { trigger: 'test-vocab-bg-dual-use', skipLock: true },
  });
}

const seedIds = loadSeedIds();
const inSeed = seedIds.has(partId);
const personalHit = pickFromLocalSeed('de', 'B1', module, { teil, excludeIds: [], assembleMode: 'practice' });
const officialOk = partPassesAssembleMode(batchToPartRecord(targetBatch, targetFile), 'official');
const pvExists = fs.existsSync(path.join(poolVerifiedDir('B1'), targetFile));

console.log('── vocab-bg / pool-verified dual-use test ──');
console.log(`  sample file     : ${targetFile}`);
console.log(`  partId          : ${partId}`);
console.log(`  pool-verified   : ${pvExists ? 'YES' : 'NO'}`);
console.log(`  seed id present : ${inSeed ? 'YES' : 'NO'}`);
console.log(`  personal pick   : ${personalHit?.id ? personalHit.id : 'none (pool may be large)'}`);
console.log(`  official-ready  : ${officialOk ? 'YES' : 'NO (quarantine/gates)'}`);

const pass = pvExists && inSeed;
console.log(pass ? '\nPASS: part available in pool-verified + seed (dual-use path)' : '\nFAIL: missing pool-verified or seed');
process.exit(pass ? 0 : 1);
