#!/usr/bin/env node
/** One-shot: inject fr: infinitive glosses into SEPARABLE_GLOSS in separableResolve.js */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEPARABLE_GLOSS_FR } from './lib/separableGlossFr.mjs';

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
    const fr = SEPARABLE_GLOSS_FR[key];
    if (!fr) throw new Error(`missing FR gloss for ${key}`);
    if (/\bfr\s*:/.test(inner)) return full;
    count++;
    const safe = fr.replace(/'/g, "\\'");
    return `${indent}${key}: {${inner}, fr: '${safe}' }`;
  },
);

if (!count) {
  console.log('No entries patched (fr: already present?)');
  process.exit(0);
}

fs.writeFileSync(target, src.slice(0, start) + newBlock + src.slice(end));
console.log(`Patched ${count} SEPARABLE_GLOSS entries with fr:`);
