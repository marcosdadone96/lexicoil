#!/usr/bin/env node
/**
 * One-off: add passage.translations { en, es, de } to library banks via MyMemory.
 * Run offline before commit: node scripts/seed-passage-translations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET_LANGS = ['en', 'es', 'de'];
const DELAY_MS = 400;

const LEVELS = [
  ['de', 'B1'],
  ['de', 'B2'],
  ['en', 'B2'],
  ['en', 'C1'],
  ['es', 'B2'],
  ['es', 'C1'],
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function freeTranslate(text, from, to) {
  const q = encodeURIComponent(String(text).trim().slice(0, 4000));
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const match = data?.responseData?.match;
  if (typeof match === 'number' && match < 0.6) return null;
  const out = String(data?.responseData?.translatedText || '').trim();
  if (!out || /INVALID LANGUAGE PAIR/i.test(out)) return null;
  return out;
}

async function seedBank(lang, level) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
  const source = bank.meta?.language || lang;
  let added = 0;

  for (const passage of bank.passages || []) {
    if (!passage.text) continue;
    passage.translations = passage.translations || {};
    for (const target of TARGET_LANGS) {
      if (target === source) continue;
      if (passage.translations[target]) continue;
      const tr = await freeTranslate(passage.text, source, target);
      await sleep(DELAY_MS);
      if (tr) {
        passage.translations[target] = tr;
        added++;
        console.log('  +', `${lang}/${level}`, passage.id, `→ ${target}`);
      } else {
        console.warn('  skip', passage.id, `→ ${target}`);
      }
    }
  }

  fs.writeFileSync(file, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  return added;
}

let total = 0;
for (const [lang, level] of LEVELS) {
  console.log('Seeding', `${lang}/${level}`);
  total += await seedBank(lang, level);
}
console.log(`\nDone — ${total} translation(s) added.`);
