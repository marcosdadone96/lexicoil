#!/usr/bin/env node
/**
 * netlify dev with extended function timeout for hybrid Gemini factory.
 * netlify dev defaults to 30s locally; hybrid Lesen needs up to ~300s per teil.
 *
 *   npm run dev:hybrid
 *   LEXICOIL_DEV_FUNCTION_TIMEOUT=300 npm run dev:hybrid
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT = Number(process.env.LEXICOIL_DEV_FUNCTION_TIMEOUT || 300);
const TO = `const SYNCHRONOUS_FUNCTION_TIMEOUT = ${TIMEOUT}`;
const FROM_RE = /(?:const|var) SYNCHRONOUS_FUNCTION_TIMEOUT = 30\b/g;

function findNetlifyCliRoot() {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const cliRoot = path.join(globalRoot, 'netlify-cli');
    if (fs.existsSync(cliRoot)) return cliRoot;
  } catch {
    /* ignore */
  }
  return null;
}

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const original = fs.readFileSync(filePath, 'utf8');
  if (!FROM_RE.test(original)) return null;
  FROM_RE.lastIndex = 0;
  const patched = original.replace(FROM_RE, TO);
  if (patched === original) return null;
  fs.writeFileSync(filePath, patched, 'utf8');
  return original;
}

function restoreBackup({ filePath, original }) {
  try {
    fs.writeFileSync(filePath, original, 'utf8');
  } catch {
    /* ignore */
  }
}

const cliRoot = findNetlifyCliRoot();
const backups = [];
if (cliRoot) {
  const targets = [
    path.join(cliRoot, 'dist', 'utils', 'dev.js'),
    path.join(cliRoot, 'node_modules', '@netlify', 'functions', 'dist', 'main.js'),
    path.join(cliRoot, 'node_modules', '@netlify', 'functions-dev', 'dist', 'main.js'),
  ];
  for (const filePath of targets) {
    const original = patchFile(filePath);
    if (original) backups.push({ filePath, original });
  }
  if (backups.length) {
    console.log(
      `[dev:hybrid] Patched Netlify CLI function timeout → ${TIMEOUT}s (${backups.length} file(s))`,
    );
  } else {
    console.warn(
      '[dev:hybrid] Could not patch Netlify CLI timeout — hybrid may still hit 30s locally.',
    );
  }
} else {
  console.warn('[dev:hybrid] netlify-cli not found globally — run: npm install -g netlify-cli');
}

let restored = false;
function restoreAll() {
  if (restored) return;
  restored = true;
  for (const b of backups) restoreBackup(b);
  if (backups.length) console.log('[dev:hybrid] Restored Netlify CLI timeout defaults.');
}

process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreAll();
  process.exit(143);
});

const args = process.argv.slice(2);
if (!process.env.NODE_OPTIONS?.includes('use-system-ca')) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');
}
const child = spawn(process.platform === 'win32' ? 'netlify.cmd' : 'netlify', ['dev', ...args], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => {
  restoreAll();
  process.exit(code ?? 0);
});
