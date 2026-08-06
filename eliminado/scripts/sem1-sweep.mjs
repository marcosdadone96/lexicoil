#!/usr/bin/env node
/**
 * sem1-sweep.mjs — SEM-1 sweep over ALL structurally-clean pool parts.
 *
 * The matrix (pool-health-report) marks a part as "clean" when it passes auditExam
 * with no IMPORTANT-or-worse findings.  This script applies exactly that same filter,
 * then runs the semantic validator (SEM-1) on every clean MCQ part.
 *
 * Parts the matrix calls clean but SEM-1 flags are "structurally OK, content buggy".
 * These should be regenerated in POOL-3, not reused.
 *
 * Results written to sem1-findings-baseline.json (root of repo).
 * READ-ONLY — no pool mutations.
 *
 * Usage:
 *   node scripts/sem1-sweep.mjs                         # full sweep
 *   node scripts/sem1-sweep.mjs --dry-run               # count clean parts, skip LLM
 *   node scripts/sem1-sweep.mjs --module lesen          # filter by module
 *   node scripts/sem1-sweep.mjs --module lesen --teil 4 # filter by module + teil
 *   node scripts/sem1-sweep.mjs --teil 2                # filter by teil (all modules)
 *   node scripts/sem1-sweep.mjs --lang de --level B1    # (defaults; change for other pools)
 *
 * Env:
 *   ANTHROPIC_API_KEY / GEMINI_API_KEY  — required for LLM calls
 *   SEM_SWEEP_PAUSE_MS                  — ms between calls (default 1500)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { loadEnvFile } from './lib/loadEnv.mjs';
loadEnvFile();

import { auditExam } from './audit-pass-2.mjs';
import {
  validatePartSemantics,
  clearSemanticCache,
  clearTemplateRegistry,
  _setLlmFn,
} from './lib/semanticValidator.mjs';

// ─── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    module: null,
    teil: null,
    dryRun: false,
    pauseMs: Number(process.env.SEM_SWEEP_PAUSE_MS || 1500),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang')   o.lang   = String(argv[++i]).toLowerCase();
    else if (a === '--level')  o.level  = String(argv[++i]).toUpperCase();
    else if (a === '--module') o.module = String(argv[++i]).toLowerCase();
    else if (a === '--teil')   o.teil   = Number(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
  }
  return o;
}

const ARGS = parseArgs(process.argv.slice(2));

// ─── Same structural-audit helpers as pool-health-report ─────────────────────
// (Inlined so this script uses the exact same "clean" definition as the matrix.)

const MODULE_PARTS_KEY = {
  lesen:    'lesenParts',
  horen:    'horenParts',
  schreiben:'schreibenParts',
  sprechen: 'sprechenParts',
};

/** Modules that have no MCQ items — SEM-1 has nothing to validate. */
const SKIP_SEMANTIC_MODULES = new Set(['schreiben', 'sprechen']);

function normType(type) {
  const t = String(type || '');
  if (t === 'multiple' || t === 'mcq') return 'multiple_choice';
  if (t === 'true_false') return 'richtig_falsch';
  return t;
}

function normQuestion(q, module, teil) {
  return {
    ...q,
    module,
    teil,
    type: normType(q.type || q.questionType),
    correctAnswer: q.correctAnswer ?? q.correct,
    question: q.question || q.signText || q.statement || '',
  };
}

function recordToExamPart(record) {
  const module = String(record.module || '').toLowerCase();
  const teil   = Number(record.teil);
  const part   = { teil, instruction: record.instruction || '' };

  if (module === 'lesen') {
    const passage = record.passage || {};
    if (Array.isArray(passage.passages) && passage.passages.length >= 2) {
      part.passages   = passage.passages;
      part.textTitle  = passage.title || '';
    } else if (teil === 3) {
      part.text       = passage.text || '';
      part.textTitle  = passage.title || '';
      part.ads        = passage.ads || record.ads || [];
    } else if (teil === 4) {
      if (Array.isArray(record.passages)) part.passages = record.passages;
      if (Array.isArray(record.ads))      part.ads      = record.ads;
    } else {
      part.text       = passage.text || '';
      part.textTitle  = passage.title || '';
      part.passageId  = record.questions?.[0]?.passageId || passage.passageId;
    }
    part.questions = (record.questions || []).map((q) => normQuestion(q, module, teil));
    if (record.example) part.example = record.example;
  } else if (module === 'horen') {
    if (Array.isArray(record.segments) && record.segments.length) {
      part.segments = record.segments.map((seg) => ({
        ...seg,
        questions: (seg.questions || []).map((q) => normQuestion(q, module, teil)),
      }));
    }
    const passage = record.passage || {};
    part.transcript = passage.transcript || passage.text || '';
    part.questions  = (record.questions || []).map((q) => normQuestion(q, module, teil));
  } else if (module === 'schreiben' || module === 'sprechen') {
    part.task       = record.task || record.instruction || '';
    part.minWords   = record.minWords;
    part.maxWords   = record.maxWords;
    part.fieldId    = record.fieldId;
    part.taskFormat = record.taskFormat;
    const task = part.task;
    part.questions  = (record.questions || []).length
      ? record.questions.map((q) => normQuestion(q, module, teil))
      : [{ id: '1', type: 'short_answer', question: task, correct: 'rubric', correctAnswer: 'rubric', module, teil }];
  } else {
    return null;
  }
  return part;
}

