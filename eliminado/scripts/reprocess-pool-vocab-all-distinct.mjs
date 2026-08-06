/**
 * Reprocess ALL pool vocab with per-question extractor; verify 0 identical sets.
 *   node scripts/reprocess-pool-vocab-all-distinct.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata, VOCAB_TAGS_NORMALIZE_VERSION } from './lib/enrichBatchMetadata.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR } from './lib/finalizePoolReady.mjs';

function vocabSig(tags) {
  return [...(tags || [])].map((t) => String(t).toLowerCase()).sort().join('\0');
}

function hasIdentical(batch) {
  const seen = new Set();
  for (const q of batch.questions || []) {
    const s = vocabSig(q.vocabularyTags);
    if (!s) continue;
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}

const report = {
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  scanned: 0,
  rewritten: 0,
  stillIdentical: [],
};

for (const dir of [POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR]) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const abs = path.join(dir, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    report.scanned++;
    const { batch: enriched } = enrichBatchMetadata(batch, {
      topic: false,
      grammar: false,
      vocab: true,
      forceVocab: true,
    });
    fs.writeFileSync(abs, `${JSON.stringify(enriched, null, 2)}\n`);
    report.rewritten++;
    if (hasIdentical(enriched)) report.stillIdentical.push(file);
  }
}

console.log(JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(ROOT, 'batches/ready/gate-logs/POOL-VOCAB-ALL-DISTINCT-2026-07-10.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
