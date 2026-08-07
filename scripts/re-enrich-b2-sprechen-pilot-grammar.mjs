#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'batches/ready/pool-verified/B2/sprechen-t1-gemini-019.json',
  'batches/ready/pool-verified/B2/sprechen-t2-gemini-019.json',
];

for (const rel of FILES) {
  const fp = path.join(ROOT, rel);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const q of batch.questions || []) {
    q.grammarTags = ['g-de-b2-argumentation', 'g-de-b2-diskussion'].filter(Boolean);
  }
  const { batch: out } = enrichBatchMetadata(batch, {
    forceGrammar: true,
    grammar: true,
    vocab: false,
    topic: false,
  });
  fs.writeFileSync(fp, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(rel, '→', out.questions?.[0]?.grammarTags?.join(', ') || '(none)');
}
