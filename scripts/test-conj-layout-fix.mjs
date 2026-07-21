#!/usr/bin/env node
/** Visual/layout check: verb conjugation panels push rows (no select overlay). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
globalThis.S = { goals: [{ id: 'g1', subject: 'de', level: 'B1' }] };
globalThis.window = globalThis;
require(path.join(ROOT, 'js/engine/separableResolve.js'));
const VerbConjugation = require(path.join(ROOT, 'js/data/verbConjugation.js'));

const goal = { subject: 'de', level: 'B1' };
const verbs = [
  { word: 'abnehmen', type: 'verb', pos: 'verb', sourceLang: 'de' },
  { word: 'bezahlen', type: 'verb', pos: 'verb', sourceLang: 'de' },
  { word: 'anbieten', type: 'verb', pos: 'verb', sourceLang: 'de' },
];

const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
const cssSlice = css.match(/\.vv-row[\s\S]*?\.vv-row--verb[\s\S]*?isolation:isolate\}/)?.[0] || '';

const rows = verbs
  .map((f, i) => {
    const html = VerbConjugation.conjugationSelectHtml(f, goal, 'id' + i).replace(
      'class="vv-conj-details"',
      'class="vv-conj-details" open',
    );
    return (
      `<div class="vv-row vv-row--verb">` +
      `<label class="vv-row-main"><input type="checkbox"><span class="vv-row-word">${f.word}</span></label>` +
      `<button type="button" class="vv-del">×</button>` +
      `<div class="vv-conj-row">${html}</div></div>`
    );
  })
  .join('');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Segoe UI,sans-serif;background:#f5f5f5;padding:24px}
.vv-rows{max-width:360px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:8px 12px}
${cssSlice}
details.vv-conj-details[open] .vv-conj-panel{display:block}
</style></head><body><div class="vv-rows">${rows}</div></body></html>`;

const outDir = path.join(ROOT, 'batches/ready/gate-logs');
fs.mkdirSync(outDir, { recursive: true });
const outHtml = path.join(outDir, 'conj-layout-fix-2026-07-13.html');
const outPdf = path.join(outDir, 'conj-layout-fix-2026-07-13.pdf');
fs.writeFileSync(outHtml, html);

const hasSelect = html.includes('<select');
const hasList = html.includes('vv-conj-list');
const hasTenseTabs = html.includes('vv-conj-tense-tab');
const openPanels = (html.match(/vv-conj-details" open/g) || []).length;
console.log('select removed:', !hasSelect);
console.log('inline list:', hasList);
console.log('tense tabs:', hasTenseTabs);
console.log('open panels:', openPanels);

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (fs.existsSync(CHROME)) {
  execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', `--print-to-pdf=${outPdf}`, `file:///${outHtml.replace(/\\/g, '/')}`],
    { stdio: 'pipe' },
  );
  console.log('PDF:', outPdf);
}
console.log('HTML:', outHtml);
if (hasSelect || !hasList || !hasTenseTabs || openPanels < 2) process.exit(1);
