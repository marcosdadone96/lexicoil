#!/usr/bin/env node
/**
 * export-b1-exams.mjs — Export full assembled B1 exam JSON(s).
 * Uses the same greedy no-repeat pick as assemble-5-b1-exams.mjs.
 *
 * Usage:
 *   node scripts/export-b1-exams.mjs --exams 4,5
 *   node scripts/export-b1-exams.mjs --exams 1-5 --out batches/assembled
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isExamPublishable,
  isPartPoolReady,
  partRecordToExamPart,
  flattenExam,
} from './audit-pass-2.mjs';
import { answerKeySequence } from './lib/balanceMcq.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

const CELLS = { lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4], schreiben: [1, 2, 3] };
const CELL_KEYS = Object.entries(CELLS).flatMap(([m, ts]) => ts.map((t) => `${m}_${t}`));

const KEY_TARGETS = [
  { label: 'L2', key: 'lesen_2', type: 'multiple_choice' },
  { label: 'L4', key: 'lesen_4', type: 'ja_nein' },
  { label: 'L5', key: 'lesen_5', type: 'multiple_choice' },
  { label: 'H2', key: 'horen_2', type: 'multiple_choice' },
];

function parseArgs(argv) {
  const o = { exams: [4, 5], out: ROOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exams') {
      const raw = argv[++i] || '4,5';
      if (/^\d+-\d+$/.test(raw)) {
        const [a0, b0] = raw.split('-').map(Number);
        o.exams = [];
        for (let n = a0; n <= b0; n++) o.exams.push(n);
      } else {
        o.exams = raw.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      }
    } else if (a === '--out') {
      o.out = path.resolve(ROOT, argv[++i]);
    }
  }
  return o;
}

const ARGS = parseArgs(process.argv.slice(2));
fs.mkdirSync(ARGS.out, { recursive: true });

const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const allRecords = (raw.records || raw).filter((r) => r && r.id);

const cleanPool = {};
for (const key of CELL_KEYS) cleanPool[key] = [];

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

const usedIds = new Set();
const assembledExams = [];

for (let e = 0; e < Math.max(...ARGS.exams); e++) {
  const picked = {};
  const missing = [];
  for (const key of CELL_KEYS) {
    const pool = cleanPool[key];
    let chosen = pool.find((c) => !usedIds.has(c.id));
    let reused = false;
    if (!chosen && pool.length > 0) {
      chosen = pool[e % pool.length];
      reused = true;
    }
    if (!chosen) {
      missing.push(key);
      continue;
    }
    picked[key] = { ...chosen, reused };
    if (!reused) usedIds.add(chosen.id);
  }
  if (missing.length) {
    console.error(`FATAL: examen ${e + 1}: sin partes para ${missing.join(', ')}`);
    process.exit(1);
  }
  const examBody = {
    lesenParts: [1, 2, 3, 4, 5].map((t) => picked[`lesen_${t}`].part),
    horenParts: [1, 2, 3, 4].map((t) => picked[`horen_${t}`].part),
    schreibenParts: [1, 2, 3].map((t) => picked[`schreiben_${t}`].part),
  };
  const gate = isExamPublishable({ exam: examBody });
  assembledExams.push({ n: e + 1, picked, examBody, gate });
}

function countByCell(examBody) {
  const flat = flattenExam(examBody);
  const byCell = {};
  for (const key of CELL_KEYS) {
    const [mod, teilStr] = key.split('_');
    const teil = Number(teilStr);
    byCell[key] = (flat.questions || []).filter(
      (q) => String(q.module || '').toLowerCase() === mod && Number(q.teil) === teil,
    ).length;
  }
  return { total: (flat.questions || []).length, byCell };
}

for (const examNum of ARGS.exams) {
  const { picked, examBody, gate } = assembledExams[examNum - 1];
  if (!gate.ok) {
    console.error(`Examen ${examNum}: GATE-1 FAIL (${gate.blocking.length} blocking)`);
    process.exit(1);
  }
  const counts = countByCell(examBody);
  const keySeqs = Object.fromEntries(
    KEY_TARGETS.map((t) => [
      t.label,
      answerKeySequence(picked[t.key].part.questions || [], t.type),
    ]),
  );
  const outPath = path.join(ARGS.out, `assembled-exam-b1-e${examNum}.json`);
  const examOut = {
    _meta: {
      examNumber: examNum,
      generatedAt: new Date().toISOString(),
      gate1: {
        ok: gate.ok,
        blocking: gate.blocking.length,
        advisory: (gate.advisory || []).length,
      },
      partIds: Object.fromEntries(
        CELL_KEYS.map((k) => [k, picked[k].record.id]),
      ),
      keySequences: keySeqs,
      questionCount: counts,
    },
    exam: examBody,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(examOut, null, 2)}\n`, 'utf8');
  console.log(`✅ Examen ${examNum}  GATE-1 PASS  →  ${path.relative(ROOT, outPath)}`);
  console.log(`   ${counts.total} preguntas  |  L2=${keySeqs.L2}`);
}
