/**
 * Patch SEPARABLE_INFINITIVES in browser + enrichBatchMetadata from DWDS accept list.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SeparableResolve from '../js/engine/separableResolve.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dwds = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/separable-dwds-verify-2026-07-12.json'), 'utf8'),
);

const PREFIX_ORDER = [
  'mit', 'auf', 'an', 'aus', 'ein', 'zu', 'vor', 'nach', 'bei', 'los', 'weg',
  'zurück', 'weiter', 'fest', 'teil', 'statt', 'ab', 'her', 'um', 'durch',
  'über', 'unter', 'zusammen', 'aner',
];

function prefixOf(w) {
  if (w === 'anerkennen') return 'aner';
  for (const p of [...PREFIX_ORDER].sort((a, b) => b.length - a.length)) {
    if (w.startsWith(p) && w.length > p.length + 2) return p;
  }
  return 'other';
}

const allow = new Set(SeparableResolve.SEPARABLE_INFINITIVES);
for (const r of dwds.accept) allow.add(r.lemma);
const all = [...allow].sort((a, b) => a.localeCompare(b, 'de'));

const groups = new Map();
for (const w of all) {
  const p = prefixOf(w);
  if (!groups.has(p)) groups.set(p, []);
  groups.get(p).push(w);
}

function formatSet(indent = '  ') {
  const lines = [`${indent}const SEPARABLE_INFINITIVES = new Set([`];
  const order = PREFIX_ORDER.filter((p) => groups.has(p)).concat(
    [...groups.keys()].filter((p) => !PREFIX_ORDER.includes(p)),
  );
  for (const p of order) {
    const words = groups.get(p) || [];
    lines.push(`${indent}  // ${p}-`);
    for (let i = 0; i < words.length; i += 6) {
      const chunk = words.slice(i, i + 6).map((w) => `'${w}'`).join(', ');
      lines.push(`${indent}  ${chunk},`);
    }
  }
  lines.push(`${indent}]);`);
  return lines.join('\n');
}

function formatExportSet() {
  const lines = ['export const SEPARABLE_INFINITIVES = new Set(['];
  const order = PREFIX_ORDER.filter((p) => groups.has(p)).concat(
    [...groups.keys()].filter((p) => !PREFIX_ORDER.includes(p)),
  );
  for (const p of order) {
    const words = groups.get(p) || [];
    lines.push(`  // ${p}-`);
    for (let i = 0; i < words.length; i += 6) {
      const chunk = words.slice(i, i + 6).map((w) => `'${w}'`).join(', ');
      lines.push(`  ${chunk},`);
    }
  }
  lines.push(']);');
  return lines.join('\n');
}

function replaceSet(filePath, replacement, isExport) {
  let src = fs.readFileSync(filePath, 'utf8');
  const re = isExport
    ? /export const SEPARABLE_INFINITIVES = new Set\(\[[\s\S]*?\]\);/
    : /const SEPARABLE_INFINITIVES = new Set\(\[[\s\S]*?\]\);/;
  if (!re.test(src)) throw new Error('Set block not found in ' + filePath);
  src = src.replace(re, replacement);
  fs.writeFileSync(filePath, src);
  console.log('patched', filePath, '→', all.length);
}

replaceSet(
  path.join(ROOT, 'js/engine/separableResolve.js'),
  formatSet('  '),
  false,
);
replaceSet(
  path.join(ROOT, 'scripts/lib/enrichBatchMetadata.mjs'),
  formatExportSet(),
  true,
);

console.log('final count', all.length);
console.log('discarded non-verbs:', dwds.discard.map((d) => d.lemma).join(', '));
