#!/usr/bin/env node
/**
 * One-shot migration: move staging JSON batches into per-level subfolders.
 * Level is read from batch JSON content (inferBatchLevel), never from filename.
 *
 *   node scripts/migrate-staging-by-level.mjs           # dry-run + counts
 *   node scripts/migrate-staging-by-level.mjs --apply   # execute moves
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
} from './lib/loadEnv.mjs';
import {
  GENERATED_DIR,
  POOL_VERIFIED_DIR,
  POOL_CONTENT_OK_DIR,
  POOL_CONTENT_OK_LESEN_DIR,
  NEEDS_REGEN_ROOT,
  READY_LESEN_DIR,
  KNOWN_LEVELS,
  inferBatchLevel,
  normalizeLevel,
  generatedDir,
  poolVerifiedDir,
  poolContentOkDir,
  poolContentOkLesenDir,
  needsRegenerationDir,
  readyLesenDir,
  listJsonInStagingRoot,
} from './lib/batchPaths.mjs';

const __filename = fileURLToPath(import.meta.url);
const apply = process.argv.includes('--apply');

const STAGES = [
  { root: GENERATED_DIR, dest: generatedDir, label: 'generated' },
  { root: POOL_VERIFIED_DIR, dest: poolVerifiedDir, label: 'pool-verified' },
  { root: POOL_CONTENT_OK_DIR, dest: poolContentOkDir, label: 'pool-content-ok' },
  { root: POOL_CONTENT_OK_LESEN_DIR, dest: poolContentOkLesenDir, label: 'pool-content-ok-lesen' },
  { root: NEEDS_REGEN_ROOT, dest: needsRegenerationDir, label: 'needs-regeneration' },
  { root: READY_LESEN_DIR, dest: readyLesenDir, label: 'ready/lesen' },
];

function collectStagingFiles() {
  const rows = [];
  for (const stage of STAGES) {
    if (!fs.existsSync(stage.root)) continue;
    for (const abs of listJsonInStagingRoot(stage.root)) {
      rows.push({ abs, stage });
    }
  }
  return rows;
}

function plannedMove(row) {
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(row.abs, 'utf8'));
  } catch (err) {
    return { ...row, error: `parse: ${err.message}`, skip: true };
  }
  const level = inferBatchLevel(batch);
  if (level === 'MIXED') {
    return { ...row, error: 'mixed levels in batch', skip: true };
  }
  const lv = normalizeLevel(level);
  const destDir = row.stage.dest(lv);
  const destAbs = path.join(destDir, path.basename(row.abs));
  const relFrom = path.relative(ROOT, row.abs).replace(/\\/g, '/');
  const relTo = path.relative(ROOT, destAbs).replace(/\\/g, '/');
  if (path.resolve(row.abs) === path.resolve(destAbs)) {
    return { ...row, level: lv, relFrom, relTo, noop: true };
  }
  return { ...row, level: lv, relFrom, relTo, batch };
}

function countByLevel(rows) {
  const counts = Object.fromEntries(KNOWN_LEVELS.map((l) => [l, 0]));
  counts.OTHER = 0;
  counts.SKIP = 0;
  for (const r of rows) {
    if (r.skip) counts.SKIP++;
    else if (r.noop) counts[r.level] = (counts[r.level] || 0) + 1;
    else counts[r.level] = (counts[r.level] || 0) + 1;
  }
  return counts;
}

function main() {
  const before = collectStagingFiles();
  const plans = before.map(plannedMove);
  const moves = plans.filter((p) => !p.skip && !p.noop);
  const noops = plans.filter((p) => p.noop);
  const skips = plans.filter((p) => p.skip);

  console.log(`\n══ migrate-staging-by-level ${apply ? '(APPLY)' : '(dry-run)'} ══`);
  console.log(`Archivos staging antes: ${before.length}`);
  console.log(`  ya en subcarpeta correcta: ${noops.length}`);
  console.log(`  a mover: ${moves.length}`);
  console.log(`  omitidos (error): ${skips.length}`);

  const beforeByLevel = countByLevel(plans);
  console.log('\nDistribución por nivel (contenido JSON):');
  for (const lv of KNOWN_LEVELS) console.log(`  ${lv}: ${beforeByLevel[lv] || 0}`);

  if (skips.length) {
    console.log('\nOmitidos:');
    for (const s of skips.slice(0, 20)) {
      console.log(`  ${path.relative(ROOT, s.abs)} — ${s.error}`);
    }
    if (skips.length > 20) console.log(`  … +${skips.length - 20} más`);
  }

  if (moves.length) {
    console.log('\nMovimientos planificados (primeros 15):');
    for (const m of moves.slice(0, 15)) {
      console.log(`  ${m.relFrom} → ${m.relTo}  [${m.level}]`);
    }
    if (moves.length > 15) console.log(`  … +${moves.length - 15} más`);
  }

  if (!apply) {
    console.log('\nDry-run: sin cambios. Usá --apply para ejecutar.');
    return;
  }

  const destSeen = new Set();
  for (const m of moves) {
    const destAbs = path.join(ROOT, m.relTo);
    if (destSeen.has(destAbs)) {
      throw new Error(`colisión destino: ${m.relTo}`);
    }
    destSeen.add(destAbs);
    if (fs.existsSync(destAbs)) {
      throw new Error(`destino ya existe: ${m.relTo}`);
    }
  }

  let moved = 0;
  for (const m of moves) {
    const destAbs = path.join(ROOT, m.relTo);
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.renameSync(m.abs, destAbs);
    moved++;
  }

  const after = collectStagingFiles();
  console.log(`\nMigrados: ${moved}`);
  console.log(`Archivos staging después: ${after.length}`);

  if (before.length !== after.length) {
    console.error(`FATAL: conteo no coincide (${before.length} → ${after.length})`);
    process.exit(1);
  }

  const afterPlans = after.map(plannedMove);
  const stillFlat = afterPlans.filter((p) => !p.skip && !p.noop);
  if (stillFlat.length) {
    console.error(`FATAL: ${stillFlat.length} archivo(s) siguen fuera de subcarpeta de nivel`);
    process.exit(1);
  }

  console.log('OK: migración completa, conteo idéntico, sin pérdidas.');
}

main();
