/**
 * Scrub pool-verified: files with _poolRejectReason must not stay as "verified".
 *
 *   - Intentional T3 fingerprint reps (_t3FingerprintPromote): strip reject meta, keep
 *   - Re-check others:
 *       READY     → strip reject meta, keep
 *       Q1-only   → move to pool-content-ok-lesen/
 *       other     → move to needs-regeneration/
 *
 *   node scripts/scrub-pool-verified-reject-meta.mjs --dry-run
 *   node scripts/scrub-pool-verified-reject-meta.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
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
  stripPoolRejectMeta,
} from './lib/finalizePoolReady.mjs';

const dryRun = process.argv.includes('--dry-run');

fs.mkdirSync(POOL_CONTENT_OK_LESEN_DIR, { recursive: true });
fs.mkdirSync(NEEDS_REGENERATION_DIR, { recursive: true });

resetPoolReadyCaches();
const corpus = getDedupCorpusCache({ reload: true });
const discard = getDiscardCache({ reload: true });
const q2Cache = loadQ2EvaluationCache({ reload: true });

const verifiedPaths = listPoolVerifiedJson('B1');
const files = verifiedPaths.map((abs) => path.basename(abs)).sort();
const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  totalVerified: files.length,
  withRejectMeta: 0,
  keptStripped: [],
  keptT3Rep: [],
  movedOkLesen: [],
  movedNeedsRegen: [],
  cleanAlready: 0,
};

for (const abs of verifiedPaths.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))) {
  const file = path.basename(abs);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!batch._poolRejectReason) {
    report.cleanAlready++;
    continue;
  }
  report.withRejectMeta++;

  // Intentional T3 fingerprint representatives — keep, strip stale Q1 stamp
  if (batch._t3FingerprintPromote) {
    report.keptT3Rep.push({ file, was: batch._poolRejectReason });
    if (!dryRun) writePoolVerified(file, batch);
    continue;
  }

  const result = await poolReadyCheckWithRepair(batch, {
    file,
    sourcePath: `batches/ready/pool-verified/${file}`,
    corpus,
    discard,
    q2Cache,
  });

  if (result.verdict === 'READY') {
    report.keptStripped.push({
      file,
      was: batch._poolRejectReason,
      note: 'stale reject meta; gates pass now',
    });
    if (!dryRun) writePoolVerified(file, result.batch || batch);
    continue;
  }

  if (result.q1OnlyReject && String(result.module || 'lesen').toLowerCase() === 'lesen') {
    report.movedOkLesen.push({ file, reasons: result.rejectReasons });
    if (!dryRun) {
      const { _poolRejectReason, _poolRejectAt, _poolRejectDetails, ...clean } = result.batch || batch;
      const tagged = {
        ...clean,
        _poolContentOkLesenAt: new Date().toISOString(),
        _poolContentOkLesenNote:
          'scrubbed from pool-verified (had reject meta; Q1-only after recheck)',
        _poolRejectReason: (result.rejectReasons || []).join(', '),
        _poolRejectDetails: (result.details || []).slice(0, 8),
        _scrubbedFromVerifiedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(POOL_CONTENT_OK_LESEN_DIR, file),
        `${JSON.stringify(tagged, null, 2)}\n`,
      );
      fs.unlinkSync(abs);
    }
    continue;
  }

  report.movedNeedsRegen.push({
    file,
    reasons: result.rejectReasons || result.reasons,
  });
  if (!dryRun) {
    const tagged = {
      ...(result.batch || batch),
      _poolRejectReason: (result.rejectReasons || result.reasons || []).join(', '),
      _poolRejectAt: new Date().toISOString(),
      _poolRejectDetails: (result.details || []).slice(0, 12),
      _scrubbedFromVerifiedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(NEEDS_REGENERATION_DIR, file),
      `${JSON.stringify(tagged, null, 2)}\n`,
    );
    fs.unlinkSync(abs);
  }
}

// Final hygiene: any remaining reject meta (shouldn't happen)
let leftover = 0;
if (!dryRun) {
  for (const abs of listPoolVerifiedJson('B1')) {
    const f = path.basename(abs);
    const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (b._poolRejectReason) {
      leftover++;
      writePoolVerified(f, stripPoolRejectMeta(b));
    }
  }
}

report.after = {
  verifiedCount: listPoolVerifiedJson('B1').length,
  leftoverRejectMetaForcedStrip: leftover,
  keptStripped: report.keptStripped.length,
  keptT3Rep: report.keptT3Rep.length,
  movedOkLesen: report.movedOkLesen.length,
  movedNeedsRegen: report.movedNeedsRegen.length,
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/POOL-VERIFIED-REJECT-SCRUB-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/POOL-VERIFIED-REJECT-SCRUB-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# pool-verified reject-meta scrub (2026-07-10)',
  '',
  `**Dry-run:** ${dryRun}`,
  '',
  '## Causa',
  '',
  'Escrituras READY a `pool-verified/` no eliminaban `_poolReject*` heredados de',
  '`needs-regeneration` / `pool-content-ok-lesen`. El archivo parecía verified pero',
  'llevaba su propio rechazo.',
  '',
  '## Alcance',
  '',
  `| Métrica | N |`,
  `|--------|--:|`,
  `| Total en pool-verified (antes) | ${report.totalVerified} |`,
  `| Con \`_poolRejectReason\` | **${report.withRejectMeta}** |`,
  `| Ya limpios | ${report.cleanAlready} |`,
  `| Kept + strip (gates READY) | ${report.keptStripped.length} |`,
  `| Kept T3 fingerprint reps + strip | ${report.keptT3Rep.length} |`,
  `| → pool-content-ok-lesen | ${report.movedOkLesen.length} |`,
  `| → needs-regeneration | ${report.movedNeedsRegen.length} |`,
  `| Verified después | ${report.after.verifiedCount} |`,
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));
console.log(JSON.stringify(report.after, null, 2));
console.log(`withRejectMeta=${report.withRejectMeta}`);
console.log(`Wrote ${outMd}`);
