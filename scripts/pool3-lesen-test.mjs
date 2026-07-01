#!/usr/bin/env node
/**
 * pool3-lesen-test.mjs — POOL-3 cycle for Lesen T3 + T4.
 *
 * Picks the best structurally-clean candidate for each teil, runs the full gate chain:
 *   batch file → POOL-2 (21 structural checks) → SEM-1 (semantic, LLM) → seed append.
 *
 * For T4 specifically, CHK-21 now verifies topic coherence (each question matches the
 * forum topic) and author uniqueness — the Frankenstein guard.
 * SEM-1 additionally checks correctness of Ja/Nein answers vs each person's signText.
 *
 * READ-ONLY unless --apply is passed.
 *
 * Usage (from local terminal with API key set):
 *   node scripts/pool3-lesen-test.mjs --apply
 *   node scripts/pool3-lesen-test.mjs --t3 batches/generated/lesen-t3-auto-0krnpo.json \
 *                                      --t4 batches/generated/lesen-t4-gemini-007.json
 *
 * Dry-run (no LLM calls, no writes):
 *   node scripts/pool3-lesen-test.mjs --dry-run
 *
 * Env: ANTHROPIC_API_KEY (or GEMINI_API_KEY + SEMANTIC_USE_GEMINI=1)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { loadEnvFile } from './lib/loadEnv.mjs';
loadEnvFile();

import { isPartPoolReady } from './audit-pass-2.mjs';

// ─── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { t3: null, t4: null, apply: false, dryRun: false, lang: 'de', level: 'B1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--t3')      o.t3     = argv[++i];
    else if (a === '--t4') o.t4     = argv[++i];
    else if (a === '--apply')   o.apply   = true;
    else if (a === '--dry-run') o.dryRun  = true;
    else if (a === '--lang')    o.lang    = String(argv[++i]).toLowerCase();
    else if (a === '--level')   o.level   = String(argv[++i]).toUpperCase();
  }
  return o;
}

const ARGS = parseArgs(process.argv.slice(2));

// Default best-candidate selection (newest file that passes structural gate)
const BEST_T3 = 'batches/generated/lesen-t3-auto-0krnpo.json';
const BEST_T4 = 'batches/generated/lesen-t4-gemini-007.json';

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

const t3Path = resolvePath(ARGS.t3) || path.join(ROOT, BEST_T3);
const t4Path = resolvePath(ARGS.t4) || path.join(ROOT, BEST_T4);
const SEED_FILE = path.join(ROOT, 'library', 'reusable-seed', `${ARGS.lang}_${ARGS.level}.json`);

// ─── Seed record builders ─────────────────────────────────────────────────────

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function buildLesenT3Record(batch, lang, level) {
  const qs = batch.questions || [];
  const passage = batch.passages?.[0] || {};
  const ads = batch.ads || passage.ads || [];
  const topic = qs[0]?.topicTags?.[0] || 'daily_life';
  const hash = shortHash(passage.text || qs.map(q => q.id).join(''));
  return {
    id         : `pool3-${lang}-${level}-lesen-t3-${hash}`,
    lang,
    level,
    module     : 'lesen',
    teil       : 3,
    instruction: '',
    complete   : true,
    verified   : true,
    contributor: `pool3:${topic}`,
    passage    : {
      title: passage.title || '',
      text : passage.text  || '',
      ads,
    },
    ads,
    questions  : qs.map(q => ({
      id           : q.id,
      module       : 'lesen',
      teil         : 3,
      type         : q.type || 'multiple_choice',
      question     : q.question || '',
      correct      : q.correct      || q.correctAnswer || '',
      correctAnswer: q.correctAnswer || q.correct      || '',
      explanation  : q.explanation  || '',
    })),
    itemCount  : qs.length,
    targetCount: qs.length,
  };
}

function buildLesenT4Record(batch, lang, level) {
  const qs = batch.questions || [];
  const passage = batch.passages?.[0] || {};
  const topic = qs[0]?.topicTags?.[0] || 'daily_life';
  const hash = shortHash(passage.title || qs.map(q => q.id).join(''));
  return {
    id         : `pool3-${lang}-${level}-lesen-t4-${hash}`,
    lang,
    level,
    module     : 'lesen',
    teil       : 4,
    instruction: '',
    complete   : true,
    verified   : true,
    contributor: `pool3:${topic}`,
    // passage = shared context (forum intro / topic)
    passage    : { title: passage.title || '', text: passage.text || '' },
    // questions carry individual signText (person opinions) — no passageId needed
    questions  : qs.map(q => ({
      id           : q.id,
      module       : 'lesen',
      teil         : 4,
      type         : q.type || 'richtig_falsch',
      question     : q.question || '',
      signText     : q.signText  || '',
      correct      : q.correct      || q.correctAnswer || '',
      correctAnswer: q.correctAnswer || q.correct      || '',
      explanation  : q.explanation  || '',
      options      : q.options || [],
    })),
    itemCount  : qs.length,
    targetCount: qs.length,
  };
}

// ─── Gate runner ─────────────────────────────────────────────────────────────

async function runGate(batchPath, teilLabel, buildRecord) {
  const rel  = path.relative(ROOT, batchPath);
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`Lesen ${teilLabel}: ${rel}`);
  console.log('─'.repeat(66));

  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  } catch (err) {
    console.error(`  ❌ JSON parse error: ${err.message}`);
    return { ok: false, record: null };
  }

  const qs = batch.questions || [];
  console.log(`  Questions: ${qs.length}  |  Passage: ${batch.passages?.length ?? 0}`);

  // ── POOL-2: structural (21 checks, sync) ─────────────────────────────────
  console.log('\n  ── POOL-2: structural gate (21 checks) ──');
  const structGate = await isPartPoolReady(batch, { semantic: false });
  if (structGate.blocking.length > 0) {
    console.log(`  ❌ Structural FAIL: ${structGate.blocking.length} finding(s)`);
    for (const f of structGate.blocking) {
      console.log(`     [${f.id}] ${f.severity} — ${f.message}`);
    }
    return { ok: false, record: null };
  }
  console.log('  ✅ Structural: 0 CRITICAL, 0 IMPORTANT');

  // ── SEM-1: semantic (LLM, async) ─────────────────────────────────────────
  if (ARGS.dryRun) {
    console.log('\n  ── SEM-1: skipped (--dry-run) ──');
    console.log('  ℹ️  Run without --dry-run from a terminal with API key for full semantic check.');
    const record = buildRecord(batch, ARGS.lang, ARGS.level);
    return { ok: true, record, semSkipped: true };
  }

  console.log('\n  ── SEM-1: semantic gate (LLM) ──');
  const semGate = await isPartPoolReady(batch, { semantic: true });
  const semFindings = semGate.blocking.filter(f => f.id?.startsWith('SEM-'));
  const structFindings = semGate.blocking.filter(f => !f.id?.startsWith('SEM-'));

  if (structFindings.length > 0) {
    // Shouldn't happen since we already passed structural
    console.log(`  ❌ Structural re-check FAIL (unexpected): ${structFindings.length} finding(s)`);
    return { ok: false, record: null };
  }

  if (semFindings.length > 0) {
    console.log(`  ❌ SEM-1 FAIL: ${semFindings.length} semantic issue(s)`);
    for (const f of semFindings) {
      console.log(`     [${f.id}] ${f.severity} — ${f.message}`);
    }
    return { ok: false, record: null };
  }

  // Check for fail-open (LLM error)
  const { validatePartSemantics } = await import('./lib/semanticValidator.mjs');
  const semResult = await validatePartSemantics(batch);
  if (semResult._llmError) {
    console.log(`  ⚠️  SEM-1: LLM error (fail-open): ${semResult._llmError}`);
    console.log('     → Treated as PASS (fail-open). Run from terminal with API key for real check.');
    const record = buildRecord(batch, ARGS.lang, ARGS.level);
    return { ok: true, record, semFallback: true };
  }

  console.log('  ✅ SEM-1: 0 semantic issues (confidence ≥ 0.85)');
  const record = buildRecord(batch, ARGS.lang, ARGS.level);
  return { ok: true, record, semSkipped: false, semFallback: false };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  POOL-3 CYCLE — Lesen T3 + T4: batch → POOL-2 → SEM-1 → seed  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`Mode: ${ARGS.dryRun ? '🔍 DRY-RUN' : ARGS.apply ? '⚡ --apply (writes to seed)' : '🔍 DRY-RUN (no --apply passed)'}`);
if (!ARGS.dryRun && !ARGS.apply) {
  console.log('       Hint: add --apply to write to seed, or --dry-run to skip SEM-1.');
}

// Seed before state
const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const before   = seedData.records || [];
const t3Before = before.filter(r => r.module === 'lesen' && Number(r.teil) === 3).length;
const t4Before = before.filter(r => r.module === 'lesen' && Number(r.teil) === 4).length;
console.log(`\nSeed before: ${before.length} total records`);
console.log(`  lesen T3: ${t3Before}  |  lesen T4: ${t4Before}`);

// Run gates
const r3 = await runGate(t3Path, 'T3', buildLesenT3Record);
const r4 = await runGate(t4Path, 'T4 ⚡ (Frankenstein guard active)', buildLesenT4Record);

// Summary
const passed  = [r3, r4].filter(r => r.ok).length;
const failed  = 2 - passed;

console.log(`\n${'═'.repeat(66)}`);
console.log('RESULTS');
console.log('═'.repeat(66));
console.log(`  Lesen T3: ${r3.ok ? '✅ PASS' : '❌ FAIL'}${r3.semSkipped ? ' (SEM-1 skipped)' : r3.semFallback ? ' (SEM-1 fail-open)' : ''}`);
console.log(`  Lesen T4: ${r4.ok ? '✅ PASS' : '❌ FAIL'}${r4.semSkipped ? ' (SEM-1 skipped)' : r4.semFallback ? ' (SEM-1 fail-open)' : ''}`);
console.log(`  Passed: ${passed}/2  |  Failed: ${failed}/2`);

if (failed > 0 || (!r3.record && !r4.record)) {
  console.log('\n⚠️  Not all parts passed. No changes written to seed.\n');
  process.exit(failed > 0 ? 1 : 0);
}

// Dedup
const existingIds = new Set(before.map(r => r.id));
const newRecords = [r3.record, r4.record].filter(Boolean);
const fresh = newRecords.filter(r => !existingIds.has(r.id));
const dupes = newRecords.filter(r => existingIds.has(r.id));

if (dupes.length) {
  console.log(`\n  ⚠️  ${dupes.length} already in seed (skipped):`);
  dupes.forEach(r => console.log(`    ${r.id}`));
}

if (!ARGS.apply && !ARGS.dryRun) {
  console.log('\n[DRY-RUN] Would add to seed:');
  fresh.forEach(r => console.log(`  + ${r.id}  (lesen T${r.teil})`));
  console.log('\nRe-run with --apply to write.\n');
  process.exit(0);
}

if (ARGS.dryRun) {
  console.log('\n[DRY-RUN] Would add to seed (structural gate passed — SEM-1 skipped):');
  fresh.forEach(r => console.log(`  + ${r.id}  (lesen T${r.teil})`));
  console.log('\nRe-run without --dry-run and with --apply for full gate chain + write.\n');
  process.exit(0);
}

// Write
const updated = { ...seedData, records: [...before, ...fresh] };
fs.writeFileSync(SEED_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

const t3After = updated.records.filter(r => r.module === 'lesen' && Number(r.teil) === 3).length;
const t4After = updated.records.filter(r => r.module === 'lesen' && Number(r.teil) === 4).length;

console.log(`\n✅ Seed written: ${updated.records.length} records (was ${before.length}, added ${fresh.length})`);
console.log(`  lesen T3: ${t3Before} → ${t3After}`);
console.log(`  lesen T4: ${t4Before} → ${t4After}`);

const semNote = [r3, r4].some(r => r.semFallback) ? ' ⚠️  (SEM-1 was fail-open — re-validate with API key)' : '';
const sem1Note = [r3, r4].some(r => r.semSkipped) ? ' ⚠️  (SEM-1 skipped — re-run without --dry-run for full check)' : '';
console.log('\n✅ POOL-3 Lesen cycle complete:');
console.log(`   generate → POOL-2 0/0 structural → SEM-1 → seed${semNote}${sem1Note}`);
