#!/usr/bin/env node
/**
 * pool-sanitize-execute.mjs — Jubila contenido roto, repara cubo A, SEM-1 en MCQ limpias.
 * Modifica library/reusable-seed/de_B1.json in place (backup first).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { classifyAndRepair } from './lib/repairTriage.mjs';
import { partToBatch } from './lib/partGate.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

loadEnvFile();

const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const CODE_REPAIRABLE = new Set(['CHK-14', 'CHK-13', 'CHK-19', 'CHK-17', 'CHK-8', 'CHK-4', 'CHK-12']);
const CONTENT_FATAL = new Set([
  'CHK-7', 'CHK-16', 'CHK-15', 'CHK-18', 'CHK-10', 'CHK-21', 'CHK-22', 'CHK-23', 'CHK-26', 'CHK-27',
  'CHK-11', 'CHK-20', 'CHK-2', 'CHK-1', 'CHK-3', 'CHK-6', 'CHK-26', 'CHK-5', 'CHK-9',
  'AUDIT-ERROR', 'DEDUP',
]);

function partBucket(blocking) {
  const ids = [...new Set(blocking.map((f) => f.id))];
  if (!ids.length) return 'ok';
  if (ids.some((id) => CONTENT_FATAL.has(id))) return 'content';
  if (ids.every((id) => CODE_REPAIRABLE.has(id))) return 'code';
  return 'mixed';
}

function jubilate(rec, reason) {
  rec.verified = false;
  rec.jubilatedAt = new Date().toISOString();
  rec.jubilatedReason = reason;
  delete rec.sem1VerifiedAt;
  delete rec.sem1Ok;
}

function recordToBatch(rec) {
  const module = String(rec.module || 'lesen').toLowerCase();
  const teil = Number(rec.teil);
  return partToBatch(rec, { module, teil });
}

function applyBatchToRecord(rec, batch) {
  if (batch.passages?.length) {
    if (rec.passage && !Array.isArray(rec.passages)) {
      rec.passage = { ...rec.passage, ...batch.passages[0] };
    }
    rec.passages = batch.passages;
  }
  if (batch.questions?.length) rec.questions = batch.questions;
  if (batch.ads) rec.ads = batch.ads;
  if (batch.segments) rec.segments = batch.segments;
}

function tryCodeRepair(rec) {
  const module = String(rec.module || 'lesen').toLowerCase();
  const teil = Number(rec.teil);
  let batch = normalizeBatch(recordToBatch(rec), {
    module,
    teil,
    lang: rec.lang || 'de',
    level: rec.level || 'B1',
  });
  const gates = {
    gate: 'audit2',
    issues: (rec._lastBlocking || []).map(
      (f) => `[${f.severity}][${f.id}] ${f.message}`,
    ),
  };
  const triage = classifyAndRepair(batch, gates);
  if (triage.repaired === true && triage.batch) {
    applyBatchToRecord(rec, triage.batch);
    return true;
  }
  return false;
}

async function main() {
  const { isPartPoolReady } = await import('./audit-pass-2.mjs');
  const { validatePartSemantics, clearSemanticCache } = await import('./lib/semanticValidator.mjs');

  if (!fs.existsSync(POOL_FILE)) {
    console.error('Missing', POOL_FILE);
    process.exit(1);
  }

  const backupDir = path.join(ROOT, 'library/reusable-seed/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `de_B1.pre-sanitize-${stamp}.json`);
  fs.copyFileSync(POOL_FILE, backupPath);
  console.log('Backup:', path.relative(ROOT, backupPath));

  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const records = pool.records || [];
  const stats = {
    jubilatedContent: 0,
    jubilatedRepairFail: 0,
    jubilatedSem1: 0,
    jubilatedMixed: 0,
    repairedOk: 0,
    sem1Ok: 0,
    keptVerified: 0,
  };

  // Pass 1: audit all, jubilate content bucket among currently verified
  for (const rec of records) {
    if (!rec.verified) continue;
    const gate = await isPartPoolReady(rec, { semantic: false });
    if (gate.ok) continue;
    rec._lastBlocking = gate.blocking || [];
    const bucket = partBucket(gate.blocking || []);
    if (bucket === 'content') {
      const chks = [...new Set(gate.blocking.map((f) => f.id))].join(',');
      jubilate(rec, `pool-sanitize:content:${chks}`);
      stats.jubilatedContent++;
    } else if (bucket === 'mixed') {
      const chks = [...new Set(gate.blocking.map((f) => f.id))].join(',');
      jubilate(rec, `pool-sanitize:mixed:${chks}`);
      stats.jubilatedMixed++;
    }
    // code bucket: leave verified for pass 2
  }

  // Pass 2: code repair
  for (const rec of records) {
    if (!rec.verified) continue;
    let gate = await isPartPoolReady(rec, { semantic: false });
    if (gate.ok) continue;
    const bucket = partBucket(gate.blocking || []);
    if (bucket !== 'code') continue;

    rec._lastBlocking = gate.blocking || [];
    tryCodeRepair(rec);
    gate = await isPartPoolReady(rec, { semantic: false });
    if (gate.ok) {
      stats.repairedOk++;
      delete rec._lastBlocking;
      continue;
    }
    const chks = [...new Set(gate.blocking.map((f) => f.id))].join(',');
    jubilate(rec, `pool-sanitize:code-repair-failed:${chks}`);
    stats.jubilatedRepairFail++;
  }

  // Pass 3: SEM-1 on verified MCQ (Lesen/Hören)
  clearSemanticCache();
  for (const rec of records) {
    if (!rec.verified) continue;
    const gate = await isPartPoolReady(rec, { semantic: false });
    if (!gate.ok) {
      const chks = [...new Set((gate.blocking || []).map((f) => f.id))].join(',');
      jubilate(rec, `pool-sanitize:struct-after-repair:${chks}`);
      continue;
    }

    const module = String(rec.module || '').toLowerCase();
    if (module === 'schreiben' || module === 'sprechen') {
      rec.sem1Ok = true;
      rec.sem1VerifiedAt = rec.sem1VerifiedAt || new Date().toISOString();
      rec.sem1Skipped = 'no-mcq';
      stats.keptVerified++;
      continue;
    }

    clearSemanticCache();
    const sem = await validatePartSemantics(rec);
    if (sem.ok) {
      rec.sem1Ok = true;
      rec.sem1VerifiedAt = new Date().toISOString();
      stats.sem1Ok++;
      stats.keptVerified++;
    } else {
      const kinds = (sem.issues || []).map((i) => i.kind).join(',');
      jubilate(rec, `pool-sanitize:sem1:${kinds}`);
      stats.jubilatedSem1++;
    }
  }

  // Clean temp fields
  for (const rec of records) delete rec._lastBlocking;

  pool.sanitizedAt = new Date().toISOString();
  pool.sanitizeStats = stats;
  fs.writeFileSync(POOL_FILE, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');

  console.log('\n=== SANITIZE COMPLETE ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`Verified remaining: ${records.filter((r) => r.verified).length}/${records.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
