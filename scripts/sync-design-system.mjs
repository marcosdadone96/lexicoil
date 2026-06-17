#!/usr/bin/env node
/** Sync canonical design system (assets/) → landing/public + validate token manifest. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_CSS = path.join(ROOT, 'assets', 'css', 'lexicoil-design-system.css');
const SRC_COLORS = path.join(ROOT, 'assets', 'brand', 'colors.json');
const DEST_CSS_DIR = path.join(ROOT, 'landing', 'public', 'assets', 'css');
const DEST_CSS = path.join(DEST_CSS_DIR, 'lexicoil-design-system.css');
const DEST_COLORS = path.join(ROOT, 'landing', 'public', 'assets', 'brand', 'colors.json');

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(SRC_CSS)) {
  console.error('Missing source:', SRC_CSS);
  process.exit(1);
}

copy(SRC_CSS, DEST_CSS);
if (fs.existsSync(SRC_COLORS)) copy(SRC_COLORS, DEST_COLORS);

const cssHash = sha(SRC_CSS);
const destHash = sha(DEST_CSS);
if (cssHash !== destHash) {
  console.error('Design system sync failed — checksum mismatch');
  process.exit(1);
}

console.log('Synced design system → landing/public/assets/css/lexicoil-design-system.css');
if (fs.existsSync(SRC_COLORS)) {
  console.log('Synced colors.json → landing/public/assets/brand/colors.json');
}
console.log('SHA256', cssHash.slice(0, 16) + '…');
