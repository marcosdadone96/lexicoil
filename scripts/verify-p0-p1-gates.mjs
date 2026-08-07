#!/usr/bin/env node
/**
 * Verifica que batches con defectos conocidos (157, 075) son RECHAZADOS por P0+P1 gates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLexical } from './lib/lexicalCheck.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadBatch(name) {
  const candidates = [
    path.join(ROOT, 'batches/generated', name),
    path.join(ROOT, 'batches/ready/pool-content-ok-lesen/B1', name),
    path.join(ROOT, 'batches/ready/pool-verified/B1', name),
    path.join(ROOT, 'batches/needs-regeneration/B1', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error(`Fixture not found: ${name}`);
}

async function expectRejected(label, batch, { expectLexical = true, expectPool = true, expectChk26 = true } = {}) {
  const lex = checkLexical(batch);
  const pool = await isPartPoolReady(batch);
  const chk26 = (pool.blocking || []).filter((f) => f.id === 'CHK-26');
  const chk6b = (pool.blocking || []).filter(
    (f) => f.id === 'CHK-6' && String(f.message).includes('B2+'),
  );

  console.log(`\n=== ${label} ===`);
  console.log(`  checkLexical: ${lex.ok ? 'PASS (FAIL esperado)' : 'FAIL ✓'}`);
  if (!lex.ok) console.log(`    → ${lex.issues[0]}`);

  console.log(`  isPartPoolReady: ${pool.ok ? 'PASS (FAIL esperado)' : 'FAIL ✓'}`);
  if (!pool.ok) {
    for (const f of pool.blocking.slice(0, 4)) {
      console.log(`    → [${f.id}] ${f.message.slice(0, 90)}`);
    }
  }

  const lexicalOk = expectLexical ? !lex.ok : true;
  const poolOk = expectPool ? !pool.ok : true;
  const chk26Ok = expectChk26 ? chk26.length > 0 : true;
  const chk6Ok = expectLexical ? chk6b.length > 0 || !lex.ok : true;

  if (!lexicalOk || !poolOk || !chk26Ok) {
    console.log('  RESULTADO: NO RECHAZADA — fix incompleto');
    return false;
  }
  console.log('  RESULTADO: RECHAZADA ✓');
  return true;
}

const b157 = loadBatch('lesen-t1-gemini-157.json');
const b075 = loadBatch('lesen-t2-gemini-075.json');

let ok = true;
ok = (await expectRejected('157 (T1 vocab B2 + topic Freizeit≠Technik)', b157, { expectChk26: false })) && ok;
ok = (await expectRejected('075 (T2 Technik+Bildung)', b075, { expectChk26: false })) && ok;

if (!ok) process.exit(1);
console.log('\nverify-p0-p1-gates: OK');
