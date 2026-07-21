#!/usr/bin/env node
import fs from 'node:fs';
import { checkLesenT5BatchTopic } from './lib/lesenT5TopicFilter.mjs';

const paths = {
  '095': 'batches/ready/pool-verified/B1/lesen-t5-gemini-095.json',
  '099': 'batches/ready/pool-verified/B1/lesen-t5-gemini-099.json',
  '092': 'batches/needs-regeneration/B1/lesen-t5-gemini-092.json',
  '094': 'batches/needs-regeneration/B1/lesen-t5-gemini-094.json',
  '096': 'batches/needs-regeneration/B1/lesen-t5-gemini-096.json',
  '098': 'batches/needs-regeneration/B1/lesen-t5-gemini-098.json',
};

for (const [n, rel] of Object.entries(paths)) {
  const batch = JSON.parse(fs.readFileSync(rel, 'utf8'));
  const r = checkLesenT5BatchTopic(batch);
  console.log(`${n} ${batch.topicTag}/${batch._textSubtype} → ${r.ok ? 'PASS' : r.issue}`);
}
