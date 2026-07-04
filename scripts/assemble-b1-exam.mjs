#!/usr/bin/env node
/**
 * assemble-b1-exam.mjs
 *
 * Assembles a complete Goethe B1 exam from clean pool parts,
 * runs isExamPublishable (GATE-1), then prints the full exam content.
 *
 * Dirty parts excluded:
 *   gen-h4-009                         (horen T4 — 15 caps errors, _regen=true)
 *   bank-de-B1-horen-t2-dde04fcc93fa5d63 (horen T2 — 3 caps FP "für Neues zu sein")
 *
 * Usage:
 *   node scripts/assemble-b1-exam.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isExamPublishable,
  isPartPoolReady,
  GATE_BLOCK_CHECKS,
  GATE_BLOCK_PENDING,
  partRecordToExamPart,
  flattenExam,
} from './audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

// ── Dirty exclusions ──────────────────────────────────────────────────────────
const DIRTY_IDS = new Set([
  'gen-h4-009',
  'bank-de-B1-horen-t2-dde04fcc93fa5d63',
]);

// ── Load pool ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const allRecords = raw.records || raw;

// ── Group by module+teil, excluding dirty ─────────────────────────────────────
const CELLS = {
  lesen:     [1, 2, 3, 4, 5],
  horen:     [1, 2, 3, 4],
  schreiben: [1, 2, 3],
};

const cellMap = {}; // key "lesen_1" → array of clean records
for (const [mod, teile] of Object.entries(CELLS)) {
  for (const t of teile) {
    cellMap[`${mod}_${t}`] = [];
  }
}

for (const rec of allRecords) {
  const id = rec.id || rec._id || '';
  if (DIRTY_IDS.has(id)) continue;
  const mod = String(rec.module || '').toLowerCase();
  const t = Number(rec.teil);
  const key = `${mod}_${t}`;
  if (cellMap[key] !== undefined) {
    cellMap[key].push(rec);
  }
}

// ── Pick one part per cell ────────────────────────────────────────────────────
// Iterate through clean records per cell; pick the first that passes isPartPoolReady.
// No parts generated with fixed prompt yet (prompt was just fixed this session),
// so no prompt-priority filtering applies.
const picked = {}; // key → { record, part }
const missingCells = [];
const skippedPerCell = {};

for (const [key, recs] of Object.entries(cellMap)) {
  if (recs.length === 0) {
    missingCells.push(key);
    continue;
  }
  let found = false;
  skippedPerCell[key] = [];
  for (const record of recs) {
    const part = partRecordToExamPart(record);
    if (!part) {
      skippedPerCell[key].push({ id: record.id || record._id, reason: 'partRecordToExamPart=null' });
      continue;
    }
    const gate = await isPartPoolReady(record, { semantic: false });
    if (!gate.ok) {
      const ids = (gate.blocking || []).map(f => f.id).join(',');
      skippedPerCell[key].push({ id: record.id || record._id, reason: ids || 'ok=false' });
      continue;
    }
    picked[key] = { record, part };
    found = true;
    break;
  }
  if (!found) {
    missingCells.push(key);
  }
}

// Report skipped parts
for (const [key, skipped] of Object.entries(skippedPerCell)) {
  if (skipped.length) {
    process.stderr.write(`  ⚠  ${key}: skipped ${skipped.length} parts with issues:\n`);
    for (const s of skipped) {
      process.stderr.write(`       ${s.id}  [${s.reason}]\n`);
    }
  }
}

if (missingCells.length > 0) {
  console.error('\nFATAL: no usable parts for cells:', missingCells.join(', '));
  process.exit(1);
}

// ── Assemble exam ─────────────────────────────────────────────────────────────
const lesenParts    = [1,2,3,4,5].map(t => picked[`lesen_${t}`].part);
const horenParts    = [1,2,3,4].map(t => picked[`horen_${t}`].part);
const schreibenParts= [1,2,3].map(t => picked[`schreiben_${t}`].part);

const assembledExam = {
  exam: { lesenParts, horenParts, schreibenParts },
};

// ── Run GATE-1 ────────────────────────────────────────────────────────────────
const gate = isExamPublishable(assembledExam);

// ── Gate report ───────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('GATE-1 (isExamPublishable)');
console.log('══════════════════════════════════════════════════════════════');
console.log('ok               :', gate.ok);
console.log('blocking         :', gate.blocking.length);
console.log('advisory         :', (gate.advisory || []).length);
console.log('pending          :', (gate.pending || []).length);

const criticals  = gate.blocking.filter(f => f.severity === 'CRITICAL');
const gateBlocks = gate.blocking.filter(f => GATE_BLOCK_CHECKS.has(f.id));
const pendingFlg = gate.pending || [];

console.log('  CRITICAL       :', criticals.length);
console.log('  GATE_BLOCK_CHECKS:', gateBlocks.length, gateBlocks.length ? gateBlocks.map(f=>f.id).join(',') : '');
console.log('  GATE_BLOCK_PENDING:', pendingFlg.length);

if (gate.blocking.length) {
  console.log('\n  Blocking findings:');
  for (const f of gate.blocking) {
    console.log(`    [${f.id}] ${f.severity} – ${f.message}`);
  }
}
if ((gate.advisory||[]).length) {
  console.log('\n  Advisory findings:');
  for (const f of gate.advisory || []) {
    console.log(`    [${f.id}] ${f.severity} – ${f.message}`);
  }
}

// ── Part IDs per cell ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('PARTES ELEGIDAS (1 por celda)');
console.log('══════════════════════════════════════════════════════════════');
for (const [mod, teile] of Object.entries(CELLS)) {
  for (const t of teile) {
    const key = `${mod}_${t}`;
    const rec = picked[key].record;
    const pid = rec.id || rec._id;
    console.log(`  ${mod.padEnd(9)} T${t}  →  ${pid}`);
  }
}

// ── Question count verification ───────────────────────────────────────────────
// Use flattenExam for deduped authoritative counts (hören stores in segments).
const flatForCount = flattenExam(assembledExam.exam);
const totalQ = (flatForCount.questions || []).length;
const countByCell = {};
for (const [mod, teile] of Object.entries(CELLS)) {
  for (const t of teile) {
    const key = `${mod}_${t}`;
    const n = (flatForCount.questions || []).filter(
      q => String(q.module||'').toLowerCase() === mod && Number(q.teil) === t
    ).length;
    countByCell[key] = n;
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('CONTEO DE PREGUNTAS');
console.log('══════════════════════════════════════════════════════════════');
for (const [key, n] of Object.entries(countByCell)) {
  console.log(`  ${key.padEnd(12)}  ${n} preguntas`);
}
console.log(`  TOTAL: ${totalQ} (esperado: 63)`);

// ── Full exam content ─────────────────────────────────────────────────────────
console.log('\n\n══════════════════════════════════════════════════════════════');
console.log('CONTENIDO COMPLETO DEL EXAMEN');
console.log('══════════════════════════════════════════════════════════════');

function hr(label) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(label);
  console.log('─'.repeat(64));
}

function optionText(opt) {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') {
    // Handle {label:"a", text:"..."} or {value:"a", label:"..."} etc.
    const label = opt.label || opt.value || opt.letter || '';
    const body  = opt.text  || opt.body  || opt.content || '';
    if (label && body) return `${label}) ${body}`;
    if (body) return body;
    if (label) return label;
    return JSON.stringify(opt);
  }
  return String(opt);
}

function printQuestion(q, idx) {
  const num = String(idx + 1).padStart(2, '0');
  console.log(`\n  ${num}. ${q.question || q.text || ''}`);
  if (q.signText) {
    console.log(`      [Meinung/Aussage] ${q.signText}`);
  }
  if (Array.isArray(q.options) && q.options.length) {
    for (const opt of q.options) {
      console.log(`        ${optionText(opt)}`);
    }
  }
  const ans = q.correct || q.correctAnswer || '';
  console.log(`      ✓ ${ans}`);
  if (q.explanation) {
    console.log(`      Expl: ${q.explanation}`);
  }
}

// ── LESEN ─────────────────────────────────────────────────────────────────────
hr('LESEN');
for (const t of [1,2,3,4,5]) {
  const key = `lesen_${t}`;
  const rec = picked[key].record;
  const part = picked[key].part;
  const pid = rec.id || rec._id;

  console.log(`\n╔═══ LESEN TEIL ${t}  [${pid}] ══════════════════════════════════════`);

  // Passage text — L2 stores both texts in part.passages[] (from record.passage.passages[])
  if (Array.isArray(part.passages) && part.passages.length) {
    for (const p of part.passages) {
      const ptitle = p.textTitle || p.title || p.passageId || '';
      console.log(`\n  [PASSAGE${ptitle ? ' — ' + ptitle : ''}]`);
      console.log((p.text || '').split('\n').map(l => '  ' + l).join('\n'));
    }
  } else {
    const passageText = part.text || rec.passage?.text || rec.text || '';
    if (passageText) {
      const ptitle = part.textTitle || rec.passage?.title || '';
      console.log(`\n  [PASSAGE${ptitle ? ' — ' + ptitle : ''}]`);
      console.log(passageText.split('\n').map(l => '  ' + l).join('\n'));
    }
  }

  // signText / ads (for T3, T4)
  if (part.ads && part.ads.length) {
    console.log('\n  [ANZEIGEN / ADS]');
    part.ads.forEach((ad, i) => {
      console.log(`\n  ${String.fromCharCode(65+i)}) ${ad.title || ad.heading || ''}`);
      console.log(`     ${ad.text || ad.body || ''}`);
    });
  }

  // Questions
  console.log(`\n  [PREGUNTAS — ${(part.questions||[]).length}]`);
  (part.questions || []).forEach((q, i) => printQuestion(q, i));
}

// ── HÖREN ─────────────────────────────────────────────────────────────────────
hr('HÖREN');
for (const t of [1,2,3,4]) {
  const key = `horen_${t}`;
  const rec = picked[key].record;
  const part = picked[key].part;
  const pid = rec.id || rec._id;

  console.log(`\n╔═══ HÖREN TEIL ${t}  [${pid}] ══════════════════════════════════════`);

  // Transcript
  const transcript = part.passage?.transcript || part.passage?.text ||
    rec.passage?.transcript || rec.passage?.text || rec.transcript || '';
  if (transcript) {
    console.log('\n  [TRANSKRIPT]');
    console.log(transcript.split('\n').map(l => '  ' + l).join('\n'));
  }

  // Segments (Hören multi-speaker format)
  if (Array.isArray(part.segments) && part.segments.length) {
    console.log('\n  [SEGMENTOS]');
    for (const seg of part.segments) {
      const segTranscript = seg.transcript || seg.text || '';
      if (segTranscript) {
        console.log(`\n  Segmento ${seg.id || ''}:`);
        console.log(segTranscript.split('\n').map(l => '    ' + l).join('\n'));
      }
      if (seg.questions && seg.questions.length) {
        seg.questions.forEach((q, i) => printQuestion(q, i));
      }
    }
  }

  // Flat questions (if no segments)
  if (!part.segments || !part.segments.length) {
    const qs = part.questions || [];
    if (qs.length) {
      console.log(`\n  [PREGUNTAS — ${qs.length}]`);
      qs.forEach((q, i) => printQuestion(q, i));
    }
  }
}

// ── SCHREIBEN ─────────────────────────────────────────────────────────────────
hr('SCHREIBEN');
for (const t of [1,2,3]) {
  const key = `schreiben_${t}`;
  const rec = picked[key].record;
  const part = picked[key].part;
  const pid = rec.id || rec._id;

  console.log(`\n╔═══ SCHREIBEN TEIL ${t}  [${pid}] ══════════════════════════════════════`);

  const task = part.task || rec.task || rec.instruction || '';
  if (task) {
    console.log('\n  [AUFGABE]');
    console.log(task.split('\n').map(l => '  ' + l).join('\n'));
  }
  if (part.minWords || part.maxWords) {
    console.log(`  Wörter: ${part.minWords||'?'}–${part.maxWords||'?'}`);
  }
  if (Array.isArray(part.questions) && part.questions.length) {
    console.log('\n  [TEILAUFGABEN]');
    part.questions.forEach((q, i) => {
      console.log(`  ${i+1}. ${q.question || q.text || ''}`);
    });
  }
}

console.log('\n\n══════════════════════════════════════════════════════════════');
console.log('FIN DEL EXAMEN');
console.log('══════════════════════════════════════════════════════════════\n');

// ── Save assembled exam JSON ──────────────────────────────────────────────────
const OUT_FILE = path.join(ROOT, 'assembled-exam-b1.json');
const examOut = {
  _meta: {
    generatedAt: new Date().toISOString(),
    gate1: { ok: gate.ok, blocking: gate.blocking.length, advisory: (gate.advisory||[]).length },
    partIds: Object.fromEntries(
      Object.entries(picked).map(([k, v]) => [k, v.record.id || v.record._id])
    ),
    questionCount: { total: totalQ, byCell: countByCell },
  },
  ...assembledExam,
};
fs.writeFileSync(OUT_FILE, JSON.stringify(examOut, null, 2), 'utf8');
console.log(`JSON guardado en: ${OUT_FILE}`);
