#!/usr/bin/env node
/**
 * assemble-5-b1-exams.mjs — 5 distinct B1 exams from clean pool (POOL-2 + GATE-1).
 * Usage: node scripts/assemble-5-b1-exams.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isExamPublishable,
  isPartPoolReady,
  GATE_BLOCK_CHECKS,
  partRecordToExamPart,
} from './audit-pass-2.mjs';
import { answerKeySequence } from './lib/balanceMcq.mjs';

const OUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exams-output.txt');
const outLines = [];
const origLog = console.log;
console.log = (...args) => {
  outLines.push(args.join(' '));
  origLog(...args);
};
process.on('exit', () => {
  fs.writeFileSync(OUT_FILE, outLines.join('\n'), 'utf8');
});

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const NUM_EXAMS = 5;

const CELLS = { lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4], schreiben: [1, 2, 3] };
const CELL_KEYS = Object.entries(CELLS).flatMap(([m, ts]) => ts.map((t) => `${m}_${t}`));

const KEY_TARGETS = [
  { label: 'L2', key: 'lesen_2', type: 'multiple_choice' },
  { label: 'L4', key: 'lesen_4', type: 'ja_nein' },
  { label: 'L5', key: 'lesen_5', type: 'multiple_choice' },
  { label: 'H2', key: 'horen_2', type: 'multiple_choice' },
];

const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const allRecords = (raw.records || raw).filter((r) => r && r.id);

const cleanPool = {};
for (const key of CELL_KEYS) cleanPool[key] = [];

process.stderr.write('Pre-screening pool parts with POOL-2...\n');
for (const rec of allRecords) {
  const mod = String(rec.module || '').toLowerCase();
  const teil = Number(rec.teil);
  const key = `${mod}_${teil}`;
  if (!cleanPool[key]) continue;
  const part = partRecordToExamPart(rec);
  if (!part) continue;
  const gate = await isPartPoolReady(rec, { semantic: false });
  if (gate.ok) cleanPool[key].push({ record: rec, part, id: rec.id });
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('  STOCK POR CELDA (partes clean disponibles)');
console.log('╚══════════════════════════════════════════════════════════════════╝');
for (const key of CELL_KEYS) {
  const n = cleanPool[key].length;
  const flag = n >= NUM_EXAMS ? '✅' : n >= 1 ? `⚠ ${n}/${NUM_EXAMS}` : '❌ VACÍA';
  console.log(`  ${key.padEnd(14)}  ${String(n).padStart(2)} clean   ${flag}`);
}
console.log('');

const usedIds = new Set();
const exams = [];
const overlapReport = {};

for (let e = 0; e < NUM_EXAMS; e++) {
  const picked = {};
  const missing = [];
  for (const key of CELL_KEYS) {
    const pool = cleanPool[key];
    let chosen = pool.find((c) => !usedIds.has(c.id));
    let reused = false;
    if (!chosen && pool.length > 0) {
      chosen = pool[e % pool.length];
      reused = true;
      if (!overlapReport[key]) overlapReport[key] = [];
      overlapReport[key].push(e + 1);
    }
    if (!chosen) {
      missing.push(key);
      continue;
    }
    picked[key] = { ...chosen, reused };
    if (!reused) usedIds.add(chosen.id);
  }
  if (missing.length) {
    console.error(`\nFATAL: examen ${e + 1}: sin partes clean para: ${missing.join(', ')}`);
    process.exit(1);
  }
  const assembled = {
    exam: {
      lesenParts: [1, 2, 3, 4, 5].map((t) => picked[`lesen_${t}`].part),
      horenParts: [1, 2, 3, 4].map((t) => picked[`horen_${t}`].part),
      schreibenParts: [1, 2, 3].map((t) => picked[`schreiben_${t}`].part),
    },
  };
  const gate = isExamPublishable(assembled);
  exams.push({ n: e + 1, picked, gate });
}

if (Object.keys(overlapReport).length) {
  console.log('⚠  CELDAS CON PARTES COMPARTIDAS (stock insuficiente):');
  for (const [key, examNums] of Object.entries(overlapReport)) {
    console.log(`  ${key.padEnd(14)}  exámenes ${examNums.join('+')} comparten parte`);
  }
  console.log('');
}

function seqFor(key, part) {
  const t = KEY_TARGETS.find((x) => x.key === key);
  return answerKeySequence(part.questions || [], t?.type);
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('  RESUMEN GATE-1 + IDs + SECUENCIAS CLAVE (L2/L4/L5/H2)');
console.log('╚══════════════════════════════════════════════════════════════════╝');

for (const { n, picked, gate } of exams) {
  const okStr = gate.ok ? '✅ PASS' : '❌ FAIL';
  console.log(`\n  EXAMEN ${n}  GATE-1: ${okStr}`);
  if (!gate.ok) {
    for (const f of gate.blocking) {
      console.log(`    [${f.id}] ${f.severity} – ${f.message?.slice(0, 100)}`);
    }
  }
  for (const key of CELL_KEYS) {
    const p = picked[key];
    const reuseMark = p.reused ? ' ♻' : '';
    console.log(`    ${key.padEnd(13)} ${p.id}${reuseMark}`);
  }
  const seqLine = KEY_TARGETS.map((t) => {
    const p = picked[t.key];
    return `${t.label}=${seqFor(t.key, p.part)}`;
  }).join('  |  ');
  console.log(`    Claves: ${seqLine}`);
}

console.log('\n── Distinctness check (5 exámenes, secuencias L2/L4/L5/H2) ──');
for (const t of KEY_TARGETS) {
  const seqs = exams.map(({ picked }) => seqFor(t.key, picked[t.key].part));
  const unique = new Set(seqs).size;
  const ok = unique === NUM_EXAMS ? '✅ 5 distintas' : `⚠ ${unique} distintas`;
  console.log(`  ${t.label}: ${ok}`);
  seqs.forEach((s, i) => console.log(`    E${i + 1}: ${s}`));
}

console.log('\n' + '═'.repeat(70));
console.log(`  FIN — ${NUM_EXAMS} EXÁMENES ENSAMBLADOS`);
console.log('═'.repeat(70) + '\n');
