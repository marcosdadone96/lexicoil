#!/usr/bin/env node
/**
 * sanitize-curated.mjs — Saneador determinista de exámenes curated.
 * Corrige, SIN IA, los errores estructurales que rompen fiabilidad:
 *   1) type "multiple_choice" -> "multiple" (y valida el set permitido).
 *   2) Elimina preguntas cuyo passageId NO coincide con el de su parte/segmento
 *      (preguntas "huérfanas" que el usuario no puede responder con el texto mostrado).
 *   3) IDs de pregunta únicos GLOBALMENTE (namespacing por examen si colisionan).
 *   4) Espeja correctAnswer = correct cuando falta.
 *
 * Uso:
 *   node scripts/sanitize-curated.mjs --dir <carpeta_con_curated_*.json> [--write] [--report informe.json]
 *   (sin --write hace dry-run y solo informa)
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeQuestionFields } from './lib/normalizeMcq.mjs';
import { loadBlueprint, comboKey } from './lib/examPipeline.mjs';

const ALLOWED_TYPES = new Set(['multiple', 'matching', 'richtig_falsch', 'true_false', 'ja_nein']);

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

function inferLangLevelFromDir(dirPath) {
  const norm = path.normalize(dirPath).split(path.sep);
  const i = norm.lastIndexOf('curated');
  if (i >= 0 && norm[i + 1] && norm[i + 2]) {
    return { lang: norm[i + 1].toLowerCase(), level: norm[i + 2].toUpperCase() };
  }
  return null;
}

function lesenTargetsFromBlueprint(blueprint) {
  const lesen = blueprint?.modules?.find((m) => m.id === 'lesen');
  const targets = {};
  for (const p of lesen?.parts || []) {
    if (p.teil != null) {
      targets[p.teil] = p.itemsTotal ?? p.questionsTotal?.min ?? p.questionsTotal?.max;
    }
  }
  return targets;
}

const dir = arg('--dir', '.');
const langArg = arg('--lang', null);
const levelArg = arg('--level', null);
const inferred = inferLangLevelFromDir(dir);
const lang = (langArg || inferred?.lang || 'de').toLowerCase();
const level = String(levelArg || inferred?.level || 'B1').toUpperCase();

let LESEN_TARGETS = { 1: 6, 2: 6, 3: 7, 4: 7, 5: 4 };
try {
  const blueprint = loadBlueprint(lang, level);
  const fromBp = lesenTargetsFromBlueprint(blueprint);
  if (Object.keys(fromBp).length) LESEN_TARGETS = fromBp;
} catch {
  console.warn(`sanitize-curated: no blueprint for ${comboKey(lang, level)} — using B1 Lesen defaults`);
}
const doWrite = !!arg('--write', false);
const reportPath = arg('--report', null);

if (!fs.existsSync(dir)) {
  console.log(`sanitize-curated: ${dir} no existe — nada que sanear`);
  process.exit(0);
}
const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json'));
if (!files.length) {
  console.error(`No hay archivos curated_*.json en ${dir}`);
  process.exit(1);
}

const seenIds = new Set();
const report = { files: 0, typeFixed: 0, idFixed: 0, orphanDropped: 0, correctMirrored: 0, details: [] };

function token(file) {
  const m = file.match(/_([0-9a-f]{8,})\.json$/i);
  return m ? m[1].slice(0, 8) : path.basename(file, '.json').slice(-8);
}

function fixQuestion(q, partPid, tok, where) {
  normalizeQuestionFields(q);
  // tipo
  if (q.type === 'multiple_choice' || q.type === 'mcq') {
    q.type = 'multiple';
    report.typeFixed++;
  }
  if (!ALLOWED_TYPES.has(q.type)) {
    report.details.push(`${where}: tipo no permitido "${q.type}" en ${q.id} (revisar manualmente)`);
  }
  // correctAnswer espejo
  if (q.correctAnswer === undefined && q.correct !== undefined) {
    q.correctAnswer = q.correct;
    report.correctMirrored++;
  }
  // id único global
  if (q.id) {
    if (seenIds.has(q.id)) {
      q.id = `${q.id}-${tok}`;
      report.idFixed++;
    }
    seenIds.add(q.id);
  }
  return q;
}

// Filtra preguntas huérfanas: passageId distinto al de la parte/segmento (cuando ambos existen).
// Para Lesen T2 (dos textos) se permite que las preguntas referencien passageIds distintos al
// principal de la parte (el alumno ve ambos textos en la misma pantalla).
function keepQuestion(q, containerPid, where, allowMultiPassage) {
  if (allowMultiPassage) return true; // T2: preguntas de ambos pasajes son válidas
  if (q.passageId && containerPid && q.passageId !== containerPid) {
    report.orphanDropped++;
    report.details.push(`${where}: ELIMINADA huérfana ${q.id} (Q.passageId=${q.passageId} != part=${containerPid})`);
    return false;
  }
  return true;
}

for (const file of files) {
  const full = path.join(dir, file);
  const x = JSON.parse(fs.readFileSync(full, 'utf8'));
  const e = x.exam || {};
  const tok = token(file);

  (e.lesenParts || []).forEach((p) => {
    const where = `${file} L${p.teil}`;

    // T2 legitimately has questions from two passages (A and B); skip orphan check.
    const isT2 = p.teil === 2;

    // Fix + filter questions[] (T1, T2, T5)
    p.questions = (p.questions || []).filter((q) => keepQuestion(q, p.passageId, where, isT2)).map((q) => fixQuestion(q, p.passageId, tok, where));

    // Fix + filter items[] (T3 matching, T4 forum opinions) — same rules apply
    if (Array.isArray(p.items)) {
      p.items = (p.items).filter((q) => keepQuestion(q, p.passageId, where)).map((q) => fixQuestion(q, p.passageId, tok, where));
    }

    // Count validation: warn if actual count < expected
    const target = LESEN_TARGETS[p.teil];
    if (target !== undefined) {
      const countField = Array.isArray(p.items) && p.items.length > 0 ? 'items' : 'questions';
      const actual = (p[countField] || []).length;
      if (actual < target) {
        report.details.push(`${where}: INCOMPLETO ${actual}/${target} ${countField} (blueprint exige ${target})`);
      }
    }
  });

  (e.horenParts || []).forEach((p) => {
    (p.segments || []).forEach((s) => {
      const where = `${file} H${p.teil} ${s.id}`;
      s.questions = (s.questions || []).filter((q) => keepQuestion(q, s.passageId, where)).map((q) => fixQuestion(q, s.passageId, tok, where));
    });
    if (Array.isArray(p.questions)) {
      const where = `${file} H${p.teil}`;
      p.questions = p.questions.filter((q) => keepQuestion(q, p.passageId, where)).map((q) => fixQuestion(q, p.passageId, tok, where));
    }
  });

  report.files++;
  if (doWrite) fs.writeFileSync(full, JSON.stringify(x, null, 2));
}

console.log('=== sanitize-curated ===');
console.log(`Archivos: ${report.files} | tipos arreglados: ${report.typeFixed} | ids únicos: ${report.idFixed} | huérfanas eliminadas: ${report.orphanDropped} | correctAnswer espejados: ${report.correctMirrored}`);
console.log(doWrite ? 'MODO ESCRITURA: archivos modificados.' : 'DRY-RUN (usa --write para guardar).');
if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Informe detallado: ${reportPath}`);
} else {
  report.details.slice(0, 12).forEach((d) => console.log('  - ' + d));
  if (report.details.length > 12) console.log(`  ... (+${report.details.length - 12} más; usa --report para el detalle completo)`);
}

// Modo GATE: en dry-run, si se detectaron problemas, salir con código !=0 para frenar el pipeline.
const issuesFound = report.typeFixed + report.idFixed + report.orphanDropped + report.details.filter((d) => /tipo no permitido/.test(d)).length;
if (!doWrite && issuesFound > 0) {
  console.error(`\nGATE: ${issuesFound} problemas detectados. Ejecuta con --write para corregir, o revisa el informe.`);
  process.exit(1);
}
process.exit(0);
