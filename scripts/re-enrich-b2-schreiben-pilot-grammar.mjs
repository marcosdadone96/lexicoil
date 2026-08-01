#!/usr/bin/env node
/** Re-enrich grammarTags on B2 Schreiben pilot batches (052, 053). */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';

const files = [
  'batches/ready/pool-verified/B2/schreiben-gemini-052.json',
  'batches/ready/pool-verified/B2/schreiben-gemini-053.json',
];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch: out } = enrichBatchMetadata(batch, { forceGrammar: true, grammar: true, vocab: false, topic: false });
  const tags = out.questions?.[0]?.grammarTags || [];
  if (tags.some((t) => String(t).includes('g-de-b1-'))) {
    console.error('FAIL still B1 tags:', rel, tags);
    process.exit(1);
  }
  fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log('OK', path.basename(rel), '→', tags.join(', '));
}
