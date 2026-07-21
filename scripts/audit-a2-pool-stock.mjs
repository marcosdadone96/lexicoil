#!/usr/bin/env node
/** Raw + assemble-gate stock for A2 pool cells */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { fileResForLevel, mcqCellKeys, oralTeilsForLevel } from './lib/examLevelCells.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = poolVerifiedDir('A2');
const FILE_RE = fileResForLevel('A2');

const raw = {};
for (const cell of mcqCellKeys('A2')) {
  const re = FILE_RE[cell];
  raw[cell] = fs.readdirSync(dir).filter((f) => re?.test(f)).length;
}
for (const mod of ['schreiben', 'sprechen']) {
  const re = mod === 'schreiben' ? /^schreiben-.*\.json$/i : /^sprechen-.*\.json$/i;
  raw[`${mod}_bundles`] = fs.readdirSync(dir).filter((f) => re.test(f)).length;
  const teils = oralTeilsForLevel(mod, 'A2');
  for (const t of teils) raw[`${mod}_${t}`] = raw[`${mod}_bundles`];
}

console.log(JSON.stringify({ dir, raw, totalFiles: fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length }, null, 2));
