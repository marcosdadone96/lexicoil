#!/usr/bin/env node
/** Print key sequences for L2/L4/L5/H2 per assembled exam (reads seed like assemble-3). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerKeySequence } from './lib/balanceMcq.mjs';
import { isPartPoolReady, partRecordToExamPart } from './audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
const allRecords = (raw.records || raw).filter((r) => r && r.id);

const TARGETS = [
  { label: 'L2', mod: 'lesen', teil: 2, type: 'multiple_choice' },
  { label: 'L4', mod: 'lesen', teil: 4, type: 'ja_nein' },
  { label: 'L5', mod: 'lesen', teil: 5, type: 'multiple_choice' },
  { label: 'H2', mod: 'horen', teil: 2, type: 'multiple_choice' },
];

const CELLS = { lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4], schreiben: [1, 2, 3] };
const CELL_KEYS = Object.entries(CELLS).flatMap(([m, ts]) => ts.map((t) => `${m}_${t}`));

const cleanPool = {};
for (const key of CELL_KEYS) cleanPool[key] = [];
for (const rec of allRecords) {
  const key = `${String(rec.module).toLowerCase()}_${Number(rec.teil)}`;
  if (!cleanPool[key]) continue;
  const part = partRecordToExamPart(rec);
  if (!part) continue;
  const gate = await isPartPoolReady(rec, { semantic: false });
  if (gate.ok) cleanPool[key].push({ record: rec, part, id: rec.id });
}

function seqForPart(part, typeFilter) {
  const qs = part.questions || [];
  return answerKeySequence(qs, typeFilter);
}

const usedIds = new Set();
console.log('\nSecuencias posicionales por examen (misma lógica assemble-3-b1-exams)\n');
console.log('Celda │ Examen 1                          │ Examen 2                          │ Examen 3');
console.log('──────┼───────────────────────────────────┼───────────────────────────────────┼──────────────────────────────────');

for (const t of TARGETS) {
  const key = `${t.mod}_${t.teil}`;
  const row = [t.label.padEnd(5)];
  for (let e = 0; e < 3; e++) {
    const pool = cleanPool[key];
    let chosen = pool.find((c) => !usedIds.has(c.id));
    if (!chosen && pool.length) chosen = pool[e % pool.length];
    if (!chosen) {
      row.push('(sin stock)'.padEnd(33));
      continue;
    }
    if (!usedIds.has(chosen.id)) usedIds.add(chosen.id);
    const s = seqForPart(chosen.part, t.type);
    row.push(`${s}  [${chosen.id.slice(-8)}]`.padEnd(33));
  }
  console.log(row.join('│ '));
}

console.log('\nDistinctness check (3 exámenes deben diferir entre sí):');
for (const t of TARGETS) {
  usedIds.clear();
  const seqs = [];
  for (let e = 0; e < 3; e++) {
    const pool = cleanPool[`${t.mod}_${t.teil}`];
    let chosen = pool.find((c) => !usedIds.has(c.id));
    if (!chosen && pool.length) chosen = pool[e % pool.length];
    if (chosen && !usedIds.has(chosen.id)) usedIds.add(chosen.id);
    seqs.push(chosen ? seqForPart(chosen.part, t.type) : '');
  }
  const unique = new Set(seqs.filter(Boolean)).size;
  console.log(`  ${t.label}: ${unique === 3 ? '✅' : unique === 2 ? '⚠ 2 distintas' : '❌'}  [${seqs.join(' | ')}]`);
}
