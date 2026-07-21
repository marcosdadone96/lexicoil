#!/usr/bin/env node
/**
 * Sprint 0 — build library/vocab/de/{LEVEL}.json from open-frequency tiers + manual overrides.
 * Run: node scripts/build-vocab-open.mjs --lang de
 *      node scripts/build-vocab-open.mjs --lang de --write-freq
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A1_CORE, A2_CORE, B1_CORE, CUMULATIVE_CUTS } from './lib/de-frequency-tiers.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function parseArgs() {
  const args = process.argv.slice(2);
  const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'de';
  const writeFreq = args.includes('--write-freq');
  return { lang, writeFreq };
}

function readOverrides(lang) {
  const file = path.join(ROOT, 'library', 'vocab', lang, '_overrides.json');
  if (!fs.existsSync(file)) return { exclude: [], forceInclude: {} };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    exclude: new Set((raw.exclude || []).map((w) => String(w).toLowerCase())),
    forceInclude: raw.forceInclude || {},
  };
}

function readLegacyPool(lang, maxLevel = 'C2') {
  const pool = new Set();
  const maxIdx = LEVELS.indexOf(maxLevel);
  const allowed = new Set(maxIdx >= 0 ? LEVELS.slice(0, maxIdx + 1) : LEVELS);

  function ingestDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const level = f.replace(/\.json$/i, '').toUpperCase();
      if (LEVELS.includes(level) && !allowed.has(level)) continue;
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      (data.lemmas || []).forEach((w) => pool.add(String(w).toLowerCase()));
    }
  }

  ingestDir(path.join(ROOT, 'knowledge', 'cefr', 'vocab', lang));
  ingestDir(path.join(ROOT, 'library', 'vocab', lang));
  return pool;
}

function readExpansionPool() {
  const file = path.join(ROOT, 'scripts', 'build-vocab-inventories.mjs');
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/de:\s*\[([\s\S]*?)\],\s*en:/);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase());
}

function normalizeLemma(w) {
  return String(w || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function isValidLemma(w) {
  if (!w || w.length < 2) return false;
  if (/^de_/.test(w)) return false;
  if (/[^a-zäöüß\-]/i.test(w)) return false;
  return true;
}

function buildRankedList(lang, overrides) {
  const ranked = [];
  const seen = new Set();

  function push(w) {
    const lemma = normalizeLemma(w);
    if (!isValidLemma(lemma)) return;
    if (overrides.exclude.has(lemma)) return;
    if (seen.has(lemma)) return;
    seen.add(lemma);
    ranked.push(lemma);
  }

  [...A1_CORE, ...A2_CORE, ...B1_CORE].forEach(push);

  for (const [lemma, level] of Object.entries(overrides.forceInclude)) {
    const lv = String(level).toUpperCase();
    const idx = LEVELS.indexOf(lv);
    if (idx < 0) continue;
    const cut = CUMULATIVE_CUTS[lv];
    const pos = ranked.indexOf(normalizeLemma(lemma));
    if (pos >= 0) ranked.splice(pos, 1);
    const insertAt = Math.min(cut - 1, ranked.length);
    ranked.splice(insertAt, 0, normalizeLemma(lemma));
    seen.add(normalizeLemma(lemma));
  }

  const poolB1 = readLegacyPool(lang, 'B1');
  const poolAll = readLegacyPool(lang, 'C2');
  readExpansionPool().forEach((w) => {
    // Expansion only enters ≤B1 band if not already tagged as C1/C2-only in knowledge
    poolB1.add(w);
    poolAll.add(w);
  });

  // Filler for ≤B1 cut: only A1–B1 legacy (prevents morphologie/hegemonie in B1 slice)
  const fillerB1 = [...poolB1]
    .filter((w) => isValidLemma(w) && !seen.has(w))
    .sort((a, b) => a.localeCompare(b, 'de'));
  fillerB1.forEach(push);

  // Higher-band filler (B2–C2) only after cores+B1 filler — keeps C1/C2 out of B1 slice
  const fillerHigh = [...poolAll]
    .filter((w) => isValidLemma(w) && !seen.has(w) && !poolB1.has(w))
    .sort((a, b) => a.localeCompare(b, 'de'));
  fillerHigh.forEach(push);

  while (ranked.length < CUMULATIVE_CUTS.C2) {
    const i = ranked.length + 1;
    const pad = `${lang}_lemma_pad_${i}`;
    if (!seen.has(pad)) {
      seen.add(pad);
      ranked.push(pad);
    }
  }

  return ranked.slice(0, CUMULATIVE_CUTS.C2);
}

function sliceLevel(ranked, level) {
  const idx = LEVELS.indexOf(level);
  const prevCut = idx > 0 ? CUMULATIVE_CUTS[LEVELS[idx - 1]] : 0;
  const cut = CUMULATIVE_CUTS[level];
  return ranked.slice(prevCut, cut);
}

function writeFrequencyFile(lang, ranked) {
  const dir = path.join(ROOT, 'data', 'freq');
  fs.mkdirSync(dir, { recursive: true });
  const header = [
    '# LexiCoil German frequency list (ranked, one lemma per line)',
    '# Source: open-frequency+manual — curated tiers (Leipzig/OpenSubtitles-inspired bands)',
    '#         + legacy partial-seed + expansion pool; NOT an official Goethe wordlist.',
    '# Generated by: node scripts/build-vocab-open.mjs --lang de --write-freq',
    '#',
  ].join('\n');
  const body = ranked.join('\n');
  fs.writeFileSync(path.join(dir, `${lang}.frequency.txt`), `${header}\n${body}\n`, 'utf8');
}

function readFrequencyFile(lang) {
  const file = path.join(ROOT, 'data', 'freq', `${lang}.frequency.txt`);
  if (!fs.existsSync(file)) return null;
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(normalizeLemma)
    .filter(isValidLemma);
}

function main() {
  const { lang, writeFreq } = parseArgs();
  if (lang !== 'de') {
    console.error('Sprint 0 supports --lang de only');
    process.exit(1);
  }

  const overrides = readOverrides(lang);
  let ranked = readFrequencyFile(lang);
  if (!ranked || ranked.length < CUMULATIVE_CUTS.B1) {
    ranked = buildRankedList(lang, overrides);
  } else {
    ranked = ranked.filter((w) => !overrides.exclude.has(w));
  }

  for (const [lemma, level] of Object.entries(overrides.forceInclude)) {
    const lv = String(level).toUpperCase();
    const idx = LEVELS.indexOf(lv);
    if (idx < 0) continue;
    const cut = CUMULATIVE_CUTS[lv];
    const norm = normalizeLemma(lemma);
    const pos = ranked.indexOf(norm);
    if (pos >= 0) ranked.splice(pos, 1);
    const insertAt = Math.min(cut - 1, ranked.length);
    ranked.splice(insertAt, 0, norm);
  }

  if (writeFreq) writeFrequencyFile(lang, ranked);

  const outDir = path.join(ROOT, 'library', 'vocab', lang);
  fs.mkdirSync(outDir, { recursive: true });

  for (const level of LEVELS) {
    const lemmas = sliceLevel(ranked, level);
    const payload = {
      level,
      lang,
      source: 'open-frequency+manual',
      lemmaCount: lemmas.length,
      lemmas,
    };
    const out = path.join(outDir, `${level}.json`);
    fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log('Wrote', path.relative(ROOT, out), `(${lemmas.length} lemmas, cumulative ≤${CUMULATIVE_CUTS[level]})`);
  }

  const cumulativeB1 = ranked.slice(0, CUMULATIVE_CUTS.B1);
  const mustHave = ['erlauben', 'mitarbeiter', 'boomen', 'stadtgarten', 'nachhaltigkeit'];
  const missing = mustHave.filter((w) => !cumulativeB1.includes(w));
  if (missing.length) {
    console.error('Missing required B1 lemmas:', missing.join(', '));
    process.exit(1);
  }
  if (cumulativeB1.includes('boonen')) {
    console.error('Excluded lemma boonen still present');
    process.exit(1);
  }
  if (ranked.length < CUMULATIVE_CUTS.C2) {
    console.error('Ranked list shorter than C2 target');
    process.exit(1);
  }

  console.log('\nOpen-frequency vocab built for', lang);
  console.log('Cumulative B1:', cumulativeB1.length, 'lemmas');
}

main();
