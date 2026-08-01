#!/usr/bin/env node
/**
 * Separable verb coverage: all library/vocab/de/*.json vs SEPARABLE_INFINITIVES.
 * Flags refined morph gaps (excludes common inseparable / non-verb false positives).
 *
 *   node scripts/analyze-separable-vocab-coverage.mjs
 *   node scripts/analyze-separable-vocab-coverage.mjs --strict   # fail if refined gaps > 0
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  SEPARABLE_PREFIXES,
  SEPARABLE_INFINITIVES,
} from './lib/enrichBatchMetadata.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));

const strict = process.argv.includes('--strict');

/** Extended particles for morph scan (includes herunter/fort used in DWDS Goethe lists). */
const MORPH_PREFIXES = [...new Set([
  ...SEPARABLE_PREFIXES,
  'herunter', 'fort', 'fern', 'hinauf', 'hinaus', 'herein', 'heraus', 'davon',
])];

const INSEPARABLE_IN_BANK = new Set([
  'übersetzen', 'unterhalten', 'unternehmen', 'unterstützen', 'untersuchen', 'beistehen',
  'übersteigen', 'überleben', 'überzeugen', 'verstehen', 'bekommen', 'besuchen', 'verreisen',
  'versuchen', 'beschweren', 'erreichen', 'erklären', 'erzählen', 'empfehlen', 'entdecken',
]);

const NON_VERB_LEMMA = new Set([
  'einverstanden', 'einzeln', 'zufrieden', 'übermorgen', 'vorgestern', 'zusammen',
  'mitmenschen', 'zutaten', 'angefangen', 'eingetreten',
  'abendessen', 'mittagessen', 'antworten',
]);

/** Documented separables in vocab not yet allowlisted (run DWDS before adding). */
const KNOWN_PENDING_ALLOWLIST = new Set(['fernsehen']);

function looksLikeInfinitive(w) {
  if (!/(?:en|eln|ern)$/i.test(w) || w.length < 4) return false;
  if (/(?:isch|lich|iv|al|är|ell|sam|bar|os)en$/i.test(w)) return false;
  if (w.length >= 9 && /igen$/i.test(w)) return false;
  if (/(?:ungen|heiten|keiten|schaften|ionen|täten)$/i.test(w)) return false;
  if (/^(?:ge).+(?:en)$/i.test(w) && !SEPARABLE_INFINITIVES.has(w)) return false;
  if (/(?:sehen|geben|nehmen|kommen|halten|lassen|rufen)en$/i.test(w)) return false;
  return true;
}

function morphSeparableCandidate(lemma) {
  const low = String(lemma || '').toLowerCase().trim();
  if (!looksLikeInfinitive(low)) return null;
  const sorted = [...MORPH_PREFIXES].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (!low.startsWith(p) || low.length <= p.length + 3) continue;
    const root = low.slice(p.length);
    if (!/(?:en|eln|ern)$/i.test(root) || root.length < 4) continue;
    return { lemma: low, prefix: p, root };
  }
  return null;
}

function loadAllDeVocabLemmas() {
  const dir = path.join(ROOT, 'library/vocab/de');
  const byLevel = {};
  const allLemmas = new Map(); // lemma -> { levels: Set, dwdsSourced: boolean }

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const lv = file.replace(/\.json$/i, '');
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const lemmas = j.lemmas || [];
    const source = String(j.source || '');
    const dwdsBank = /dwds/i.test(source);
    byLevel[lv] = {
      lemmaCount: j.lemmaCount ?? lemmas.length,
      fileCount: lemmas.length,
      source,
      dwdsSourcedBank: dwdsBank,
    };
    for (const l of lemmas) {
      const key = String(l).toLowerCase();
      if (!allLemmas.has(key)) {
        allLemmas.set(key, { levels: new Set(), inDwdsSourcedBank: false });
      }
      const row = allLemmas.get(key);
      row.levels.add(lv);
      if (dwdsBank) row.inDwdsSourcedBank = true;
    }
  }
  return { byLevel, allLemmas };
}

