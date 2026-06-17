#!/usr/bin/env node
/** Phase 7 — design system parity (app ↔ landing). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_CSS = path.join(ROOT, 'assets/css/lexicoil-design-system.css');
const LANDING_CSS = path.join(ROOT, 'landing/public/assets/css/lexicoil-design-system.css');
const GLOBALS = path.join(ROOT, 'landing/src/app/globals.css');
const TAILWIND = path.join(ROOT, 'landing/tailwind.config.ts');
const COLORS = path.join(ROOT, 'assets/brand/colors.json');
const DEMO_LOOP = path.join(ROOT, 'assets/css/demo-loop.css');
const CAPTURE = [
  'landing/public/capture/dashboard.html',
  'landing/public/capture/workspace.html',
];

const LEGACY = ['--accent:', '--text2:', '--text3:', ' --r:', '--r-lg:', 'var(--accent)', 'var(--text2)', 'var(--text3)'];

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex');
}

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}
function ok(msg) {
  console.log('OK:', msg);
}

if (!fs.existsSync(LANDING_CSS)) fail('Run npm run sync:design-system first — landing copy missing');
if (sha(SRC_CSS) !== sha(LANDING_CSS)) fail('landing/public CSS out of sync with assets/css (run sync:design-system)');

ok('landing/public design-system matches assets source');

const globals = fs.readFileSync(GLOBALS, 'utf8');
if (!globals.includes('assets/css/lexicoil-design-system.css')) {
  fail('landing globals.css must @import canonical design-system.css');
}
if (globals.includes('--lc-blue:') || globals.includes('#2563eb')) {
  fail('landing globals.css must not duplicate token hex values');
}
ok('landing globals.css imports canonical tokens');

const tw = fs.readFileSync(TAILWIND, 'utf8');
if (tw.includes("'#2563eb'") || tw.includes('"#2563eb"')) {
  fail('tailwind.config.ts must use CSS variables, not hardcoded brand hex');
}
if (!tw.includes('var(--brand)')) fail('tailwind.config.ts missing var(--brand)');
ok('tailwind.config.ts uses CSS variable theme');

const manifest = JSON.parse(fs.readFileSync(COLORS, 'utf8'));
const css = fs.readFileSync(SRC_CSS, 'utf8');
for (const [key, hex] of Object.entries({
  primaryBlue: manifest.brand?.primaryBlue,
  teal: manifest.brand?.teal,
  navy: manifest.brand?.navy,
})) {
  if (!hex) fail(`colors.json missing brand.${key}`);
  if (!css.toLowerCase().includes(hex.toLowerCase())) {
    fail(`colors.json ${key} ${hex} not found in design-system CSS`);
  }
}
ok('colors.json manifest matches design-system CSS');

for (const token of LEGACY) {
  if (fs.readFileSync(DEMO_LOOP, 'utf8').includes(token)) {
    fail(`demo-loop.css still uses legacy token ${token}`);
  }
}
ok('demo-loop.css uses canonical tokens');

for (const rel of CAPTURE) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    fail(`missing ${rel}`);
  }
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('lexicoil-design-system.css')) {
    fail(`${rel} must link canonical design-system.css`);
  }
  if (text.includes(':root{') && text.includes('--blue:#2563eb')) {
    fail(`${rel} must not embed duplicate :root token block`);
  }
  for (const token of ['var(--text2)', 'var(--text3)', 'var(--r-lg)']) {
    if (text.includes(token)) fail(`${rel} still uses ${token}`);
  }
}
ok('landing capture HTML uses linked design system');

if (!css.includes('--amber: var(--warning)')) {
  fail('design-system missing --amber alias');
}
ok('design-system includes --amber semantic alias');

console.log('\nDesign system parity checks passed.');
