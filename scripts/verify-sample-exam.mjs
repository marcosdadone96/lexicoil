#!/usr/bin/env node
/**
 * Ensambla 1 examen Goethe B1 completo desde el banco (+ lotes opcionales)
 * y valida coherencia, blueprint y calidad.
 *
 * Uso:
 *   npm run verify:exam:b1
 *   node scripts/verify-sample-exam.mjs --merge-file batches/generated/horen-t2-gemini-001.json
 *   node scripts/verify-sample-exam.mjs --include-generated --save data/exams/de_B1_verify.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG = 'de';
const LEVEL = 'B1';

function parseArgs(argv) {
  const out = {
    mergeFiles: [],
    includeGenerated: false,
    save: null,
    seed: null,
    strict: false,
    attempts: 50,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--merge-file') out.mergeFiles.push(argv[++i]);
    else if (a === '--include-generated') out.includeGenerated = true;
    else if (a === '--save') out.save = argv[++i];
    else if (a === '--seed') out.seed = Number(argv[++i]);
    else if (a === '--strict') out.strict = true;
    else if (a === '--attempts') out.attempts = Math.max(1, Number(argv[++i]) || 50);
  }
  return out;
}

function loadBank() {
  const bankPath = path.join(ROOT, 'library', LANG, LEVEL, 'questions.json');
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  bank.passages = bank.passages || [];
  bank.questions = bank.questions || [];

  const pp = path.join(ROOT, 'library', LANG, LEVEL, 'passages.json');
  if (fs.existsSync(pp)) {
    const pf = JSON.parse(fs.readFileSync(pp, 'utf8'));
    const ids = new Set(bank.passages.map((p) => p.id));
    for (const p of pf.passages || []) {
      if (!ids.has(p.id)) bank.passages.push(p);
    }
  }
  return bank;
}

function mergeBatchIntoBank(bank, batchPath, label) {
  const abs = path.isAbsolute(batchPath) ? batchPath : path.join(ROOT, batchPath);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠ No existe: ${batchPath}`);
    return { addedQ: 0, addedP: 0, skippedQ: 0, skippedP: 0 };
  }

  let batch;
  try {
    batch = normalizeBatch(JSON.parse(fs.readFileSync(abs, 'utf8')));
  } catch (err) {
    console.warn(`⚠ JSON inválido ${batchPath}: ${err.message}`);
    return { addedQ: 0, addedP: 0, skippedQ: 0, skippedP: 0 };
  }

  const qIds = new Set(bank.questions.map((q) => q.id));
  const pIds = new Set(bank.passages.map((p) => p.id));
  const batchPids = new Set((batch.passages || []).map((p) => p.id));
  let addedQ = 0;
  let addedP = 0;
  let skippedQ = 0;
  let skippedP = 0;

  for (const p of batch.passages || []) {
    if (!p?.id) continue;
    if (pIds.has(p.id)) {
      skippedP++;
      continue;
    }
    bank.passages.push(p);
    pIds.add(p.id);
    addedP++;
  }

  for (const q of batch.questions || []) {
    if (!q?.id) continue;
    if (qIds.has(q.id)) {
      skippedQ++;
      continue;
    }
    if (q.passageId && !pIds.has(q.passageId) && !batchPids.has(q.passageId)) {
      console.warn(`⚠ ${label}: pregunta ${q.id} passageId huérfano (${q.passageId}) — omitida`);
      continue;
    }
    bank.questions.push(q);
    qIds.add(q.id);
    addedQ++;
  }

  console.log(
    `[merge] ${path.relative(ROOT, abs)} → +${addedQ}Q +${addedP}P (${skippedQ} dup Q, ${skippedP} dup P)`,
  );
  return { addedQ, addedP, skippedQ, skippedP };
}

function listGeneratedJson() {
  const dir = path.join(ROOT, 'batches', 'generated');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json') && !n.startsWith('.tmp-'))
    .map((n) => path.join('batches', 'generated', n).replace(/\\/g, '/'))
    .sort();
}

function withOptionalSeed(seed, fn) {
  if (!Number.isFinite(seed)) return fn();
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/adsMatching.js'));
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));
const {
  GOETHE_B1_SCHREIBEN_WORDS,
  GOETHE_B1_PRESENTATION_SLIDES,
  GOETHE_B1_LESEN_T3_EXAMPLE,
} = require(path.join(ROOT, 'js/library/goetheB1Constants.js'));

function loadBlueprint() {
  const id = LibraryCatalog.blueprintId(LANG, LEVEL);
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${id}.json`), 'utf8'));
}

function printCoverage(coverage) {
  const summary = ExamBlueprint.coverageSummary(coverage);
  console.log(
    `\nCobertura blueprint: ${(summary.ratio * 100).toFixed(1)}% (${summary.complete}/${summary.total} partes)`,
  );
  for (const row of coverage || []) {
    const mark = row.complete ? '✓' : '✗';
    console.log(
      `  ${mark} ${row.module} T${row.teil}: ${row.filled}/${row.target} (${row.slotType || row.taskFormat || '—'})`,
    );
  }
  return summary;
}

function applyGoetheB1FidelityPatches(exam) {
  for (const part of exam.schreibenParts || []) {
    const spec = GOETHE_B1_SCHREIBEN_WORDS[Number(part.aufgabe)];
    if (!spec) continue;
    part.minWords = spec.min;
    part.maxWords = spec.max;
    part.targetWords = spec.target;
  }
  const t2 = (exam.sprechenParts || []).find((p) => Number(p.teil) === 2);
  if (t2) t2.slides = GOETHE_B1_PRESENTATION_SLIDES.map((s) => ({ ...s }));
  const t3 = (exam.lesenParts || []).find((p) => Number(p.teil) === 3);
  if (t3 && !t3.example && !t3.solvedExample) {
    t3.example = { ...GOETHE_B1_LESEN_T3_EXAMPLE };
  }
  return exam;
}

function countPartQuestions(part) {
  if (Array.isArray(part?.questions) && part.questions.length) return part.questions.length;
  if (Array.isArray(part?.items) && part.items.length) return part.items.length;
  if (Array.isArray(part?.segments)) {
    return part.segments.reduce((n, seg) => n + (seg.questions?.length || 0), 0);
  }
  if (part?.task || part?.situation) return 1;
  return 0;
}

function moduleCounts(exam) {
  const counts = {};
  for (const key of ['lesenParts', 'horenParts', 'schreibenParts', 'sprechenParts']) {
    const parts = exam[key] || [];
    for (const part of parts) {
      const mod = part.module || key.replace('Parts', '');
      const teil = part.teil ?? '?';
      const n = countPartQuestions(part);
      counts[`${mod}T${teil}`] = (counts[`${mod}T${teil}`] || 0) + n;
    }
  }
  return counts;
}

function validateExamAttempt(exam, assembled, blueprint, strict) {
  const validator = new ExamValidator();
  const structural = validator.validate(exam, { strict, blueprint });
  const gate = validateGeneratedExam(exam, { strict, blueprint });
  return { structural, gate, ok: structural.valid && gate.valid };
}

function tryAssembleValidExam(bank, blueprint, { seed, attempts, strict }) {
  const usedSigs = new Set();
  let lastFailure = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptSeed = Number.isFinite(seed) ? seed + attempt : attempt * 9973 + 42;
    const { assembled, exam } = withOptionalSeed(attemptSeed, () => {
      const assembled = ExamBlueprint.assemble(bank, blueprint);
      let exam = ExamBuilder.buildFromBlueprint(LANG, LEVEL, bank, blueprint, {
        mode: 'standard',
        assembled,
      });
      exam = applyGoetheB1FidelityPatches(exam);
      return { assembled, exam };
    });

    if (!assembled?.selected?.length) continue;
    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < 1.0) continue;

    const sig = assembled.selected
      .map((q) => q.id)
      .sort()
      .join(',');
    if (usedSigs.has(sig)) continue;
    usedSigs.add(sig);

    const result = validateExamAttempt(exam, assembled, blueprint, strict);
    if (result.ok) {
      return { assembled, exam, attempt: attempt + 1, seed: attemptSeed, ...result };
    }
    lastFailure = { assembled, exam, attempt: attempt + 1, seed: attemptSeed, ...result };
  }

  return lastFailure ? { ...lastFailure, ok: false } : { ok: false };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bank = loadBank();
  const blueprint = loadBlueprint();

  console.log(`\n=== Verificación examen ${LANG}/${LEVEL} ===\n`);
  console.log(`Banco base: ${bank.questions.length} preguntas, ${bank.passages.length} passages`);

  const mergePaths = [...args.mergeFiles];
  if (args.includeGenerated) mergePaths.push(...listGeneratedJson());

  let totalAddedQ = 0;
  let totalAddedP = 0;
  for (const rel of [...new Set(mergePaths)]) {
    const r = mergeBatchIntoBank(bank, rel, rel);
    totalAddedQ += r.addedQ;
    totalAddedP += r.addedP;
  }

  if (mergePaths.length) {
    console.log(`\nBanco efímero: ${bank.questions.length} preguntas (+${totalAddedQ}), ${bank.passages.length} passages (+${totalAddedP})`);
  }

  ExamBlueprint.cacheBlueprint(LANG, LEVEL, blueprint);

  console.log(`\nBuscando ensamblado válido (hasta ${args.attempts} intentos)…`);

  const result = tryAssembleValidExam(bank, blueprint, {
    seed: args.seed,
    attempts: args.attempts,
    strict: args.strict,
  });

  if (!result?.assembled?.selected?.length) {
    console.error('\n❌ No se pudo ensamblar ningún ítem (banco insuficiente o slots vacíos).');
    process.exit(1);
  }

  const { assembled, exam, structural, gate } = result;
  printCoverage(assembled.coverage);

  if (result.ok) {
    console.log(`\n✓ Ensamblado válido en intento ${result.attempt} (seed ${result.seed})`);
  } else {
    console.log(`\n✗ Mejor intento ${result.attempt}/${args.attempts} (seed ${result.seed}) — aún con errores`);
  }

  console.log(`\nÍtems seleccionados: ${assembled.selected.length}`);
  console.log(`Tema: ${exam.topic || '—'}`);

  const counts = moduleCounts(exam);
  console.log('\nEstructura por Teil:');
  for (const [k, n] of Object.entries(counts).sort()) {
    console.log(`  ${k}: ${n} preguntas`);
  }

  console.log(`\nExamValidator: ${structural.valid ? 'PASS' : 'FAIL'}`);
  if (!structural.valid) {
    for (const e of structural.errors || []) console.log(`  ✗ ${e}`);
  }
  for (const w of structural.warnings || []) console.log(`  ⚠ ${w}`);

  console.log(`\nQuality gate: ${gate.valid ? 'PASS' : 'FAIL'} (placeholders: ${gate.placeholders})`);
  if (!gate.valid) {
    for (const e of gate.errors || []) console.log(`  ✗ ${e}`);
  }
  for (const w of gate.warnings || []) console.log(`  ⚠ ${w}`);

  const ok = result.ok;
  if (args.save && ok) {
    const outPath = path.isAbsolute(args.save) ? args.save : path.join(ROOT, args.save);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const payload = {
      topic: exam.topic,
      level: exam.level,
      lang: exam.lang,
      goetheFormat: true,
      libraryBuilt: true,
      blueprintId: exam.blueprintId || blueprint.id,
      blueprintCoverage: assembled.coverage,
      verifiedAt: new Date().toISOString(),
      exam,
    };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`\n💾 Guardado: ${path.relative(ROOT, outPath)}`);
  }

  if (ok) {
    console.log('\n✅ Examen B1 completo, coherente y validado.');
    process.exit(0);
  }

  console.error('\n❌ El examen ensamblado no pasa todas las validaciones.');
  process.exit(1);
}

main();
