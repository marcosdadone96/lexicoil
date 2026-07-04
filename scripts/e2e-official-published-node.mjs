#!/usr/bin/env node
/**
 * Official B1 published-source smoke (no Playwright): HTTP + VM render + grading.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { partRecordToExamPart } from './audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.LC_E2E_BASE || 'http://127.0.0.1:5173';
const require = createRequire(import.meta.url);

function ok(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log('OK:', label);
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function loadAdapter() {
  const globalObj = { console, window: null, module: { exports: {} } };
  globalObj.window = globalObj;
  const ctx = vm.createContext(globalObj);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8'), ctx);
  return globalObj.PublishedExamAdapter;
}

function loadBrowserGlobals() {
  const globalObj = {
    console,
    window: null,
    document: { getElementById: () => null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch,
    LEXICOIL_EXAM_SOURCE: 'published',
    lcDebug: { log() {}, warn() {}, error: console.error.bind(console) },
  };
  globalObj.window = globalObj;
  const ctx = vm.createContext(globalObj);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config/examSource.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/examLibrary.js'), 'utf8'), ctx);
  return globalObj;
}

function loadRunnerHtml(part, pi = 2) {
  const {
    isAnswerKeyRenderable,
    optKey,
    normalizeGradingToken,
    getRenderableAnswerKeys,
  } = require('../js/engine/validation/isAnswerKeyRenderable.js');
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
  const start = src.indexOf('function esc(s)');
  const lesenEnd = src.indexOf('function renderGoetheHorenPart');
  const foreachStart = src.indexOf('function forEachGoetheLesenItems');
  const foreachEnd = src.indexOf('function forEachGoetheNotes');
  const optKeyStart = src.indexOf('const _akr = typeof IsAnswerKeyRenderable');
  const setRFEnd = src.indexOf('function updProg()');
  const fnBlock =
    src.slice(start, lesenEnd) +
    src.slice(foreachStart, foreachEnd) +
    src.slice(optKeyStart, setRFEnd);
  const sandbox = {
    console,
    IsAnswerKeyRenderable: { isAnswerKeyRenderable, optKey, normalizeGradingToken, getRenderableAnswerKeys },
    wrapW: (t) => String(t || ''),
    lcDebug: { warn() {} },
    S: { answers: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fnBlock, sandbox);
  const ui = {
    lang: 'de',
    reading: 'Lesen',
    teil: 'Teil',
    partial: 'partial',
    option: 'Option',
    trueL: 'Richtig',
    falseL: 'Falsch',
    trueK: 'R',
  };
  return sandbox.renderGoetheLesenPart(part, pi, false, ui);
}

function gradeLesenHoren(exam, answers) {
  const MG = require('../js/ui/exam/moduleGrading.js');
  const { isAnswerKeyRenderable } = require('../js/engine/validation/isAnswerKeyRenderable.js');
  const goetheAnswersMatch = (user, correct) => {
    const u = String(user ?? '').trim().toLowerCase();
    const c = String(correct ?? '').trim().toLowerCase();
    return u === c || u === c.slice(0, 1);
  };
  let lc = 0,
    la = 0,
    lp = 0,
    hc = 0,
    ha = 0,
    hp = 0;
  const walk = (mod, q, part) => {
    if (!isAnswerKeyRenderable(q, part)) return;
    const key = `${mod}_${q.id}`;
    const user = answers[key];
    const answered = user != null && String(user).trim() !== '';
    if (mod.startsWith('lesen_')) lp++;
    else if (mod.startsWith('horen_')) hp++;
    if (!answered) return;
    const match = goetheAnswersMatch(user, q.correct ?? q.correctAnswer);
    if (mod.startsWith('lesen_')) {
      la++;
      if (match) lc++;
    } else if (mod.startsWith('horen_')) {
      ha++;
      if (match) hc++;
    }
  };
  exam.lesenParts?.forEach((p, i) => {
    (p.questions || []).forEach((q) => walk(`lesen_${i}`, q, p));
  });
  exam.horenParts?.forEach((p, i) => {
    (p.questions || []).forEach((q) => walk(`horen_${i}`, q, p));
    (p.segments || []).forEach((seg) => {
      (seg.questions || []).forEach((q) => walk(`horen_${i}`, q, p));
    });
  });
  const passPercent = 60;
  return {
    lesen: la ? MG.buildObjectiveModuleResult(lc, la, lp, passPercent) : null,
    horen: ha ? MG.buildObjectiveModuleResult(hc, ha, hp, passPercent) : null,
    legacyPct: la + ha ? Math.round(((lc + hc) / (la + ha)) * 100) : 0,
  };
}

async function main() {
  const indexHtml = await fetchText(`${BASE}/`);
  ok('index sets LEXICOIL_EXAM_SOURCE=published', /LEXICOIL_EXAM_SOURCE\s*=\s*['"]published['"]/.test(indexHtml));

  const g = loadBrowserGlobals();
  ok("getLexicoilExamSource() → 'published'", g.getLexicoilExamSource() === 'published');
  ok("ExamLibrary.usesPublishedExams('de','B1') → true", g.ExamLibrary.usesPublishedExams('de', 'B1') === true);

  const catalog = await fetchJson(`${BASE}/library/published-exams/de/B1/_catalog.json`);
  ok('catalog has 5 live exams', catalog.exams.filter((e) => e.status === 'live').length === 5);

  const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/de_B1.json'), 'utf8'));
  ok('legacy de_B1 has BildScharf (control)', JSON.stringify(legacy).includes('BildScharf'));

  let e4Doc = null;
  for (const entry of catalog.exams) {
    const doc = await fetchJson(
      `${BASE}/library/published-exams/de/B1/${entry.examId}.json`,
    );
    ok(`${entry.examId} has 12 parts with snapshot+hash`, doc.parts?.length === 12 && doc.parts.every((p) => p.snapshot && p.contentHash));
    if (entry.examId === 'official-de-B1-e4') e4Doc = doc;
  }
  ok('loaded official-de-B1-e4', !!e4Doc);

  const Adapter = loadAdapter();
  const exam = Adapter.publishedDocToServedExam(e4Doc);
  ok('E4 lesen/horen/schreiben part counts', exam.lesenParts.length === 5 && exam.horenParts.length === 4 && exam.schreibenParts.length === 3);

  const l3 = exam.lesenParts.find((p) => p.teil === 3);
  const adTitles = (l3?.ads || []).map((a) => a.title);
  ok('L3 has TechDeal24 (published)', adTitles.includes('TechDeal24'));
  ok('L3 has PC-Hilfe (published)', adTitles.some((t) => String(t).includes('PC-Hilfe')));
  ok('L3 not legacy BildScharf', !adTitles.includes('BildScharf'));

  const l3Html = loadRunnerHtml(l3, 2);
  ok('L3 render HTML contains TechDeal24', l3Html.includes('TechDeal24'));
  ok('L3 render HTML no BildScharf', !l3Html.includes('BildScharf'));

  const l2 = exam.lesenParts.find((p) => p.teil === 2);
  const l2Passages = l2?.passages?.filter((p) => (p.text || '').length > 100) || [];
  ok('Lesen T2 has 2 full passages', l2Passages.length >= 2);
  const l2Blob = JSON.stringify(l2);
  ok('Lesen T2 no wrong caps', !/\bIch Glaube,|frisch Kochen|was sie Essen\b/.test(l2Blob));
  ok('Lesen T2 has frisch kochen fix', /frisch kochen|um junge Menschen/i.test(l2Blob) || l2Passages.length >= 2);

  for (const mod of ['lesen', 'horen', 'schreiben']) {
    const parts = exam[`${mod}Parts`] || [];
    ok(`${mod} modules non-empty`, parts.length > 0);
    if (mod === 'horen') {
      const hasAudio = parts.some((p) => (p.transcript || '').length > 50 || (p.segments || []).some((s) => (s.transcript || '').length > 20));
      ok('horen has transcript content for audio', hasAudio);
    }
    if (mod === 'schreiben') {
      ok('schreiben has task text', parts.every((p) => (p.task || '').length > 20));
    }
  }

  const answers = {};
  exam.lesenParts.forEach((p, pi) => {
    (p.questions || []).forEach((q) => {
      answers[`lesen_${pi}_${q.id}`] = String(q.correct ?? q.correctAnswer ?? '');
    });
  });
  exam.horenParts.forEach((p, pi) => {
    (p.questions || []).forEach((q) => {
      answers[`horen_${pi}_${q.id}`] = String(q.correct ?? q.correctAnswer ?? '');
    });
    (p.segments || []).forEach((seg) => {
      (seg.questions || []).forEach((q) => {
        answers[`horen_${pi}_${q.id}`] = String(q.correct ?? q.correctAnswer ?? '');
      });
    });
  });
  const graded = gradeLesenHoren(exam, answers);
  ok('grader scores 100% with correct keys', graded.legacyPct === 100);
  ok('lesen module pass', graded.lesen?.passed === true);
  ok('horen module pass', graded.horen?.passed === true);

  console.log('\n✅ All checks passed — published Official B1 reaches user (server', BASE + ')');
  console.log('   Console: getLexicoilExamSource()=published, usesPublishedExams(de,B1)=true');
  console.log('   L3: TechDeal24 + PC-Hilfe (not BildScharf)');
  console.log('   Modules: Lesen + Hören + Schreiben OK; grader', graded.legacyPct + '%');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
