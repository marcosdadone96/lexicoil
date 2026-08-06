/**
 * Option-letter explanation resync (generalized patterns).
 * Run: node scripts/lib/__tests__/explanationOptionResync.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  balanceMcqGroup,
  resyncExplanationOptionLetter,
  findExplanationOptionLetters,
  alignExplanationOptionLetters,
} from '../balanceMcq.mjs';

const require = createRequire(import.meta.url);
const { balanceAnswerPositions } = require('../../../js/engine/prompts/partPostprocess.js');
const shared = require('../../../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'batches/ready/pool-verified');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    fail++;
  } else {
    console.log('OK:', msg);
  }
}

function normalizeCorrect(c) {
  const s = String(c ?? '').trim().toLowerCase();
  const m = s.match(/^([abc])\b/);
  return m ? m[1] : null;
}

// ── Shared module identity (both call sites) ───────────────────────────────
console.log('\n=== shared module ===');
assert(
  resyncExplanationOptionLetter === shared.resyncExplanationOptionLetter,
  'balanceMcq re-exports the same shared function',
);
assert(
  typeof balanceAnswerPositions === 'function',
  'partPostprocess loads with shared resync',
);

// ── Unit: paren + bare + antwort ───────────────────────────────────────────
console.log('\n=== unit patterns ===');
assert(
  resyncExplanationOptionLetter('Der Text sagt Montag.', 'a', 'b') === 'Der Text sagt Montag.',
  'no-op when no Option letter',
);
assert(
  resyncExplanationOptionLetter('Option a) ist korrekt.', 'a', 'b') === 'Option b) ist korrekt.',
  'paren a→b',
);
assert(
  resyncExplanationOptionLetter('was Option c korrekt macht.', 'c', 'a') ===
    'was Option a korrekt macht.',
  'bare Option c→a (005 case)',
);
assert(
  resyncExplanationOptionLetter('Antwort b ist richtig.', 'b', 'c') === 'Antwort c ist richtig.',
  'Antwort pattern',
);
assert(
  alignExplanationOptionLetters('was Option c korrekt macht.', 'a').explanation ===
    'was Option a korrekt macht.',
  'align desync c→a',
);

// ── balanceMcq with bare pattern ───────────────────────────────────────────
console.log('\n=== balanceMcq bare Option ===');
const bareQ = {
  id: 't-bare',
  type: 'multiple_choice',
  correct: 'c',
  correctAnswer: 'c',
  explanation: "Der Preis beträgt fünfzig Euro, was Option c korrekt macht.",
  options: ['a) zehn', 'b) zwanzig', 'c) fünfzig'],
};
const tripleBare = [structuredClone(bareQ), structuredClone(bareQ), structuredClone(bareQ)];
const balBare = balanceMcqGroup(tripleBare, { seed: 'bare-resync-test' });
for (const q of balBare) {
  const hits = findExplanationOptionLetters(q.explanation);
  assert(hits.length === 1, `bare expl has 1 letter ref (got ${hits.length})`);
  assert(hits[0].letter === q.correct, `bare expl letter ${hits[0].letter} === correct ${q.correct}`);
}

// ── balanceMcq paren (016-style) ───────────────────────────────────────────
console.log('\n=== balanceMcq paren Option ===');
const parenQ = {
  id: 't-paren',
  type: 'multiple_choice',
  correct: 'b',
  correctAnswer: 'b',
  explanation: 'Die Woche beginnt am Montag. Option b) ist die korrekte Aussage.',
  options: ['a) April', 'b) Montag', 'c) heute'],
};
const tripleParen = [structuredClone(parenQ), structuredClone(parenQ), structuredClone(parenQ)];
const balParen = balanceMcqGroup(tripleParen, { seed: 'paren-resync-test' });
for (const q of balParen) {
  assert(
    q.explanation.includes(`Option ${q.correct})`),
    `paren expl synced to ${q.correct}`,
  );
}

// ── partPostprocess ────────────────────────────────────────────────────────
console.log('\n=== partPostprocess ===');
const filler = {
  type: 'multiple_choice',
  correct: 'a',
  correctAnswer: 'a',
  explanation: 'Ohne Buchstabenreferenz in diesem Text.',
  options: [
    { key: 'a', text: 'X' },
    { key: 'b', text: 'Y' },
    { key: 'c', text: 'Z' },
  ],
};
const qObj = {
  type: 'multiple_choice',
  correct: 'a',
  correctAnswer: 'a',
  explanation: 'Der Text bestätigt den Preis, was Option a korrekt macht.',
  options: [
    { key: 'a', text: 'fünfzig' },
    { key: 'b', text: 'zwanzig' },
    { key: 'c', text: 'zehn' },
  ],
};
const qs = [filler, structuredClone(qObj)];
const { changed } = balanceAnswerPositions(qs);
assert(changed >= 1, 'partPostprocess changed ≥1');
assert(qs[1].correct === 'b', '2nd MCQ → b');
assert(/Option b\b/.test(qs[1].explanation), 'partPostprocess bare → Option b');
assert(!/Option a\b/.test(qs[1].explanation), 'partPostprocess no Option a');
assert(qs[0].explanation === filler.explanation, 'filler untouched');

// ── Pool scan: 0 desync after repair ───────────────────────────────────────
console.log('\n=== pool-verified scan ===');
const mentions = [];
const desync = [];
const syncOk = [];
const fileHashesBefore = new Map();
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  fileHashesBefore.set(f, raw);
  const j = JSON.parse(raw);
  for (const q of j.questions || []) {
    const hits = findExplanationOptionLetters(q.explanation);
    if (!hits.length) continue;
    const correct = normalizeCorrect(q.correct ?? q.correctAnswer);
    for (const h of hits) {
      const row = { f, id: q.id, mentioned: h.letter, correct, match: h.match };
      mentions.push(row);
      if (correct && h.letter !== correct) desync.push(row);
      else if (correct && h.letter === correct) syncOk.push(row);
    }
  }
}
console.log('mentions', mentions.length, 'desync', desync.length, 'syncOk', syncOk.length);
mentions.forEach((m) =>
  console.log(m.f, m.id, `mentioned=${m.mentioned}`, `correct=${m.correct}`, m.match),
);
assert(desync.length === 0, '0 real desyncs in pool-verified');

// ── 005 specifically fixed ─────────────────────────────────────────────────
console.log('\n=== horen-t1-005 ===');
const b005 = JSON.parse(fs.readFileSync(path.join(DIR, 'horen-t1-gemini-005.json'), 'utf8'));
const q005 = b005.questions.find((x) => x.id === 'gen-q-h1-c0c5c593-s5-q2');
assert(q005, '005 question found');
assert(normalizeCorrect(q005.correct) === 'a', '005 correct still a');
assert(/Option a\b/.test(q005.explanation), '005 expl says Option a');
assert(!/Option c\b/.test(q005.explanation), '005 expl no longer Option c');

// ── sync-ok file (016) unchanged letter that already matched ───────────────
console.log('\n=== 016 coincide left alone ===');
const b016 = JSON.parse(fs.readFileSync(path.join(DIR, 'horen-t1-gemini-016.json'), 'utf8'));
const q016 = b016.questions.find((x) => x.id === 'gen-q-h1-8e7e4170-s1-q2');
assert(/Option b\)/.test(q016.explanation), '016 still Option b)');
assert(normalizeCorrect(q016.correct) === 'b', '016 correct still b');

if (fail) {
  console.error(`\n${fail} failure(s)`);
  process.exit(1);
}
console.log('\nAll explanation-option-resync tests passed.');
