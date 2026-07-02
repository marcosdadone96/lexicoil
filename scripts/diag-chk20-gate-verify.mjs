/**
 * Quick verify: the 1 H1 record with CHK-20 is now blocked by isExamPublishable.
 */
import { readFileSync } from 'fs';
import { isExamPublishable, GATE_BLOCK_CHECKS, GATE_BLOCK_PENDING } from './audit-pass-2.mjs';

console.log('GATE_BLOCK_CHECKS:', [...GATE_BLOCK_CHECKS].join(', '));
console.log('GATE_BLOCK_PENDING:', [...GATE_BLOCK_PENDING].join(', '));
console.log('');

const pool = JSON.parse(readFileSync('library/reusable-seed/de_B1.json', 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || pool.parts || []);

const MODULE_PARTS_KEY = { lesen:'lesenParts', horen:'horenParts', schreiben:'schreibenParts', sprechen:'sprechenParts' };

for (const rec of records.filter(r => r.module === 'horen' && Number(r.teil) === 1)) {
  const partsKey = MODULE_PARTS_KEY[rec.module];
  const exam = { exam: { [partsKey]: [rec] } };
  const res = isExamPublishable(exam);
  const chk20 = res.blocking.some(f => f.id === 'CHK-20');
  const chk18 = res.pending?.some(f => f.id === 'CHK-18') ?? false;
  const shortId = (rec.id || '').slice(-20);
  console.log(`H1 ${shortId}: ok=${res.ok}  CHK-20 in blocking=${chk20}  CHK-18 in pending=${chk18}  blocking=[${res.blocking.map(f=>f.id).join(',')}]`);
}
