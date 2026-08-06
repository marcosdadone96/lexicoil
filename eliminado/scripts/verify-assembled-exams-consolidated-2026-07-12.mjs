#!/usr/bin/env node
/**
 * Consolidated verification on source batches used by assembled exams only.
 * Gates: date/weekday, explanation option resync, separables smoke, caps bad patterns, MCQ position letters.
 *
 *   node scripts/verify-assembled-exams-consolidated-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findDateWeekdayMismatches } from './lib/qualityGates/dateWeekdayGate.mjs';
import { GERMAN_CAPS_NORMALIZE_VERSION } from './lib/germanCapsNormalize.mjs';
import { BALANCE_MCQ_VERSION } from './lib/balanceMcq.mjs';
import { capitalizeNounsInText, decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';
import { verifyRfChronoByCharPos } from './lib/horenRfChronoEvidence.mjs';
import { chk14 } from './audit-pass-2.mjs';

const require = createRequire(import.meta.url);
const { findExplanationOptionLetters } = require('../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSEMBLED = path.join(ROOT, 'batches/ready/assembled-from-verified');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/assembled-e2e-verify-2026-07-12.json');

// Case-sensitive: these are the bad lowercase / mis-capitalized forms.
const CAPS_BAD_RE =
  /kleine unternehmen|unserem Jährlichen|für die kleinen\.|und Brauchen|und Zahlen|zu kunden|zu medien/;
const OPTION_LETTER_RE = /[Oo]ption\s+[abc]\)/;

function normalizeCorrect(c) {
  const s = String(c ?? '').trim().toLowerCase();
  const m = s.match(/^([abc])\b/);
  return m ? m[1] : null;
}

function collectTexts(batch) {
  const texts = [];
  for (const p of batch.passages || []) {
    for (const f of ['text', 'title', 'signText', 'transcript']) {
      if (p[f]) texts.push({ where: `p.${f}`, text: p[f] });
    }
    for (const a of p.audio || []) {
      if (a.text) texts.push({ where: 'audio', text: a.text });
    }
  }
  for (const q of batch.questions || []) {
    for (const f of ['question', 'explanation', 'signText']) {
      if (q[f]) texts.push({ where: `q.${q.id}.${f}`, text: q[f] });
    }
    for (const o of q.options || []) texts.push({ where: 'opt', text: String(o) });
  }
  return texts;
}

function unitCaps() {
  const fails = [];
  const a = decapitalizeMidSentence('Sie bezahlen mehr und Brauchen einen Gästeausweis.');
  if (!/und brauchen einen/.test(a.result || a)) fails.push({ kind: 'unitUndBrauchen', got: a.result || a });
  const b = capitalizeNounsInText('für kleine unternehmen.').result;
  if (b !== 'für kleine Unternehmen.') fails.push({ kind: 'unitUnternehmen', got: b });
  const c = capitalizeNounsInText('Der Kontakt zu kunden muss bleiben.').result;
  if (c !== 'Der Kontakt zu Kunden muss bleiben.') fails.push({ kind: 'unitZuKunden', got: c });
  return fails;
}

function mcqPositionCounts(batch) {
  const counts = { a: 0, b: 0, c: 0 };
  let n = 0;
  for (const q of batch.questions || []) {
    if (q.type !== 'multiple_choice') continue;
    const letter = normalizeCorrect(q.correctAnswer ?? q.correct);
    if (!letter || !counts[letter] && counts[letter] !== 0) continue;
    if (!(letter in counts)) continue;
    counts[letter] += 1;
    n += 1;
  }
  return { n, counts };
}

// Collect unique source basenames from assembled exams
const examFiles = fs
  .readdirSync(ASSEMBLED)
  .filter((f) => /^assembled-exam-b1-verified-e\d+\.json$/.test(f))
  .sort();

const examMeta = [];
const sourceSet = new Set();
for (const f of examFiles) {
  const doc = JSON.parse(fs.readFileSync(path.join(ASSEMBLED, f), 'utf8'));
  const sources = Object.values(doc._meta?.sources || {});
  for (const s of sources) sourceSet.add(path.basename(s));
  examMeta.push({
    exam: doc._meta?.examId,
    file: f,
    gate1: doc._meta?.gate1?.ok,
    sources: doc._meta?.sources,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'assembled-exams-source-batches-only',
  expected: {
    caps: GERMAN_CAPS_NORMALIZE_VERSION,
    balanceMcq: BALANCE_MCQ_VERSION,
  },
  unitCaps: unitCaps(),
  exams: examMeta,
  sourceFiles: [...sourceSet].sort(),
  files: [],
  failCount: 0,
  positionBias: [],
};

for (const name of [...sourceSet].sort()) {
  const abs = path.join(POOL, name);
  const entry = { file: name, fails: [], warnings: [] };
  if (!fs.existsSync(abs)) {
    entry.fails.push({ kind: 'missing' });
    report.files.push(entry);
    report.failCount += 1;
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));

  // Caps stamp — warn if lagging (oral bundles often lack stamp)
  if (
    batch._germanCapsNormalizeVersion &&
    batch._germanCapsNormalizeVersion !== GERMAN_CAPS_NORMALIZE_VERSION
  ) {
    entry.warnings.push({
      kind: 'capsStampLag',
      got: batch._germanCapsNormalizeVersion,
      want: GERMAN_CAPS_NORMALIZE_VERSION,
    });
  }

  // Hören T3 RF chrono by char evidence
  if (/^horen-t3-/i.test(name)) {
    const qs = batch.questions || [];
    if (qs.length && qs.every((q) => q.type === 'richtig_falsch')) {
      const charChrono = verifyRfChronoByCharPos(batch);
      entry.rfChronoCharPos = charChrono.positions;
      if (!charChrono.ok) {
        entry.fails.push({ kind: 'rfChronoCharPos', positions: charChrono.positions });
      }
    }
  }

  for (const q of batch.questions || []) {
    if (q.type === 'multiple_choice') {
      const want = normalizeCorrect(q.correctAnswer ?? q.correct);
      const expl = String(q.explanation || '');
      if (OPTION_LETTER_RE.test(expl)) {
        entry.fails.push({ kind: 'optionLetterInExpl', qid: q.id, expl: expl.slice(0, 120) });
      }
      if (want) {
        const hits = findExplanationOptionLetters(expl);
        const desync = hits.filter((h) => h.letter !== want);
        if (desync.length) entry.fails.push({ kind: 'explDesync', qid: q.id, desync });
      }
    }
  }

  for (const { where, text } of collectTexts(batch)) {
    if (CAPS_BAD_RE.test(text)) {
      entry.fails.push({ kind: 'capsBad', where, match: text.match(CAPS_BAD_RE)?.[0] });
    }
    for (const h of findDateWeekdayMismatches(text, { field: where })) {
      if (h.reason === 'weekday_mismatch') {
        entry.fails.push({ kind: 'dateWeekday', where, hit: h });
      }
    }
  }

  // Separable smoke
  for (const q of batch.questions || []) {
    const tags = (q.vocabularyTags || []).map((t) => String(t).toLowerCase());
    const text = [q.question, q.explanation, ...(q.options || [])].filter(Boolean).join(' ');
    if (
      tags.includes('schlagen') &&
      !tags.includes('vorschlagen') &&
      /\bschlägt\b[\s\S]{0,100}\bvor\b/i.test(text)
    ) {
      entry.fails.push({ kind: 'separable', qid: q.id });
    }
  }

  // CHK-14 IMPORTANT only (ignore meta/_rejectedReason FPs)
  const batchForChk = { ...batch };
  for (const k of Object.keys(batchForChk)) {
    if (k.startsWith('_')) delete batchForChk[k];
  }
  const chk = chk14(batchForChk, name) || [];
  for (const f of chk) {
    if (f.severity === 'IMPORTANT') {
      entry.fails.push({ kind: 'CHK-14', message: f.message, word: f.word || f.snippet });
    }
  }

  const pos = mcqPositionCounts(batch);
  if (pos.n >= 3) {
    report.positionBias.push({ file: name, ...pos });
    // Soft bias: all answers same letter when n>=5
    const vals = Object.values(pos.counts);
    if (pos.n >= 5 && vals.some((v) => v === pos.n)) {
      entry.fails.push({ kind: 'positionBiasAllSame', counts: pos.counts, n: pos.n });
    }
  }

  if (entry.fails.length) report.failCount += 1;
  report.files.push(entry);
}

report.okCount = report.files.filter((f) => f.fails.length === 0).length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Sources checked: ${report.files.length}`);
console.log(`OK ${report.okCount}/${report.files.length} · fails ${report.failCount}`);
console.log(`unitCaps fails: ${report.unitCaps.length}`);
console.log(`Log: ${path.relative(ROOT, OUT)}`);
if (report.failCount || report.unitCaps.length) process.exit(1);
