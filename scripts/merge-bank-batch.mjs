#!/usr/bin/env node
/**
 * Merge a ChatGPT-generated batch ({passages:[], questions:[]}) into the bank
 * library/<lang>/<level>/questions.json. Backs up first, skips duplicate ids,
 * checks passageId integrity. Offline, no AI.
 *
 * Usage:
 *   node scripts/merge-bank-batch.mjs --lang de --level B1 --file batches/lesen-t1.json
 *   node scripts/merge-bank-batch.mjs --lang de --level B1 --file batches/lesen-t1.json --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const o = { lang: 'de', level: 'B1', file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i];
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--file') o.file = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
  }
  return o;
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.file) { console.error('Falta --file <ruta al JSON del lote>'); process.exit(1); }

  const bankPath = path.join(ROOT, 'library', o.lang, o.level, 'questions.json');
  if (!fs.existsSync(bankPath)) { console.error('No existe el banco:', bankPath); process.exit(1); }

  let batch;
  try { batch = JSON.parse(fs.readFileSync(path.resolve(o.file), 'utf8')); }
  catch (e) { console.error('El JSON del lote no es válido:', e.message); process.exit(1); }

  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  bank.passages = bank.passages || [];
  bank.questions = bank.questions || [];

  const existingQ = new Set(bank.questions.map((q) => q.id));
  const existingP = new Set(bank.passages.map((p) => p.id));
  const batchPids = new Set((batch.passages || []).map((p) => p.id));

  const errors = [];
  const addP = [];
  const addQ = [];
  let skipP = 0, skipQ = 0;

  for (const p of batch.passages || []) {
    if (!p.id || !p.text) { errors.push(`pasaje sin id/text: ${p.id || '??'}`); continue; }
    if (existingP.has(p.id)) { skipP++; continue; }
    addP.push(p); existingP.add(p.id);
  }
  for (const q of batch.questions || []) {
    if (!q.id || !q.module) { errors.push(`pregunta sin id/module: ${q.id || '??'}`); continue; }
    if (['lesen', 'horen'].includes(q.module) && q.passageId && !existingP.has(q.passageId) && !batchPids.has(q.passageId)) {
      errors.push(`pregunta ${q.id}: passageId inexistente (${q.passageId})`);
      continue;
    }
    if (existingQ.has(q.id)) { skipQ++; continue; }
    addQ.push(q); existingQ.add(q.id);
  }

  console.log(`\n== Fusión ${o.lang}_${o.level} ==`);
  console.log(`Pasajes: +${addP.length} nuevos, ${skipP} ya existían`);
  console.log(`Preguntas: +${addQ.length} nuevas, ${skipQ} ya existían`);
  if (errors.length) { console.log('\nERRORES (no se añaden):'); errors.forEach((e) => console.log('  - ' + e)); }

  if (o.dryRun) { console.log('\n(dry-run: no se escribe nada)'); return; }
  if (!addP.length && !addQ.length) { console.log('\nNada que añadir.'); return; }

  const backup = bankPath.replace('.json', `.backup-${Date.now()}.json`);
  fs.copyFileSync(bankPath, backup);
  bank.passages.push(...addP);
  bank.questions.push(...addQ);
  if (bank.meta) bank.meta.version = (bank.meta.version || 1) + 1;
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log(`\nBackup: ${path.relative(ROOT, backup)}`);
  console.log(`Escrito: ${path.relative(ROOT, bankPath)} (ahora ${bank.questions.length} preguntas, ${bank.passages.length} pasajes)`);
}

main();
