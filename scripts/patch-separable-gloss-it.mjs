#!/usr/bin/env node
/** One-shot: inject it: infinitive glosses into SEPARABLE_GLOSS in separableResolve.js */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEPARABLE_GLOSS_IT } from './lib/separableGlossIt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'js/engine/separableResolve.js');
let src = fs.readFileSync(target, 'utf8');
const start = src.indexOf('const SEPARABLE_GLOSS = Object.freeze({');
const end = src.indexOf('});', start) + 3;
const block = src.slice(start, end);

let count = 0;
const newBlock = block.replace(
  /^(\s+)([a-zäöüß]+):\s*\{([^}]+)\}/gm,
  (full, indent, key, inner) => {
    const it = SEPARABLE_GLOSS_IT[key];
    if (!it) throw new Error(`missing IT gloss for ${key}`);
    if (/\bit\s*:/.test(inner)) return full;
    count++;
    const safe = it.replace(/'/g, "\\'");
    return `${indent}${key}: {${inner}, it: '${safe}' }`;
  },
);

if (!count) {
  console.log('No entries patched (it: already present?)');
  process.exit(0);
}

fs.writeFileSync(target, src.slice(0, start) + newBlock + src.slice(end));
console.log(`Patched ${count} SEPARABLE_GLOSS entries with it:`);
