/**
 * Pool impact for DWDS-accepted verbs + emit allowlist patch data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SeparableResolve from '../js/engine/separableResolve.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dwds = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/separable-dwds-verify-2026-07-12.json'), 'utf8'),
);
const DIR = path.join(ROOT, 'batches/ready/pool-verified');
const allow = SeparableResolve.SEPARABLE_INFINITIVES;
const toAdd = dwds.accept.map((r) => r.lemma).filter((w) => !allow.has(w)).sort();
const discarded = [...dwds.discard, ...dwds.discardedNonVerb];

const PREFIXES = [...SeparableResolve.SEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);
function splitParts(full) {
  for (const p of PREFIXES) {
    if (full.startsWith(p) && full.length > p.length + 2) return { p, root: full.slice(p.length) };
  }
  // anerkennen
  if (full === 'anerkennen') return { p: 'an', root: 'erkennen' };
  return null;
}

function hasSplitEvidence(text, full) {
  const sp = splitParts(full);
  if (!sp) return false;
  const tokens = SeparableResolve.tokenize(text);
  const articles = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen']);
  for (let i = 0; i < tokens.length; i++) {
    let root = SeparableResolve.rootOfToken(tokens[i]);
    // special: erkennt → erkennen for anerkennen
    if (tokens[i] === 'erkennt' || tokens[i] === 'erkenne' || tokens[i] === 'erkennst') root = 'erkennen';
    if (root !== sp.root) continue;
    for (let j = i + 1; j < Math.min(tokens.length, i + 14); j++) {
      if (tokens[j] !== sp.p) continue;
      const next = tokens[j + 1] || '';
      if (articles.has(next)) continue;
      return true;
    }
  }
  return false;
}

const hits = {};
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const c of toAdd) {
    const solid = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(raw);
    const split = hasSplitEvidence(raw, c);
    if (!solid && !split) continue;
    hits[c] = hits[c] || { solid: 0, split: 0, files: new Set() };
    if (solid) hits[c].solid += 1;
    if (split) hits[c].split += 1;
    hits[c].files.add(f);
  }
}

const rows = Object.entries(hits)
  .map(([lemma, v]) => ({ lemma, solid: v.solid, split: v.split, files: v.files.size }))
  .sort((a, b) => b.files - a.files || a.lemma.localeCompare(b.lemma));

const out = {
  generatedAt: new Date().toISOString(),
  poolFiles: files.length,
  toAddCount: toAdd.length,
  discarded,
  poolHits: rows,
  poolHitCount: rows.length,
  noPoolHitYet: toAdd.filter((w) => !hits[w]),
  toAdd,
};
fs.writeFileSync(
  path.join(ROOT, 'batches/ready/gate-logs/separable-dwds-pool-impact-2026-07-12.json'),
  JSON.stringify(out, null, 2),
);
console.log('toAdd', toAdd.length);
console.log('discarded', discarded.map((d) => d.lemma || d).join(', '));
console.log('pool hits', rows.length, '/', toAdd.length);
rows.slice(0, 30).forEach((r) => console.log(`  ${r.files}f solid=${r.solid} split=${r.split}  ${r.lemma}`));
console.log('no pool yet sample:', out.noPoolHitYet.slice(0, 20).join(', '), '...');
