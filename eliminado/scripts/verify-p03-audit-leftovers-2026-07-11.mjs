#!/usr/bin/env node
/**
 * Verify 15-file set: 9 canary + 6 Hören T1 (staging 001–005 + pool 016).
 *   node scripts/verify-p03-audit-leftovers-2026-07-11.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findDateWeekdayMismatches } from './lib/qualityGates/dateWeekdayGate.mjs';
import { VOCAB_TAGS_NORMALIZE_VERSION } from './lib/enrichBatchMetadata.mjs';
import { GERMAN_CAPS_NORMALIZE_VERSION } from './lib/germanCapsNormalize.mjs';
import { BALANCE_MCQ_VERSION } from './lib/balanceMcq.mjs';
import { capitalizeNounsInText, decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';
import {
  HOREN_RF_CHRONO_EVIDENCE_VERSION,
  verifyRfChronoByCharPos,
} from './lib/horenRfChronoEvidence.mjs';

const require = createRequire(import.meta.url);
const { findExplanationOptionLetters } = require('../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches/ready');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/p03-audit-leftovers-verify-2026-07-11.json');

const FILES = [
  'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-001.json',
  'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-002.json',
  'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-003.json',
  'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-001.json',
  'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-002.json',
  'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-003.json',
  'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-001.json',
  'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-002.json',
  'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-004.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-001.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-002.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-003.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-004.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-005.json',
  'pool-verified/horen-t1-gemini-016.json',
];

const BAD_TAGS_RE =
  /\b(robuen|mindesten|hinterlässen|läsen|yoga-kur|streaming-dien|vier-tage-woch|\w+-nachhilf)\b/i;
const CAPS_BAD_RE = /kleine unternehmen|unserem Jährlichen|für die kleinen\.|und Brauchen|und Zahlen|zu kunden|zu medien/;
const HYPHEN_BAD_RE =
  /\byoga-kur\b|\bstreaming-dien\b|\bvier-tage-woch\b|\b\w+-nachhilf\b|\brepair-caf\b/i;

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

function rfChronoOk(batch) {
  const qs = batch.questions || [];
  if (!qs.length || !qs.every((q) => q.type === 'richtig_falsch')) return { applicable: false, ok: true };
  const nums = qs.map((q) => Number(String(q.id).match(/-(\d+)$/)?.[1] || 0));
  const sorted = [...nums].sort((a, b) => a - b);
  const ok = nums.every((n, i) => n === sorted[i]);
  return { applicable: true, ok, nums };
}

function unitCaps() {
  const fails = [];
  const a = decapitalizeMidSentence(
    'Sie bezahlen mehr und Brauchen einen Gästeausweis.',
  );
  if (!/und brauchen einen/.test(a.result || a)) {
    fails.push({ kind: 'unitUndBrauchen', got: a.result || a });
  }
  const b = capitalizeNounsInText('für kleine unternehmen.').result;
  if (b !== 'für kleine Unternehmen.') fails.push({ kind: 'unitUnternehmen', got: b });
  const c = capitalizeNounsInText('Der Kontakt zu kunden muss bleiben.').result;
  if (c !== 'Der Kontakt zu Kunden muss bleiben.') fails.push({ kind: 'unitZuKunden', got: c });
  return fails;
}

const report = {
  generatedAt: new Date().toISOString(),
  expected: {
    vocab: VOCAB_TAGS_NORMALIZE_VERSION,
    caps: GERMAN_CAPS_NORMALIZE_VERSION,
    balanceMcq: BALANCE_MCQ_VERSION,
    rfChronoEvidence: HOREN_RF_CHRONO_EVIDENCE_VERSION,
  },
  unitCaps: unitCaps(),
  files: [],
  failCount: 0,
};

for (const rel of FILES) {
  const abs = path.join(READY, rel);
  const entry = { file: rel, fails: [] };
  if (!fs.existsSync(abs)) {
    entry.fails.push({ kind: 'missing' });
    report.files.push(entry);
    report.failCount += 1;
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));

  if (batch._vocabTagsNormalizeVersion && batch._vocabTagsNormalizeVersion !== VOCAB_TAGS_NORMALIZE_VERSION) {
    // T1 staging may lag vocab stamp — warn only if tags look broken
  }
  if (batch._germanCapsNormalizeVersion !== GERMAN_CAPS_NORMALIZE_VERSION) {
    entry.fails.push({ kind: 'capsStamp', got: batch._germanCapsNormalizeVersion });
  }

  const chrono = rfChronoOk(batch);
  if (chrono.applicable && !chrono.ok) {
    entry.fails.push({ kind: 'rfChrono', nums: chrono.nums });
  }
  // Canonical chrono for Hören T3 R/F: char offset in passages[0].text
  // (NOT audio-turn token overlap — that metric false-greened t3-004).
  if (rel.includes('horen-t3-') && chrono.applicable) {
    const charChrono = verifyRfChronoByCharPos(batch);
    entry.charEvidencePos = charChrono.positions;
    entry.charEvidenceMono = charChrono.ok;
    if (!charChrono.ok) {
      entry.fails.push({
        kind: 'rfChronoCharPos',
        positions: charChrono.positions,
      });
    }
  }

  if (rel.includes('horen-t3-gemini-001') && /Anna fragt:.*"Ich sollte mehr machen\."/s.test(JSON.stringify(batch))) {
    // old misattribution pattern without Ben antwortet
    if (!/Ben antwortet:.*"Ich sollte mehr machen\."/s.test(JSON.stringify(batch))) {
      entry.fails.push({ kind: 'misattributedQuote' });
    }
  }
  if (rel.includes('horen-t3-gemini-002')) {
    if (/eine gute Agenda/.test(JSON.stringify(batch))) entry.fails.push({ kind: 'agendaLeft' });
    if (/Familientreffen organisiert/.test(JSON.stringify(batch))) {
      entry.fails.push({ kind: 'circularOrganisiert' });
    }
  }
  if (rel.includes('horen-t3-gemini-001')) {
    if (/konsumiere nur noch Kaffee/.test(JSON.stringify(batch))) {
      entry.fails.push({ kind: 'artificialKonsumiere' });
    }
    if (/Das gab mir gute Gedanken/.test(JSON.stringify(batch))) {
      entry.fails.push({ kind: 'artificialGuteGedanken' });
    }
  }
  if (rel.includes('horen-t3-gemini-004')) {
    if (/Bestände an verlässlichen/.test(JSON.stringify(batch))) {
      entry.fails.push({ kind: 'bestaendeLeft' });
    }
    const p = batch.passages?.[0];
    const audio = p?.audio || [];
    if (audio.length && (batch.questions || []).length) {
      // evidence mono: each q's best audio-turn index should be non-decreasing
      const turns = (batch.questions || []).map((q) => {
        const blob = `${q.question || ''} ${q.explanation || ''}`.toLowerCase();
        const words = (blob.match(/[a-zäöüß]{5,}/g) || []).filter(
          (w) => !['richtig', 'falsch', 'beide', 'stimmen', 'aussagen', 'markus', 'lena'].includes(w),
        );
        let best = { score: 0, idx: -1 };
        audio.forEach((turn, idx) => {
          const t = String(turn.text || '').toLowerCase();
          let score = 0;
          for (const w of words) if (t.includes(w)) score++;
          if (score > best.score) best = { score, idx };
        });
        return best;
      });
      const usable = turns.filter((t) => t.score > 0 && t.idx >= 0);
      for (let i = 1; i < usable.length; i++) {
        if (usable[i].idx < usable[i - 1].idx) {
          entry.fails.push({ kind: 'evidenceNotMono', turns: usable.map((t) => t.idx) });
          break;
        }
      }
    }
  }
  if (rel.includes('lesen-t4-gemini-001') && /zu kunden\b/.test(JSON.stringify(batch))) {
    entry.fails.push({ kind: 'zuKundenLower' });
  }
  if (rel.includes('lesen-t5-gemini-002') && batch._textSubtype === 'kantine') {
    entry.fails.push({ kind: 'kantineSubtype' });
  }

  for (const q of batch.questions || []) {
    for (const tag of q.vocabularyTags || []) {
      if (BAD_TAGS_RE.test(String(tag)) || HYPHEN_BAD_RE.test(String(tag))) {
        entry.fails.push({ kind: 'badTag', qid: q.id, tag });
      }
    }
    if (q.type === 'multiple_choice') {
      const want = normalizeCorrect(q.correctAnswer ?? q.correct);
      if (want) {
        const hits = findExplanationOptionLetters(String(q.explanation || ''));
        const desync = hits.filter((h) => h.letter !== want);
        if (desync.length) entry.fails.push({ kind: 'explDesync', qid: q.id, desync });
      }
    }
  }

  for (const { where, text } of collectTexts(batch)) {
    if (CAPS_BAD_RE.test(text)) entry.fails.push({ kind: 'capsBad', where, match: text.match(CAPS_BAD_RE)?.[0] });
    for (const h of findDateWeekdayMismatches(text, { field: where })) {
      if (h.reason === 'weekday_mismatch') entry.fails.push({ kind: 'dateWeekday', where, hit: h });
    }
  }

  // Separable smoke: schlagen without vorschlagen when schlägt…vor present
  for (const q of batch.questions || []) {
    const tags = (q.vocabularyTags || []).map((t) => String(t).toLowerCase());
    const text = [q.question, q.explanation, ...(q.options || [])].filter(Boolean).join(' ');
    if (tags.includes('schlagen') && !tags.includes('vorschlagen') && /\bschlägt\b[\s\S]{0,100}\bvor\b/i.test(text)) {
      entry.fails.push({ kind: 'separable', qid: q.id });
    }
  }

  if (entry.fails.length) report.failCount += 1;
  report.files.push(entry);
}

report.okCount = report.files.filter((f) => f.fails.length === 0).length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`OK ${report.okCount}/${FILES.length} · fails ${report.failCount}`);
console.log(`unitCaps fails: ${report.unitCaps.length}`);
console.log(`Log: ${OUT}`);
if (report.failCount || report.unitCaps.length) process.exit(1);
