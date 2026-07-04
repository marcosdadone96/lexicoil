#!/usr/bin/env node
/** Regression: instruction range must match rendered display numbers after normalizeExam. */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const akr = require('../js/engine/validation/isAnswerKeyRenderable.js');

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
  vm.runInContext(fs.readFileSync('js/data/publishedExamAdapter.js', 'utf8'), g);
  vm.runInContext(fs.readFileSync('js/ui/exam/examGeneration.js', 'utf8'), g);
  const src = fs.readFileSync('js/ui/exam/examRunner.js', 'utf8');
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

function parseRange(instr) {
  const m = String(instr || '').match(/(\d+)\s*(?:bis|–|-|to)\s*(\d+)/i);
  if (!m) return null;
  return { start: Number(m[1]), end: Number(m[2]) };
}

function collectDisplayNums(part, sb) {
  const ui = {
    lang: 'de',
    reading: 'Lesen',
    teil: 'Teil',
    partial: '',
    option: 'O',
    trueL: 'Richtig',
    falseL: 'Falsch',
    trueK: 'R',
  };
  const pi = (part.teil || 1) - 1;
  const html = sb.renderGoetheLesenPart(part, pi, false, ui);
  const matchNums = [...html.matchAll(/pt-match-num">(\d+)\./g)].map((m) => Number(m[1]));
  const qNums = [...html.matchAll(/class="q-number">(\d+)\./g)].map((m) => Number(m[1]));
  const offLabels = [...html.matchAll(/off-sign-label">(\d+)</g)].map((m) => Number(m[1]));
  return [...matchNums, ...qNums, ...offLabels];
}

const { g, sb } = boot();
const exams = ['e1', 'e2', 'e3', 'e4', 'e5'];
let failures = 0;

for (const slot of exams) {
  const doc = JSON.parse(
    fs.readFileSync(`library/published-exams/de/B1/official-de-B1-${slot}.json`, 'utf8'),
  );
  const exam = g.normalizeExam(g.PublishedExamAdapter.publishedDocToServedExam(doc));
  console.log(`\n=== E${slot.slice(1)} ===`);
  for (const part of exam.lesenParts || []) {
    const range = parseRange(part.instruction);
    const nums = collectDisplayNums(part, sb);
    const instrOk = !!String(part.instruction || '').trim();
    const rangeOk = !range || !nums.length || (Math.min(...nums) >= range.start && Math.max(...nums) <= range.end);
    const t3Zero =
      Number(part.teil) !== 3 ||
      !part._t3HasNoMatch ||
      sb.renderGoetheLesenPart(part, part.teil - 1, false, { lang: 'de', reading: 'L', teil: 'T' }).includes('>0</button>');
    const status = instrOk && rangeOk && t3Zero ? 'OK' : 'FAIL';
    if (status === 'FAIL') failures++;
    console.log(
      `  T${part.teil}: ${status} instr=${instrOk ? 'yes' : 'EMPTY'} range=${range ? `${range.start}-${range.end}` : 'n/a'} nums=${nums.length ? `${Math.min(...nums)}-${Math.max(...nums)}` : 'none'} t3zero=${t3Zero}`,
    );
  }
}

if (failures) {
  console.error(`\n${failures} part(s) failed`);
  process.exit(1);
}
console.log('\nAll lesen parts passed numbering/instruction checks');
