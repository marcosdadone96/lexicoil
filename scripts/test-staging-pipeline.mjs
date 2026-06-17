#!/usr/bin/env node
/**
 * Sprint 2 — staging pipeline smoke tests (generate → approve → promote).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  stagingRoot,
  loadIndex,
  saveCandidate,
  listCandidates,
} from './pipeline/lib/stagingStore.mjs';
import { lesenPartToCandidate } from './pipeline/lib/candidateBuilder.mjs';
import { validateCandidate, resolveBlueprint } from './pipeline/lib/validateCandidate.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const TEST_LANG = 'de';
const TEST_LEVEL = 'B1';
const testRoot = stagingRoot(TEST_LANG, TEST_LEVEL);
const backupDir = path.join(ROOT, 'staging', '_test_backup');
const libPath = path.join(ROOT, 'library/de/B1/questions.json');
const libBackup = path.join(ROOT, 'staging', '_test_lib_backup.json');

function backupStaging() {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.cpSync(testRoot, backupDir, { recursive: true });
  }
}

function restoreStaging() {
  fs.rmSync(testRoot, { recursive: true, force: true });
  if (fs.existsSync(backupDir)) {
    fs.cpSync(backupDir, testRoot, { recursive: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

function backupLibrary() {
  fs.copyFileSync(libPath, libBackup);
}

function restoreLibrary() {
  if (fs.existsSync(libBackup)) {
    fs.copyFileSync(libBackup, libPath);
    fs.rmSync(libBackup, { force: true });
  }
}

backupStaging();
backupLibrary();
fs.rmSync(testRoot, { recursive: true, force: true });

const blueprint = resolveBlueprint(TEST_LANG, TEST_LEVEL);
assert(blueprint?.id === 'goethe-b1', 'blueprint goethe-b1 loaded');

const samplePart = {
  teil: 1,
  instruction: 'Test Lesen Teil 1',
  textTitle: 'Test Stadtgarten',
  text: 'Immer mehr Menschen in deutschen Städten entscheiden sich für einen eigenen kleinen Garten. Stadtgärten bieten frische Produkte und Gemeinschaft. Kinder lernen, wie Pflanzen wachsen. Die Wartelisten sind oft lang.',
  questions: [
    { question: 'Stadtgärten werden beliebter.', correct: 'Richtig', type: 'richtig_falsch' },
    { question: 'Stadtgärten gibt es nur auf dem Land.', correct: 'Falsch', type: 'richtig_falsch' },
    { question: 'Kinder können etwas über Pflanzen lernen.', correct: 'Richtig', type: 'richtig_falsch' },
    { question: 'Es gibt keine Wartelisten.', correct: 'Falsch', type: 'richtig_falsch' },
    { question: 'Stadtgärten fördern Gemeinschaft.', correct: 'Richtig', type: 'richtig_falsch' },
    { question: 'Frische Produkte sind ein Vorteil.', correct: 'Richtig', type: 'richtig_falsch' },
  ],
};

const candidate = lesenPartToCandidate(samplePart, {
  lang: TEST_LANG,
  level: TEST_LEVEL,
  blueprint,
  batchId: 'test-batch',
  source: 'test-staging-pipeline',
});
candidate.validation = validateCandidate(candidate, blueprint);
saveCandidate(candidate);

assert(candidate.id.startsWith('stg-de-B1-lesen-t1'), 'candidate id format');
assert(loadIndex(TEST_LANG, TEST_LEVEL).candidates.length === 1, 'index has 1 row');

const loaded = listCandidates(TEST_LANG, TEST_LEVEL, { status: 'pending' });
assert(loaded.length === 1, 'list pending');
assert(loaded[0].questions.length === 6, 'lesen t1 has 6 questions');

loaded[0].status = 'approved';
loaded[0].review.reviewedAt = new Date().toISOString();
saveCandidate(loaded[0]);

const approved = listCandidates(TEST_LANG, TEST_LEVEL, { status: 'approved' });
assert(approved.length === 1, 'approved candidate');

const libBefore = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'),
);
const qBefore = libBefore.questions.length;
const pBefore = libBefore.passages.length;

const { execSync } = await import('node:child_process');
execSync(`node scripts/promote-approved.mjs --lang ${TEST_LANG} --level ${TEST_LEVEL}`, {
  cwd: ROOT,
  stdio: 'pipe',
});

const libAfter = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'),
);
assert(libAfter.questions.length >= qBefore, 'library questions grew or stayed');
assert(listCandidates(TEST_LANG, TEST_LEVEL, { status: 'promoted' }).length === 1, 'candidate promoted');

restoreStaging();
restoreLibrary();

console.log('\nStaging pipeline tests passed.');
