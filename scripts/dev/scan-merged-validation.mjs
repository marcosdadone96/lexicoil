import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const dir = path.join('batches', 'merged');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const bad = [];

for (const f of files) {
  const rel = path.join('batches', 'merged', f).replace(/\\/g, '/');
  try {
    execSync(`node scripts/validate-batch.mjs --lang de --level B1 --file "${rel}"`, {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    if (out.includes('id ya existe')) bad.push({ f, kind: 'dup' });
    else if (out.includes('type_not_allowed') || out.includes('Conformidad blueprint: FAIL')) {
      bad.push({ f, kind: 'format' });
    } else bad.push({ f, kind: 'other' });
  }
}

console.log(`Would fail validate: ${bad.length}`);
for (const b of bad) console.log(`${b.kind}\t${b.f}`);
