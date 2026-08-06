#!/usr/bin/env node
/**
 * Fix A2 pool-verified render blockers (Hören T2 pictures, Lesen T4 ads, T2 answer keys).
 *   node scripts/fix-a2-production-render.mjs           # dry-run
 *   node scripts/fix-a2-production-render.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';

const require = createRequire(import.meta.url);
const HPM = require('../js/engine/horenPictureMatching.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK = path.join(ROOT, 'library/de/A2/questions.json');
const PV = poolVerifiedDir('A2');
const apply = process.argv.includes('--apply');

const LESEN_T4_OPTS = ['a', 'b', 'c', 'd', 'e', 'f', 'X'];
const SOCIETY_EXPL = {
  Montag: 'Julia geht montags in die Bibliothek (Lernen).',
  Dienstag: 'Paul spielt dienstags Fußball mit Freunden im Park.',
  Mittwoch: 'Julia kocht mittwochs für den Verein „Nachbarschaft hilft“.',
  Donnerstag: 'Paul fährt donnerstags mit dem Fahrrad an den See.',
  Freitag: 'Julia schaut am Freitagabend einen Film zu Hause.',
};

function syncHorenT2FromBank(bank) {
  const fixes = [];
  for (const f of fs.readdirSync(PV).filter((x) => /^horen-t2.*\.json$/i.test(x))) {
    const abs = path.join(PV, f);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const pid = batch.passages?.[0]?.id;
    const bankPassage = (bank.passages || []).find((p) => p.id === pid);
    if (!bankPassage) {
      fixes.push({ file: f, skip: `no bank passage ${pid}` });
      continue;
    }
    batch.passages = [
      {
        ...batch.passages[0],
        ...bankPassage,
        audio: undefined,
      },
    ];
    delete batch.passages[0].audio;
    for (const q of batch.questions || []) {
      const bq = (bank.questions || []).find((x) => x.id === q.id);
      if (bq) {
        q.correct = bq.correct;
        q.correctAnswer = bq.correctAnswer;
      }
      if (f.includes('society') && SOCIETY_EXPL[q.question]) {
        q.explanation = SOCIETY_EXPL[q.question];
      }
      delete q.options;
      q._keyOnlyMatch = true;
    }
    const norm = normalizeBatch(batch, { module: 'horen', teil: 2, lang: 'de', level: 'A2' });
    const struct = HPM.validatePictureMatchingBatch(norm, { module: 'horen', teil: 2, level: 'A2' });
    fixes.push({ file: f, structIssues: struct.length, issues: struct.slice(0, 3) });
    if (apply) fs.writeFileSync(abs, `${JSON.stringify(norm, null, 2)}\n`);
  }
  return fixes;
}

function fixLesenT4PoolFiles() {
  const fixes = [];
  for (const f of fs.readdirSync(PV).filter((x) => /^lesen-t4.*\.json$/i.test(x))) {
    const abs = path.join(PV, f);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    let touched = 0;
    for (const q of batch.questions || []) {
      if (q.type !== 'matching') continue;
      q.options = [...LESEN_T4_OPTS];
      const c = String(q.correct ?? q.correctAnswer ?? '').trim().toLowerCase();
      if (c === 'g') {
        q.correct = 'X';
        q.correctAnswer = 'X';
        touched++;
      }
      delete q.passageId;
    }
    if (!batch.instruction) {
      batch.instruction =
        'Lesen Sie die Aufgaben 16 bis 20 und die Anzeigen a bis f.\nWelche Anzeige passt zu welcher Person? Für eine Aufgabe gibt es keine Lösung. Markieren Sie X.';
      touched++;
    }
    fixes.push({ file: f, touched, ads: batch.passages?.length || 0 });
    if (apply) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
  }
  return fixes;
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const h2 = syncHorenT2FromBank(bank);
  const l4 = fixLesenT4PoolFiles();
  console.log('A2 production render fixes:');
  console.log('  Hören T2 pool files:', h2.length);
  for (const row of h2) console.log('   ', row.file, row.structIssues ? `ISSUES ${row.issues}` : row.skip || 'OK');
  console.log('  Lesen T4 pool files:', l4.length);
  for (const row of l4) console.log('   ', row.file, `${row.ads} ads, ${row.touched} fixes`);
  if (!apply) console.log('\n[dry-run] Pass --apply to write');
}

main();
