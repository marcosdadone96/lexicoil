#!/usr/bin/env node
/**
 * Repair B1 Lesen T5 pool: caps, institution grammar, weil, topicTag.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { repairT5InstitutionSurfaces, repairWeilClauseVerbOrder } from './lib/lesenT5InstitutionGrammar.mjs';
import { inferLesenT5DominantTopic } from './lib/topicRotation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POOL = path.join(__dirname, '../batches/ready/pool-verified/B1');
const dryRun = process.argv.includes('--dry-run');

function repairBatch(batch) {
  let b = { ...batch };
  b = repairT5InstitutionSurfaces(b);
  if (b.questions) {
    b.questions = b.questions.map((q) => ({
      ...q,
      explanation: q.explanation ? repairWeilClauseVerbOrder(q.explanation) : q.explanation,
    }));
  }
  b = applyGermanCapsNormalize(b, { log: false }).batch;
  const topic = inferLesenT5DominantTopic(b, b.topicTag || b._requestedTopic);
  b.topicTag = topic;
  b.passages = (b.passages || []).map((p) => ({ ...p, topicTag: topic }));
  b.questions = (b.questions || []).map((q) => ({
    ...q,
    topicTags: [topic],
    ...(q.topicTag != null ? { topicTag: topic } : {}),
  }));
  b._lesenT5RootRepairAt = new Date().toISOString();
  return b;
}

const files = fs.readdirSync(POOL).filter((f) => /^lesen-t5-.+\.json$/i.test(f));
let changed = 0;
for (const f of files) {
  const fp = path.join(POOL, f);
  const raw = fs.readFileSync(fp, 'utf8');
  const before = JSON.parse(raw);
  const after = repairBatch(before);
  const out = `${JSON.stringify(after, null, 2)}\n`;
  const changedJson = JSON.stringify(after) !== JSON.stringify(before);
  if (changedJson) {
    changed++;
    if (!dryRun) fs.writeFileSync(fp, out, 'utf8');
    console.log(`  updated ${f}`);
  }
}
console.log(`Lesen T5 root repair: ${changed}/${files.length} files${dryRun ? ' (dry-run)' : ''}`);
