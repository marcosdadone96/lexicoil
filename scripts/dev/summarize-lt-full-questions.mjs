#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealLanguageToolMatch } from '../lib/qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = '2026-08-05';

function load(level) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, `batches/ready/gate-logs/preventive-lt-full-${level}-${stamp}.json`), 'utf8'),
  );
}

function wordFrom(m) {
  return (m.context || '').slice(m.contextOffset || 0, (m.contextOffset || 0) + (m.length || 0));
}

function isMcqOptionNoise(m, field) {
  if (field !== 'questions.content') return false;
  const w = wordFrom(m);
  const ctx = m.context || '';
  if (m.ruleId === 'DE_CASE' && /^[a-c]\)$/i.test(w)) return true;
  if (m.ruleId === 'UPPERCASE_SENTENCE_START' && /\)\s/.test(ctx)) return true;
  if (m.ruleId === 'DE_CASE' && /\b[a-c]\)\s+[A-Z]/.test(ctx)) return true;
  return false;
}

function classify(hit) {
  const { ruleId, field, word } = hit;
  if (isMcqOptionNoise(hit, field)) return 'noise';
  if (ruleId === 'GERMAN_SPELLER_RULE') {
    if (/^[a-zäöüß]{4,}/.test(word) && word[0] === word[0].toLowerCase()) return 'A';
    if (word === 'dAmit' || /^d[A-Z]/.test(word)) return 'A';
    return 'D';
  }
  if (['DE_AGREEMENT', 'DE_AGREEMENT2', 'DE_SUBJECT_VERB_AGREEMENT'].includes(ruleId)) return 'A';
  if (['DE_CASE', 'NOMEN_KLEIN', 'FEHLERHAFTES_KOMMA_ALLG', 'DE_DATE_WEEKDAY_CURRENTYEAR', 'EIN_BISSCHEN'].includes(ruleId)) {
    return 'D';
  }
  return 'D';
}

for (const level of ['B2', 'A2', 'B1']) {
  const j = load(level);
  const qHits = [];
  const pHits = [];
  for (const f of j.files || []) {
    for (const seg of f.segments || []) {
      for (const m of seg.matches || []) {
        if (!isRealLanguageToolMatch(m)) continue;
        const row = {
          file: f.file,
          field: seg.field,
          questionIndex: seg.questionIndex,
          ruleId: m.ruleId,
          word: wordFrom(m),
          context: (m.context || '').slice(0, 100),
          replacement: (m.replacements || [])[0],
        };
        row.category = classify(row);
        if (seg.field?.startsWith('questions')) qHits.push(row);
        else pHits.push(row);
      }
    }
  }
  const qReal = qHits.filter((h) => h.category !== 'noise');
  const counts = { A: 0, B: 0, C: 0, D: 0, noise: 0 };
  for (const h of qHits) counts[h.category] = (counts[h.category] || 0) + 1;
  const filesWithQ = new Set(qReal.map((h) => h.file)).size;
  console.log(`\n=== ${level} ===`);
  console.log('question hits raw:', qHits.length, 'after mcq-noise filter:', qReal.length, 'files:', filesWithQ);
  console.log('counts:', counts);
  console.log('A candidates:', qReal.filter((h) => h.category === 'A').slice(0, 15).map((h) => `${h.file} Q${h.questionIndex} ${h.word}→${h.replacement}`));
}
