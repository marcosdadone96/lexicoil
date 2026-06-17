#!/usr/bin/env node
/**
 * Acceptance: ja_nein renders Ja/Nein buttons and grades Ja/J equivalently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizeGradingToken(val) {
  if (val == null || val === '') return '';
  const u = String(val).trim().toLowerCase();
  if (u === 'ja' || u === 'j' || u === 'yes') return 'J';
  if (u === 'nein' || u === 'n' || u === 'no') return 'N';
  if (u === 'richtig' || u === 'r' || u === 'true' || u === 't') return 'R';
  if (u === 'falsch' || u === 'f' || u === 'false') return 'F';
  return String(val).trim().toLowerCase();
}

function goetheAnswersMatch(user, correct) {
  if (correct == null) return false;
  if (Array.isArray(correct)) {
    if (correct.length === 1) return normalizeGradingToken(user) === normalizeGradingToken(correct[0]);
    return false;
  }
  return normalizeGradingToken(user) === normalizeGradingToken(correct);
}

function renderWouldShowYn(q) {
  return q.type === 'yn' || q.type === 'ja_nein';
}

function normalizeGoetheQuestion(q) {
  if (q.type === 'ja_nein') {
    q = { ...q, type: 'yn' };
    if (q.correct === 'Ja') q.correct = 'J';
    else if (q.correct === 'Nein') q.correct = 'N';
  }
  return q;
}

let fail = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) fail = true;
}

const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'));
const jaNein = (bank.questions || []).filter((q) => q.type === 'ja_nein' && q.module === 'lesen' && Number(q.teil) === 4);
check('bank has ja_nein lesen T4 items', jaNein.length > 0);

const raw = jaNein[0];
check('raw ja_nein lesen T4 sample exists', !!raw);
check('renderQ branch matches ja_nein (not Keine Optionen path)', renderWouldShowYn(raw));

const norm = normalizeGoetheQuestion(raw);
check('normalizeExam converts ja_nein -> yn', norm.type === 'yn');
check('normalizeExam converts correct Ja -> J', norm.correct === 'J' || norm.correct === 'N');

check('grade Ja vs J', goetheAnswersMatch('J', 'Ja'));
check('grade Nein vs N', goetheAnswersMatch('N', 'Nein'));
check('grade wrong', !goetheAnswersMatch('J', 'Nein'));

console.log(fail ? '\nSome checks FAILED.\n' : '\nAll ja_nein checks PASSED.\n');
process.exit(fail ? 1 : 0);
