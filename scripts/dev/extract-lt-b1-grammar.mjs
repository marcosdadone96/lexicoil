#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealLanguageToolMatch } from '../lib/qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const j = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/preventive-lt-B1-2026-08-04.json'), 'utf8'),
);

const FOCUS = new Set([
  'DE_CASE', 'DE_AGREEMENT', 'DE_AGREEMENT2', 'DE_SUBJECT_VERB_AGREEMENT',
  'NOMEN_KLEIN', 'DEN_DEM', 'DE_COMPOUNDS', 'DE_WORD_COHERENCY',
]);

const hits = [];
for (const f of j.files || []) {
  for (const p of f.passages || []) {
    for (const m of p.matches || []) {
      if (!isRealLanguageToolMatch(m)) continue;
      if (m.ruleId === 'GERMAN_SPELLER_RULE') continue;
      if (!FOCUS.has(m.ruleId)) continue;
      hits.push({ file: f.file, passage: p.passageIndex, ruleId: m.ruleId, context: m.context, msg: m.message, rep: (m.replacements || [])[0] });
    }
  }
}
console.log('FOCUS hits', hits.length);
for (const x of hits) console.log(JSON.stringify(x));
