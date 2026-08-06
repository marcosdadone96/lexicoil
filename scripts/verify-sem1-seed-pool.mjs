#!/usr/bin/env node
/** SEM-1 sobre seed pool (misma metodología que sem1-findings-baseline.json). */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { clearSemanticCache } from './lib/semanticValidator.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

const SEED = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const data = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const records = data.records || data;

let pool2Clean = 0;
let semKeyBlocked = 0;
let correctnessParts = 0;
let ambiguityParts = 0;
let correctnessFindings = 0;
let ambiguityFindings = 0;
const samples = [];

for (const rec of records) {
  if (String(rec.module).toLowerCase() !== 'lesen') continue;
  clearSemanticCache();
  const struct = await isPartPoolReady(rec, { semantic: false });
  if (!struct.ok) continue;
  pool2Clean += 1;
  const sem = await isPartPoolReady(rec, { semantic: true, skipSem2: true });
  const blocking = sem.blocking || [];
  const corr = blocking.filter((x) => x.id === 'SEM-CORRECTNESS');
  const amb = blocking.filter((x) => x.id === 'SEM-AMBIGUITY');
  if (corr.length || amb.length) {
    semKeyBlocked += 1;
    if (corr.length) correctnessParts += 1;
    if (amb.length) ambiguityParts += 1;
    correctnessFindings += corr.length;
    ambiguityFindings += amb.length;
    if (samples.length < 6) {
      samples.push({
        id: rec.id,
        teil: rec.teil,
        corr: corr.map((x) => x.message?.slice(0, 90)),
        amb: amb.map((x) => x.message?.slice(0, 90)),
      });
    }
  }
}

const pct = pool2Clean ? ((semKeyBlocked / pool2Clean) * 100).toFixed(1) : '0';
console.log(JSON.stringify({
  scope: 'library/reusable-seed/de_B1.json lesen POOL-2-clean',
  pool2Clean,
  semKeyBlocked,
  semKeyBlockedPct: Number(pct),
  breakdown: { correctnessParts, ambiguityParts, correctnessFindings, ambiguityFindings },
  samples,
}, null, 2));
