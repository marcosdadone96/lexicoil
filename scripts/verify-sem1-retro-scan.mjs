#!/usr/bin/env node
/** Retro-scan: POOL-2 clean batches × SEM-1 factory gate (skipSem2). */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { validatePart } from './lib/partGate.mjs';
import { _setHolisticJudgeLlmFn } from './lib/holisticJudge.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

let sem2Calls = 0;
_setHolisticJudgeLlmFn(async () => {
  sem2Calls += 1;
  return JSON.stringify({ themeTags: [], findings: [] });
});

const dir = path.join(ROOT, 'batches/generated');
const byTeil = { 1: [], 2: [], 3: [] };
for (const name of fs.readdirSync(dir)) {
  const m = name.match(/^lesen-t([123])-gemini-\d+\.json$/i);
  if (!m) continue;
  byTeil[Number(m[1])].push(name);
}
for (const t of [1, 2, 3]) {
  byTeil[t].sort((a, b) =>
    fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs,
  );
  byTeil[t] = byTeil[t].slice(0, 4);
}
const files = [...byTeil[1], ...byTeil[2], ...byTeil[3]];

const rows = [];
for (const f of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const teil = Number(f.match(/lesen-t(\d)/i)[1]);
  const struct = await validatePart(batch, {
    module: 'lesen',
    teil,
    semantic: false,
    skipSem2: true,
    skipDedup: true,
  });
  if (!struct.ok) {
    rows.push({ f, teil, pool2: false });
    continue;
  }
  const full = await validatePart(struct.batch, {
    module: 'lesen',
    teil,
    semantic: true,
    skipSem2: true,
    skipDedup: true,
    skipNormalize: true,
  });
  const blocking = full.blocking || [];
  const semKey = blocking.filter((x) => /^SEM-(CORRECTNESS|AMBIGUITY)/.test(x.id));
  const semOther = blocking.filter(
    (x) => /^SEM-/.test(x.id) && !/^SEM-(CORRECTNESS|AMBIGUITY)/.test(x.id),
  );
  rows.push({
    f,
    teil,
    pool2: true,
    sem1ok: full.ok,
    semKey: semKey.length,
    semOtherIds: semOther.map((x) => x.id),
    sample: semKey[0]?.message?.slice(0, 100) || semOther[0]?.message?.slice(0, 100) || null,
  });
}

const pool2 = rows.filter((r) => r.pool2);
const report = {
  generatedAt: new Date().toISOString(),
  files: rows.length,
  pool2ok: pool2.length,
  sem2CallsDuringScan: sem2Calls,
  semPass: pool2.filter((r) => r.sem1ok).length,
  semKeyFail: pool2.filter((r) => r.semKey > 0).length,
  semOtherFail: pool2.filter((r) => !r.sem1ok && !r.semKey).length,
  wouldHaveBlockedBeforePublish: pool2.filter((r) => !r.sem1ok).length,
  rows,
};

const out = path.join(dir, 'verify-sem1-retro-scan-report.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));
console.log(`\nInforme: ${path.relative(ROOT, out)}`);
if (sem2Calls > 0) process.exit(1);
