#!/usr/bin/env node
/**
 * Post-fix volume checks for fixes-raiz-2026-07-27 (deterministic gates).
 *   node scripts/verify-fixes-raiz-2026-07-27.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, args) {
  console.log(`\n══ ${label} ══\n`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('capitalizeNouns unit tests', ['scripts/lib/__tests__/capitalizeNouns.test.mjs']);
run('Hören T1 vocab + caps evidence', ['scripts/lib/__tests__/generationFeedbackHorenT1.test.mjs']);
run('Lesen T4 name rotation', ['scripts/lib/__tests__/lesen-t4-name-rotation.test.mjs']);

console.log('\n✅ Deterministic verify-fixes-raiz gates passed.\n');
console.log('Volume generation (Gemini): run operator batch for Hören T1/T2 + Lesen T2 after this script.\n');
