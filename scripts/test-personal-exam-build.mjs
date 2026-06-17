#!/usr/bin/env node
/** Smoke test personal exam assembly (de/B1). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'));
const pp = path.join(ROOT, 'library/de/B1/passages.json');
if (fs.existsSync(pp)) {
  const pf = JSON.parse(fs.readFileSync(pp, 'utf8'));
  const ids = new Set((bank.passages || []).map((p) => p.id));
  bank.passages = [...(bank.passages || []), ...(pf.passages || []).filter((p) => !ids.has(p.id))];
}
const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'));

const wordSets = [
  { words: ['gemeinschaftliche', 'Frau', 'Auto', 'Mann'], skills: ['lesen'] },
  { words: ['gemeinschaftliche', 'Frau', 'Auto', 'Mann'], skills: ['horen'] },
  { words: ['gemeinschaftliche', 'Frau'], skills: ['sprechen'] },
  { words: ['gemeinschaftliche', 'Frau'], skills: ['lesen', 'horen'] },
];

function goethePartHasContent(part, mod) {
  if (mod === 'lesen') return !!(part.items?.length || part.text || part.questions?.length);
  if (mod === 'horen') return !!(part.segments?.length || part.transcript);
  if (mod === 'schreiben') return !!(part.task || part.prompt);
  if (mod === 'sprechen') return !!(part.situation || part.points?.length || part.prompts?.length);
  return false;
}

function stripSkills(exam, skills) {
  const s = new Set(skills);
  if (!s.has('lesen')) exam.lesenParts = [];
  if (!s.has('horen')) exam.horenParts = [];
  if (!s.has('schreiben')) exam.schreibenParts = [];
  if (!s.has('sprechen')) exam.sprechenParts = [];
  return exam;
}

for (const { words, skills } of wordSets) {
  const exam = ExamBuilder.buildFromBlueprint('de', 'B1', bank, blueprint, {
    mode: 'personal',
    targetWords: words,
    skills,
  });
  stripSkills(exam, skills);
  exam.vocabPersonal = true;
  const renderable =
    (exam.lesenParts || []).some((p) => goethePartHasContent(p, 'lesen')) ||
    (exam.horenParts || []).some((p) => goethePartHasContent(p, 'horen')) ||
    (exam.sprechenParts || []).some((p) => goethePartHasContent(p, 'sprechen')) ||
    (exam.schreibenParts || []).some((p) => goethePartHasContent(p, 'schreiben'));
  const v = new ExamValidator().validate(exam, { strict: false, blueprint });
  console.log(`\n[${skills.join('+')}] words=${words.join(',')}`);
  console.log(`  renderable=${renderable} valid=${v.valid}`);
  console.log(`  parts: L=${exam.lesenParts?.length} H=${exam.horenParts?.length} S=${exam.schreibenParts?.length} Sp=${exam.sprechenParts?.length}`);
  if (!v.valid) console.log(`  errors: ${v.errors.slice(0, 8).join('; ')}`);
}
