#!/usr/bin/env node
/**
 * Non-destructive preflight for de/B1: conformance scan + dry-run disjoint assembly.
 * Usage: node scripts/preflight-de-b1.mjs [--target 10]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkQuestionConformance } from './lib/blueprintConformance.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG = 'de';
const LEVEL = 'B1';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const TARGET = Math.max(1, Number(arg('--target', '10')) || 10);

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function loadBank() {
  const bank = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'library', LANG, LEVEL, 'questions.json'), 'utf8'),
  );
  const pp = path.join(ROOT, 'library', LANG, LEVEL, 'passages.json');
  if (fs.existsSync(pp)) {
    const pf = JSON.parse(fs.readFileSync(pp, 'utf8'));
    const ids = new Set((bank.passages || []).map((p) => p.id));
    const extra = (pf.passages || []).filter((p) => !ids.has(p.id));
    bank.passages = [...(bank.passages || []), ...extra];
  }
  return bank;
}

function loadBlueprint() {
  const id = ExamBlueprint.INDEX[`${LANG}_${LEVEL}`];
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${id}.json`), 'utf8'));
}

function partTarget(partSpec) {
  return partSpec.itemsTotal || partSpec.questionsTotal?.max || partSpec.questionsTotal?.min || 1;
}

function modulePool(bank, moduleId) {
  const mod = String(moduleId).toLowerCase();
  return (bank.questions || []).filter((q) => {
    const m = String(q.module || '').toLowerCase();
    if (mod === 'lesen' || mod === 'reading') return m === 'lesen' || m === 'reading';
    if (mod === 'horen' || mod === 'listening') return m === 'horen' || m === 'listening';
    return m === mod;
  });
}

function blueprintTeilInventory(bank, blueprint) {
  let minDisjointCapacity = Infinity;
  let bindingTeil = null;
  let bindingGap = 0;

  for (const mod of blueprint.modules || []) {
    const pool = modulePool(bank, mod.id);
    const teilCounts = {};
    for (const q of pool) {
      const t = q.teil ?? 0;
      teilCounts[t] = (teilCounts[t] || 0) + 1;
    }
    for (const part of mod.parts || []) {
      const teil = part.teil;
      const target = partTarget(part);
      const count = teilCounts[teil] || 0;
      const disjointCapacity = target ? Math.floor(count / target) : 0;
      const gap = Math.max(0, target * TARGET - count);
      if (disjointCapacity < minDisjointCapacity) {
        minDisjointCapacity = disjointCapacity;
        bindingTeil = `${mod.id}T${teil}`;
        bindingGap = gap;
      }
    }
  }

  return {
    bindingTeil: minDisjointCapacity === Infinity ? null : bindingTeil,
    theoreticalMax: minDisjointCapacity === Infinity ? 0 : minDisjointCapacity,
    bindingGap,
  };
}

function countDisjointExams(bank, blueprint, max = TARGET) {
  const usedIds = new Set();
  let built = 0;
  for (let attempt = 0; attempt < max + 5 && built < max; attempt++) {
    const sub = { ...bank, questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)) };
    if (!sub.questions.length) break;
    const assembled = ExamBlueprint.assemble(sub, blueprint);
    const selected = assembled.selected || [];
    if (!selected.length) break;
    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < 1.0) break;
    const exam = ExamBuilder.buildFromBlueprint(LANG, LEVEL, sub, blueprint, { assembled });
    const check = new ExamValidator().validate(exam, { strict: false });
    if (!check.valid) {
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }
    selected.forEach((q) => usedIds.add(q.id));
    built++;
  }
  return built;
}

const bank = loadBank();
const blueprint = loadBlueprint();
const questions = bank.questions || [];

const nonConformant = [];
for (const q of questions) {
  const { ok, reasons } = checkQuestionConformance(q, blueprint);
  if (!ok) nonConformant.push({ id: q.id, reasons });
}

const blocking = nonConformant.filter((item) =>
  item.reasons.some((r) =>
    ['matching_missing_options', 'options_missing', 'correct_missing'].includes(r),
  ),
);
const typeOnly = nonConformant.filter(
  (item) => !blocking.some((b) => b.id === item.id),
);

const examsBuilt = countDisjointExams(bank, blueprint, TARGET);
const teilInfo = blueprintTeilInventory(bank, blueprint);
const gapToTarget = Math.max(0, TARGET - examsBuilt);

console.log(`\n=== Preflight de/B1 (target ${TARGET} exámenes) ===\n`);
console.log(`Preguntas en banco:     ${questions.length}`);
console.log(`No conformes:           ${nonConformant.length} (${blocking.length} bloquean ensamblado, ${typeOnly.length} solo tipo/slot)`);
if (nonConformant.length) {
  console.log('\nÍtems no conformes:');
  for (const item of nonConformant.slice(0, 20)) {
    console.log(`  ${item.id}: ${item.reasons.join('; ')}`);
  }
  if (nonConformant.length > 20) console.log(`  … y ${nonConformant.length - 20} más`);
}

console.log(`\nEnsamblado en seco:     ${examsBuilt} exámenes completos (ratio 1.0, validados)`);
console.log(`Cuello de botella:      ${teilInfo.bindingTeil || '—'} (capacidad teórica ${teilInfo.theoreticalMax})`);
console.log(`Gap hasta ${TARGET}:          ${gapToTarget} exámenes`);

let verdict;
let exitCode = 0;
if (nonConformant.length > 0) {
  verdict = 'LIMPIAR banco primero';
  exitCode = 1;
} else if (examsBuilt >= TARGET) {
  verdict = 'LISTO para generar';
} else {
  verdict = `FALTAN ítems en ${teilInfo.bindingTeil || 'varios Teile'}`;
}

console.log(`\nVeredicto: ${verdict}\n`);
process.exit(exitCode);
