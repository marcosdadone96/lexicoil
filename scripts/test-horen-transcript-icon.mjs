#!/usr/bin/env node
/** Smoke: Hören transcript summary must not show broken ?? placeholder. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');

if (/horen-transcript-details>summary::before\{content:'\?\?'/.test(css)) {
  console.error('FAIL: horen-transcript-details still uses content:\'??\'');
  process.exit(1);
}
if (!css.includes('horen-transcript-details>summary::before') || !css.includes('mask:url(')) {
  console.error('FAIL: expected SVG mask icon on transcript summary');
  process.exit(1);
}

const runner = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
if (!runner.includes('horen-transcript-details')) {
  console.error('FAIL: examRunner missing horen-transcript-details');
  process.exit(1);
}

console.log('OK: Transkript summary uses document SVG icon (no ?? placeholder)');
console.log('   CSS: assets/css/app.css → .horen-transcript-details>summary::before');
console.log('   HTML: examRunner.js → horenTranscriptDetailsHtml() + class on <details>');
