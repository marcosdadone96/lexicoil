#!/usr/bin/env node
/**
 * Repara topicTags/topicTag por pregunta (Schreiben/Sprechen A2).
 *   node scripts/repair-a2-schreiben-sprechen-topic-tag.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { detectQuestionTopicTag } from './lib/topicRotation.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
let filesTouched = 0;
let questionsFixed = 0;

for (const file of fs
  .readdirSync(poolDir)
  .filter((f) => /^(schreiben|sprechen).*\.json$/i.test(f))
  .sort()) {
  const fp = path.join(poolDir, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const root = batch.topicTag || batch._requestedTopic || null;
  let changed = false;
  for (const q of batch.questions || []) {
    const mod = String(q.module || '').toLowerCase();
    if (mod !== 'schreiben' && mod !== 'sprechen') continue;
    const lv = String(q.level || batch.level || 'A2').trim().toUpperCase();
    if (lv !== 'A2') continue;
    const expected = detectQuestionTopicTag(q, root);
    const declared = q.topicTags?.[0] || q.topicTag;
    if (declared !== expected) {
      q.topicTags = [expected];
      if (q.topicTag != null) q.topicTag = expected;
      questionsFixed++;
      changed = true;
    }
  }
  if (changed) {
    batch._a2PerQuestionTopicRepairAt = new Date().toISOString();
    batch._a2PerQuestionTopicRepairNote = 'detectQuestionTopicTag per question (not batch-only tagBatchWithTopic)';
    fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    filesTouched++;
    console.log('repaired', file);
  }
}

console.log(JSON.stringify({ filesTouched, questionsFixed }, null, 2));
