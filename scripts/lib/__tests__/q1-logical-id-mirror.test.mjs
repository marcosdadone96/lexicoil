/**
 * Regression: Q1 must not flag same logical ID under different folders as duplicate.
 *   node scripts/lib/__tests__/q1-logical-id-mirror.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDedupCorpus, corpusExcludingSource, logicalBatchId } from '../qualityGates/dedupCorpus.mjs';
import { runDuplicateContentGate } from '../qualityGates/duplicateContentGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const needs = path.join(ROOT, 'batches/needs-regeneration');
const pco = path.join(ROOT, 'batches/ready/pool-content-ok');

let sample = null;
if (fs.existsSync(needs) && fs.existsSync(pco)) {
  for (const f of fs.readdirSync(needs)) {
    if (!/^lesen-t1-.*\.json$/i.test(f)) continue;
    if (fs.existsSync(path.join(pco, f))) {
      sample = f;
      break;
    }
  }
}

if (!sample) {
  console.log('skip: no lesen twin in needs-regeneration + pool-content-ok');
  process.exit(0);
}

const batch = JSON.parse(fs.readFileSync(path.join(needs, sample), 'utf8'));
const corpus = buildDedupCorpus({
  dirs: [needs, pco, path.join(ROOT, 'batches/ready/lesen'), path.join(ROOT, 'batches/generated')],
  bankPath: path.join(ROOT, 'library/de/B1/questions.json'),
});
const source = `batches/needs-regeneration/${sample}`;
const filtered = corpusExcludingSource(corpus, source);

const buggy = runDuplicateContentGate(batch, {
  selfSource: `batches/generated/${sample}`,
  corpus: filtered,
  index: corpus.index,
});
const fixed = runDuplicateContentGate(batch, {
  selfSource: source,
  corpus: filtered,
  index: filtered.index,
});

const buggyMirror = (buggy.findings || []).some((f) =>
  String(f.detail || '').includes(logicalBatchId(sample)),
);
const fixedMirror = (fixed.findings || []).some((f) => {
  const ref = String(f.detail || '').match(/«([^»]+)»/);
  return ref && logicalBatchId(ref[1]) === logicalBatchId(sample);
});

if (fixedMirror) {
  console.error('FAIL: fixed path still reports same-logical-id mirror', fixed.findings);
  process.exit(1);
}
console.log('ok: logical-id mirror suppressed for', sample, {
  buggyFindings: (buggy.findings || []).length,
  fixedFindings: (fixed.findings || []).length,
  buggyHadMirror: buggyMirror,
});
