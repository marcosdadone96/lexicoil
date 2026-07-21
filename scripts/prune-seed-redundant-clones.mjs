#!/usr/bin/env node
/**
 * Quita clones estructurales redundantes del seed local (de_B1.json + banco questions.json).
 *
 *   node scripts/prune-seed-redundant-clones.mjs
 *   node scripts/prune-seed-redundant-clones.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const REMOVE_SOURCE_FILES = new Set([
  'batches/generated/lesen-t4-gemini-032.json',
  'batches/generated/lesen-t5-gemini-052.json',
  'batches/generated/lesen-t5-gemini-053.json',
]);

const KEEP_SOURCE_FILES = new Set([
  'batches/generated/lesen-t4-gemini-031.json',
  'batches/generated/lesen-t5-gemini-051.json',
]);

function collectIdsFromBatch(relFile) {
  const file = path.join(ROOT, relFile);
  if (!fs.existsSync(file)) return { qIds: [], pIds: [] };
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const qIds = (batch.questions || []).map((q) => q.id).filter(Boolean);
  const pIds = (batch.passages || []).map((p) => p.id).filter(Boolean);
  return { qIds, pIds };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const poolFile = path.join(ROOT, 'library/reusable-seed/de_B1.json');
  const bankFile = path.join(ROOT, 'library/de/B1/questions.json');

  const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  const before = pool.records?.length || 0;
  const removed = (pool.records || []).filter((r) => REMOVE_SOURCE_FILES.has(r.sourceFile));
  const kept = (pool.records || []).filter((r) => KEEP_SOURCE_FILES.has(r.sourceFile));

  console.log('\n══ Prune clones seed (T4 Handyverbot ×1, T5 Vitalis ×1) ══\n');
  console.log('Quitar del seed:');
  for (const r of removed) {
    console.log(`  · ${r.id} ← ${r.sourceFile}`);
  }
  console.log('\nConservar (1 molde cada uno):');
  for (const r of kept) {
    console.log(`  ✓ ${r.id} ← ${r.sourceFile}`);
  }

  const qIds = new Set();
  const pIds = new Set();
  for (const sf of REMOVE_SOURCE_FILES) {
    const ids = collectIdsFromBatch(sf);
    ids.qIds.forEach((id) => qIds.add(id));
    ids.pIds.forEach((id) => pIds.add(id));
  }

  if (dryRun) {
    console.log(`\n[dry-run] Seed: ${before} → ${before - removed.length} records`);
    console.log(`[dry-run] Banco: quitar ${qIds.size} preguntas, ${pIds.size} passages`);
    return;
  }

  pool.records = (pool.records || []).filter((r) => !REMOVE_SOURCE_FILES.has(r.sourceFile));
  fs.writeFileSync(poolFile, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
  console.log(`\nSeed: ${before} → ${pool.records.length} records`);

  if (fs.existsSync(bankFile)) {
    const bank = JSON.parse(fs.readFileSync(bankFile, 'utf8'));
    const qBefore = bank.questions?.length || 0;
    const pBefore = bank.passages?.length || 0;
    bank.questions = (bank.questions || []).filter((q) => !qIds.has(q.id));
    bank.passages = (bank.passages || []).filter((p) => !pIds.has(p.id));
    fs.writeFileSync(bankFile, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
    console.log(
      `Banco: questions ${qBefore}→${bank.questions.length}, passages ${pBefore}→${bank.passages.length}`,
    );
  }

  console.log('\n✅ Clones redundantes eliminados del seed local.\n');
}

main();
