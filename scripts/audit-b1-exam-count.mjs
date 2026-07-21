#!/usr/bin/env node
/** Quick audit: how many B1 exams are served in dev (published path). */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/published-exams/de/B1/_catalog.json'), 'utf8'));
const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/de_B1.json'), 'utf8'));
const avail = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/availability.json'), 'utf8'));

console.log('=== AUDIT B1 EXAMS (dev serves repo root via netlify dev) ===\n');
console.log('Published catalog (live):', catalog.exams.filter((e) => e.status === 'live').length);
for (const e of catalog.exams) console.log('  ', e.examId, e.status);

console.log('\nLegacy data/exams/de_B1.json:', legacy.length, 'exam(s)');
if (legacy[0]) console.log('  id:', legacy[0].examId || legacy[0].id);

console.log('\navailability.json de.B1.exams:', avail.de.B1.exams);

console.log('\nStale published files e2–e5:');
for (let n = 2; n <= 5; n++) {
  const p = path.join(ROOT, `library/published-exams/de/B1/official-de-B1-e${n}.json`);
  console.log(`  e${n}:`, fs.existsSync(p) ? 'EXISTS (remove)' : 'absent OK');
}

console.log('\nStale assembled-exam-b1-e*.json at repo root:');
for (let n = 1; n <= 5; n++) {
  const p = path.join(ROOT, `assembled-exam-b1-e${n}.json`);
  if (fs.existsSync(p)) console.log(`  e${n}: present (discarded drafts, not served)`);
}

const g = {
  console,
  window: null,
  fetch: async (url) => {
    const rel = String(url).replace(/^\//, '').replace(/\//g, path.sep);
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return { ok: true, json: () => JSON.parse(body) };
  },
};
g.window = g;
const ctx = vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config/examSource.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/examLibrary.js'), 'utf8'), ctx);

const count = await g.PublishedExamAdapter.getExamCount('de', 'B1');
const exams = await g.PublishedExamAdapter.loadExams('de', 'B1');
console.log('\nBrowser adapter (published source):');
console.log('  getExamCount:', count);
console.log('  loadExams:', exams.length, '→', exams.map((e) => e.examId).join(', '));
console.log('\nindex.html LEXICOIL_EXAM_SOURCE=published → dev uses catalog above, not pool shuffle.');
