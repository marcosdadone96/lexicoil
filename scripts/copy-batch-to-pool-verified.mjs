#!/usr/bin/env node
/**
 * Copia un batch JSON a pool-verified/{level}/ con guardia anti-restauración de retirados.
 *
 *   node scripts/copy-batch-to-pool-verified.mjs --level A2 --from batches/needs-regeneration/A2/foo.json
 *   node scripts/copy-batch-to-pool-verified.mjs ... --acknowledge-retired-restore   # solo decisión humana explícita
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { normalizeLevel, poolVerifiedDir } from './lib/batchPaths.mjs';
import { assertSafeCopyIntoPoolVerified, poolRetiredMeta } from './lib/poolRetiredRestoreGuard.mjs';

const args = process.argv.slice(2);
const level = normalizeLevel(args.includes('--level') ? args[args.indexOf('--level') + 1] : 'A2');
const fromIdx = args.indexOf('--from');
const acknowledge = args.includes('--acknowledge-retired-restore');
if (fromIdx < 0 || !args[fromIdx + 1]) {
  console.error(
    'Usage: node scripts/copy-batch-to-pool-verified.mjs --level A2 --from <path> [--acknowledge-retired-restore]',
  );
  process.exit(1);
}

const rel = args[fromIdx + 1].replace(/\\/g, '/');
const sourceAbs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
const base = path.basename(sourceAbs);
const destAbs = path.join(poolVerifiedDir(level), base);

assertSafeCopyIntoPoolVerified({ sourceAbs, destAbs, acknowledgeRetiredRestore: acknowledge });
const batch = JSON.parse(fs.readFileSync(sourceAbs, 'utf8'));
const meta = poolRetiredMeta(batch);
if (meta && acknowledge) {
  console.warn('⚠ Restauración reconocida de batch retirado:', meta.reason);
}
fs.copyFileSync(sourceAbs, destAbs);
console.log(JSON.stringify({ ok: true, from: rel, to: path.relative(ROOT, destAbs).replace(/\\/g, '/') }, null, 2));
