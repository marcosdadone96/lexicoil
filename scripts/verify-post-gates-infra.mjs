#!/usr/bin/env node
/**
 * Deterministic infra checks after Gates 0–5 (no API, no content generation).
 *   node scripts/verify-post-gates-infra.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PASSAGE_VOCAB_ENRICH_BACKLOG,
  bankPassagesExcludingEnrichBacklog,
} from './lib/bankPassageEnrichBacklog.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, args) {
  console.log(`\n══ ${label} ══\n`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function checkBankPassageSync() {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'));
  const passagesFile = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'library/de/B1/passages.json'), 'utf8'),
  );
  const ps = bank.passages || [];
  const indexed = bankPassagesExcludingEnrichBacklog(ps);
  const pf = passagesFile.passages || [];
  if (pf.length !== indexed.length) {
    console.error(
      `FAIL passages.json sync: file=${pf.length} bank(excl backlog)=${indexed.length}`,
    );
    process.exit(1);
  }
  for (const id of PASSAGE_VOCAB_ENRICH_BACKLOG) {
    if (!ps.some((p) => p.id === id)) {
      console.error(`FAIL backlog id missing in bank: ${id}`);
      process.exit(1);
    }
  }
  const bad = indexed.filter((p) => (p.passageVocab || []).length < 10);
  if (bad.length) {
    console.error(`FAIL ${bad.length} passage(s) without passageVocab (excl backlog)`);
    process.exit(1);
  }
  console.log(
    `OK   bank passages: ${ps.length} total, ${PASSAGE_VOCAB_ENRICH_BACKLOG.size} enrich backlog, ${indexed.length} indexed`,
  );
}

checkBankPassageSync();

run('bankPassageEnrichBacklog', ['scripts/lib/__tests__/bankPassageEnrichBacklog.test.mjs']);
run('eval-phase0-gate (baseline)', ['batches/ready/gate-logs/eval-phase0-gate.mjs']);
run('eval-phase5-gate (artifacts)', ['batches/ready/gate-logs/eval-phase5-gate.mjs']);
run('eval-phase4-gate (dry-run JSON)', ['batches/ready/gate-logs/eval-phase4-gate.mjs']);

run('german-caps-normalize (iter3)', ['scripts/lib/__tests__/germanCapsNormalize.iter3.test.mjs']);
run('capitalizeNouns unit', ['scripts/lib/__tests__/capitalizeNouns.test.mjs']);
run('lesen T5 subtype vocab', ['scripts/lib/__tests__/lesenT5SubtypeVocab.test.mjs']);
run('verify-t5-topic-gate', ['scripts/verify-t5-topic-gate.mjs']);
run('verify-p0-p1-gates', ['scripts/verify-p0-p1-gates.mjs']);
run('verify-fixes-raiz', ['scripts/verify-fixes-raiz-2026-07-27.mjs']);
run('balance-mcq-contract', ['scripts/lib/__tests__/balanceMcq.writerContract.test.mjs']);
run('balance-mcq-contract (core)', ['scripts/lib/__tests__/balanceMcq.test.mjs']);
run('vocab-personalization', ['scripts/test-vocab-personalization.mjs']);
run('pool-quality-parity', ['scripts/test-pool-quality-parity.mjs']);

console.log('\n══ assemble dry-run (pool-verified) ══\n');
const asm = spawnSync(
  process.execPath,
  ['scripts/assemble-from-pool-verified.mjs', '--dry-run'],
  { cwd: ROOT, encoding: 'utf8', shell: false, maxBuffer: 8 * 1024 * 1024 },
);
if (asm.status !== 0) {
  process.stderr.write(asm.stderr || asm.stdout || '');
  process.exit(asm.status ?? 1);
}
if (/AUDIT-ERROR|nextLc is not defined/i.test(asm.stdout + asm.stderr)) {
  console.error('FAIL assemble dry-run: AUDIT-ERROR in output');
  process.exit(1);
}
const cap = (asm.stdout || '').match(/min stock = (\d+)/);
console.log(`OK   assemble dry-run (min stock ${cap?.[1] ?? '?'})`);

console.log('\n✅ Post-gates infra verify passed.\n');
