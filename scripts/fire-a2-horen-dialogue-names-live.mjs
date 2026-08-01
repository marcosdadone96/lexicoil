#!/usr/bin/env node
/**
 * Live fire test: N Hören A2 T1–T3 generations via Gemini; scan output for hot pairs;
 * track dialogue-names-usage.json growth.
 *
 *   node scripts/fire-a2-horen-dialogue-names-live.mjs
 *   node scripts/fire-a2-horen-dialogue-names-live.mjs --runs 12 --skip-quality
 *
 * Con --skip-quality los batches NO pasan calidad/léxico → no son pool productivo;
 * usar retire-a2-horen-live-fire-batches.mjs tras la prueba o omitir --skip-quality.
 *
 * ⚠ COSTO REAL: cada run dispara generación Gemini (~$0.02–0.05 por parte).
 * No correr en CI ni en loops automatizados sin presupuesto explícito.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { runExamGenerator } from './lib/generatePartGeminiLib.mjs';
import { extractDialoguePairs, pairKey } from './lib/dialogueNamesBank.mjs';

loadEnvFile();

const FORBIDDEN = new Set(['Emma+Jonas', 'Clara+Tobias']);
const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  return argv[i + 1] ?? true;
}

const RUNS = Math.max(1, Number(flag('--runs', 12)) || 12);
const skipQuality = argv.includes('--skip-quality');

const usagePath = path.join(ROOT, 'data/dialogue-names-usage.json');
const usageBefore = fs.existsSync(usagePath)
  ? JSON.parse(fs.readFileSync(usagePath, 'utf8'))
  : { cells: {} };

const runs = [];
let forbiddenHits = 0;
let okCount = 0;

for (let i = 0; i < RUNS; i += 1) {
  const teil = [1, 2, 3][i % 3];
  const cellBefore = JSON.stringify(usageBefore.cells || {});
  let result;
  try {
    const out = await runExamGenerator([
      '--module',
      'horen',
      '--level',
      'A2',
      '--teil',
      String(teil),
      '--from-coverage',
      '--count',
      '1',
      ...(skipQuality ? ['--skip-quality'] : []),
    ]);
    result = out?.results?.[0] || out?.results?.at(-1);
  } catch (err) {
    runs.push({ i, teil, ok: false, error: err.message || String(err) });
    continue;
  }

  const entry = {
    i,
    teil,
    ok: !!result?.ok,
    file: result?.file || null,
    pairs: [],
    forbiddenInOutput: [],
  };

  if (result?.ok && result.file) {
    okCount += 1;
    const abs = path.join(ROOT, result.file);
    if (fs.existsSync(abs)) {
      const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      for (const [a, b] of extractDialoguePairs(batch)) {
        const pk = pairKey(a, b);
        entry.pairs.push(pk);
        if (FORBIDDEN.has(pk)) {
          forbiddenHits += 1;
          entry.forbiddenInOutput.push(pk);
        }
      }
    }
  } else {
    entry.error = result?.reason || 'unknown';
  }

  const usageMid = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
  entry.usageCells = Object.keys(usageMid.cells || {}).length;
  runs.push(entry);
}

const usageAfter = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
const report = {
  at: new Date().toISOString(),
  mode: 'live-gemini',
  runsRequested: RUNS,
  runsOk: okCount,
  forbiddenPairHits: forbiddenHits,
  pass: forbiddenHits === 0 && okCount >= Math.min(10, RUNS),
  skipQuality,
  runs,
  usageCellsBefore: Object.keys(usageBefore.cells || {}).length,
  usageCellsAfter: Object.keys(usageAfter.cells || {}).length,
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/a2-dialogue-name-rotation-live-fire.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (forbiddenHits > 0) process.exit(1);
if (okCount < Math.min(10, RUNS)) process.exit(2);
