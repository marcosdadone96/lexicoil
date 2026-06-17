#!/usr/bin/env node
/** Move inline <style> from index.html to assets/css/app.css */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');
const cssPath = path.join(ROOT, 'assets', 'css', 'app.css');

let html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
if (!match) {
  console.error('No <style> block found in index.html');
  process.exit(1);
}

const css = match[1].trim() + '\n';
fs.mkdirSync(path.dirname(cssPath), { recursive: true });
fs.writeFileSync(cssPath, css, 'utf8');

const link =
  '<link rel="stylesheet" href="/assets/css/lexicoil-design-system.css">\n<link rel="stylesheet" href="/assets/css/app.css">';
html = html.replace(
  /<link rel="stylesheet" href="\/assets\/css\/lexicoil-design-system\.css">/,
  link,
);
html = html.replace(/<style>\n[\s\S]*?\n<\/style>\n/, '');

fs.writeFileSync(indexPath, html, 'utf8');
console.log(`Extracted ${css.split('\n').length} lines → assets/css/app.css`);
console.log(`index.html now ${html.split('\n').length} lines`);
