#!/usr/bin/env node
/**
 * Find pool vocabularyTags that would be misclassified as verb due to -en heuristic.
 * Run: node scripts/scan-pool-en-noun-misclass.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');

const ctx = { console, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/articleLexicon.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'), ctx);
const ManualVocab = ctx.ManualVocab || ctx.window?.ManualVocab;
const ArticleLexicon = ctx.ArticleLexicon || ctx.window?.ArticleLexicon;
ArticleLexicon.loadSync(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lexicon/de-gender.json'), 'utf8')));

function norm(s) {
  return String(s || '').trim().normalize('NFC').toLowerCase();
}

const freq = new Map();
const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json'));
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  for (const q of batch.questions || []) {
    for (const tag of q.vocabularyTags || []) {
      const raw = String(tag || '').trim();
      if (!/^[A-ZÄÖÜ]/.test(raw)) continue;
      if (!/en$/i.test(norm(raw))) continue;
      const fc = { word: raw, translations: { en: 'x' } };
      ManualVocab.enrichFlashcard(fc, 'de');
      if (fc.type === 'verb' && ArticleLexicon.lookupGender(raw, 'de')) {
        const key = norm(raw);
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    }
  }
}

const hits = [...freq.entries()].sort((a, b) => b[1] - a[1]);
const outPath = path.join(ROOT, 'batches/ready/gate-logs/pool-en-verb-misclass-2026-07-13.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ scannedAt: new Date().toISOString(), poolFiles: files.length, hits: hits.map(([lemma, count]) => ({ lemma, count })) }, null, 2),
);

console.log(`\n── Pool -en→verb misclass scan (${files.length} files) ──\n`);
console.log(`Remaining misclassifications (lexicon has gender but POS=verb): ${hits.length}`);
console.log(`Report: ${path.relative(ROOT, outPath)}\n`);
for (const [lemma, count] of hits.slice(0, 25)) {
  console.log(`${String(count).padStart(3)}×  ${lemma}`);
}
