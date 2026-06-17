#!/usr/bin/env node
/**
 * Phase 12 — visual token + a11y smoke checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = ['--accent:', '--text2:', '--text3:', ' --r:', '--r-lg:', 'var(--accent)', 'var(--text2)', 'var(--text3)', 'var(--r)', 'var(--r-lg)'];
const MAIN = [
  'assets/css/app.css',
  'assets/css/lexicoil-design-system.css',
  'index.html',
];

function walkJs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walkJs(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance({ r, g, b }) {
  const s = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

function contrast(a, b) {
  const l1 = luminance(hexToRgb(a));
  const l2 = luminance(hexToRgb(b));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

let failed = 0;

function fail(msg) {
  console.error('FAIL:', msg);
  failed++;
}

function ok(msg) {
  console.log('OK:', msg);
}

// Required files
for (const f of ['assets/css/app-utilities.css', 'js/ui/components/a11y.js', 'js/ui/exam/examKeyboard.js', 'js/ui/vocabulary/fcKeyboard.js']) {
  if (!fs.existsSync(path.join(ROOT, f))) fail(`missing ${f}`);
  else ok(`exists ${f}`);
}

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!index.includes('app-utilities.css')) fail('index.html missing app-utilities.css');
else ok('index.html loads app-utilities.css');
if (!index.includes('a11y.js')) fail('index.html missing a11y.js');
else ok('index.html loads a11y.js');

// Legacy tokens removed from main app surface
const ds = fs.readFileSync(path.join(ROOT, 'assets/css/lexicoil-design-system.css'), 'utf8');
for (const token of ['--text2:', '--text3:', '--accent:', '--r:', '--r-lg:']) {
  if (ds.includes(token)) fail(`design-system still defines legacy alias ${token}`);
}
ok('design-system legacy accent/text/r aliases removed');

for (const file of MAIN) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const token of LEGACY.filter((t) => t.startsWith('var('))) {
    if (text.includes(token)) fail(`${file} still uses ${token}`);
  }
}

const jsFiles = walkJs(path.join(ROOT, 'js'));
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const token of ['var(--accent)', 'var(--text2)', 'var(--text3)', 'var(--r)', 'var(--r-lg)']) {
    if (text.includes(token)) fail(`${rel(file)} still uses ${token}`);
  }
}
ok('main JS uses canonical CSS tokens');

// WCAG AA contrast — locked brand palette on light theme
const pairs = [
  ['#2563EB', '#FFFFFF', 4.5, 'brand on white (large text / UI)'],
  ['#0F172A', '#F8FAFC', 4.5, 'text-primary on bg-base'],
  ['#475569', '#F8FAFC', 4.5, 'text-secondary on bg-base'],
];
for (const [fg, bg, min, label] of pairs) {
  const ratio = contrast(fg, bg);
  if (ratio < min) fail(`${label}: ${ratio.toFixed(2)} < ${min}`);
  else ok(`${label}: ${ratio.toFixed(2)}:1`);
}

// nav.js wires LcA11y
const nav = fs.readFileSync(path.join(ROOT, 'js/bootstrap/nav.js'), 'utf8');
if (!nav.includes('LcA11y.onScreenShown')) fail('nav.js missing LcA11y.onScreenShown');
else ok('nav.js announces screen changes');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll visual token / a11y checks passed');
