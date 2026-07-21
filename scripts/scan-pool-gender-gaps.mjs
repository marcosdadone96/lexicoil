#!/usr/bin/env node
/**
 * Scan pool-verified (152) for German noun tags missing from de-gender.json.
 * Run: node scripts/scan-pool-gender-gaps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const LEX = path.join(ROOT, 'data/lexicon/de-gender.json');

const lex = JSON.parse(fs.readFileSync(LEX, 'utf8'));
const lexKeys = new Set(Object.keys(lex));

const DE_NOUN_SUFFIX =
  /(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion|schaft)$/i;
const VERB_LIKE = /(ieren|eln|en)$/i;

function norm(s) {
  return String(s || '').trim().normalize('NFC').toLowerCase();
}

function isGermanNounCandidate(tag) {
  const raw = String(tag || '').trim();
  if (!raw || raw.length < 2) return false;
  if (!/^[A-ZÄÖÜ]/.test(raw)) return false;
  const low = norm(raw);
  if (lexKeys.has(low)) return false;
  if (/^(Der|Die|Das)\s/i.test(raw)) return false;
  // Inflected adjective / determiner tags (Öffentlichen, Alleine, …)
  if (/^(allein|öffentlich|wichtig|möglich|persönlich|regelmäßig|verfügbar)/i.test(low)) return false;
  if (/(lichen|lichem|liches|licher|liche|igen|igem|igen|iges|iger|ige|enen|enen|endem|enden|endes|ender|ende)$/i.test(low)) {
    return false;
  }
  if (DE_NOUN_SUFFIX.test(low)) return true;
  if (/^[A-ZÄÖÜ][a-zäöüß]+$/.test(raw) && raw.length >= 3) {
    if (VERB_LIKE.test(low) && !DE_NOUN_SUFFIX.test(low) && low.length <= 8) return false;
    return true;
  }
  return false;
}

const freq = new Map();
const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json'));
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  for (const q of batch.questions || []) {
    for (const tag of q.vocabularyTags || []) {
      if (!isGermanNounCandidate(tag)) continue;
      const key = norm(tag);
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
}

const missing = [...freq.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([lemma, count]) => ({ lemma, count }));

const outPath = path.join(ROOT, 'batches/ready/gate-logs/pool-gender-gaps-2026-07-13.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      scannedAt: new Date().toISOString(),
      poolFiles: files.length,
      lexiconSize: lexKeys.size,
      missingCount: missing.length,
      missing,
    },
    null,
    2,
  ),
);

console.log(`\n── Pool gender gap scan (${files.length} files) ──\n`);
console.log(`Lexicon entries: ${lexKeys.size} | Missing noun candidates: ${missing.length}`);
console.log(`Report: ${path.relative(ROOT, outPath)}\n`);
for (const { lemma, count } of missing.slice(0, 40)) {
  console.log(`${String(count).padStart(3)}×  ${lemma}`);
}
if (missing.length > 40) console.log(`… and ${missing.length - 40} more`);
