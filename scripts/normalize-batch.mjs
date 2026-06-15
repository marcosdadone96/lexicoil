#!/usr/bin/env node
/** Normalize a batch file in place (Gemini post-fix). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/normalize-batch.mjs <file.json>');
  process.exit(1);
}
const full = path.resolve(file);
const batch = normalizeBatch(JSON.parse(fs.readFileSync(full, 'utf8')));
fs.writeFileSync(full, JSON.stringify(batch, null, 2) + '\n', 'utf8');
console.log('Normalized', path.basename(full));
