import { readFileSync } from 'fs';
import { chk23 } from './audit-pass-2.mjs';

const data = JSON.parse(readFileSync('library/reusable-seed/de_B1.json', 'utf8'));
const records = data.records || [];
let total = 0, withConflict = 0;
const conflictIds = [];

for (const rec of records) {
  total++;
  const findings = chk23(rec, rec.id);
  if (findings.length > 0) {
    withConflict++;
    conflictIds.push({ id: rec.id, msg: findings[0].message.slice(0, 80) });
  }
}

console.log(`Total records: ${total}`);
console.log(`CHK-23 conflicts: ${withConflict}`);
if (conflictIds.length) {
  console.log('Records with conflicts:');
  conflictIds.forEach(c => console.log(`  ${c.id}\n    ${c.msg}`));
} else {
  console.log('✅ Pool is clean — 0 CHK-23 conflicts');
}
