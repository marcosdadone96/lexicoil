#!/usr/bin/env node
/**
 * Reprocess all pool-verified with germanCapsNormalize v3.8
 * (die-kleinen / substantivized adj no-noun-head + possessive attr-adj).
 *
 *   node scripts/reprocess-pool-caps-v3.8-2026-07-11.mjs
 *   node scripts/reprocess-pool-caps-v3.8-2026-07-11.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'batches/ready/pool-verified');
const LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/caps-v3.8-reprocess-2026-07-11.json',
);
const dryRun = process.argv.includes('--dry-run');

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const report = {
  generatedAt: new Date().toISOString(),
  version: GERMAN_CAPS_NORMALIZE_VERSION,
  dryRun,
  filesScanned: files.length,
  filesChanged: [],
  stampOnly: [],
  jahrlichen005: null,
};

console.log(`Caps reprocess · ${files.length} files · ${GERMAN_CAPS_NORMALIZE_VERSION} · dryRun=${dryRun}`);

for (const f of files) {
  const abs = path.join(DIR, f);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const before = JSON.stringify(batch);
  const { batch: normalized, stats, changes } = applyGermanCapsNormalize(structuredClone(batch));
  const next = stampGermanCapsVersion(normalized);
  const after = JSON.stringify(next);
  const contentChanged =
    stats.markdownFixed + stats.decapFixed + stats.capFixed > 0 || before !== after;

  const tokenSamples = changes
    .filter((c) => c.kind === 'token')
    .slice(0, 30)
    .map((c) => ({
      field: c.field || c.path || c.ctx,
      before: c.before,
      after: c.after,
    }));

  if (f === 'horen-t1-gemini-005.json') {
    const text = (next.passages || []).map((p) => p.text || '').join('\n');
    report.jahrlichen005 = {
      hasJaehrlichenCap: /Jährlichen/.test(text),
      hasJaehrlichenLower: /jährlichen/.test(text),
      snippet: (text.match(/.{0,40}[Jj]ährlichen.{0,40}/) || [''])[0],
    };
  }

  if (stats.markdownFixed + stats.decapFixed + stats.capFixed > 0) {
    report.filesChanged.push({
      file: f,
      stats,
      samples: tokenSamples,
    });
    console.log(
      `  CHANGE ${f}: md=${stats.markdownFixed} decap=${stats.decapFixed} cap=${stats.capFixed}`,
    );
  } else {
    report.stampOnly.push(f);
  }

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`);
  }
}

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nChanged content: ${report.filesChanged.length}`);
console.log(`Stamp only: ${report.stampOnly.length}`);
console.log('005 Jährlichen:', report.jahrlichen005);
console.log(`Log: ${LOG}`);
