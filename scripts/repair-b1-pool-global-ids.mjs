#!/usr/bin/env node
/**
 * Deterministic global ID dedup for pool-verified/B1 (CHK-8).
 * First file (lexicographic) keeps IDs; later files get file-scoped renames.
 *
 *   node scripts/repair-b1-pool-global-ids.mjs --dry-run
 *   node scripts/repair-b1-pool-global-ids.mjs --apply
 *   node scripts/repair-b1-pool-global-ids.mjs --apply --sync-seed
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';

loadEnvFile();

const apply = process.argv.includes('--apply');
const syncSeed = process.argv.includes('--sync-seed');
const dir = poolVerifiedDir('B1');

function fileStem(name) {
  return name.replace(/\.json$/i, '');
}

function slugFromStem(stem) {
  return stem.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function collectIds(batch) {
  const qIds = (batch.questions || []).map((q) => q.id).filter(Boolean);
  const pIds = (batch.passages || []).map((p) => p.id).filter(Boolean);
  return { qIds, pIds };
}

function renameBatchIds(batch, stem, globalQ, globalP) {
  const slug = slugFromStem(stem);
  const passageMap = new Map();
  const qMap = new Map();
  let qRen = 0;
  let pRen = 0;

  const passages = (batch.passages || []).map((p, i) => {
    const old = p.id;
    if (!old) return p;
    if (!globalP.has(old)) {
      globalP.set(old, stem);
      return p;
    }
    if (globalP.get(old) === stem) return p;
    const neu = `gen-p-${slug}-s${i + 1}`;
    passageMap.set(old, neu);
    globalP.set(neu, stem);
    pRen++;
    return { ...p, id: neu };
  });

  const questions = (batch.questions || []).map((q, i) => {
    let out = { ...q };
    const old = q.id;
    if (old) {
      if (!globalQ.has(old)) {
        globalQ.set(old, stem);
      } else if (globalQ.get(old) !== stem) {
        const neu = `gen-q-${slug}-${i + 1}`;
        qMap.set(old, neu);
        globalQ.set(neu, stem);
        out = { ...out, id: neu };
        qRen++;
      }
    } else {
      out = { ...out, id: `gen-q-${slug}-${i + 1}` };
      globalQ.set(out.id, stem);
      qRen++;
    }
    if (out.passageId && passageMap.has(out.passageId)) {
      out = { ...out, passageId: passageMap.get(out.passageId) };
    }
    return out;
  });

  const next = { ...batch, passages, questions };
  if (qRen || pRen) {
    next._b1GlobalIdRepairAt = new Date().toISOString();
    next._b1GlobalIdRepairNote = `renamed q=${qRen} p=${pRen} (deterministic, $0)`;
  }
  return { batch: next, qRen, pRen, passageMap, qMap };
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const globalQ = new Map();
const globalP = new Map();
const report = { files: [], totalQRenamed: 0, totalPRenamed: 0 };

for (const file of files) {
  const abs = path.join(dir, file);
  const stem = fileStem(file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch: next, qRen, pRen } = renameBatchIds(batch, stem, globalQ, globalP);
  if (qRen || pRen) {
    report.files.push({ file, qRenamed: qRen, pRenamed: pRen });
    report.totalQRenamed += qRen;
    report.totalPRenamed += pRen;
    if (apply) {
      fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      if (syncSeed) {
        await syncPoolVerifiedBatch({
          file,
          batch: next,
          level: 'B1',
          opts: { trigger: 'repair-b1-pool-global-ids', skipLock: true },
        });
      }
    }
  }
}

// Verify 0 duplicates
const verifyQ = new Map();
const verifyP = new Map();
let dupQ = 0;
let dupP = 0;
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const q of batch.questions || []) {
    if (!q.id) continue;
    if (verifyQ.has(q.id)) dupQ++;
    else verifyQ.set(q.id, file);
  }
  for (const p of batch.passages || []) {
    if (!p.id) continue;
    if (verifyP.has(p.id)) dupP++;
    else verifyP.set(p.id, file);
  }
}

console.log(`\n══ repair-b1-pool-global-ids ${apply ? 'APPLY' : 'DRY-RUN'} ══`);
console.log(`  files touched: ${report.files.length}`);
console.log(`  questions renamed: ${report.totalQRenamed}`);
console.log(`  passages renamed: ${report.totalPRenamed}`);
console.log(`  post-check dup Q: ${dupQ}  dup P: ${dupP}`);
if (report.files.length) {
  for (const r of report.files.slice(0, 15)) {
    console.log(`    ${r.file}: q=${r.qRenamed} p=${r.pRenamed}`);
  }
  if (report.files.length > 15) console.log(`    … +${report.files.length - 15} more`);
}

const outPath = path.join(ROOT, 'batches/ready/gate-logs/repair-b1-global-ids.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ ...report, dupQ, dupP, apply, at: new Date().toISOString() }, null, 2),
);
process.exit(dupQ + dupP > 0 ? 1 : 0);
