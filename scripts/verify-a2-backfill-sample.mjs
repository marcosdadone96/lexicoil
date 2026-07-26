#!/usr/bin/env node
/**
 * Verifica backfill D+E: todas las preguntas reprocesadas, no solo Q1.
 *   node scripts/verify-a2-backfill-sample.mjs [file...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata, VOCAB_TAGS_NORMALIZE_VERSION } from './lib/enrichBatchMetadata.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const defaults = [
  'horen-t2-gemini-069.json',
  'horen-t3-gemini-043.json',
  'lesen-t1-gemini-200.json',
  'horen-t2-cur-health.json',
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : defaults;

let failed = 0;
for (const file of files) {
  const abs = path.join(poolDir, file);
  if (!fs.existsSync(abs)) {
    console.log(`SKIP missing: ${file}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const qs = batch.questions || [];
  console.log(`\n=== ${file} (${qs.length} preguntas) ===`);
  console.log(`batch backfill: ${batch._metadataBackfillAt || 'NO'}`);
  console.log(`vocab version: ${batch._vocabTagsNormalizeVersion || 'NO'}`);

  const sigs = qs.map((q) => JSON.stringify(q.vocabularyTags || []));
  const gramSigs = qs.map((q) => JSON.stringify(q.grammarTags || []));
  const allHaveVocab = qs.every((q) => (q.vocabularyTags || []).length >= 1);
  const distinctVocab = new Set(sigs).size;
  const identicalAll = distinctVocab === 1 && qs.length > 1;

  // Re-enrich should be idempotent (proves full pass applied consistently)
  const { batch: re } = enrichBatchMetadata(batch, {
    forceVocab: true,
    forceGrammar: true,
    fillGrammarDefaults: false,
  });
  let idempotent = true;
  for (let i = 0; i < qs.length; i += 1) {
    const a = JSON.stringify(qs[i].vocabularyTags || []);
    const b = JSON.stringify(re.questions[i].vocabularyTags || []);
    const ga = JSON.stringify(qs[i].grammarTags || []);
    const gb = JSON.stringify(re.questions[i].grammarTags || []);
    if (a !== b || ga !== gb) idempotent = false;
  }

  qs.forEach((q, i) => {
    console.log(
      `  Q${i + 1}: vocab=${JSON.stringify(q.vocabularyTags)} grammar=${JSON.stringify(q.grammarTags)}`,
    );
  });

  const checks = [
    ['all questions have vocabularyTags', allHaveVocab],
    ['batch has backfill stamp', !!batch._metadataBackfillAt],
    [`vocab version ${VOCAB_TAGS_NORMALIZE_VERSION}`, batch._vocabTagsNormalizeVersion === VOCAB_TAGS_NORMALIZE_VERSION],
    ['re-enrich idempotent (all Q stable)', idempotent],
  ];
  for (const [label, ok] of checks) {
    console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
    if (!ok) failed += 1;
  }
  if (identicalAll) {
    console.log(`  ⚠ identical vocabTags on all ${qs.length} questions (may be OK for some modules)`);
  } else {
    console.log(`  ℹ distinct vocab signatures: ${distinctVocab}/${qs.length}`);
  }
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} (${failed} checks failed)\n`);
process.exit(failed ? 1 : 0);
