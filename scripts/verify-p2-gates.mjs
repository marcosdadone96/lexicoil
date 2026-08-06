#!/usr/bin/env node
/** Quick P2 verification — run: node scripts/verify-p2-gates.mjs */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = [
  'scripts/lib/__tests__/capitalizeNouns.test.mjs',
  'scripts/lib/__tests__/p2Capitalization.test.mjs',
];

let ok = true;
for (const t of tests) {
  const r = spawnSync(process.execPath, [t], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) ok = false;
}
process.exit(ok ? 0 : 1);