function recordToExamWrapper(record) {
  const module   = String(record.module || '').toLowerCase();
  const partsKey = MODULE_PARTS_KEY[module];
  if (!partsKey) return null;
  const part = recordToExamPart(record);
  if (!part) return null;
  return { exam: { [partsKey]: [part] } };
}

/** CHK-3 "Teil ausente" fires when auditing a single part — suppress it. */
function filterPartFindings(findings) {
  return findings.filter((f) => {
    if (f.severity === 'INFO') return false;
    if (f.id === 'CHK-3' && String(f.message).includes('Teil ausente')) return false;
    return true;
  });
}

function auditPartRecord(record) {
  const wrapper = recordToExamWrapper(record);
  if (!wrapper) return { clean: false, byChk: { 'CHK-?': 1 } };
  const audit    = auditExam(wrapper, record.id || 'part');
  const findings = filterPartFindings(audit.findings);
  const important = findings.filter((f) => f.severity === 'IMPORTANT');
  const byChk = {};
  for (const f of important) byChk[f.id] = (byChk[f.id] || 0) + 1;
  return { clean: important.length === 0, byChk, importantCount: important.length };
}

// ─── Load pool ────────────────────────────────────────────────────────────────
const POOL_FILE = path.join(ROOT, 'library', 'reusable-seed', `${ARGS.lang}_${ARGS.level}.json`);
if (!fs.existsSync(POOL_FILE)) {
  console.error('Pool file not found:', POOL_FILE);
  process.exit(1);
}
const { records: allRecords } = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));

// Apply CLI filters (module / teil)
const filtered = allRecords.filter((r) => {
  if (ARGS.module && String(r.module || '').toLowerCase() !== ARGS.module) return false;
  if (ARGS.teil   && Number(r.teil) !== ARGS.teil) return false;
  return true;
});

console.log(`\nSEM-1 SWEEP — pool ${ARGS.lang.toUpperCase()} ${ARGS.level}`);
console.log(`Total records in pool : ${allRecords.length}`);
if (ARGS.module || ARGS.teil) {
  const filterDesc = [ARGS.module, ARGS.teil ? `T${ARGS.teil}` : null].filter(Boolean).join(' ');
  console.log(`Filter active         : ${filterDesc} → ${filtered.length} record(s)`);
}

// ─── Step 1: structural audit → classify clean / dirty / skip ────────────────
console.log('\n─── Step 1: structural audit (same logic as pool-health-report) ───\n');

const cleanParts    = [];
const dirtyParts    = [];
const skippedModules = [];

for (const record of filtered) {
  const module = String(record.module || '').toLowerCase();
  if (SKIP_SEMANTIC_MODULES.has(module)) {
    skippedModules.push(record);
    continue;
  }
  const verdict = auditPartRecord(record);
  if (verdict.clean) {
    cleanParts.push(record);
  } else {
    dirtyParts.push({ record, byChk: verdict.byChk });
  }
}

console.log(`  Structurally clean (→ SEM-1 target) : ${cleanParts.length}`);
console.log(`  Structurally dirty (skip SEM-1)      : ${dirtyParts.length}`);
console.log(`  Skipped (no MCQ: schreiben/sprechen) : ${skippedModules.length}`);
console.log(`  Total                                : ${filtered.length}`);

if (dirtyParts.length > 0) {
  const chkTally = {};
  for (const { byChk } of dirtyParts) {
    for (const [k, n] of Object.entries(byChk)) chkTally[k] = (chkTally[k] || 0) + n;
  }
  const chkStr = Object.entries(chkTally)
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => `${k}×${n}`)
    .join(', ');
  console.log(`  Dirty by check                       : ${chkStr}`);
}

if (ARGS.dryRun) {
  console.log('\n[--dry-run] Structural audit complete. LLM calls skipped.\n');
  process.exit(0);
}

if (cleanParts.length === 0) {
  console.log('\nNo structurally-clean MCQ parts to sweep. sem1-findings-baseline.json not written.\n');
  process.exit(0);
}

// ─── Provider check ───────────────────────────────────────────────────────────
{
  const useGemini = !!process.env.SEMANTIC_USE_GEMINI &&
    !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const provider = useGemini
    ? `Gemini (${process.env.GEMINI_MODEL || 'gemini-2.5-flash'})`
    : `Claude (${process.env.CLAUDE_GEN_MODEL || 'claude-haiku-4-5'})`;
  const keySet = useGemini
    ? !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    : !!process.env.ANTHROPIC_API_KEY;
  console.log(`\nProvider: ${provider} | Key set: ${keySet ? 'yes' : '⚠  NO'}`);
  if (!keySet) { console.error('API key missing. Set ANTHROPIC_API_KEY (or GEMINI_API_KEY).'); process.exit(1); }
}

