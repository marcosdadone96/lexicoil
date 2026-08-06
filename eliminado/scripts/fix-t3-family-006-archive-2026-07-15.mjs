#!/usr/bin/env node
/**
 * Fix gender bug in lesen-t3-gemini-006 q7 + archive family duplicates.
 *
 *   node scripts/fix-t3-family-006-archive-2026-07-15.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { replaceLesenT3SeekerName } from './lib/lesenT3NamesBank.mjs';
import { checkT3PoolDedup, resetPoolVerifiedT3IndexCache } from './lib/t3PoolDedupGate.mjs';
import { poolReadyCheck } from './lib/poolReadyCheck.mjs';

const POOL006 = path.join(ROOT, 'batches/ready/pool-verified/lesen-t3-gemini-006.json');
const NEEDS = path.join(ROOT, 'batches/needs-regeneration');
const GENERATED = path.join(ROOT, 'batches/generated');

const ARCHIVE_FROM_GENERATED = [
  'lesen-t3-gemini-008.json', // bp-gesundheit, gender bug, family blocked
  'lesen-t3-gemini-011.json', // bp-ernaehrung dup of 010, gender bug
];

fs.mkdirSync(NEEDS, { recursive: true });

// —— Fix 006 q7 ——
const batch = JSON.parse(fs.readFileSync(POOL006, 'utf8'));
const q7 = batch.questions[6];
const before = q7.question;
q7.question = replaceLesenT3SeekerName(before, 'Herr Keller', { replaceAnySeeker: true });
batch._t3GenderFixAt = new Date().toISOString();
batch._t3GenderFixNote = 'q7 seeker + possessive via replaceLesenT3SeekerName v2';
fs.writeFileSync(POOL006, `${JSON.stringify(batch, null, 2)}\n`);
console.log('006 q7 before:', before);
console.log('006 q7 after: ', q7.question);

resetPoolVerifiedT3IndexCache();
const gate = checkT3PoolDedup(batch, { file: 'lesen-t3-gemini-006.json', reload: true });
console.log('006 gate ok:', gate.ok, gate.reasons);

const ready = await poolReadyCheck(batch, {
  file: 'lesen-t3-gemini-006.json',
  skipQ2: true,
  skipMetadata: false,
});
console.log('006 poolReady verdict:', ready.verdict, (ready.reasons || []).filter((r) => r.startsWith('t3_')));

// —— Archive duplicates ——
for (const name of ARCHIVE_FROM_GENERATED) {
  const src = path.join(GENERATED, name);
  if (!fs.existsSync(src)) {
    console.log('skip archive (missing):', name);
    continue;
  }
  const dest = path.join(NEEDS, name);
  fs.renameSync(src, dest);
  console.log('archived:', name, '→ needs-regeneration/');
}

console.log('\nKEEP pool-verified: lesen-t3-gemini-006.json (bp-umwelt, gender fixed)');
console.log('KEEP generated: lesen-t3-gemini-009.json (bp-freizeit-garten, otro molde)');
console.log('KEEP generated: lesen-t3-gemini-010.json (bp-ernaehrung, gender OK; bloqueado pool por familia)');
console.log('ARCHIVED: 008, 011 → needs-regeneration');
