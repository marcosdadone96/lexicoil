#!/usr/bin/env node
/**
 * Deterministic global ID dedup for pool-verified/A2 (CHK-8).
 *   node scripts/repair-a2-pool-global-ids.mjs --dry-run
 *   node scripts/repair-a2-pool-global-ids.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';

loadEnvFile();

const apply = process.argv.includes('--apply');
const dir = poolVerifiedDir('A2');

function fileStem(name) {
  return name.replace(/\.json$/i, '');
}

function slugFromStem(stem) {
  return stem.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function renameBatchIds(batch, stem, globalQ, globalP) {
  const slug = slugFromStem(stem);
  const passageMap = new Map();
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
    next._a2GlobalIdRepairAt = new Date().toISOString();
    next._a2GlobalIdRepairNote = `renamed q=${qRen} p=${pRen} (deterministic, $0)`;
  }
  return { batch: next, qRen, pRen };
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const globalQ = new Map();
const globalP = new Map();
let totalQ = 0;
let totalP = 0;
let touched = 0;

for (const file of files) {
  const abs = path.join(dir, file);
  const stem = fileStem(file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch: next, qRen, pRen } = renameBatchIds(batch, stem, globalQ, globalP);
  if (qRen || pRen) {
    touched++;
    totalQ += qRen;
    totalP += pRen;
    if (apply) fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

// Fix broken *-qde IDs from bad rename (deterministic re-index)
if (apply) {
  for (const file of files) {
    const abs = path.join(dir, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    let bad = false;
    const questions = (batch.questions || []).map((q, i) => {
      if (String(q.id || '').endsWith('-qde')) {
        bad = true;
        const slug = fileStem(file);
        return { ...q, id: `de-a2-cur-${slug}-q${i + 1}` };
      }
      return q;
    });
    if (bad) {
      batch.questions = questions;
      batch._a2QdeIdFixAt = new Date().toISOString();
      fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
      touched++;
    }
  }
}

let dupQ = 0;
const verifyQ = new Map();
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const q of batch.questions || []) {
    if (!q.id) continue;
    if (verifyQ.has(q.id)) dupQ++;
    else verifyQ.set(q.id, file);
  }
}

console.log(`repair-a2-pool-global-ids: ${touched} files, qRen=${totalQ} pRen=${totalP}, dupQ=${dupQ} ${apply ? 'APPLIED' : 'DRY-RUN'}`);
process.exit(dupQ > 0 ? 1 : 0);
