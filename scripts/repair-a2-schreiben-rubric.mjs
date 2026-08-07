#!/usr/bin/env node
/**
 * Repara explanation Schreiben A2 con canonicalSchreibenExplanation(teil, 'A2').
 *   node scripts/repair-a2-schreiben-rubric.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { canonicalSchreibenExplanation } from './lib/schreibenDisplayRubric.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
let filesTouched = 0;
let questionsFixed = 0;

for (const file of fs.readdirSync(poolDir).filter((f) => /^schreiben.*\.json$/i.test(f)).sort()) {
  const fp = path.join(poolDir, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let changed = false;
  for (const q of batch.questions || []) {
    if (String(q.module || '').toLowerCase() !== 'schreiben') continue;
    const lv = String(q.level || batch.level || 'A2').trim().toUpperCase();
    if (lv !== 'A2') continue;
    const teil = Number(q.teil);
    const canon = canonicalSchreibenExplanation(teil, 'A2');
    if (!canon) continue;
    if (q.explanation !== canon) {
      q.explanation = canon;
      questionsFixed++;
      changed = true;
    }
  }
  if (changed) {
    batch._a2SchreibenRubricRepairAt = new Date().toISOString();
    fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    filesTouched++;
    console.log('repaired', file);
  }
}

console.log(JSON.stringify({ filesTouched, questionsFixed }, null, 2));
