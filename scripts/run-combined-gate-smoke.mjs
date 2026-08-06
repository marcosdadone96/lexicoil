#!/usr/bin/env node
/** Smoke: 3 partes por celda con gate combinado + fix-retries=2 (default). */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

const cells = [
  { label: 'Hören T1', script: 'generate-part-gemini.mjs', argv: ['--module', 'horen', '--teil', '1'] },
  { label: 'Hören T3', script: 'generate-part-gemini.mjs', argv: ['--module', 'horen', '--teil', '3'] },
  { label: 'Lesen T3', script: 'generate-lesen-part-gemini.mjs', argv: ['--teil', '3'] },
  { label: 'Lesen T4', script: 'generate-lesen-part-gemini.mjs', argv: ['--teil', '4'] },
];

for (const cell of cells) {
  console.log(`\n######## ${cell.label} × 3 ########\n`);
  const r = spawnSync(
    node,
    [
      path.join(ROOT, 'scripts', cell.script),
      ...cell.argv,
      '--from-coverage',
      '--count',
      '3',
      '--skip-pool-ready',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' },
  );
  if (r.status !== 0) {
    console.warn(`[warn] ${cell.label} exit ${r.status}`);
  }
}

console.log('\nDone combined-gate smoke batch.');
