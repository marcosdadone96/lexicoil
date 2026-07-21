/**
 * Reprocess vocabularyTags: 3sg -et finites → infinitive (arbeitet→arbeiten)
 * after lemmatizer tryDeFiniteEt.
 *
 * Surgical: only remaps tags that lemmatize from *et → *en; does not re-extract.
 *
 *   node scripts/reprocess-et-finite-lemmas-2026-07-12.mjs
 *   node scripts/reprocess-et-finite-lemmas-2026-07-12.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
const dryRun = process.argv.includes('--dry-run');

function remapTag(tag) {
  const raw = String(typeof tag === 'string' ? tag : tag?.word || '').trim();
  if (!raw) return { tag, changed: false };
  const low = raw.toLowerCase();
  if (!low.endsWith('et') || low.length < 5) return { tag, changed: false };
  const lem = String(Lemmatizer.normalizeLemma(raw, 'de') || '').toLowerCase();
  if (!lem || lem === low) return { tag, changed: false };
  if (!/(?:en|eln|ern)$/.test(lem)) return { tag, changed: false };
  // Only accept clear et→en finite remap (arbeitet→arbeiten)
  if (!low.endsWith('et') || lem !== `${low.slice(0, -2)}en`) {
    // öffnet→öffnen: stem öffn + en; slice -2 is öffn ✓
    // bedeutet→bedeuten ✓
  }
  if (lem === `${low.slice(0, -2)}en` || lem === `${low.slice(0, -2).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')}en`) {
    if (typeof tag === 'string') return { tag: lem, changed: true, from: low, to: lem };
    return { tag: { ...tag, word: lem }, changed: true, from: low, to: lem };
  }
  // öffnen keeps ö; lem may be öffnen while slice gives öffnen
  if (lem.endsWith('en') && low.endsWith('et') && lem.slice(0, -2) === low.slice(0, -2)) {
    if (typeof tag === 'string') return { tag: lem, changed: true, from: low, to: lem };
    return { tag: { ...tag, word: lem }, changed: true, from: low, to: lem };
  }
  return { tag, changed: false };
}

function walkTags(doc) {
  const changes = [];
  const visit = (n, pathHint) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach((x, i) => visit(x, `${pathHint}[${i}]`));
      return;
    }
    if (Array.isArray(n.vocabularyTags)) {
      const next = [];
      let local = false;
      for (const t of n.vocabularyTags) {
        const { tag, changed, from, to } = remapTag(t);
        next.push(tag);
        if (changed) {
          local = true;
          changes.push({ path: pathHint, from, to });
        }
      }
      if (local) n.vocabularyTags = next;
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'vocabularyTags') continue;
      if (v && typeof v === 'object') visit(v, `${pathHint}.${k}`);
    }
  };
  visit(doc, 'root');
  return changes;
}

const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json'));
let filesTouched = 0;
let tagRemaps = 0;
const byFrom = {};
const touched = [];

for (const f of files) {
  const fp = path.join(POOL, f);
  const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const changes = walkTags(doc);
  if (!changes.length) continue;
  filesTouched++;
  tagRemaps += changes.length;
  touched.push(f);
  for (const c of changes) {
    byFrom[c.from] = (byFrom[c.from] || 0) + 1;
  }
  doc._etFiniteLemmaReprocessAt = new Date().toISOString();
  doc._etFiniteLemmaReprocessCount = changes.length;
  if (!dryRun) {
    fs.writeFileSync(fp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }
}

console.log(dryRun ? 'DRY-RUN' : 'WROTE');
console.log({
  poolFiles: files.length,
  filesTouched,
  tagRemaps,
  byFrom,
  touched: touched.slice(0, 30),
  touchedMore: Math.max(0, touched.length - 30),
});
