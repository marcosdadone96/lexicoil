#!/usr/bin/env node
/**
 * Hallazgo D — next batch number must not collide with pool/staging.
 *   node scripts/lib/__tests__/nextBatchBasename.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  maxExistingBatchNumber,
  nextNumberedBatchBasename,
  defaultBatchNumberScanDirs,
  GENERATED_DIR,
} from '../batchPaths.mjs';
import { nextExamOutputBasename } from '../pasteExamBatchLib.mjs';
import { nextOutputBasename } from '../lesenTemplatePrompt.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function listNums(prefix, dir) {
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp(`^${prefix}-(\\d+)\\.json$`, 'i');
  return fs
    .readdirSync(dir)
    .map((n) => n.match(re))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

const POOL = path.join('batches', 'ready', 'pool-verified');
const dirs = defaultBatchNumberScanDirs();

console.log('scanDirs count', dirs.length);
console.log('includes generated', dirs.some((d) => d.replace(/\\/g, '/').endsWith('batches/generated')));
console.log('includes pool-verified', dirs.some((d) => d.replace(/\\/g, '/').includes('pool-verified')));

// --- inventory ---
function report(prefix) {
  const pool = listNums(prefix, POOL);
  const gen = listNums(prefix, GENERATED_DIR);
  const maxAll = maxExistingBatchNumber(prefix);
  const next = nextNumberedBatchBasename(prefix);
  const nextN = Number(next.match(/-(\d+)\.json$/i)[1]);
  console.log(`\n${prefix}`);
  console.log('  pool nums:', pool.join(',') || '(none)', 'maxPool', pool.at(-1) || 0);
  console.log('  generated:', gen.join(',') || '(none)', 'maxGen', gen.at(-1) || 0);
  console.log('  maxAll', maxAll, '→ next', next);
  return { pool, gen, maxAll, next, nextN };
}

console.log('\n=== a) Hören T3 ===');
const h3 = report('horen-t3-gemini');
assert(h3.pool.includes(1) && h3.pool.includes(7), 'pool should have 001 and 007');
assert(h3.maxAll >= 7, `maxAll should be >=7, got ${h3.maxAll}`);
assert(h3.nextN === h3.maxAll + 1, 'next = max+1');
assert(h3.nextN > Math.max(...h3.pool, 0), 'next must exceed pool max');
assert(!h3.pool.includes(h3.nextN), 'next must not be in pool');
assert(!h3.gen.includes(h3.nextN), 'next must not be in generated');
// public API
const h3api = nextExamOutputBasename('horen', 3, 'gemini');
assert(h3api === h3.next, `API mismatch ${h3api} vs ${h3.next}`);
console.log('  ✓ Hören T3 next avoids pool+generated+staging');

console.log('\n=== b) Lesen T4 / T5 ===');
const l4 = report('lesen-t4-gemini');
const l5 = report('lesen-t5-gemini');
assert(l4.nextN === l4.maxAll + 1 && l4.nextN > Math.max(...l4.pool, 0), 'L4 next ok');
assert(l5.nextN === l5.maxAll + 1 && l5.nextN > Math.max(...l5.pool, 0), 'L5 next ok');
assert(nextOutputBasename(4) === l4.next, 'lesen nextOutputBasename T4');
assert(nextOutputBasename(5) === l5.next, 'lesen nextOutputBasename T5');
console.log('  ✓ Lesen T4 next', l4.next);
console.log('  ✓ Lesen T5 next', l5.next);

console.log('\n=== c) Hören T1 / T2 (same bug class; confirm next) ===');
const h1 = report('horen-t1-gemini');
const h2 = report('horen-t2-gemini');
assert(h1.nextN === h1.maxAll + 1, 'H1 next');
assert(h2.nextN === h2.maxAll + 1, 'H2 next');
// Old bug: generated-only max for H1 is 5 → would suggest 006 while pool already has 001-005
// (006 free in pool today) but staging/canary reused 001 — collision on promote.
// New logic must be >= pool max (16).
assert(h1.maxAll >= 16, `H1 maxAll expected >=16 (pool has 016), got ${h1.maxAll}`);
assert(h1.nextN >= 17, `H1 next expected >=017, got ${h1.next}`);
assert(h2.maxAll >= 23, `H2 maxAll expected >=23, got ${h2.maxAll}`);
assert(h2.nextN >= 24, `H2 next expected >=024, got ${h2.next}`);
console.log('  ✓ Hören T1/T2 also use cross-dir max (bug applied to them too when generated empty)');

// Simulate old vs new for H3 if only generated scanned
const genOnlyMax = maxExistingBatchNumber('horen-t3-gemini', [GENERATED_DIR]);
console.log('\n=== old vs new (Hören T3) ===');
console.log('  old (generated only) max', genOnlyMax, '→ would pick', String(genOnlyMax + 1).padStart(3, '0'));
console.log('  new (all dirs)        max', h3.maxAll, '→ picks', h3.next);
assert(genOnlyMax < h3.maxAll || h3.pool.some((n) => n > genOnlyMax), 'demonstrates pool has higher ids than generated-only');

console.log('\nALL OK');
