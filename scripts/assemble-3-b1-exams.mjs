#!/usr/bin/env node
/**
 * assemble-3-b1-exams.mjs
 *
 * Assembles 3 distinct Goethe B1 exams from the synchronized pool.
 * Each exam uses isPartPoolReady (POOL-2) + isExamPublishable (GATE-1).
 * Parts are not repeated across exams unless stock is insufficient (reported explicitly).
 *
 * Usage:  node scripts/assemble-3-b1-exams.mjs > exams-output.txt 2>&1
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isExamPublishable,
  isPartPoolReady,
  GATE_BLOCK_CHECKS,
  partRecordToExamPart,
  flattenExam,
} from './audit-pass-2.mjs';

// ── Write output to file directly (avoids PowerShell encoding issues) ─────────
const OUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exams-output.txt');
const outLines = [];
const origLog = console.log;
console.log = (...args) => {
  const line = args.join(' ');
  outLines.push(line);
  origLog(...args);
};
process.on('exit', () => {
  fs.writeFileSync(OUT_FILE, outLines.join('\n'), 'utf8');
});

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

// ── Load pool ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const allRecords = (raw.records || raw).filter(r => r && r.id);

// ── Cell structure ────────────────────────────────────────────────────────────
const CELLS = { lesen: [1,2,3,4,5], horen: [1,2,3,4], schreiben: [1,2,3] };
const CELL_KEYS = Object.entries(CELLS).flatMap(([m,ts]) => ts.map(t => `${m}_${t}`));

// ── Build clean-pool per cell (pre-screen with isPartPoolReady) ───────────────
process.stderr.write('Pre-screening pool parts with POOL-2...\n');
const cleanPool = {}; // cellKey → [{ record, part }]
for (const key of CELL_KEYS) cleanPool[key] = [];

for (const rec of allRecords) {
  const mod  = String(rec.module || '').toLowerCase();
  const teil = Number(rec.teil);
  const key  = `${mod}_${teil}`;
  if (!cleanPool[key]) continue;
  const part = partRecordToExamPart(rec);
  if (!part) continue;
  const gate = await isPartPoolReady(rec, { semantic: false });
  if (gate.ok) cleanPool[key].push({ record: rec, part, id: rec.id });
}

// ── Print cell stock summary ───────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('  STOCK POR CELDA (partes clean disponibles)');
console.log('╚══════════════════════════════════════════════════════════════════╝');
for (const key of CELL_KEYS) {
  const n = cleanPool[key].length;
  const flag = n === 0 ? '❌ VACÍA' : n === 1 ? '⚠ solo 1 (repetición forzada en 3 exámenes)' : n === 2 ? '⚠ solo 2 (1 examen repite)' : '✅';
  console.log(`  ${key.padEnd(14)}  ${String(n).padStart(2)} clean   ${flag}`);
}
console.log('');

// ── Assemble 3 exams (greedy, no-repeat) ─────────────────────────────────────
const usedIds = new Set();
const exams = [];
const overlapReport = {}; // cellKey → list of exam indices that share a part

for (let e = 0; e < 3; e++) {
  const picked = {};
  const missing = [];

  for (const key of CELL_KEYS) {
    // Try to pick a part not used in earlier exams
    const pool = cleanPool[key];
    let chosen = pool.find(c => !usedIds.has(c.id));
    let reused = false;
    if (!chosen && pool.length > 0) {
      // Stock exhausted — must reuse; pick least-recently-used
      chosen = pool[e % pool.length];
      reused = true;
      if (!overlapReport[key]) overlapReport[key] = [];
      overlapReport[key].push(e + 1);
    }
    if (!chosen) { missing.push(key); continue; }
    picked[key] = { ...chosen, reused };
    if (!reused) usedIds.add(chosen.id);
  }

  if (missing.length) {
    console.error(`\nFATAL: examen ${e+1}: sin partes clean para: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Assemble exam object
  const lesenParts    = [1,2,3,4,5].map(t => picked[`lesen_${t}`].part);
  const horenParts    = [1,2,3,4].map(t => picked[`horen_${t}`].part);
  const schreibenParts= [1,2,3].map(t => picked[`schreiben_${t}`].part);
  const assembled     = { exam: { lesenParts, horenParts, schreibenParts } };

  // Run GATE-1
  const gate = isExamPublishable(assembled);
  exams.push({ n: e+1, picked, assembled, gate });
}

// ── Overlap report ────────────────────────────────────────────────────────────
if (Object.keys(overlapReport).length) {
  console.log('⚠  CELDAS CON PARTES COMPARTIDAS (stock insuficiente para 3 distintas):');
  for (const [key, examNums] of Object.entries(overlapReport)) {
    const id = cleanPool[key][0]?.id || '?';
    console.log(`  ${key.padEnd(14)}  examenes ${examNums.join('+')} comparten  ${id}`);
  }
  console.log('');
}

// ── Per-exam summary ──────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('  RESUMEN GATE-1 POR EXAMEN');
console.log('╚══════════════════════════════════════════════════════════════════╝');

const TABLE_HDR = '  Examen │ Celda         │ ID de Parte                                    │ Reuse';
console.log(TABLE_HDR);
console.log('  ' + '─'.repeat(90));

for (const { n, picked, gate } of exams) {
  const criticals  = gate.blocking.filter(f => f.severity === 'CRITICAL');
  const gateBlocks = gate.blocking.filter(f => GATE_BLOCK_CHECKS.has(f.id));
  const okStr = gate.ok ? '✅ PASS' : '❌ FAIL';
  console.log(`\n  EXAMEN ${n}  GATE-1: ${okStr}  CRITICAL=${criticals.length}  GATE_BLOCK=${gateBlocks.length}`);
  if (!gate.ok) {
    for (const f of gate.blocking) console.log(`    [${f.id}] ${f.severity} – ${f.message?.slice(0,100)}`);
  }
  for (const key of CELL_KEYS) {
    const p = picked[key];
    const reuseMark = p.reused ? ' ♻ REUSE' : '';
    console.log(`    ${String(n)}   │ ${key.padEnd(13)} │ ${p.id.padEnd(46)} │${reuseMark}`);
  }
}

// ── Helper functions for content printing ─────────────────────────────────────
function optionText(opt) {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') {
    const label = opt.label || opt.value || opt.key || opt.letter || '';
    const body  = opt.text  || opt.body  || opt.content || '';
    if (label && body) return `${label}) ${body}`;
    return body || label || JSON.stringify(opt);
  }
  return String(opt);
}

function printQ(q, idx, extraIndent = '') {
  const num = String(idx + 1).padStart(2, '0');
  const qtext = q.question || q.text || q.signText || '';
  console.log(`\n${extraIndent}  ${num}. ${qtext}`);
  if (Array.isArray(q.options) && q.options.length) {
    for (const opt of q.options) {
      console.log(`${extraIndent}      ${optionText(opt)}`);
    }
  }
  const ans = q.correct || q.correctAnswer || '';
  console.log(`${extraIndent}      ✓ Clave: ${ans}`);
  if (q.explanation) console.log(`${extraIndent}      Expl: ${q.explanation}`);
}

function printLesenPart(rec, part, t, prevSeenIds, examN) {
  const pid = rec.id;
  const seenMark = prevSeenIds.has(pid) ? '  ♻ [YA REVISADA EN EXAMEN ANTERIOR]' : '';
  console.log(`\n╔═══ LESEN TEIL ${t}  [${pid}]${seenMark}`);

  // Passage(s)
  if (Array.isArray(part.passages) && part.passages.length) {
    for (const p of part.passages) {
      const ttl = p.textTitle || p.title || '';
      console.log(`\n  [TEXTO${ttl ? ' — ' + ttl : ''}]`);
      console.log((p.text || '').split('\n').map(l => '  ' + l).join('\n'));
    }
  } else {
    const txt = part.text || rec.passage?.text || rec.text || '';
    if (txt) {
      const ttl = part.textTitle || rec.passage?.title || '';
      console.log(`\n  [TEXTO${ttl ? ' — ' + ttl : ''}]`);
      console.log(txt.split('\n').map(l => '  ' + l).join('\n'));
    }
  }

  // Ads (L3/L4)
  if (Array.isArray(part.ads) && part.ads.length) {
    console.log('\n  [ANZEIGEN]');
    part.ads.forEach((ad, i) => {
      const lbl = ad.key || String.fromCharCode(65 + i);
      console.log(`\n  ${lbl}) ${ad.title || ad.heading || ''}`);
      console.log(`     ${ad.text || ad.body || ''}`);
    });
  }

  console.log(`\n  [PREGUNTAS — ${(part.questions||[]).length}]`);
  (part.questions || []).forEach((q, i) => printQ(q, i));
}

function printHorenPart(rec, part, t, prevSeenIds) {
  const pid = rec.id;
  const seenMark = prevSeenIds.has(pid) ? '  ♻ [YA REVISADA EN EXAMEN ANTERIOR]' : '';
  console.log(`\n╔═══ HÖREN TEIL ${t}  [${pid}]${seenMark}`);

  // Single transcript
  const transcript = part.passage?.transcript || part.passage?.text || rec.passage?.transcript || rec.passage?.text || rec.transcript || '';
  if (transcript) {
    console.log('\n  [TRANSKRIPT]');
    console.log(transcript.split('\n').map(l => '  ' + l).join('\n'));
  }

  // Multi-segment (H1, H3, H4)
  if (Array.isArray(part.segments) && part.segments.length) {
    for (const seg of part.segments) {
      console.log(`\n  [SEGMENTO: ${seg.label || seg.id || ''}]`);
      if (seg.transcript) console.log(seg.transcript.split('\n').map(l => '    ' + l).join('\n'));
      const segQs = seg.questions || [];
      if (segQs.length) {
        console.log(`\n  [PREGUNTAS SEG]`);
        segQs.forEach((q, i) => printQ(q, i, '  '));
      }
    }
  }

  // Flat questions
  if (Array.isArray(part.questions) && part.questions.length) {
    console.log(`\n  [PREGUNTAS — ${part.questions.length}]`);
    part.questions.forEach((q, i) => printQ(q, i));
  }
}

function printSchreibenPart(rec, part, t, prevSeenIds) {
  const pid = rec.id;
  const seenMark = prevSeenIds.has(pid) ? '  ♻ [YA REVISADA EN EXAMEN ANTERIOR]' : '';
  console.log(`\n╔═══ SCHREIBEN TEIL ${t}  [${pid}]${seenMark}`);
  const instr = part.instruction || rec.instruction || '';
  if (instr) { console.log('\n  [INSTRUCCIÓN]'); console.log(instr.split('\n').map(l => '  '+l).join('\n')); }
  if (Array.isArray(part.questions) && part.questions.length) {
    console.log(`\n  [PREGUNTAS — ${part.questions.length}]`);
    part.questions.forEach((q, i) => printQ(q, i));
  }
}

// ── Print full content of all 3 exams ─────────────────────────────────────────
const seenBefore = new Set(); // track IDs already printed in prior exams

for (const { n, picked, gate } of exams) {
  const sep = '═'.repeat(70);
  console.log(`\n\n${sep}`);
  console.log(`  EXAMEN ${n} DE 3   GATE-1: ${gate.ok ? '✅ PASS' : '❌ FAIL'}`);
  console.log(sep);

  // Flat question count
  const flat = flattenExam(picked[Object.keys(picked)[0]]?.part ? {
    lesenParts:    [1,2,3,4,5].map(t => picked[`lesen_${t}`].part),
    horenParts:    [1,2,3,4].map(t => picked[`horen_${t}`].part),
    schreibenParts:[1,2,3].map(t => picked[`schreiben_${t}`].part),
  } : {});

  console.log(`\n── LESEN ${'─'.repeat(60)}`);
  for (const t of [1,2,3,4,5]) {
    const { record, part } = picked[`lesen_${t}`];
    printLesenPart(record, part, t, seenBefore, n);
    seenBefore.add(record.id);
  }

  console.log(`\n── HÖREN ${'─'.repeat(60)}`);
  for (const t of [1,2,3,4]) {
    const { record, part } = picked[`horen_${t}`];
    printHorenPart(record, part, t, seenBefore);
    seenBefore.add(record.id);
  }

  console.log(`\n── SCHREIBEN ${'─'.repeat(56)}`);
  for (const t of [1,2,3]) {
    const { record, part } = picked[`schreiben_${t}`];
    printSchreibenPart(record, part, t, seenBefore);
    seenBefore.add(record.id);
  }
}

console.log('\n\n' + '═'.repeat(70));
console.log('  FIN — 3 EXÁMENES ENSAMBLADOS');
console.log('═'.repeat(70) + '\n');
