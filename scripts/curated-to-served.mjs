#!/usr/bin/env node
/**
 * curated-to-served.mjs — Promueve exámenes curated al archivo servido al cliente.
 *
 * Lee library/curated/<lang>/<level>/curated_*.json → data/exams/<lang>_<level>.json
 *
 * Uso: node scripts/curated-to-served.mjs --lang de --level B1 --apply
 *      npm run assemble:servable -- --lang de --level B1 --apply
 *
 * SAFETY: Sin --apply este script hace CERO escrituras (dry-run por defecto).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parseLangLevelArgs,
  requireLangLevel,
  curatedDir,
  servedExamPath,
  listCuratedFiles,
  comboKey,
  ROOT,
} from './lib/examPipeline.mjs';
import { isExamPublishable } from './audit-pass-2.mjs';

const ALLOWED = new Set(['multiple_choice', 'multiple', 'matching', 'richtig_falsch', 'true_false', 'yn', 'ja_nein']);

// ── Parse args (extend parseLangLevelArgs with --allow-audit-failures) ─────
const ALLOW_AUDIT_FAILURES = process.argv.includes('--allow-audit-failures');
const APPLY = process.argv.includes('--apply');

if (ALLOW_AUDIT_FAILURES) {
  process.stderr.write(
    '\n\x1b[31m⚠  --allow-audit-failures activo: exámenes con findings bloqueantes SE INCLUIRÁN igualmente.\x1b[0m\n\n',
  );
}
if (!APPLY) {
  process.stderr.write(
    '\x1b[33m[curated-to-served] DRY-RUN — añade --apply para escribir a data/exams/.\x1b[0m\n\n',
  );
}

const opts = parseLangLevelArgs(process.argv);
requireLangLevel(opts, [
  'Usage: node scripts/curated-to-served.mjs --lang de --level B1 --apply',
  '',
  'Paths:',
  '  in:  library/curated/<lang>/<level>/curated_*.json',
  '  out: data/exams/<lang>_<level>.json',
  '',
  'SAFETY: sin --apply = dry-run (CERO escrituras a disco).',
]);

const LANG = opts.lang;
const LEVEL = opts.level;
const curatedPath = curatedDir(LANG, LEVEL);
const servedFile = servedExamPath(LANG, LEVEL);

if (!fs.existsSync(curatedPath)) {
  console.error(`No existe ${path.relative(ROOT, curatedPath)}`);
  process.exit(1);
}

const files = listCuratedFiles(LANG, LEVEL);
let droppedOrphans = 0;

function allowedPassageIds(part) {
  const ids = new Set();
  if (part.passageId) ids.add(part.passageId);
  for (const pp of part.passages || []) {
    if (pp.passageId) ids.add(pp.passageId);
    if (pp.id) ids.add(pp.id);
  }
  for (const q of part.questions || []) {
    if (q.passageId) ids.add(q.passageId);
  }
  return ids;
}

function guardPart(container, allowedIds) {
  if (!Array.isArray(container.questions)) return;
  const allowed =
    allowedIds instanceof Set ? allowedIds : new Set([allowedIds].filter(Boolean));
  container.questions = container.questions.filter((q) => {
    if (q.passageId && allowed.size && !allowed.has(q.passageId)) {
      droppedOrphans++;
      return false;
    }
    return true;
  });
}

/** Stable catalog id for a served exam.
 *
 *  saveExams.getExamContentKey() needs examId | poolId | published id to build
 *  a contentKey; without one every attempt at the same exam is stored as a new
 *  history entry instead of matching the previous one. The published pipeline
 *  (de/*) assigns official-<lang>-<level>-eN, but exams promoted through this
 *  script carried no id at all.
 *
 *  Derived from the curated filename hash (curated_en_B1_<hash>.json) so it
 *  survives reordering — a positional eN would shift when a file is added. */
function catalogIdFor(fileName) {
  const m = /^curated_[^_]+_[^_]+_([0-9a-f]+)\.json$/i.exec(fileName);
  const suffix = m ? m[1] : path.basename(fileName, '.json');
  return `official-${LANG}-${LEVEL}-${suffix}`;
}

const served = [];
let gateBlocked = 0;
for (const f of files) {
  const x = JSON.parse(fs.readFileSync(path.join(curatedPath, f), 'utf8'));
  const exam = x.exam || x;
  if (!exam.examId) exam.examId = catalogIdFor(f);
  if (!exam.id) exam.id = exam.examId;

  // ── GATE-1 segunda barrera ───────────────────────────────────────────────
  const gate = isExamPublishable(exam, { allowFailures: ALLOW_AUDIT_FAILURES });
  if (!gate.ok) {
    const ids = [...new Set(gate.blocking.map((fi) => fi.id))].join(',');
    console.error(`[curated-to-served] EXCLUIDO ${f}: ${gate.blocking.length} finding(s) bloqueante(s) [${ids}]`);
    for (const fi of gate.blocking) {
      console.error(`  [${fi.severity}][${fi.id}] ${fi.message}`);
    }
    gateBlocked++;
    continue;
  }
  if (gate.advisory.length > 0) {
    const ids = [...new Set(gate.advisory.map((fi) => fi.id))].join(',');
    console.log(`[curated-to-served] advisory ${f}: ${gate.advisory.length} finding(s) no bloqueante(s) [${ids}]`);
  }

  (exam.lesenParts || []).forEach((p) => guardPart(p, allowedPassageIds(p)));
  (exam.horenParts || []).forEach((p) =>
    (p.segments || []).forEach((s) => guardPart(s, allowedPassageIds(s))),
  );
  served.push(exam);
}

if (!served.length) {
  if (gateBlocked > 0) {
    console.error(`No quedan exámenes tras el gate de auditoría (${gateBlocked} bloqueado(s)). Corrige los findings o usa --allow-audit-failures (solo desarrollo).`);
  } else {
    console.error('No se encontraron exámenes curated para promover.');
  }
  process.exit(1);
}
if (gateBlocked > 0) {
  console.warn(`\n⚠  ${gateBlocked} examen(es) excluido(s) por gate de auditoría (no incluidos en data/exams/).`);
}

console.log('=== curated-to-served ===');
console.log(`${comboKey(LANG, LEVEL)}: ${served.length} exámenes -> ${path.relative(ROOT, servedFile)}`);
console.log(`Guard: huérfanas eliminadas=${droppedOrphans}`);

if (!APPLY) {
  console.log('\n[DRY-RUN] No se escribió ningún archivo. Re-ejecuta con --apply para publicar.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(servedFile), { recursive: true });
fs.writeFileSync(servedFile, JSON.stringify(served, null, 2) + '\n', 'utf8');
console.log(`Escrito: ${path.relative(ROOT, servedFile)}`);
