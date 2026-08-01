/**
 * Guards for re-publish-official-exam.mjs (published manifest recapture).
 * Distinct from assembled freshness: no assembled JSON body involved.
 */
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './loadEnv.mjs';
import { canonicalPartHash } from './partContentHash.mjs';
import { seedRecordToSnapshotPayload } from './publishedExamLib.mjs';
import { recordFromPoolVerifiedPart } from './verifiedExamPublishLib.mjs';
import { auditAssembledFreshness } from './assembledExamFreshness.mjs';

function snapshotHashFromSeedRecord(rec) {
  if (!rec) return null;
  return canonicalPartHash(seedRecordToSnapshotPayload(rec));
}

/** Compare local reusable-seed vs pool-verified (source of truth for verified publish). */
export function auditRepublishSeedVsPool({ level, partIdMap, seedById }) {
  const drift = [];
  const unchecked = [];
  for (const [cell, partId] of Object.entries(partIdMap || {})) {
    const poolRec = recordFromPoolVerifiedPart(partId, cell, level);
    if (!poolRec) {
      unchecked.push({ cell, partId, reason: 'no_pool_file' });
      continue;
    }
    const poolHash = snapshotHashFromSeedRecord(poolRec);
    const seedRec = seedById?.get(partId);
    const seedHash = snapshotHashFromSeedRecord(seedRec);
    if (seedHash !== poolHash) {
      drift.push({
        cell,
        partId,
        hasSeed: !!seedRec,
        seedHash: seedHash ? seedHash.slice(0, 16) : null,
        poolHash: poolHash ? poolHash.slice(0, 16) : null,
      });
    }
  }
  return {
    ok: drift.length === 0,
    drift,
    unchecked,
  };
}

export function assertRepublishSeedMatchesPool({ level, partIdMap, seedById }) {
  const report = auditRepublishSeedVsPool({ level, partIdMap, seedById });
  if (report.ok) return report;
  const msg =
    'RE-PUBLISH BLOCK — reusable-seed ≠ pool-verified for part(s) that would be recaptured:\n' +
    report.drift.map((d) => `  ${d.cell} ${d.partId} (seed ${d.seedHash} vs pool ${d.poolHash})`).join('\n') +
    '\n  Sync seed from pool (syncPoolVerifiedBatch / resync) or use publish-verified-exams-local after reassemble.\n' +
    '  Override only with --ack-seed-pool-drift (documents accepted risk).';
  const err = new Error(msg);
  err.code = 'REPUBLISH_SEED_POOL_DRIFT';
  err.report = report;
  throw err;
}

/** If manifest still points at an assembled file, block when that assembled is STALE vs pool. */
export function assertRepublishAssembledNotStale(sourceAssembledRel, level) {
  if (!sourceAssembledRel) return null;
  const asmPath = path.isAbsolute(sourceAssembledRel)
    ? sourceAssembledRel
    : path.join(ROOT, sourceAssembledRel);
  if (!fs.existsSync(asmPath)) return null;
  const audit = auditAssembledFreshness(asmPath, level);
  if (audit.fresh) return audit;
  const err = new Error(
    `RE-PUBLISH BLOCK — source assembled is STALE (${audit.staleCells.join(', ')}).\n` +
      `  Use reassemble-verified-from-pool + publish-verified-exams-local instead of re-publish.\n` +
      '  Override with --ack-assembled-stale.',
  );
  err.code = 'REPUBLISH_ASSEMBLED_STALE';
  err.report = audit;
  throw err;
}
