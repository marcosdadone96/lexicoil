#!/usr/bin/env node
/**
 * dedup-titles.mjs — Fix CHK-5: detects duplicate passage titles in batches/generated/
 * and appends a natural discriminator suffix to all duplicates after the first occurrence.
 *
 * Usage:
 *   node scripts/dedup-titles.mjs             # report only
 *   node scripts/dedup-titles.mjs --apply     # apply fixes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN  = path.join(ROOT, 'batches', 'generated');

const args   = process.argv.slice(2);
const APPLY  = args.includes('--apply');
const TARGET = args.find(a => !a.startsWith('--')) || null;

// ── Collect all passage titles ──────────────────────────────────────────────

function normalize(t) {
  return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const files = TARGET
  ? [path.isAbsolute(TARGET) ? TARGET : path.join(ROOT, TARGET)]
  : fs.readdirSync(GEN)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .sort()
      .map(f => path.join(GEN, f));

// Map: normalizedTitle → [{file, passageIdx, originalTitle}]
const titleMap = new Map();

for (const filePath of files) {
  let batch;
  try { batch = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { continue; }

  for (let i = 0; i < (batch.passages || []).length; i++) {
    const p = batch.passages[i];
    const raw = p.title || p.signText || '';
    if (!raw) continue;
    const key = normalize(raw);
    if (!titleMap.has(key)) titleMap.set(key, []);
    titleMap.get(key).push({ file: filePath, passageIdx: i, originalTitle: raw });
  }
}

// ── Find duplicates ──────────────────────────────────────────────────────────

const duplicates = [...titleMap.entries()].filter(([, entries]) => entries.length > 1);

if (duplicates.length === 0) {
  console.log('✅ Sin títulos duplicados — CHK-5 limpio.');
  process.exit(0);
}

console.log(`\nTítulos duplicados encontrados: ${duplicates.length}`);
let totalFixed = 0;

for (const [key, entries] of duplicates) {
  console.log(`\n  "${entries[0].originalTitle}" (${entries.length}× duplicado)`);

  // First occurrence stays as-is
  for (let j = 1; j < entries.length; j++) {
    const { file, passageIdx, originalTitle } = entries[j];
    const suffix = romanNumeral(j + 1); // II, III, IV…
    const newTitle = `${originalTitle} (${suffix})`;

    console.log(`    [${j}] ${path.basename(file)} → "${newTitle}"`);

    if (APPLY) {
      const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
      const p = batch.passages[passageIdx];
      if (p.title) p.title = newTitle;
      else if (p.signText) p.signText = newTitle;
      fs.writeFileSync(file, JSON.stringify(batch, null, 2), 'utf8');
      totalFixed++;
    }
  }
}

if (APPLY) {
  console.log(`\n✅ ${totalFixed} títulos renombrados.`);
} else {
  console.log(`\n(dry-run) Ejecuta con --apply para corregir.`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function romanNumeral(n) {
  const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  return numerals[n - 1] || String(n);
}
