#!/usr/bin/env node
/**
 * Align batch topicTag with detectTopic(content) when declared ≠ content.
 *   node scripts/repair-a2-internal-topic-tag.mjs --apply file.json ...
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';
import { detectTopic } from '../js/engine/partTopicDetect.js';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const apply = process.argv.includes('--apply');
const files = process.argv.filter((a) => a.endsWith('.json'));
const POOL = path.join(ROOT, 'batches/ready/pool-verified/A2');

function batchText(b) {
  return (b.passages || []).map((p) => p.text || '').join('\n') + (b.passage?.text || '');
}

const report = { at: new Date().toISOString(), apply, patches: [] };

for (const file of files) {
  const abs = path.join(POOL, path.basename(file));
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const declared = normalizeB1Topic(batch.topicTag || batch._requestedTopic);
  const detected = detectTopic(batchText(batch));
  if (!detected || !declared || declared === detected) {
    report.patches.push({ file: path.basename(file), skipped: true, declared, detected });
    continue;
  }
  batch.topicTag = detected;
  batch._requestedTopic = detected;
  for (const p of batch.passages || []) {
    if (p.topicTag != null) p.topicTag = detected;
  }
  for (const q of batch.questions || []) {
    if (q.topicTags) q.topicTags = [detected];
  }
  batch._internalTopicTagRepairAt = report.at;
  if (apply) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  report.patches.push({ file: path.basename(file), declared, detected, applied: apply });
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-internal-topic-tag-repair.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
