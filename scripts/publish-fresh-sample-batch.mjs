#!/usr/bin/env node
/** Publica las 14 partes OK de pool-fill-fresh-sample-report.json al seed. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const REPORT = path.join(ROOT, 'batches/generated/pool-fill-fresh-sample-report.json');
const data = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const files = data.attempts.filter((a) => a.ok && a.file).map((a) => a.file);

console.log(`\n══ Publicando ${files.length} partes al seed ══\n`);

let ok = 0;
let fail = 0;
for (const rel of files) {
  const teil = Number(rel.match(/lesen-t(\d)/i)?.[1]);
  console.log(`── ${rel} ──`);
  const res = spawnSync(
    process.execPath,
    [
      'scripts/publish-lesen-generated.mjs',
      '--file', rel,
      '--publish',
      '--allow-bank-dup',
      '--lang', 'de',
      '--level', 'B1',
      '--teil', String(teil),
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' },
  );
  if (res.status === 0) ok++;
  else fail++;
}

console.log(`\n✅ ${ok} publicadas · ❌ ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
