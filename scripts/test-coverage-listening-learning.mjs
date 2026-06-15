#!/usr/bin/env node
/**
 * Phase 13 — coverage, task fidelity, weakness/mastery, tagging gate, listening.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ALL_LANGS, ALL_LEVELS, makeBank } from './seed-coverage-levels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let failed = 0;
function fail(msg) {
  console.error('FAIL:', msg);
  failed++;
}
function ok(msg) {
  console.log('OK:', msg);
}

// --- 13a: library coverage ---
for (const lang of ALL_LANGS) {
  for (const level of ALL_LEVELS) {
    const file = path.join(ROOT, 'library', lang, level, 'questions.json');
    if (!fs.existsSync(file)) fail(`missing bank ${lang}/${level}`);
  }
}
ok('13a: all 18 question banks exist');

const idx = {};
for (const lang of ALL_LANGS) {
  for (const level of ALL_LEVELS) {
    const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
    idx[`${lang}_${level}`] = `${type}_${level}`;
  }
}
for (const fileId of new Set(Object.values(idx))) {
  const bp = path.join(ROOT, 'library/blueprints', `${fileId}.json`);
  if (!fs.existsSync(bp)) fail(`missing blueprint ${fileId}`);
}
ok('13a: all 18 blueprints exist');

// CefrGate smoke on sample banks
const { validateExam } = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
process.env.CEFR_GATE = '1';
for (const [lang, level] of [
  ['de', 'A1'],
  ['de', 'C2'],
  ['en', 'A2'],
  ['es', 'C1'],
]) {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'));
  const passage = bank.passages?.[0]?.text || '';
  if (!passage) fail(`no passage ${lang}/${level}`);
  else ok(`13a: ${lang}/${level} has passage (${passage.split(/\s+/).length} words)`);
}

// --- 13b: blueprint fidelity ---
const { checkBlueprintFidelity } = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));
for (const fileId of ['goethe_B1', 'goethe_B2', 'cambridge_B2', 'dele_B2']) {
  const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${fileId}.json`), 'utf8'));
  const r = checkBlueprintFidelity(bp);
  if (!r.ok) fail(`13b ${fileId}: ${r.issues.join(', ')}`);
  else ok(`13b: ${fileId} fidelity (${(bp.modules.find((m) => m.id === 'schreiben')?.parts || []).length} schreiben, ${(bp.modules.find((m) => m.id === 'sprechen')?.parts || []).length} sprechen)`);
}

// --- 13c: AnalyticsStore ---
const analyticsSrc = fs.readFileSync(path.join(ROOT, 'js/library/AnalyticsStore.js'), 'utf8');
for (const fn of ['getWeakTopicTags', 'getWeakModules', 'getMasterySummary', 'masteryLevel']) {
  if (!analyticsSrc.includes(fn)) fail(`AnalyticsStore missing ${fn}`);
}
ok('13c: AnalyticsStore extended API');

// --- 13d: TaggingGate + WeaknessEngine ---
const { gateBank } = require(path.join(ROOT, 'js/library/TaggingGate.js'));
const sample = makeBank('de', 'A1');
const gate = gateBank(sample);
if (!gate.passed) fail(`13d tagging gate: ${gate.trusted}/${gate.total}`);
else ok(`13d: TaggingGate passed (${gate.trusted} trusted questions)`);

const weakSrc = fs.readFileSync(path.join(ROOT, 'js/library/WeaknessEngine.js'), 'utf8');
if (!weakSrc.includes('TaggingGate')) fail('WeaknessEngine missing TaggingGate');
else ok('13d: WeaknessEngine uses TaggingGate');

// --- 13e: multi-voice listening ---
const { parseSegments, isMultiVoice, prepare } = require(path.join(ROOT, 'js/bootstrap/listeningScript.js'));
const dialogue = 'Moderator: Hello.\nGuest: Hi there.\nModerator: Thanks.';
const segs = parseSegments(dialogue);
if (segs.length < 2) fail('13e: expected multi-speaker segments');
else ok(`13e: ListeningScript parsed ${segs.length} segments`);
const prepped = prepare(dialogue, 'en');
if (!prepped.every((s) => s.voice)) fail('13e: segments missing voice assignment');
else ok('13e: multi-voice voices assigned');

const audioSrc = fs.readFileSync(path.join(ROOT, 'js/bootstrap/audio.js'), 'utf8');
if (!audioSrc.includes('playMultiVoiceSegments')) fail('13e: audio.js missing playMultiVoiceSegments');
const runnerSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
if (!runnerSrc.includes('ListeningScript')) fail('13e: examRunner missing ListeningScript integration');
else ok('13e: listening pipeline wired');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll phase 13 checks passed');
