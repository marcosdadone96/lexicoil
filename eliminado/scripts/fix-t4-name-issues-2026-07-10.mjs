/**
 * Fix T4 name issues in pool-verified (Cat 3 deep-read 2026-07-10).
 *   node scripts/fix-t4-name-issues-2026-07-10.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  replaceGuestNamesInBatch,
  findTitleNameGenderMismatches,
  getNameGender,
} from './lib/nameRotation.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const DIR = path.join(ROOT, 'batches/ready/pool-verified');
const GEN = path.join(ROOT, 'batches/generated');

function load(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function save(dir, file, batch) {
  const next = stampGermanCapsVersion(batch);
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(next, null, 2)}\n`);
}

function apply(file, from, to, note) {
  const absDirs = [DIR];
  if (fs.existsSync(path.join(GEN, file))) absDirs.push(GEN);
  const results = [];
  for (const dir of absDirs) {
    const batch = load(dir, file);
    const { batch: next, replacements } = replaceGuestNamesInBatch(batch, from, to);
    next._nameRotation = {
      at: new Date().toISOString(),
      from,
      to,
      replacements,
      note,
    };
    save(dir, file, next);
    results.push({ dir: path.relative(ROOT, dir), replacements });
  }
  return results;
}

const report = { at: new Date().toISOString(), fixes: [], audit: [] };

// 1) Herrn Marie → Herrn Erik (male; Erik unused in T4 verified)
report.fixes.push({
  file: 'horen-t4-gemini-008.json',
  ...apply(
    'horen-t4-gemini-008.json',
    ['Marie'],
    ['Erik'],
    'Cat3: fix Herrn Marie gender bug (Marie→Erik)',
  ),
});

// 2) Lena dup 003/006 — rotate 006 only
report.fixes.push({
  file: 'horen-t4-gemini-006.json',
  ...apply(
    'horen-t4-gemini-006.json',
    ['Lena'],
    ['Mira'],
    'Cat3: disambiguate Lena Schmidt shared with t4-003',
  ),
});

// 3) 009 / 010 still Dana/Florian — distinct pairs
report.fixes.push({
  file: 'horen-t4-gemini-009.json',
  ...apply(
    'horen-t4-gemini-009.json',
    ['Dana', 'Florian'],
    ['Nele', 'Paul'],
    'Cat3: AUD-5 backfill Dana/Florian → Nele/Paul',
  ),
});
report.fixes.push({
  file: 'horen-t4-gemini-010.json',
  ...apply(
    'horen-t4-gemini-010.json',
    ['Dana', 'Florian'],
    ['Zara', 'Omar'],
    'Cat3: AUD-5 backfill Dana/Florian → Zara/Omar',
  ),
});

// 4) Full pool-verified title/name gender audit (first names only)
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const batch = load(DIR, f);
  const blobs = [];
  for (const p of batch.passages || []) {
    blobs.push(p.text || '', p.transcript || '');
    for (const t of p.audio || []) blobs.push(t.text || '');
  }
  for (const q of batch.questions || []) {
    blobs.push(q.question || '', q.explanation || '', ...(q.options || []).map((o) => (typeof o === 'string' ? o : o?.text || '')));
  }
  const hits = findTitleNameGenderMismatches(blobs.join('\n'));
  if (hits.length) {
    report.audit.push({ file: f, hits });
  }
}

// Sanity: no Dana/Florian left in T4 verified; no Lena shared across 003+006
const t4 = fs.readdirSync(DIR).filter((x) => /^horen-t4-/.test(x));
const nameFiles = {};
for (const f of t4) {
  const text = JSON.stringify(load(DIR, f));
  for (const n of ['Dana', 'Florian', 'Marie', 'Lena', 'Mira', 'Erik', 'Nele', 'Paul', 'Zara', 'Omar']) {
    if (new RegExp(`\\b${n}\\b`).test(text)) {
      (nameFiles[n] ||= []).push(f);
    }
  }
}
report.nameIndex = nameFiles;
report.ok =
  report.audit.length === 0 &&
  !nameFiles.Dana &&
  !nameFiles.Florian &&
  !nameFiles.Marie &&
  (nameFiles.Lena || []).length <= 1;

const out = path.join(ROOT, 'batches/ready/gate-logs/T4-NAME-FIX-2026-07-10.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
