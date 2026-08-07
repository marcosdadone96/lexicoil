#!/usr/bin/env node
/**
 * Backfill metadata pool-verified/A2 — causas D + E (vocabularyTags + grammarTags).
 *   node scripts/backfill-a2-pool-metadata.mjs --dry-run
 *   node scripts/backfill-a2-pool-metadata.mjs --sample 3
 *   node scripts/backfill-a2-pool-metadata.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata, questionSpecificVocabBlob } from './lib/enrichBatchMetadata.mjs';

function tagInBlob(tag, blob) {
  const t = String(tag).toLowerCase();
  const b = String(blob).toLowerCase();
  if (b.includes(t)) return true;
  if (t.length >= 5 && b.split(/\s+/).some((w) => w.startsWith(t.slice(0, 5)))) return true;
  return false;
}

function countContaminatedQuestions(batch) {
  let bad = 0;
  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  for (const q of batch.questions || []) {
    const mod = String(q.module || batch.module || '').toLowerCase();
    if (mod !== 'lesen' && mod !== 'horen') continue;
    const blob = questionSpecificVocabBlob(q, passagesById.get(q.passageId));
    const tags = q.vocabularyTags || [];
    if (tags.some((t) => !tagInBlob(t, blob))) bad += 1;
  }
  return bad;
}

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const dryRun = process.argv.includes('--dry-run');
const sampleN = Number(process.argv.find((a, i) => process.argv[i - 1] === '--sample') || 0);

const files = fs.readdirSync(poolDir).filter((f) => f.endsWith('.json'));
const targets = sampleN > 0 ? files.slice(0, sampleN) : files;

let updated = 0;
let contaminatedBefore = 0;
let contaminatedAfter = 0;
let totalLesenHorenQ = 0;

for (const file of targets) {
  const abs = path.join(poolDir, file);
  if (!fs.existsSync(abs)) {
    console.log(`skip (missing): ${file}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  contaminatedBefore += countContaminatedQuestions(batch);
  for (const q of batch.questions || []) {
    const mod = String(q.module || batch.module || '').toLowerCase();
    if (mod === 'lesen' || mod === 'horen') totalLesenHorenQ += 1;
  }
  const before = JSON.stringify({
    q0v: batch.questions?.[0]?.vocabularyTags,
    q0g: batch.questions?.[0]?.grammarTags,
  });
  const { batch: enriched } = enrichBatchMetadata(batch, {
    forceVocab: true,
    forceGrammar: true,
    fillGrammarDefaults: false,
  });
  const after = JSON.stringify({
    q0v: enriched.questions?.[0]?.vocabularyTags,
    q0g: enriched.questions?.[0]?.grammarTags,
  });
  if (before !== after || enriched._vocabTagsNormalizeVersion) {
    updated += 1;
    contaminatedAfter += countContaminatedQuestions(enriched);
    enriched._metadataBackfillAt = new Date().toISOString();
    enriched._metadataBackfillNote = 'A2 root-cause audit D+E';
    if (!dryRun) {
      fs.writeFileSync(abs, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');
    }
    console.log(`${dryRun ? '[dry-run] ' : ''}${file}: vocab ${JSON.stringify(enriched.questions?.[0]?.vocabularyTags?.slice(0, 3))} grammar ${JSON.stringify(enriched.questions?.[0]?.grammarTags)}`);
  } else {
    contaminatedAfter += countContaminatedQuestions(batch);
  }
}
console.log(`\nContaminación vocabularyTags (audit D): ${contaminatedBefore} → ${contaminatedAfter} / ${totalLesenHorenQ} preguntas lesen+horen`);
console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated}/${targets.length} files.`);
