/**
 * Assembled exam ↔ pool-verified content freshness (blocking STALE detection).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { normalizeLevel, poolVerifiedDir } from './batchPaths.mjs';
import { allAssembleCellKeys } from './examLevelCells.mjs';
import { canonicalPartHash } from './partContentHash.mjs';
import { partRecordToExamPart } from '../audit-pass-2.mjs';
import { assembledExamPath, loadPoolRecordForAssembledCell } from './assembledPoolLoad.mjs';

function examPartForCell(exam, cell) {
  const [mod, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const key = `${mod}Parts`;
  const parts = exam?.[key] || [];
  return parts.find((p) => Number(p.teil) === teil) || null;
}

/** Stable hash of exam-facing part payload (embedded in assembled JSON). */
export function examPartContentHash(part, cell) {
  if (!part) return null;
  const [mod, teilStr] = cell.split('_');
  const payload = {
    module: mod,
    teil: Number(teilStr),
    instruction: part.instruction || '',
    task: part.task || '',
    text: part.text || '',
    textTitle: part.textTitle || '',
    passages: part.passages || [],
    segments: part.segments || [],
    items: part.items || [],
    questions: part.questions || [],
    minWords: part.minWords,
    maxWords: part.maxWords,
  };
  return canonicalPartHash(payload);
}

export function poolRecordContentHash(record) {
  if (!record) return null;
  const part = partRecordToExamPart(record);
  const cell = `${record.module}_${record.teil}`;
  return examPartContentHash(part, cell);
}

/**
 * @param {string} assembledAbsPath
 * @param {string} [level]
 */
export function auditAssembledFreshness(assembledAbsPath, level = 'B1') {
  const lv = normalizeLevel(level);
  const doc = JSON.parse(fs.readFileSync(assembledAbsPath, 'utf8'));
  const meta = doc._meta || {};
  const partIds = meta.partIds || {};
  const cells = [];
  for (const cell of allAssembleCellKeys(lv)) {
    const partId = partIds[cell];
    if (!partId) continue;
    const poolRec = loadPoolRecordForAssembledCell(meta, cell, partId, lv);
    const poolHash = poolRecordContentHash(poolRec);
    const embedded = examPartForCell(doc.exam, cell);
    const examHash = examPartContentHash(embedded, cell);
    const fresh = poolHash && examHash && poolHash === examHash;
    cells.push({
      cell,
      partId,
      poolHash: poolHash ? poolHash.slice(0, 16) : null,
      examHash: examHash ? examHash.slice(0, 16) : null,
      fresh,
      stale: !fresh,
    });
  }
  const staleCells = cells.filter((c) => c.stale);
  return {
    file: path.basename(assembledAbsPath),
    slot: meta.examNumber ?? null,
    level: lv,
    fresh: staleCells.length === 0,
    stale: staleCells.length > 0,
    staleCellCount: staleCells.length,
    cells,
    staleCells: staleCells.map((c) => c.cell),
  };
}

export function auditAssembledSlotsFreshness({ slots, level = 'B1' }) {
  const rows = slots.map((slot) =>
    auditAssembledFreshness(assembledExamPath(slot, level), level),
  );
  return {
    at: new Date().toISOString(),
    level: normalizeLevel(level),
    slots,
    allFresh: rows.every((r) => r.fresh),
    staleExams: rows.filter((r) => r.stale).map((r) => ({ slot: r.slot, file: r.file, staleCells: r.staleCells })),
    rows,
  };
}

/** @throws if any assembled exam for slots is STALE */
export function assertAssembledFreshBeforePublish({ slots, level = 'B1' }) {
  const report = auditAssembledSlotsFreshness({ slots, level });
  if (report.allFresh) return report;
  const msg =
    `STALE — requiere reensamblado antes de publish (${report.level} slots ${slots.join(',')}):\n` +
    report.staleExams
      .map((e) => `  e${e.slot} ${e.file}: celdas ${e.staleCells.join(', ')}`)
      .join('\n') +
    '\n  → node scripts/reassemble-verified-from-pool.mjs --level ' +
    report.level +
    ' --slots ' +
    slots.join(',');
  const err = new Error(msg);
  err.code = 'ASSEMBLED_EXAM_STALE';
  err.report = report;
  throw err;
}

/** Pool file basename touched — list assembled exams that reference it and are STALE. */
export function assembledExamsStaleAfterPoolFileTouch(poolFileBasename, level = 'B1') {
  const lv = normalizeLevel(level);
  const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
  if (!fs.existsSync(asmDir)) return [];
  const re = new RegExp(`^assembled-exam-${lv.toLowerCase()}-verified-e(\\d+)\\.json$`, 'i');
  const hits = [];
  for (const f of fs.readdirSync(asmDir)) {
    if (!re.test(f)) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(asmDir, f), 'utf8'));
    const sources = doc._meta?.sources || {};
    const uses = Object.entries(sources).filter(([, src]) => src === poolFileBasename);
    if (!uses.length) continue;
    const audit = auditAssembledFreshness(path.join(asmDir, f), lv);
    if (audit.stale) {
      hits.push({
        file: f,
        slot: audit.slot,
        poolFile: poolFileBasename,
        cells: uses.map(([c]) => c),
        staleCells: audit.staleCells,
      });
    }
  }
  return hits;
}

export function logAssembledStaleAfterPoolTouch({ level, file, trigger = 'pool-touch' }) {
  const base = path.basename(String(file || ''));
  if (!base.endsWith('.json')) return [];
  const hits = assembledExamsStaleAfterPoolFileTouch(base, level);
  if (!hits.length) return hits;
  const entry = {
    at: new Date().toISOString(),
    trigger,
    poolFile: base,
    level: normalizeLevel(level),
    hits,
  };
  const logPath = path.join(ROOT, 'batches/ready/gate-logs/assembled-stale-after-pool-touch.jsonl');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  console.warn(
    `[assembled-freshness] STALE after pool touch ${base}: ${hits.map((h) => `e${h.slot}(${h.staleCells.join('|')})`).join(', ')} — reassemble before publish`,
  );
  return hits;
}