// ─── Step 2: SEM-1 sweep on clean parts ───────────────────────────────────────
console.log(`\n─── Step 2: SEM-1 semantic sweep (${cleanParts.length} parts) ───\n`);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

clearSemanticCache();
clearTemplateRegistry();

const sweepResults = [];   // { record, ok, issues, error }
let llmErrorCount  = 0;

// Group parts by module/teil for display
function partLabel(r) {
  return `${r.module}-T${r.teil} [${r.id || 'no-id'}]`;
}

for (let i = 0; i < cleanParts.length; i++) {
  const record = cleanParts[i];
  const label  = partLabel(record);
  process.stdout.write(`  [${String(i + 1).padStart(3)}/${cleanParts.length}] ${label.padEnd(50)} … `);

  try {
    clearSemanticCache(); // no cross-part cache bleed
    const result = await validatePartSemantics(record);

    if (result._llmError) {
      console.log(`⚠  LLM-ERROR: ${result._llmError}`);
      sweepResults.push({ record, ok: null, error: result._llmError });
      llmErrorCount++;
    } else if (result.ok) {
      console.log('✅ ok');
      sweepResults.push({ record, ok: true, issues: [] });
    } else {
      console.log(`❌ ${result.issues.length} issue(s)`);
      for (const iss of result.issues) {
        const conf = typeof iss.confidence === 'number' ? ` (conf=${iss.confidence.toFixed(2)})` : '';
        console.log(`       ${iss.kind.padEnd(12)} [${iss.itemId}]${conf}  ${iss.detail}`);
      }
      sweepResults.push({ record, ok: false, issues: result.issues });
    }
  } catch (err) {
    console.log(`⚠  ERROR: ${err.message}`);
    sweepResults.push({ record, ok: null, error: err.message });
    llmErrorCount++;
  }

  if (i < cleanParts.length - 1) await sleep(ARGS.pauseMs);
}

// ─── Step 3: summary ─────────────────────────────────────────────────────────
const okCount   = sweepResults.filter((r) => r.ok === true).length;
const flagCount = sweepResults.filter((r) => r.ok === false).length;
const errCount  = sweepResults.filter((r) => r.ok === null).length;

console.log('\n' + '═'.repeat(70));
console.log('SEM-1 SWEEP — RESUMEN');
console.log('═'.repeat(70));
console.log(`  Parts swept        : ${cleanParts.length}`);
console.log(`  ✅ Semánticamente ok : ${okCount}`);
console.log(`  ❌ Bugs semánticos  : ${flagCount}  ← must NOT be reused (POOL-3 regenerate)`);
console.log(`  ⚠  LLM errors      : ${errCount}   ← not counted, re-run to confirm`);
if (errCount > 0) {
  console.log('\n  ⚠  Some parts had LLM errors (fail-open). Check API key / network.');
  console.log('     Re-run those parts after confirming connectivity.\n');
}

// ─── Step 4: write baseline JSON ─────────────────────────────────────────────
const findings = sweepResults
  .filter((r) => r.ok === false)
  .map((r) => ({
    partId : r.record.id,
    module : r.record.module,
    teil   : r.record.teil,
    theme  : r.record.theme || r.record.contributor || '_untagged',
    issues : r.issues.map((iss) => ({
      kind      : iss.kind,
      itemId    : iss.itemId,
      confidence: iss.confidence,
      detail    : iss.detail,
    })),
  }));

const errors = sweepResults
  .filter((r) => r.ok === null)
  .map((r) => ({ partId: r.record.id, module: r.record.module, teil: r.record.teil, error: r.error }));

const baseline = {
  generated          : new Date().toISOString(),
  pool               : POOL_FILE,
  lang               : ARGS.lang,
  level              : ARGS.level,
  filter             : { module: ARGS.module, teil: ARGS.teil },
  description        : 'Parts the structural matrix marks clean but SEM-1 flags for content bugs (conf ≥ 0.85). Must be regenerated in POOL-3.',
  confidenceThreshold: 0.85,
  stats: {
    totalInPool        : allRecords.length,
    filtered           : filtered.length,
    structurallyClean  : cleanParts.length,
    structurallyDirty  : dirtyParts.length,
    skippedNoMcq       : skippedModules.length,
    semOk              : okCount,
    semFlagged         : flagCount,
    semLlmError        : errCount,
  },
  findings,
  llmErrors: errors,
};

const OUT_FILE = path.join(ROOT, 'sem1-findings-baseline.json');
fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2), 'utf8');

if (flagCount > 0) {
  console.log(`\n📄 sem1-findings-baseline.json — ${flagCount} parte(s) con bugs semánticos.`);
} else {
  console.log('\n✅ 0 bugs semánticos detectados — sem1-findings-baseline.json actualizado con stats.');
}
console.log(`   ${OUT_FILE}\n`);
