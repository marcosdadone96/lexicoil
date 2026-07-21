#!/usr/bin/env node
/**
 * Scan all regular verbs the conjugator knows; list participles fixed by epenthesis rule.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

globalThis.Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
globalThis.SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const VerbConjugation = require(path.join(ROOT, 'js/data/verbConjugation.js'));

function oldNeedsEt(stem) {
  return /(?:d|t|m|n|chn|ff|mm)$/i.test(stem);
}
function oldPartizip(stem) {
  return 'ge' + stem + (oldNeedsEt(stem) ? 'et' : 't');
}

function deStem(inf) {
  const low = String(inf || '').toLowerCase();
  if (low.endsWith('en')) return low.slice(0, -2);
  if (low.endsWith('n')) return low.slice(0, -1);
  return low;
}

const DE_PARTIZIP_KEYS = new Set(
  Object.keys(
    (() => {
      const src = fs.readFileSync(path.join(ROOT, 'js/data/verbConjugation.js'), 'utf8');
      const m = src.match(/const DE_PARTIZIP = \{([\s\S]*?)\};/);
      if (!m) return {};
      const keys = [...m[1].matchAll(/^\s+([a-zäöüß]+):/gm)].map((x) => x[1]);
      return Object.fromEntries(keys.map((k) => [k, 1]));
    })(),
  ),
);

const candidates = new Set([...SeparableResolve.SEPARABLE_INFINITIVES]);

const fixed = [];
for (const verb of [...candidates].sort()) {
  const sep = VerbConjugation.splitSeparableInfinitive(verb);
  const root = sep ? sep.root : verb;
  if (DE_PARTIZIP_KEYS.has(root)) continue;
  const stem = deStem(root);
  const before = sep ? sep.prefix + oldPartizip(stem) : oldPartizip(stem);
  const after = VerbConjugation.getPerfekt(verb, 'de')?.partizip;
  if (before !== after && after) {
    fixed.push({ verb, stem, before, after });
  }
}

const out = path.join(ROOT, 'batches/ready/gate-logs/partizip-epenthesis-fix-2026-07-13.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: fixed.length, fixed }, null, 2),
);

console.log(`Participles corrected: ${fixed.length}`);
for (const row of fixed) {
  console.log(`  ${row.verb}: ${row.before} → ${row.after}`);
}
console.log('Report:', out);
