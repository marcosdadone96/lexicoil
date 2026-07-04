#!/usr/bin/env node
/**
 * Full local validation pass for published Official B1 E1–E5.
 * Run: node scripts/validate-published-pass.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'library/published-exams/de/B1');
const require = createRequire(import.meta.url);
const akr = require('../js/engine/validation/isAnswerKeyRenderable.js');

let failures = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
    return false;
  }
  console.log('OK:', msg);
  return true;
}

function boot() {
  const g = {
    console,
    window: null,
    document: { getElementById: () => null },
    localStorage: { getItem: () => null },
    lcDebug: { log() {}, warn() {}, error: console.error.bind(console) },
    S: { subject: 'de', level: 'B1', answers: {}, flashcards: [], vocabLang: 'en', history: [] },
    PartPostprocess: require('../js/engine/prompts/partPostprocess.js'),
    TargetUsage: require('../js/engine/targetUsage.js'),
    ExamRenumber: require('../js/engine/examRenumber.js'),
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8'), g);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8'), g);
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
  const fnBlock = src.slice(src.indexOf('function esc(s)'), src.indexOf('function updProg()'));
  const sb = {
    console,
    IsAnswerKeyRenderable: {
      isAnswerKeyRenderable: akr.isAnswerKeyRenderable,
      optKey: akr.optKey,
      normalizeGradingToken: akr.normalizeGradingToken,
      getRenderableAnswerKeys: akr.getRenderableAnswerKeys,
    },
    wrapW: (t) => String(t || ''),
    lcDebug: { warn() {} },
    S: g.S,
  };
  vm.createContext(sb);
  vm.runInContext(fnBlock, sb);
  return { g, sb };
}

function loadVocab() {
  const window = {};
  const ctx = { window, console, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/bootstrap/featureFlashcards.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/engine/validation/lemmatizer.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/verbConjugation.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'), ctx);
  return window.ManualVocab;
}

function gradeLesenHoren(exam, answers) {
  const MG = require('../js/ui/exam/moduleGrading.js');
  const { isAnswerKeyRenderable } = akr;
  const goetheAnswersMatch = (user, correct) => {
    const u = String(user ?? '').trim().toLowerCase();
    const c = String(correct ?? '').trim().toLowerCase();
    return u === c || u === c.slice(0, 1);
  };
  let lc = 0, la = 0, lp = 0, hc = 0, ha = 0, hp = 0;
  const walk = (mod, q, part) => {
    if (!isAnswerKeyRenderable(q, part)) return;
    const key = `${mod}_${q.id}`;
    const user = answers[key];
    const answered = user != null && String(user).trim() !== '';
    if (mod.startsWith('lesen_')) lp++;
    else if (mod.startsWith('horen_')) hp++;
    if (!answered) return;
    const match = goetheAnswersMatch(user, q.correct ?? q.correctAnswer);
    if (mod.startsWith('lesen_')) { la++; if (match) lc++; }
    else if (mod.startsWith('horen_')) { ha++; if (match) hc++; }
  };
  exam.lesenParts?.forEach((p, i) => (p.questions || []).forEach((q) => walk(`lesen_${i}`, q, p)));
  exam.horenParts?.forEach((p, i) => {
    (p.questions || []).forEach((q) => walk(`horen_${i}`, q, p));
    (p.segments || []).forEach((seg) => (seg.questions || []).forEach((q) => walk(`horen_${i}`, q, p)));
  });
  const passPercent = 60;
  return {
    lesen: la ? MG.buildObjectiveModuleResult(lc, la, lp, passPercent) : null,
    horen: ha ? MG.buildObjectiveModuleResult(hc, ha, hp, passPercent) : null,
    legacyPct: la + ha ? Math.round(((lc + hc) / (la + ha)) * 100) : 0,
    gradable: la + ha,
  };
}

function buildAnswers(exam) {
  const answers = {};
  exam.lesenParts?.forEach((p, pi) => {
    (p.questions || []).forEach((q) => {
      answers[`lesen_${pi}_${q.id}`] = String(q.correct ?? q.correctAnswer ?? '');
    });
  });
  exam.horenParts?.forEach((p, pi) => {
    (p.questions || []).forEach((q) => {
      answers[`horen_${pi}_${q.id}`] = String(q.correct ?? q.correctAnswer ?? '');
    });
    (p.segments || []).forEach((seg) => {
      (seg.questions || []).forEach((q) => {
        answers[`horen_${pi}_${q.id}`] = String(q.correct ?? q.correctAnswer ?? '');
      });
    });
  });
  return answers;
}

function renderLesen(part, sb) {
  const ui = { lang: 'de', reading: 'Lesen', teil: 'Teil', partial: '', option: 'O', trueL: 'R', falseL: 'F', trueK: 'R' };
  return sb.renderGoetheLesenPart(part, (part.teil || 1) - 1, false, ui);
}

const { g, sb } = boot();
const ManualVocab = loadVocab();

console.log('\n=== Catalog ===');
const catalog = JSON.parse(fs.readFileSync(path.join(DIR, '_catalog.json'), 'utf8'));
ok(catalog.exams?.length === 5, 'catalog has 5 exams');
ok(catalog.exams.every((e) => e.status === 'live'), 'all exams status=live');

console.log('\n=== Vocab POS (inferPos) ===');
const posCases = [
  ['habe', 'verb'],
  ['bezahlt', 'verb'],
  ['arbeitet', 'verb'],
  ['danach', 'adverb'],
  ['Entscheidung', 'noun'],
];
for (const [word, expect] of posCases) {
  const got = ManualVocab.inferPos({ word }, 'de');
  ok(got === expect, `inferPos(${word})=${got} (expect ${expect})`);
}

console.log('\n=== Per-exam pipeline ===');
for (let n = 1; n <= 5; n++) {
  const examId = `official-de-B1-e${n}`;
  console.log(`\n--- E${n} ---`);
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${examId}.json`), 'utf8'));
  ok(doc.status === 'live', `E${n} status live`);
  const expectedParts = n === 1 ? 15 : 12;
  ok(doc.parts?.length === expectedParts, `E${n} ${expectedParts} parts`);
  ok(doc.parts.every((p) => p.snapshot && p.contentHash), `E${n} snapshot+hash`);

  const exam = g.normalizeExam(g.PublishedExamAdapter.publishedDocToServedExam(doc));
  ok(exam.lesenParts?.length === 5, `E${n} lesen×5`);
  ok(exam.horenParts?.length === 4, `E${n} horen×4`);
  ok(exam.schreibenParts?.length === 3, `E${n} schreiben×3`);
  if (n === 1) {
    ok(exam.sprechenParts?.length === 3, `E${n} sprechen×3 (pilot)`);
    ok(
      exam.sprechenParts.every(
        (p) => p.fieldId?.startsWith('speak_bp_') && String(p.situation || '').length > 20,
      ),
      `E${n} sprechen fieldId + situation`,
    );
  } else {
    ok(doc.parts.filter((p) => p.module === 'sprechen').length === 0, `E${n} sprechen not in bundle`);
    ok(!exam.sprechenParts?.length, `E${n} no sprechenParts`);
  }

  const l2 = exam.lesenParts.find((p) => p.teil === 2);
  const l2Qs = l2?.questions || [];
  ok(l2Qs.length >= 6, `E${n} L2 ≥6 questions`);
  ok(l2Qs.every((q) => String(q.question || q.prompt || '').trim().length > 5), `E${n} L2 enunciados non-empty`);
  ok((l2?.passages || []).filter((p) => (p.text || '').length > 80).length >= 2, `E${n} L2 ≥2 passages`);

  const l3 = exam.lesenParts.find((p) => p.teil === 3);
  const l3Items = l3?.items?.length ? l3.items : l3?.questions || [];
  ok((l3?.ads || []).length === 10, `E${n} L3 10 ads`);
  ok(l3Items.length >= 7, `E${n} L3 ≥7 match items`);
  ok(l3Items.every((q) => String(q.signText || q.question || q.prompt || q.situation || '').trim().length > 10), `E${n} L3 situation text`);
  const l3Html = renderLesen(l3, sb);
  if (l3?._t3HasNoMatch) ok(l3Html.includes('>0</button>'), `E${n} L3 zero button`);

  const l4 = exam.lesenParts.find((p) => p.teil === 4);
  const l4Items = l4?.items?.length ? l4.items : l4?.questions || [];
  ok(l4Items.length >= 7, `E${n} L4 ≥7 items`);
  ok(l4Items.every((it) => String(it.signText || it.text || it.body || '').trim().length > 20), `E${n} L4 opinion text`);
  ok(l4Items.every((it) => String(it.question || '').trim().length > 5), `E${n} L4 per-opinion question`);
  const l4Html = renderLesen(l4, sb);
  ok(l4Html.includes('off-sign'), `E${n} L4 off-sign in HTML`);
  ok(/off-sign-label">\d+</.test(l4Html), `E${n} L4 numbered signs 20–26`);
  ok(!l4Html.includes('class="q-number">1.'), `E${n} L4 not fallback 1–7 numbering`);

  const hAudio = exam.horenParts.some(
    (p) => (p.transcript || '').length > 40 || (p.segments || []).some((s) => (s.transcript || '').length > 20),
  );
  ok(hAudio, `E${n} horen transcript content`);

  ok(
    exam.schreibenParts.every((p) => String(p.task || p.prompt || p.instruction || '').trim().length > 15),
    `E${n} schreiben tasks`,
  );

  const answers = buildAnswers(exam);
  const graded = gradeLesenHoren(exam, answers);
  ok(graded.gradable > 0, `E${n} gradable questions=${graded.gradable}`);
  ok(graded.legacyPct === 100, `E${n} grader 100% (${graded.legacyPct}%)`);
  ok(graded.lesen?.passed === true, `E${n} lesen module pass`);
  ok(graded.horen?.passed === true, `E${n} horen module pass`);
}

console.log('\n=== index.html config ===');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/LEXICOIL_EXAM_SOURCE\s*=\s*['"]published['"]/.test(indexHtml), 'index LEXICOIL_EXAM_SOURCE=published');
ok(indexHtml.includes('publishedExamAdapter.js'), 'index loads publishedExamAdapter');

if (failures) {
  console.error(`\n❌ ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\n✅ Validation pass complete — E1–E5 OK locally');
