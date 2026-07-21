/**
 * Retro: replace Herr Ott in 10 lesen-t3-auto pool files with distinct bank names.
 *   node scripts/fix-lesen-t3-herr-ott-names.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadLesenT3NamesConfig,
  replaceLesenT3SeekerName,
  resetLesenT3NamesCache,
} from './lib/lesenT3NamesBank.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const STAMP = new Date().toISOString();

resetLesenT3NamesCache();
const bankNames = loadLesenT3NamesConfig().names;

const files = fs
  .readdirSync(POOL)
  .filter((f) => f.startsWith('lesen-t3-auto-') && f.endsWith('.json'))
  .sort()
  .filter((f) => {
    const raw = fs.readFileSync(path.join(POOL, f), 'utf8');
    return /\bHerr Ott\b/.test(raw);
  });

if (files.length !== 10) {
  console.error(`Expected 10 Herr Ott files, found ${files.length}:`, files);
  process.exit(1);
}

// Prefer bank names; if bank shorter, append documented extras (not needed with 10).
const extras = [
  'Herr Wolf',
  'Herr Lorenz',
  'Herr Brandt',
  'Herr Seidel',
  'Herr Pfeiffer',
];
const names = [...bankNames];
while (names.length < files.length) {
  names.push(extras[names.length - bankNames.length] || `Herr Extra${names.length}`);
}

const table = [];
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const fp = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const newName = names[i];
  let before = null;
  let hits = 0;
  for (const q of batch.questions || []) {
    if (typeof q.question === 'string' && /\bHerr Ott\b/.test(q.question)) {
      if (!before) before = q.question;
      q.question = replaceLesenT3SeekerName(q.question, newName);
      hits++;
    }
    if (typeof q.explanation === 'string' && /\bHerr Ott\b/.test(q.explanation)) {
      q.explanation = replaceLesenT3SeekerName(q.explanation, newName);
      hits++;
    }
  }
  // Deep scan other string fields lightly (situation aliases)
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && /\bHerr Ott\b/.test(v)) {
        obj[k] = replaceLesenT3SeekerName(v, newName);
        hits++;
      } else if (Array.isArray(v) || (v && typeof v === 'object')) walk(v);
    }
  };
  walk(batch.passages);
  walk(batch.example);

  batch._lesenT3SeekerNameVariedAt = STAMP;
  batch._lesenT3SeekerNameNote =
    'Seeker name varied to ' + newName + ' (Lesen T3 names bank; was legacy Ott)';
  fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  table.push({
    file,
    before: before || '(no question hit?)',
    afterName: newName,
    hits,
  });
}

const report = {
  stampedAt: STAMP,
  bankNames,
  extrasUsed: names.slice(bankNames.length),
  mappings: table,
};
fs.writeFileSync(
  path.join(ROOT, 'batches/ready/gate-logs/lesen-t3-herr-ott-rename-2026-07-11.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(table, null, 2));
console.log('extrasUsed', report.extrasUsed);

// Verify uniqueness + no Herr Ott left in pool-verified lesen-t3-auto
const remaining = [];
const afterNames = new Set();
for (const f of fs.readdirSync(POOL).filter((x) => x.startsWith('lesen-t3-auto-'))) {
  const raw = fs.readFileSync(path.join(POOL, f), 'utf8');
  if (/\bHerr Ott\b/.test(raw)) remaining.push(f);
}
for (const row of table) afterNames.add(row.afterName);
console.log('unique after names', afterNames.size, '/', table.length);
console.log('Herr Ott remaining in lesen-t3-auto-*', remaining);
process.exit(remaining.length || afterNames.size !== table.length ? 1 : 0);
