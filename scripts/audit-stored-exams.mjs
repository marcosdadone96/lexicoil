#!/usr/bin/env node
/**
 * Audit stored exams — reading/listening passage presence, length, blueprint item counts.
 * Output: docs/audit/04_EXAMBUILDER_PASSAGES/audit-report.json + console summary
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const { loadBlueprintFileSync, BLUEPRINT_INDEX } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

const LEVEL_MIN = { A1: 25, A2: 60, B1: 150, B2: 250, C1: 350, C2: 450 };

function walkExamFiles() {
  const out = [];
  const pushJson = (rel, kind) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      fs.readdirSync(abs).forEach((f) => {
        if (f.endsWith('.json')) out.push({ rel: path.join(rel, f), kind });
      });
      return;
    }
    if (rel.endsWith('.json')) out.push({ rel, kind });
  };

  pushJson('library/pool-seed', 'pool-seed');
  ['de', 'en', 'es'].forEach((lang) => {
    const base = path.join('library', lang);
    if (!fs.existsSync(path.join(ROOT, base))) return;
    fs.readdirSync(path.join(ROOT, base)).forEach((lv) => {
      const examDir = path.join(base, lv, 'exams');
      if (fs.existsSync(path.join(ROOT, examDir))) pushJson(examDir, 'library-exam');
    });
  });
  pushJson('data/exams', 'data-exam');
  pushJson('data/demo', 'data-demo');
  return out;
}

function loadExamsFromFile(rel, kind) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  if (kind === 'pool-seed' && Array.isArray(raw)) {
    return raw.map((entry, i) => ({
      id: entry.id || `${rel}#${i}`,
      exam: entry.exam || entry,
    }));
  }
  if (raw.exam) return [{ id: rel, exam: raw.exam }];
  if (raw.lesenParts || raw.readingParts || raw.modules) return [{ id: rel, exam: raw }];
  return [];
}

function countPartItems(part) {
  return (
    (part.items?.length || 0) +
    (part.questions?.length || 0) +
    (part.segments || []).reduce((n, s) => n + (s.questions?.length || 0), 0)
  );
}

function auditExam(id, exam) {
  const lang = exam.lang === 'de' ? 'de' : exam.lang === 'es' ? 'es' : 'en';
  const level = exam.level;
  const fileId = level ? BLUEPRINT_INDEX[`${lang}_${level}`] : null;
  const blueprint = fileId ? loadBlueprintFileSync(fileId) : null;
  const minWords = LEVEL_MIN[String(level || '').toUpperCase()] || 0;
  const longest = PassageResolver.longestReadingWords(exam);
  const issues = [];

  (exam.lesenParts || exam.readingParts || []).forEach((part, i) => {
    if (!PassageResolver.partHasReadingText(part)) {
      issues.push(`passage_missing:reading[${i}]`);
    }
  });
  (exam.horenParts || exam.listeningParts || []).forEach((part, i) => {
    if (!PassageResolver.partHasListeningTranscript(part)) {
      issues.push(`transcript_missing:listening[${i}]`);
    }
  });
  if (minWords && longest > 0 && longest < minWords) {
    issues.push(`passage_too_short:longest=${longest},min=${minWords}`);
  }

  if (blueprint) {
    let li = 0;
    let hi = 0;
    for (const mod of blueprint.modules || []) {
      for (const partSpec of mod.parts || []) {
        const modId = String(mod.id).toLowerCase();
        let part = null;
        if (modId === 'lesen' || modId === 'reading') part = (exam.lesenParts || exam.readingParts || [])[li++];
        if (modId === 'horen' || modId === 'listening') part = (exam.horenParts || exam.listeningParts || [])[hi++];
        if (!part) {
          issues.push(`part_missing:${modId}:teil=${partSpec.teil}`);
          continue;
        }
        const count = countPartItems(part);
        const min = partSpec.questionsTotal?.min ?? 0;
        const max = partSpec.questionsTotal?.max ?? min;
        if (count < min || count > max) {
          issues.push(`item_count_mismatch:${modId}:teil=${partSpec.teil},expected=${min}-${max},received=${count}`);
        }
      }
    }
    const strict = new ExamValidator().validate(exam, { blueprint, strict: true });
    if (!strict.valid) issues.push(...strict.errors);
  }

  return {
    id,
    level,
    lang,
    longestReadingWords: longest,
    issueCount: issues.length,
    issues: [...new Set(issues)],
    needsCuration: issues.length > 0,
  };
}

const files = walkExamFiles();
const entries = [];
let needsCuration = 0;

for (const { rel, kind } of files) {
  let exams;
  try {
    exams = loadExamsFromFile(rel, kind);
  } catch (e) {
    entries.push({ file: rel, kind, error: e.message });
    continue;
  }
  for (const { id, exam } of exams) {
    const row = auditExam(`${rel} :: ${id}`, exam);
    entries.push({ file: rel, kind, ...row });
    if (row.needsCuration) needsCuration++;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  examsAudited: entries.filter((e) => !e.error).length,
  needsCuration,
  entries,
};

const outDir = path.join(ROOT, 'docs', 'audit', '04_EXAMBUILDER_PASSAGES');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'audit-report.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('Audit complete');
console.log(`  Files scanned: ${report.filesScanned}`);
console.log(`  Exams audited: ${report.examsAudited}`);
console.log(`  Needs curation: ${needsCuration}`);
console.log(`  Report: ${path.relative(ROOT, outFile)}`);

const worst = entries.filter((e) => e.needsCuration).slice(0, 8);
if (worst.length) {
  console.log('\nSample issues:');
  worst.forEach((e) => {
    console.log(`  - ${e.file}`);
    e.issues.slice(0, 3).forEach((i) => console.log(`      ${i}`));
  });
}
