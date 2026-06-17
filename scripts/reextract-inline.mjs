#!/usr/bin/env node
/** Re-extract inline JS from git HEAD index.html using section markers. */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const html = execSync('git show HEAD:index.html', { cwd: ROOT, encoding: 'utf8' });
const m = html.match(/<script src="js\/examProfile\.js\?v=1"><\/script>\s*<script>([\s\S]*?)<\/script>\s*<script src="js\/appFeatures/);
if (!m) throw new Error('inline block not found in HEAD index.html');

const lines = m[1].split(/\r?\n/);
console.log('inline lines:', lines.length);

const sections = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('// ═') && lines[i + 1]?.startsWith('// ')) {
    sections.push({ name: lines[i + 1].replace(/^\/\/\s*/, '').trim(), start: i });
  }
}
for (let i = 0; i < sections.length; i++) {
  sections[i].end = (sections[i + 1]?.start ?? lines.length) - 1;
  console.log(`${sections[i].start + 1}-${sections[i].end + 1} (${sections[i].end - sections[i].start + 1}): ${sections[i].name}`);
}

function slice(a, b) {
  return lines.slice(a, b + 1).join('\n').trim() + '\n';
}

function findLine(pred) {
  const i = lines.findIndex(pred);
  if (i < 0) throw new Error('marker not found');
  return i;
}

const idx = (name) => sections.find((s) => s.name === name).start;
const end = (name) => sections.find((s) => s.name === name).end;

const vocabHubEnd = findLine((l) => l.startsWith('const _examConfig=')) - 1;
const mistakeStart = findLine((l) => l.startsWith('function openMistakeReview'));
const mistakeEnd = findLine((l) => l.startsWith('function updBadges')) - 1;

const files = [
  ['js/bootstrap/state.js', sections[0].start, sections.find((s) => s.name === 'QUOTA / PLAN').start - 1],
  ['js/bootstrap/quota.js', idx('QUOTA / PLAN'), end('QUOTA / PLAN')],
  ['js/bootstrap/auth.js', idx('AUTH'), end('AUTH')],
  ['js/bootstrap/theme.js', idx('THEME / UI'), idx('EXAM GOALS') - 1],
  ['js/ui/workspace/vocabHub.js', idx('EXAM GOALS'), vocabHubEnd],
  ['js/ui/exam/examConfig.js', vocabHubEnd + 1, mistakeStart - 1],
  ['js/ui/exam/mistakeReview.js', mistakeStart, mistakeEnd],
  ['js/ui/app/coach.js', mistakeEnd + 1, idx('NAVIGATION') - 1],
  ['js/bootstrap/nav.js', idx('NAVIGATION'), end('NAVIGATION')],
  ['js/ui/exam/examGeneration.js', idx('EXAM GENERATION'), idx('TIMER') - 1],
  ['js/ui/exam/examRunner.js', idx('TIMER'), end('RENDER EXAM')],
  ['js/ui/exam/results.js', idx('SUBMIT EXAM + CORRECTION'), end('SUBMIT EXAM + CORRECTION')],
  ['js/ui/exam/saveExams.js', idx('SAVE / LOAD EXAMS'), end('SAVE / LOAD EXAMS')],
  ['js/ui/vocabulary/tooltip.js', idx('VOCAB TOOLTIP'), end('VOCAB TOOLTIP')],
  ['js/bootstrap/audio.js', idx('AUDIO'), end('AUDIO')],
  ['js/ui/vocabulary/flashcards.js', idx('FLASHCARDS'), end('VOCAB EXAM')],
  ['js/bootstrap/init.js', idx('INIT'), lines.length - 1],
];

const bootPatch = `
(function(){
  const _origSetFcType=window.setFcTypeFilter;
  if(_origSetFcType)window.setFcTypeFilter=function(type,btn){S.fcSingleIdx=0;S.fcSingleFlipped=false;return _origSetFcType(type,btn);};
})();
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>window.bootApp());
}else{
  window.bootApp();
}
`.trim();

for (const [out, a, b] of files) {
  let content = slice(a, b);
  if (out === 'js/bootstrap/init.js') content = content.trimEnd() + '\n\n' + bootPatch + '\n';
  const full = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  try {
    execSync(`node --check "${full}"`, { stdio: 'pipe' });
    console.log('OK', out, b - a + 1, 'lines');
  } catch (e) {
    console.error('FAIL', out, e.stderr?.toString() || e.message);
    process.exit(1);
  }
}