const { byLevel, allLemmas } = loadAllDeVocabLemmas();
const allow = SeparableResolve.SEPARABLE_INFINITIVES;
const allowEmb = SEPARABLE_INFINITIVES;

const morphInBanks = new Map();
for (const [lemma, meta] of allLemmas) {
  const c = morphSeparableCandidate(lemma);
  if (!c) continue;
  morphInBanks.set(lemma, { ...c, levels: [...meta.levels].sort(), inDwdsSourcedBank: meta.inDwdsSourcedBank });
}

const inAllowlist = [];
const missingRaw = [];
const missingRefined = [];

for (const [lemma, info] of morphInBanks) {
  const row = {
    lemma,
    prefix: info.prefix,
    levels: info.levels,
    inDwdsSourcedBank: info.inDwdsSourcedBank,
  };
  if (allow.has(lemma)) inAllowlist.push(row);
  else missingRaw.push(row);
  if (!allow.has(lemma) && !INSEPARABLE_IN_BANK.has(lemma) && !NON_VERB_LEMMA.has(lemma)) {
    missingRefined.push(row);
  }
}

const missingRefinedActionable = missingRefined.filter((r) => !KNOWN_PENDING_ALLOWLIST.has(r.lemma));

missingRaw.sort((a, b) => a.lemma.localeCompare(b.lemma));
missingRefined.sort((a, b) => a.lemma.localeCompare(b.lemma));
inAllowlist.sort((a, b) => a.lemma.localeCompare(b.lemma));

const dwdsSourcedMorph = [...morphInBanks.values()].filter((v) => v.inDwdsSourcedBank);

const report = {
  at: new Date().toISOString(),
  scope: 'library/vocab/de/*.json (all CEFR levels)',
  allowlist: {
    separableResolveSize: allow.size,
    enrichBatchMetadataSize: allowEmb.size,
    inSync: allow.size === allowEmb.size,
  },
  vocabBanks: byLevel,
  unionLemmaCount: allLemmas.size,
  morphSeparableCandidatesInUnion: morphInBanks.size,
  morphCandidatesInDwdsSourcedBanks: dwdsSourcedMorph.length,
  inAllowlistCount: inAllowlist.length,
  missingFromAllowlistRawCount: missingRaw.length,
  missingFromAllowlistRefinedCount: missingRefined.length,
  missingFromAllowlistRefinedActionableCount: missingRefinedActionable.length,
  knownPendingAllowlist: [...KNOWN_PENDING_ALLOWLIST],
  missingFromAllowlistRefined: missingRefined,
  missingFromAllowlistRefinedActionable: missingRefinedActionable,
  missingFromAllowlistRawSample: missingRaw.slice(0, 25),
};

const out = path.join(ROOT, 'batches/ready/gate-logs/separable-vocab-coverage.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('Allowlist SEPARABLE_INFINITIVES:', allow.size, '(sync', allow.size === allowEmb.size ? 'OK' : 'MISMATCH', ')');
console.log('Scope: all library/vocab/de — union', allLemmas.size, 'lemmas');
console.log('Morph separable candidates:', morphInBanks.size);
console.log('  in DWDS-sourced banks (metadata):', dwdsSourcedMorph.length);
console.log('  covered by allowlist:', inAllowlist.length);
console.log('  missing (raw):', missingRaw.length);
console.log('  missing (refined, actionable):', missingRefinedActionable.length);
if (KNOWN_PENDING_ALLOWLIST.size) {
  console.log('  known pending (documented):', [...KNOWN_PENDING_ALLOWLIST].join(', '));
}
if (missingRefinedActionable.length) {
  console.log('\nRefined gaps:');
  for (const m of missingRefinedActionable.slice(0, 20)) {
    console.log(`  ${m.lemma}  [${m.levels.join(', ')}]`);
  }
}
console.log('\nWrote', path.relative(ROOT, out));

if (strict && missingRefinedActionable.length > 0) process.exit(1);
