#!/usr/bin/env node
/**
 * Quarantine Lesen Teil 3 matching items whose options are not real ads (reversible).
 *
 * Usage:
 *   node scripts/clean-lesen-t3-nonconformant.mjs --lang de --level B1
 *   node scripts/clean-lesen-t3-nonconformant.mjs --lang de --level B1 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AdsMatching = require(path.join(ROOT, 'js/library/adsMatching.js'));

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--apply') out.apply = true;
  }
  return out;
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

const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const questions = bank.questions || [];

const bad = [];
const good = [];
for (const q of questions) {
  const { ok, reasons } = AdsMatching.checkLesenT3AdsConformance(q);
  if (!ok) bad.push({ question: q, reasons });
  else good.push(q);
}

console.log(`\nClean Lesen T3 nonconformant ${args.lang}/${args.level}`);
console.log(`Preguntas: ${questions.length} | T3 no conformes: ${bad.length}\n`);

if (!bad.length) {
  console.log('Nada que cuarentenar.');
  process.exit(0);
}

const groups = new Map();
for (const item of bad) {
  const id = item.question.id || '';
  const prefix = id.replace(/-q\d+$/, '');
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix).push(item);
}

for (const [prefix, items] of [...groups.entries()].sort()) {
  console.log(`  Grupo ${prefix} (${items.length} ítems):`);
  for (const item of items) {
    console.log(`    ${item.question.id}: ${item.reasons.join('; ')}`);
  }
}

if (!args.apply) {
  console.log('\n(dry-run: usa --apply para mover a _quarantine.json)\n');
  process.exit(0);
}

const usedAfter = passageIdsUsedBy(good);
const orphanPassages = (bank.passages || []).filter((p) => !usedAfter.has(p.id));
const keptPassages = (bank.passages || []).filter((p) => usedAfter.has(p.id));

const backup = bankPath.replace('.json', `.backup-${Date.now()}.json`);
fs.copyFileSync(bankPath, backup);

appendQuarantine(quarantinePath, {
  timestamp: new Date().toISOString(),
  lang: args.lang,
  level: args.level,
  reason: 'lesen_t3_ads_nonconformant',
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
console.log(
  `Cuarentena: ${path.relative(ROOT, quarantinePath)} (+${bad.length} preguntas, ${orphanPassages.length} passages huérfanos)`,
);
console.log(`Escrito:    ${path.relative(ROOT, bankPath)} (${good.length} preguntas, ${keptPassages.length} passages)\n`);
