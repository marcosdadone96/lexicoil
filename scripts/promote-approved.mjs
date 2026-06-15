#!/usr/bin/env node
/**
 * Sprint 2 — promote approved staging candidates into library/{lang}/{level}/questions.json
 *
 * Usage:
 *   node scripts/promote-approved.mjs --lang de --level B1
 *   node scripts/promote-approved.mjs --lang de --level B1 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listCandidates,
  saveCandidate,
  loadIndex,
  saveIndex,
} from './pipeline/lib/stagingStore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', dryRun: false, id: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--id') out.id = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function libraryPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'questions.json');
}

function loadLibrary(lang, level) {
  const file = libraryPath(lang, level);
  if (!fs.existsSync(file)) {
    return {
      meta: { language: lang, level, version: 1, generatedAt: new Date().toISOString().slice(0, 10) },
      passages: [],
      questions: [],
    };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function passagesFromCandidate(candidate) {
  const list = [];
  if (Array.isArray(candidate.passages)) list.push(...candidate.passages);
  else if (candidate.passage?.id && candidate.passage.text) list.push(candidate.passage);
  return list;
}

function mergeCandidate(bank, candidate) {
  let addedP = 0;
  let addedQ = 0;
  for (const p of passagesFromCandidate(candidate)) {
    if (!p?.id || !p.text) continue;
    const exists = bank.passages.some((row) => row.id === p.id);
    if (!exists) {
      bank.passages.push({
        id: p.id,
        module: p.module || candidate.module,
        title: p.title || '',
        text: p.text,
      });
      addedP++;
    }
  }
  const qIds = new Set(bank.questions.map((q) => q.id));
  for (const q of candidate.questions || []) {
    if (qIds.has(q.id)) continue;
    bank.questions.push(q);
    qIds.add(q.id);
    addedQ++;
  }
  return { addedP, addedQ };
}

const args = parseArgs(process.argv.slice(2));
let approved = listCandidates(args.lang, args.level, { status: 'approved' });
if (args.id) {
  approved = approved.filter((c) => c.id === args.id);
}

if (!approved.length) {
  console.log('No approved candidates to promote.');
  process.exit(0);
}

const bank = loadLibrary(args.lang, args.level);
let totalP = 0;
let totalQ = 0;
const promoted = [];

for (const candidate of approved) {
  const { addedP, addedQ } = mergeCandidate(bank, candidate);
  if (addedP === 0 && addedQ === 0) {
    console.log(`SKIP  ${candidate.id} — already in library`);
    continue;
  }
  totalP += addedP;
  totalQ += addedQ;
  promoted.push(candidate.id);
  console.log(`PROMOTE ${candidate.id} (+${addedP} passages, +${addedQ} questions)`);

  if (!args.dryRun) {
    candidate.status = 'promoted';
    candidate.review = { ...candidate.review, promotedAt: new Date().toISOString() };
    saveCandidate(candidate);
  }
}

if (promoted.length === 0) {
  console.log('\nNothing new to write.');
  process.exit(0);
}

bank.meta.version = (bank.meta.version || 1) + (args.dryRun ? 0 : 1);
bank.meta.generatedAt = new Date().toISOString().slice(0, 10);
bank.meta.lastPromote = { batchAt: new Date().toISOString(), candidateIds: promoted };

if (args.dryRun) {
  console.log(`\nDry-run: would add ${totalP} passages, ${totalQ} questions (${promoted.length} candidates)`);
} else {
  fs.writeFileSync(libraryPath(args.lang, args.level), JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log(`\nWrote library/${args.lang}/${args.level}/questions.json (+${totalP} passages, +${totalQ} questions)`);
  console.log(`Total bank: ${bank.passages.length} passages, ${bank.questions.length} questions`);
}
