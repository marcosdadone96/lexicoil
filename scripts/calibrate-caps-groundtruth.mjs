#!/usr/bin/env node
/**
 * Ground-truth harness for German caps POS gate.
 * Run: node scripts/calibrate-caps-groundtruth.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { classifyTextRegime, REGIME } from './lib/textRegime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT_PATH = path.join(ROOT, 'scripts/lib/__tests__/germanCapsGate.groundtruth.json');
const READY = path.join(ROOT, 'batches/ready/lesen');
const GENERATED = path.join(ROOT, 'batches/generated');

const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8'));

function poolDir(pool) {
  if (pool === 'generated') return GENERATED;
  return READY;
}

function getFieldText(spec) {
  if (spec.text) return spec.text;
  const pool = poolDir(spec.pool || 'ready');
  const abs = path.join(pool, spec.file);
  if (!fs.existsSync(abs)) return null;
  const batchObj = JSON.parse(fs.readFileSync(abs, 'utf8'));

  if (spec.field === 'passages.text') {
    const idx = spec.passageIndex ?? 0;
    return batchObj.passages?.[idx]?.text ?? null;
  }
  if (spec.field === 'questions.options') {
    for (const q of batchObj.questions || []) {
      for (const opt of q.options || []) {
        const s = typeof opt === 'string' ? opt : opt?.text;
        if (s && s.includes(spec.token)) return s;
      }
    }
    return null;
  }
  if (spec.field === 'questions.question') {
    for (const q of batchObj.questions || []) {
      if (q.question?.includes(spec.token)) return q.question;
    }
  }
  if (spec.field === 'questions.explanation') {
    for (const q of batchObj.questions || []) {
      if (q.explanation?.includes(spec.token)) return q.explanation;
    }
  }
  if (spec.field === 'questions.signText') {
    for (const q of batchObj.questions || []) {
      if (q.signText?.includes(spec.token)) return q.signText;
    }
  }
  return null;
}

function normWord(w) {
  return String(w || '').toLowerCase();
}

function findingMatches(f, token, type) {
  if (type && f.type !== type) return false;
  return normWord(f.word) === normWord(token);
}

// ── MUST_CATCH ───────────────────────────────────────────────────────────────
const catchItems = [];
const catchMeta = [];

for (const spec of gt.MUST_CATCH) {
  const text = getFieldText(spec);
  if (!text) {
    catchMeta.push({ ...spec, text: null, error: 'text_not_found' });
    continue;
  }
  const id = spec.id;
  catchItems.push({ id, field: spec.field, text, file: spec.file || '' });
  catchMeta.push({ ...spec, text });
}

const catchResult = runPosCapsBulk(catchItems);
if (catchResult.skipped) {
  console.error('Gate unavailable:', catchResult.warning);
  process.exit(2);
}

const catchMisses = [];
let catchHits = 0;

for (const spec of catchMeta) {
  if (spec.error) {
    catchMisses.push({ ...spec, reason: spec.error });
    continue;
  }
  const findings = (catchResult.findings || []).filter((f) => f.id === spec.id);
  const hit = findings.some((f) => findingMatches(f, spec.token, spec.type));
  if (hit) catchHits += 1;
  else {
    catchMisses.push({
      id: spec.id,
      token: spec.token,
      type: spec.type,
      reason: findings.length
        ? `flagged other: ${findings.map((f) => `${f.type}:${f.word}`).join(', ')}`
        : 'not_flagged',
    });
  }
}

const catchTotal = gt.MUST_CATCH.length;
const catchKnownFn = new Set((gt.KNOWN_FN || []).map((k) => k.id));
const catchScored = catchTotal - catchKnownFn.size;
const catchScoredHits = catchHits - [...catchKnownFn].filter((id) =>
  !catchMisses.some((m) => m.id === id),
).length;
const recall = catchScored > 0 ? catchScoredHits / catchScored : 1;

// ── MUST_NOT_FLAG ────────────────────────────────────────────────────────────
const notItems = gt.MUST_NOT_FLAG.map((spec) => ({
  id: spec.id,
  field: spec.field || 'passages.text',
  text: spec.text,
  file: spec.file || '',
}));
const notResult = runPosCapsBulk(notItems);
const falsePositives = [];

for (const spec of gt.MUST_NOT_FLAG) {
  const findings = (notResult.findings || []).filter((f) => f.id === spec.id);
  if (findings.length) {
    falsePositives.push({
      id: spec.id,
      text: spec.text.slice(0, 80),
      findings: findings.map((f) => `${f.type}:${f.word}(${f.tag})`),
    });
  }
}

// ── MUST_PROSE (regime classifier only) ──────────────────────────────────────
const mustProseMisses = [];
for (const spec of gt.MUST_PROSE || []) {
  const { regime } = classifyTextRegime({
    text: spec.text,
    field: spec.field || 'passages.text',
    file: spec.file || '',
  });
  if (regime !== REGIME.PROSE) {
    mustProseMisses.push({ id: spec.id, regime, text: spec.text.slice(0, 60) });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('══ German caps gate — ground truth harness ══\n');
console.log(`MUST_CATCH: ${catchHits}/${catchTotal} hits (recall ${(recall * 100).toFixed(1)}% on ${catchScored} scored)`);
console.log(`MUST_NOT_FLAG: ${gt.MUST_NOT_FLAG.length - falsePositives.length}/${gt.MUST_NOT_FLAG.length} clean (FP ${falsePositives.length})`);
if (gt.MUST_PROSE?.length) {
  console.log(`MUST_PROSE: ${gt.MUST_PROSE.length - mustProseMisses.length}/${gt.MUST_PROSE.length} classified PROSE`);
}

const passRecall = recall >= 0.9;
const passFp = falsePositives.length === 0;
const passProse = mustProseMisses.length === 0;
console.log(`\nCriteria: recall ≥90% → ${passRecall ? 'PASS' : 'FAIL'} | FP=0 → ${passFp ? 'PASS' : 'FAIL'} | MUST_PROSE → ${passProse ? 'PASS' : 'FAIL'}`);

if (catchMisses.length) {
  console.log('\n── MUST_CATCH misses ──');
  for (const m of catchMisses) {
    if (catchKnownFn.has(m.id)) {
      console.log(`  KNOWN_FN  ${m.id}  ${m.token}`);
      continue;
    }
    console.log(`  MISS  ${m.id}  ${m.token}  (${m.reason})`);
  }
}

if (falsePositives.length) {
  console.log('\n── MUST_NOT_FLAG false positives ──');
  for (const fp of falsePositives) {
    console.log(`  FP  ${fp.id}  ${fp.findings.join('; ')}`);
    console.log(`      «${fp.text}…»`);
  }
}

if (mustProseMisses.length) {
  console.log('\n── MUST_PROSE regime misses ──');
  for (const m of mustProseMisses) {
    console.log(`  MISS  ${m.id}  got ${m.regime}`);
    console.log(`      «${m.text}…»`);
  }
}

if (gt.KNOWN_FN?.length) {
  console.log('\n── KNOWN_FN (excluded from recall) ──');
  for (const k of gt.KNOWN_FN) console.log(`  - ${k.id}: ${k.note || ''}`);
}

process.exit(passRecall && passFp && passProse ? 0 : 1);
