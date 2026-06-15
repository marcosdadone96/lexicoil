#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['landing/public/capture/dashboard.html', 'landing/public/capture/workspace.html'];

const replacements = [
  [/var\(--text3\)/g, 'var(--text-muted)'],
  [/var\(--text2\)/g, 'var(--text-secondary)'],
  [/var\(--r-full\)/g, 'var(--radius-full)'],
  [/var\(--r-xl\)/g, 'var(--radius-xl)'],
  [/var\(--r-lg\)/g, 'var(--radius-lg)'],
  [/var\(--r-md\)/g, 'var(--radius-md)'],
  [/var\(--r-sm\)/g, 'var(--radius-sm)'],
  [/var\(--elevated\)/g, 'var(--bg-elevated)'],
  [/var\(--blue-light\)/g, 'var(--brand-light)'],
  [/var\(--blue-dark\)/g, 'var(--brand-dark)'],
  [/var\(--blue\)/g, 'var(--brand)'],
  [/var\(--surface\)/g, 'var(--bg-surface)'],
  [/var\(--bg\)/g, 'var(--bg-base)'],
  [/var\(--text\)/g, 'var(--text-primary)'],
];

for (const rel of files) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    /<style>\s*\/\* ====== LEXICOIL DESIGN TOKENS[\s\S]*?\}\s*\n/,
    '<link rel="stylesheet" href="/assets/css/lexicoil-design-system.css">\n<style>\n',
  );
  html = html.replace(
    /<style>\s*:root\{[\s\S]*?\}\s*\n/,
    '<link rel="stylesheet" href="/assets/css/lexicoil-design-system.css">\n<style>\n',
  );
  for (const [re, rep] of replacements) html = html.replace(re, rep);
  fs.writeFileSync(file, html);
  console.log('migrated', rel);
}
