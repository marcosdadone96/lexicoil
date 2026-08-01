#!/usr/bin/env node
/**
 * Pre-deploy checks (deterministic, no Gemini). Run before commit/deploy when ready.
 *   node scripts/verify-pre-deploy.mjs
 *   node scripts/verify-pre-deploy.mjs --quick   # gate evals only (~30s)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');

function run(label, args) {
  console.log(`\n══ ${label} ══\n`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('eval-all-gates', ['batches/ready/gate-logs/eval-all-gates.mjs']);

if (quick) {
  console.log('\n✅ verify-pre-deploy (--quick) passed.\n');
  process.exit(0);
}

run('validate:library', ['scripts/validate-library.mjs']);
run('validate:demo', ['scripts/validate-demo-content.mjs']);
run('assert-no-mojibake', ['scripts/lib/assert-no-mojibake.mjs']);

console.log('\n✅ verify-pre-deploy passed (full).\n');
console.log('Deploy: push to main → Netlify (see README). Optional: docs/smoke-staging.md post-deploy.\n');
