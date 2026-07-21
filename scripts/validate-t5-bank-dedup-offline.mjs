/**
 * Offline validation: bank-dedup gate on historical dup batches + pool-verified baseline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assertLesenT5NotBankDuplicate } from './lib/lesenT5BankBlocklist.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';

const dupBatches = ['084', '085', '086', '087', '088', '089', '090'];
const roots = [
  'batches/ready/pool-content-ok-lesen/B1',
  'batches/generated/B1',
  'batches/needs-regeneration/B1',
];

let histFail = 0;
for (const n of dupBatches) {
  const fn = `lesen-t5-gemini-${n}.json`;
  let file = null;
  for (const r of roots) {
    const p = path.join(r, fn);
    if (fs.existsSync(p)) { file = p; break; }
  }
  if (!file) continue;
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = assertLesenT5NotBankDuplicate(b, { lang: 'de', level: 'B1' });
  if (!r.ok) histFail++;
  console.log(n, r.ok ? 'PASS (unexpected)' : `BLOCK ${r.matchTitle?.slice(0, 40)}`);
}

const pv = listPoolVerifiedJson('B1').filter((f) => f.includes('lesen-t5'));
let pvPass = 0;
let pvDup = 0;
for (const f of pv) {
  const b = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = assertLesenT5NotBankDuplicate(b, { lang: 'de', level: 'B1' });
  if (r.ok) pvPass++;
  else pvDup++;
}
console.log(`\nHistorical dup batches blocked: ${histFail}/${dupBatches.length}`);
console.log(`Pool-verified T5: ${pvPass} pass bank-dedup, ${pvDup} would block (${pv.length} total)`);
