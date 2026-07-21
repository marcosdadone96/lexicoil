#!/usr/bin/env node
/**
 * Reorder Hören T3 R/F by CANONICAL char-evidence positions in passages[0].text.
 * Replaces the weak audio-turn metric used in the earlier false-green pass.
 *
 *   node scripts/reorder-horen-t3-char-chrono-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALANCE_MCQ_VERSION } from './lib/balanceMcq.mjs';
import {
  HOREN_RF_CHRONO_EVIDENCE_VERSION,
  HOREN_RF_CHRONO_FORBIDDEN_METRIC,
  reorderRfByCharEvidence,
  verifyRfChronoByCharPos,
} from './lib/horenRfChronoEvidence.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'batches/ready/horen-t3-staging-2026-07-11-canary/horen-t3-gemini-001.json',
  'batches/ready/horen-t3-staging-2026-07-11-canary/horen-t3-gemini-002.json',
  'batches/ready/horen-t3-staging-2026-07-11-canary/horen-t3-gemini-004.json',
  'batches/ready/canary-all-staging-2026-07-11/horen-t3-gemini-001.json',
  'batches/ready/canary-all-staging-2026-07-11/horen-t3-gemini-002.json',
  'batches/ready/canary-all-staging-2026-07-11/horen-t3-gemini-004.json',
];

const report = {
  generatedAt: new Date().toISOString(),
  balanceMcq: BALANCE_MCQ_VERSION,
  chronoEvidence: HOREN_RF_CHRONO_EVIDENCE_VERSION,
  forbiddenMetric: HOREN_RF_CHRONO_FORBIDDEN_METRIC,
  note:
    'Canonical chrono = char offset in passages[0].text. Audio-turn overlap is forbidden.',
  files: [],
};

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    report.files.push({ file: rel, missing: true });
    console.log('MISSING', rel);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const beforeVerify = verifyRfChronoByCharPos(batch);
  const chrono = reorderRfByCharEvidence(batch);
  const afterVerify = verifyRfChronoByCharPos(batch);
  batch._rfChronoRestoredAt = new Date().toISOString();
  batch._rfChronoEvidenceVersion = HOREN_RF_CHRONO_EVIDENCE_VERSION;
  batch._balanceMcqVersion = BALANCE_MCQ_VERSION;
  fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  const entry = {
    file: rel,
    chronoChanged: chrono.changed,
    mode: chrono.mode,
    beforePos: chrono.beforePos,
    afterPos: chrono.afterPos,
    beforeIds: chrono.before,
    afterIds: chrono.after,
    beforeMono: beforeVerify.ok,
    afterMono: afterVerify.ok,
    detailsAfter: afterVerify.details,
  };
  report.files.push(entry);
  console.log(
    path.basename(rel),
    'chronoChanged=',
    chrono.changed,
    'before',
    JSON.stringify(chrono.beforePos),
    'after',
    JSON.stringify(chrono.afterPos),
    'mono',
    afterVerify.ok,
  );
}

const out = path.join(
  ROOT,
  'batches/ready/gate-logs/horen-t3-char-chrono-2026-07-12.json',
);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('wrote', out);
