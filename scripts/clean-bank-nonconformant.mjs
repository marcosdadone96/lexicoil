#!/usr/bin/env node
/**
 * Quarantine blueprint-nonconformant questions (reversible).
 *
 * Usage:
 *   node scripts/clean-bank-nonconformant.mjs --lang de --level B1
 *   node scripts/clean-bank-nonconformant.mjs --lang de --level B1 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkQuestionConformance } from './lib/blueprintConformance.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', apply: false, restorePassing: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--apply') out.apply = true;
    else if (a === '--restore-passing') out.restorePassing = true;
  }
  return out;
}

function loadBlueprint(lang, level) {
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) throw new Error(`No blueprint for ${lang}/${level}`);
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${id}.json`), 'utf8'));
}

function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function passageIdsUsedBy(questions) {
  const ids = new Set();
  for (const q of questions) {
    if (q.passageId) ids.add(q.passageId);
  }
  return ids;
}

function appendQuarantine(quarantinePath, entry) {
  let doc = { entries: [] };
  if (fs.existsSync(quarantinePath)) {
    try {
      doc = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
      if (!Array.isArray(doc.entries)) doc = { entries: [] };
    } catch {
      doc = { entries: [] };
    }
  }
  doc.entries.push(entry);
  atomicWriteJson(quarantinePath, doc);
}

const args = parseArgs(process.argv.slice(2));
const bankPath = path.join(ROOT, 'library', args.lang, args.level, 'questions.json');
const quarantinePath = path.join(ROOT, 'library', args.lang, args.level, '_quarantine.json');

if (!fs.existsSync(bankPath)) {
  console.error(`Missing bank: ${bankPath}`);
  process.exit(1);
}

if (args.restorePassing) {
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const blueprint = loadBlueprint(args.lang, args.level);
  if (!fs.existsSync(quarantinePath)) {
    console.log('Sin cuarentena.');
    process.exit(0);
  }
  const doc = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
  const ids = new Set((bank.questions || []).map((q) => q.id));
  const pids = new Set((bank.passages || []).map((p) => p.id));
  let restoredQ = 0;
  let restoredP = 0;
  for (const entry of doc.entries || []) {
    for (const raw of entry.questions || []) {
      const q = { ...raw };
      delete q._conformanceReasons;
      if (ids.has(q.id)) continue;
      const { ok } = checkQuestionConformance(q, blueprint);
      if (!ok) continue;
      bank.questions.push(q);
      ids.add(q.id);
      restoredQ++;
    }
    for (const p of entry.passages || []) {
      if (pids.has(p.id)) continue;
      bank.passages.push(p);
      pids.add(p.id);
      restoredP++;
    }
  }
  if (restoredQ || restoredP) {
    const backup = bankPath.replace('.json', `.backup-${Date.now()}.json`);
    fs.copyFileSync(bankPath, backup);
    atomicWriteJson(bankPath, bank);
    console.log(`Restaurados: ${restoredQ} preguntas, ${restoredP} passages`);
    console.log(`Backup: ${path.relative(ROOT, backup)}`);
  } else {
    console.log('Nada que restaurar (ningún ítem en cuarentena pasa conformidad ahora).');
  }
  process.exit(0);
}

const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const blueprint = loadBlueprint(args.lang, args.level);
const questions = bank.questions || [];

const bad = [];
const good = [];
for (const q of questions) {
  const { ok, reasons } = checkQuestionConformance(q, blueprint);
  if (!ok) bad.push({ question: q, reasons });
  else good.push(q);
}

console.log(`\nClean nonconformant ${args.lang}/${args.level}`);
console.log(`Preguntas: ${questions.length} | no conformes: ${bad.length} | conformes: ${good.length}\n`);

if (!bad.length) {
  console.log('Nada que cuarentenar.');
  process.exit(0);
}

for (const item of bad) {
  console.log(`  ${item.question.id}: ${item.reasons.join('; ')}`);
}

if (!args.apply) {
  console.log('\n(dry-run: usa --apply para mover a _quarantine.json)\n');
  process.exit(0);
}

const removedIds = new Set(bad.map((b) => b.question.id));
const usedAfter = passageIdsUsedBy(good);
const orphanPassages = (bank.passages || []).filter((p) => !usedAfter.has(p.id));
const keptPassages = (bank.passages || []).filter((p) => usedAfter.has(p.id));

const backup = bankPath.replace('.json', `.backup-${Date.now()}.json`);
fs.copyFileSync(bankPath, backup);

appendQuarantine(quarantinePath, {
  timestamp: new Date().toISOString(),
  lang: args.lang,
  level: args.level,
  reason: 'blueprint_nonconformant',
  questions: bad.map((b) => ({ ...b.question, _conformanceReasons: b.reasons })),
  passages: orphanPassages,
});

const cleaned = {
  ...bank,
  passages: keptPassages,
  questions: good,
};
atomicWriteJson(bankPath, cleaned);

console.log(`\nBackup:     ${path.relative(ROOT, backup)}`);
console.log(`Cuarentena: ${path.relative(ROOT, quarantinePath)} (+${bad.length} preguntas, ${orphanPassages.length} passages huérfanos)`);
console.log(`Escrito:    ${path.relative(ROOT, bankPath)} (${good.length} preguntas, ${keptPassages.length} passages)\n`);
