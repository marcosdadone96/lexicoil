#!/usr/bin/env node
/** Fix today's MCQ double-letter files. Run: node scripts/fix-mcq-double-letter-today-2026-07-14.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'batches/generated/lesen-t2-gemini-115.json',
  'batches/ready/pool-verified/horen-t2-gemini-039.json',
  'batches/ready/pool-verified/horen-t4-gemini-017.json',
];

const DOUBLE_RE = /^[a-c]\)\s*[a-c]\)\s/i;

function countDoubles(batch) {
  let n = 0;
  for (const q of batch.questions || []) {
    for (const opt of q.options || []) {
      const text = typeof opt === 'string' ? opt : String(opt?.text ?? '');
      if (DOUBLE_RE.test(text)) n++;
    }
  }
  return n;
}

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const before = countDoubles(raw);
  const { batch, stats } = applyGermanCapsNormalize(raw, { log: true });
  const after = countDoubles(batch);
  fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(`${rel}: before=${before} after=${after} dedupe=${stats.dedupeFixed}`);
}
