#!/usr/bin/env node
/**
 * Launch gate: de/B1 ready for production?
 * Usage: node scripts/accept-de-b1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Ajv from 'ajv';
import { assertNoMojibake } from './lib/assert-no-mojibake.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 10;
const LANG = 'de';
const LEVEL = 'B1';

const ContentServable = require(path.join(ROOT, 'js/library/contentServable.js'));
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function loadBank() {
  const file = path.join(ROOT, 'library', LANG, LEVEL, 'questions.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBlueprint() {
  const id = LibraryCatalog.blueprintId(LANG, LEVEL);
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${id}.json`), 'utf8'));
}

function countDisjointExams(bank, blueprint, max = TARGET + 5) {
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

function poolCompleteExams() {
  const file = path.join(ROOT, 'library/pool-seed', `${LANG}_${LEVEL}.json`);
  if (!fs.existsSync(file)) return 0;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) return 0;
  return data.filter((e) => e && (e.coverageRatio === 1 || e.exam)).length;
}

function validateStructure(bank, blueprint) {
  const expected = {
    lesen: [6, 6, 7, 7, 4],
    horen: [10, 5, 7, 8],
    schreiben: [1, 1, 1],
    sprechen: [1, 1, 1],
  };
  const issues = [];
  for (const mod of blueprint.modules || []) {
    const exp = expected[mod.id];
    if (!exp) continue;
    for (let i = 0; i < mod.parts.length; i++) {
      const part = mod.parts[i];
      const count = (bank.questions || []).filter((q) => q.module === mod.id && q.teil === part.teil).length;
      const need = exp[i] * TARGET;
      if (count < need) {
        issues.push(`${mod.id}T${part.teil}: ${count}/${need}`);
      }
    }
  }
  return issues;
}

console.log(`\n=== Accept de/B1 (target ${TARGET} exámenes) ===\n`);

const bank = loadBank();
const blueprint = loadBlueprint();
const thresholds = ContentServable.loadThresholdsSync(fs.readFileSync, ROOT);
const passagesFile = fs.existsSync(path.join(ROOT, 'library', LANG, LEVEL, 'passages.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'library', LANG, LEVEL, 'passages.json'), 'utf8'))
  : null;
const wsFile = fs.existsSync(path.join(ROOT, 'library', LANG, LEVEL, 'writing-speaking.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'library', LANG, LEVEL, 'writing-speaking.json'), 'utf8'))
  : null;

const servReport = ContentServable.assessLevel({
  lang: LANG,
  level: LEVEL,
  questions: bank.questions,
  passages: ContentServable.mergePassages(bank.passages, passagesFile?.passages),
  writingSpeaking: wsFile || { writing: [], speaking: [] },
  blueprint,
  thresholds,
});
check('SERVABILIDAD', servReport.servable, servReport.servable ? 'de/B1 SERVABLE' : servReport.deficits?.join('; '));

const disjoint = countDisjointExams(bank, blueprint);
const poolCount = poolCompleteExams();
const coverageCount = Math.max(disjoint, poolCount);
check(
  'COBERTURA',
  coverageCount >= TARGET,
  `${coverageCount}/${TARGET} exámenes completos (disjuntos=${disjoint}, pool-seed=${poolCount})`,
);

const structIssues = validateStructure(bank, blueprint);
check(
  'ESTRUCTURA (banco)',
  structIssues.length === 0,
  structIssues.length ? structIssues.slice(0, 5).join(', ') : 'Lesen/Hören/Schreiben/Sprechen OK',
);

const ajv = new Ajv({ allErrors: true, strict: false });
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/schemas/questions.schema.json'), 'utf8'));
const validate = ajv.compile(schema);
const schemaOk = validate(bank);
check('INTEGRIDAD esquema', schemaOk, schemaOk ? 'Ajv OK' : JSON.stringify(validate.errors?.slice(0, 2)));

const qs = bank.questions || [];
const caMismatch = qs.filter((q) => q.correct !== undefined && q.correctAnswer !== undefined && q.correct !== q.correctAnswer);
check('INTEGRIDAD correct===correctAnswer', caMismatch.length === 0, caMismatch.length ? `${caMismatch.length} mismatches` : '');

const pids = new Set((bank.passages || []).map((p) => p.id));
const badPassage = qs.filter(
  (q) => ['lesen', 'horen'].includes(q.module) && q.passageId && !pids.has(q.passageId),
);
check('INTEGRIDAD passageId', badPassage.length === 0, badPassage.length ? `${badPassage.length} rotos` : '');

const ids = qs.map((q) => q.id);
const dupIds = ids.length - new Set(ids).size;
check('INTEGRIDAD IDs únicos', dupIds === 0, dupIds ? `${dupIds} duplicados` : '');

const moj = assertNoMojibake({ verbose: false });
check('CODIFICACIÓN', moj.ok, moj.ok ? `${moj.filesScanned} archivos` : `${moj.violations?.length} líneas mojibake`);

const ttsManifest = path.join(ROOT, 'library/tts-cache/manifest', `${LANG}_${LEVEL}.json`);
let ttsInfo = 'sin manifest';
if (fs.existsSync(ttsManifest)) {
  const man = JSON.parse(fs.readFileSync(ttsManifest, 'utf8'));
  const entries = Array.isArray(man) ? man.length : Object.keys(man.entries || man).length;
  ttsInfo = `${entries} entradas en manifest`;
} else {
  const mp3 = fs.readdirSync(path.join(ROOT, 'library/tts-cache')).filter((f) => f.endsWith('.mp3')).length;
  ttsInfo = `${mp3} mp3 en cache (sin manifest)`;
}
console.log(`INFO   AUDIO TTS — ${ttsInfo} (no bloqueante)`);

const failed = checks.filter((c) => !c.pass);
console.log(`\n=== ${checks.length - failed.length}/${checks.length} PASS ===\n`);
process.exit(failed.length ? 1 : 0);
