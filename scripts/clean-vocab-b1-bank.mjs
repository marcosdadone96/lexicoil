#!/usr/bin/env node
/**
 * Clean library/vocab/de/B1.json: drop C1/C2-only academic lemmas that leaked
 * via build-vocab-open filler, drop blacklist hits, dedupe.
 *
 *   node scripts/clean-vocab-b1-bank.mjs
 *   node scripts/clean-vocab-b1-bank.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlacklistedLemma } from './lib/lexicalCheck.mjs';
import { resetVocabBankCache } from './lib/vocabBank.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function loadKnowledge(level) {
  const f = path.join(ROOT, 'knowledge/cefr/vocab/de', `${level}.json`);
  if (!fs.existsSync(f)) return new Set();
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return new Set((d.lemmas || []).map((l) => String(l).toLowerCase()));
}

const A1 = loadKnowledge('A1');
const A2 = loadKnowledge('A2');
const B1k = loadKnowledge('B1');
const C1 = loadKnowledge('C1');
const C2 = loadKnowledge('C2');
const lowerOrEqB1 = new Set([...A1, ...A2, ...B1k]);

const bankPath = path.join(ROOT, 'library/vocab/de/B1.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const before = bank.lemmas.map((l) => String(l).toLowerCase());
const beforeUnique = new Set(before);

const removed = [];
const kept = [];
const seen = new Set();

for (const raw of before) {
  const w = raw.toLowerCase();
  if (seen.has(w)) {
    removed.push({ lemma: w, reason: 'duplicate' });
    continue;
  }
  const onlyHigh = (C1.has(w) || C2.has(w)) && !lowerOrEqB1.has(w);
  if (onlyHigh) {
    removed.push({ lemma: w, reason: 'c1_c2_only' });
    continue;
  }
  if (isBlacklistedLemma(w)) {
    removed.push({ lemma: w, reason: 'blacklist' });
    continue;
  }
  seen.add(w);
  kept.push(w);
}

// Update overrides exclude so rebuild doesn't re-import
const overridesPath = path.join(ROOT, 'library/vocab/de/_overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const excludeSet = new Set((overrides.exclude || []).map((w) => String(w).toLowerCase()));
for (const r of removed) {
  if (r.reason === 'c1_c2_only' || r.reason === 'blacklist') excludeSet.add(r.lemma);
}
overrides.exclude = [...excludeSet].sort((a, b) => a.localeCompare(b, 'de'));

console.log(`B1 bank: ${before.length} entries → ${beforeUnique.size} unique → ${kept.length} after clean`);
console.log(`Removed: ${removed.length}`);
const byReason = {};
for (const r of removed) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
console.log(byReason);
console.log('Sample c1_c2_only:', removed.filter((r) => r.reason === 'c1_c2_only').slice(0, 15).map((r) => r.lemma).join(', '));

if (!dryRun) {
  bank.lemmas = kept;
  bank.lemmaCount = kept.length;
  bank.source = `${bank.source || 'open-frequency+manual'}+cleaned-c1c2-leak-2026-07-10`;
  bank.cleanedAt = new Date().toISOString();
  fs.writeFileSync(bankPath, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  fs.writeFileSync(overridesPath, `${JSON.stringify(overrides, null, 2)}\n`, 'utf8');
  resetVocabBankCache();
  console.log('Wrote', path.relative(ROOT, bankPath));
  console.log('Updated', path.relative(ROOT, overridesPath), `exclude=${overrides.exclude.length}`);
} else {
  console.log('(dry-run: no write)');
}

const reportPath = path.join(ROOT, 'batches/ready/VOCAB-B1-BANK-CLEAN-2026-07-10.md');
fs.writeFileSync(
  reportPath,
  [
    '# Limpieza library/vocab/de/B1.json (2026-07-10)',
    '',
    '## Causa raíz',
    '',
    '`scripts/build-vocab-open.mjs` → `readLegacyPool()` mezclaba **todos** los niveles',
    '(`knowledge/cefr/vocab/de/{A1…C2}.json`) como filler alfabético en la lista ranked.',
    'El slice B1 (`ranked[1200:2400]`) absorbía lemas C1/C2 (p. ej. `morphologie`, `hegemonie`).',
    '',
    '`vocab-coverage-report.mjs` solo escribe `weak-de_B1.json` desde ese banco —',
    '**0 lemas fuera de B1.json**; la basura venía del banco mismo.',
    '',
    '## Acciones',
    '',
    `- Entradas antes: ${before.length} (únicos ${beforeUnique.size})`,
    `- Tras clean: ${kept.length}`,
    `- Eliminados: ${JSON.stringify(byReason)}`,
    '- Fix origen: `readLegacyPool(lang, maxLevel)` + filler ≤B1 separado de C1/C2',
    '- Whitelist en `filterPromptTargetWords` / `sanitizePromptTargetWords`',
    '',
    '## Lemas eliminados (c1_c2_only)',
    '',
    removed
      .filter((r) => r.reason === 'c1_c2_only')
      .map((r) => `- \`${r.lemma}\``)
      .join('\n'),
    '',
  ].join('\n'),
  'utf8',
);
console.log('Report', path.relative(ROOT, reportPath));
