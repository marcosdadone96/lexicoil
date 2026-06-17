#!/usr/bin/env node
/**
 * Phase 1 — create passages.json, writing-speaking.json, vocab stubs for all 18 levels.
 * Run: node scripts/seed-content-stubs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_LANGS, ALL_LEVELS } from './seed-coverage-levels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'library');

function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    console.log('Skip (exists)', rel);
    return;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Wrote', rel);
}

for (const lang of ALL_LANGS) {
  for (const level of ALL_LEVELS) {
    const today = new Date().toISOString().slice(0, 10);
    writeJson(`library/${lang}/${level}/passages.json`, {
      meta: { language: lang, level, version: 1, generatedAt: today },
      passages: [],
    });
    writeJson(`library/${lang}/${level}/writing-speaking.json`, {
      meta: { language: lang, level, version: 1, generatedAt: today },
      writing: [],
      speaking: [],
    });
    writeJson(`library/vocab/${lang}/${level}.json`, {
      level,
      lang,
      source: 'pending',
      lemmaCount: 0,
      lemmas: [],
    });
  }
}

console.log('Content stubs complete.');
