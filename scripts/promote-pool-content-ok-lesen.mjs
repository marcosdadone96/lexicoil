#!/usr/bin/env node
/**
 * promote-pool-content-ok-lesen.mjs — Recheck interim Lesen after Q1 decision (2026-07-23+).
 *
 *   node scripts/promote-pool-content-ok-lesen.mjs --dry-run
 *   node scripts/promote-pool-content-ok-lesen.mjs
 *   node scripts/promote-pool-content-ok-lesen.mjs --demote-q1   # after Q1 is live block: Q1-only → needs-regen
 *
 * Default policy (post-decision day):
 *   READY          → pool-verified/
 *   still Q1-only  → stay in pool-content-ok-lesen/ (still assemblable; accepted backlog risk)
 *   other REJECT   → needs-regeneration/
 *
 * With --demote-q1 (optional, only if Marco decides interim pool must close):
 *   Q1-only        → needs-regeneration/
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  poolReadyCheckWithRepair,
  resetPoolReadyCaches,
  getDedupCorpusCache,
  getDiscardCache,
  loadQ2EvaluationCache,
} from './lib/poolReadyCheck.mjs';
import {
  POOL_VERIFIED_DIR,
  POOL_CONTENT_OK_LESEN_DIR,
  NEEDS_REGENERATION_DIR,
  writePoolVerified,
} from './lib/finalizePoolReady.mjs';
import {
  maybeNormalizeManualLesenBatch,
  assertManualPublishPositionGates,
  formatMcqPositionLine,
} from './lib/manualPublishNormalize.mjs';

const dryRun = process.argv.includes('--dry-run');
const demoteQ1 = process.argv.includes('--demote-q1');

fs.mkdirSync(POOL_VERIFIED_DIR, { recursive: true });
fs.mkdirSync(NEEDS_REGENERATION_DIR, { recursive: true });

if (!fs.existsSync(POOL_CONTENT_OK_LESEN_DIR)) {
  console.log('No existe pool-content-ok-lesen/ — nada que promover.');
  process.exit(0);
}

resetPoolReadyCaches();
const corpus = getDedupCorpusCache({ reload: true });
const discard = getDiscardCache({ reload: true });
const q2Cache = loadQ2EvaluationCache({ reload: true });

const files = fs
  .readdirSync(POOL_CONTENT_OK_LESEN_DIR)
  .filter((f) => f.endsWith('.json') && f.startsWith('lesen-'))
  .sort();

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  demoteQ1,
  total: files.length,
  toVerified: [],
  stayQ1Only: [],
  toNeedsRegen: [],
};

for (const file of files) {
  const abs = path.join(POOL_CONTENT_OK_LESEN_DIR, file);
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const teil = Number(batch?.questions?.[0]?.teil ?? batch?.passages?.[0]?.teil);
  batch = maybeNormalizeManualLesenBatch(batch, { teil, lang: 'de', level: 'B1', module: 'lesen' });
  if (file.startsWith('lesen-') && [2, 5].includes(teil)) {
    const pos = assertManualPublishPositionGates(batch, { teil, lang: 'de', level: 'B1' });
    if (!pos.ok) {
      console.warn(`skip ${file}: ${formatMcqPositionLine(pos.dist)} — ${pos.issues.join('; ')}`);
      report.toNeedsRegen.push({ file, reasons: pos.issues, via: 'position-gate' });
      if (!dryRun) {
        const tagged = {
          ...pos.batch,
          _poolRejectReason: pos.issues.join(', '),
          _poolRejectAt: new Date().toISOString(),
          _poolDemotedFrom: 'pool-content-ok-lesen',
        };
        fs.writeFileSync(
          path.join(NEEDS_REGENERATION_DIR, file),
          `${JSON.stringify(tagged, null, 2)}\n`,
        );
        fs.unlinkSync(abs);
      }
      continue;
    }
    batch = pos.batch;
  }
  const sourcePath = `batches/ready/pool-content-ok-lesen/${file}`;
  const result = await poolReadyCheckWithRepair(batch, {
    file,
    sourcePath,
    corpus,
    discard,
    q2Cache,
  });

  if (result.verdict === 'READY') {
    report.toVerified.push(file);
    if (!dryRun) {
      writePoolVerified(file, result.batch || batch);
      fs.unlinkSync(abs);
    }
    continue;
  }

  if (result.q1OnlyReject) {
    if (demoteQ1) {
      report.toNeedsRegen.push({ file, reasons: result.rejectReasons, via: 'demote-q1' });
      if (!dryRun) {
        const tagged = {
          ...(result.batch || batch),
          _poolRejectReason: (result.rejectReasons || []).join(', '),
          _poolRejectAt: new Date().toISOString(),
          _poolRejectDetails: (result.details || []).slice(0, 12),
          _poolDemotedFrom: 'pool-content-ok-lesen',
        };
        fs.writeFileSync(
          path.join(NEEDS_REGENERATION_DIR, file),
          `${JSON.stringify(tagged, null, 2)}\n`,
        );
        fs.unlinkSync(abs);
      }
    } else {
      report.stayQ1Only.push(file);
    }
    continue;
  }

  report.toNeedsRegen.push({ file, reasons: result.rejectReasons || result.reasons });
  if (!dryRun) {
    const tagged = {
      ...(result.batch || batch),
      _poolRejectReason: (result.rejectReasons || result.reasons || []).join(', '),
      _poolRejectAt: new Date().toISOString(),
      _poolRejectDetails: (result.details || []).slice(0, 12),
      _poolDemotedFrom: 'pool-content-ok-lesen',
    };
    fs.writeFileSync(
      path.join(NEEDS_REGENERATION_DIR, file),
      `${JSON.stringify(tagged, null, 2)}\n`,
    );
    fs.unlinkSync(abs);
  }
}

const summary = {
  total: report.total,
  toVerified: report.toVerified.length,
  stayQ1Only: report.stayQ1Only.length,
  toNeedsRegen: report.toNeedsRegen.length,
};
console.log(JSON.stringify({ ...summary, dryRun, demoteQ1 }, null, 2));

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(ROOT, 'batches/ready/gate-logs', `promote-ok-lesen-${stamp}.json`);
fs.writeFileSync(out, `${JSON.stringify({ ...report, summary }, null, 2)}\n`);
console.log(`Wrote ${out}`);
