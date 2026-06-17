#!/usr/bin/env node
/**
 * Ingest gate: validate-batch rejects non-conformant batches.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runValidate(file, extraArgs = []) {
  return spawnSync(
    process.execPath,
    ['scripts/validate-batch.mjs', '--lang', 'de', '--level', 'B1', '--file', file, ...extraArgs],
    { cwd: ROOT, encoding: 'utf8' },
  );
}

const bad = runValidate('batches/_fixtures/horen-t4-bad-no-options.json');
const badOut = `${bad.stdout}\n${bad.stderr}`;
if (bad.status === 0) {
  console.error('FAIL: batch no conforme debería salir con error');
  process.exit(1);
}
if (!badOut.includes('matching_missing_options')) {
  console.error('FAIL: debería listar matching_missing_options');
  console.error(badOut);
  process.exit(1);
}
console.log('OK: batch Hören T4 sin options rechazado con matching_missing_options');

const good = runValidate('batches/merged/horen-t4-englischklasse-02.json', ['--allow-dup']);
if (good.status !== 0) {
  console.error('FAIL: batch conforme debería pasar con --allow-dup');
  console.error(`${good.stdout}\n${good.stderr}`);
  process.exit(1);
}
if (!good.stdout.includes('Conformidad blueprint: OK')) {
  console.error('FAIL: conformidad debería ser OK');
  console.error(good.stdout);
  process.exit(1);
}
console.log('OK: batch conforme pasa validación');

console.log('\nIngest conformance tests passed.\n');
