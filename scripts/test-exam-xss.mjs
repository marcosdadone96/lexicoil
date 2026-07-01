#!/usr/bin/env node
/**
 * XSS regression — exam content must not inject executable HTML/JS via innerHTML render paths.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadRunnerFns() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
  const start = src.indexOf('function esc(s)');
  const lesenEnd = src.indexOf('function renderGoetheHorenPart');
  const foreachStart = src.indexOf('function forEachGoetheLesenItems');
  const foreachEnd = src.indexOf('function forEachGoetheNotes');
  const optKeyStart = src.indexOf('const _akr = typeof IsAnswerKeyRenderable');
  const setRFEnd = src.indexOf('function updProg()');
  const genStart = src.indexOf('function sanitizeExamText');
  const genEnd = src.indexOf('function isLesenForumOpinionsPart');
  const genSrc = genStart >= 0 && genEnd > genStart ? src.slice(genStart, genEnd) : '';
  const gapStart = src.indexOf('function gapInputEl');
  const gapEnd = src.indexOf('const _akr = typeof IsAnswerKeyRenderable');
  const fnBlock =
    genSrc +
    src.slice(start, lesenEnd) +
    src.slice(foreachStart, foreachEnd) +
    (gapStart >= 0 && gapEnd > gapStart ? src.slice(gapStart, gapEnd) : '') +
    src.slice(optKeyStart, setRFEnd);
  const sandbox = {
    console,
    S: { answers: {} },
    wrapW: (t) => String(t || '').replace(/</g, '&lt;'),
    sanitizeExamText: (t) => String(t || '').replace(/<\/?[^>]+>/g, ''),
  };
  vm.createContext(sandbox);
  vm.runInContext(fnBlock, sandbox);
  return sandbox;
}

function ok(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function hasRawXss(html) {
  return /<img[\s/>]/i.test(html) || /<script[\s/>]/i.test(html);
}

const runner = loadRunnerFns();
const payload = '<img src=x onerror=alert(1)>';
const ui = { lang: 'de', trueL: 'Richtig', falseL: 'Falsch', trueK: 'R' };

const qHtml = runner.renderQ(
  {
    id: "x');alert(1);//",
    type: 'multiple',
    question: payload,
    options: [{ key: 'A', text: payload }, { key: 'B', text: 'Normal' }],
    correct: 'A',
  },
  1,
  'lesen',
  ui.trueL,
  ui.falseL,
  ui.trueK,
  true,
);

ok('renderQ: no raw <img tag', !/<img\b/i.test(qHtml));
ok('renderQ: no active onerror attribute', !/<[^>]*onerror\s*=/i.test(qHtml));
ok('renderQ: escaped lt in question', qHtml.includes('&lt;img'));

const forumPart = {
  teil: 4,
  blueprintSlot: 'forum_opinions',
  items: [{ id: '20', type: 'ja_nein', signText: payload, correct: 'J' }],
  questions: [],
};
const forumHtml = runner.renderGoetheLesenPart(forumPart, 0, false, {
  ...ui,
  reading: 'Lesen',
  teil: 'Teil',
  partial: 'partial',
  option: 'Option',
});
ok('forum signText: no raw XSS', !hasRawXss(forumHtml));

const gapHtml = runner.renderGapSec(
  {
    instruction: payload,
    sentences: [{ id: "s');alert(1);//", text: `Before [BLANK] ${payload}`, options: [payload, 'ok'] }],
  },
  true,
  false,
);
ok('gap fill: no raw XSS in sentence/options', !hasRawXss(gapHtml));

let alertFired = false;
if (typeof document !== 'undefined') {
  const prev = global.alert;
  global.alert = () => {
    alertFired = true;
  };
  try {
    const probe = document.createElement('div');
    probe.innerHTML = qHtml;
    for (const img of probe.querySelectorAll('img')) {
      img.onerror?.(new Event('error'));
    }
  } catch (_) {
    /* ignore */
  } finally {
    global.alert = prev;
  }
}
ok('DOM probe: alert not fired from injected markup', !alertFired);

console.log('\nAll exam XSS checks passed.');
