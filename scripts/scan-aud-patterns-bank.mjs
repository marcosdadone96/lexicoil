#!/usr/bin/env node
/**
 * Diagnóstico AUD-1..4b en capa publicada/servida (solo lectura).
 *   node scripts/scan-aud-patterns-bank.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { EIN_PAAR_PAIR_OBJECTS } from './lib/capitalizeNouns.mjs';

const TARGETS = [
  { label: 'bank', file: path.join(ROOT, 'library/de/B1/questions.json') },
  { label: 'served', file: path.join(ROOT, 'data/exams/de_B1.json') },
];

const LANG_LOWER_RE =
  /\bin (chinesisch|arabisch|russisch|deutsch|spanisch|italienisch|englisch|französisch|türkisch|polnisch|japanisch|portugiesisch)\b/g;
const IM_FREIEN_RE = /\bim freien\b/g;
const BOLD_RE = /\*\*[^*\n]{1,200}\*\*/g;
const BULLET_RE = /(?:^|\n)(\s*)[*-]\s+(?=\S)/g;
const EIN_PAAR_RE = /\bein Paar\s+([A-Za-zÄÖÜäöüß]+)/g;

function classifyEinPaar(nextWord) {
  const lc = nextWord.toLowerCase();
  if (EIN_PAAR_PAIR_OBJECTS.has(lc)) return 'ok_pair_object';
  if (/^(das|die|der|dem|den|des)$/i.test(nextWord)) return 'ok_couple_clause';
  return 'flag_quantifier';
}

function scanText(text, field, ctx, hits) {
  if (typeof text !== 'string' || !text) return;

  LANG_LOWER_RE.lastIndex = 0;
  let m;
  while ((m = LANG_LOWER_RE.exec(text)) !== null) {
    hits.aud1.push({ ...ctx, field, match: m[0], snippet: snippet(text, m.index) });
  }

  IM_FREIEN_RE.lastIndex = 0;
  while ((m = IM_FREIEN_RE.exec(text)) !== null) {
    hits.aud2.push({ ...ctx, field, match: m[0], snippet: snippet(text, m.index) });
  }

  EIN_PAAR_RE.lastIndex = 0;
  while ((m = EIN_PAAR_RE.exec(text)) !== null) {
    const kind = classifyEinPaar(m[1]);
    const row = { ...ctx, field, match: m[0], next: m[1], kind, snippet: snippet(text, m.index) };
    if (kind === 'flag_quantifier') hits.aud3.push(row);
    else hits.aud3_ok.push(row);
  }

  if (/passage|text|title|transcript/i.test(field) || field.includes('passage') || field.includes('textTitle')) {
    BOLD_RE.lastIndex = 0;
    while ((m = BOLD_RE.exec(text)) !== null) {
      hits.aud4.push({ ...ctx, field, match: m[0].slice(0, 80), snippet: snippet(text, m.index) });
    }
    BULLET_RE.lastIndex = 0;
    while ((m = BULLET_RE.exec(text)) !== null) {
      hits.aud4b.push({ ...ctx, field, match: m[0], snippet: snippet(text, m.index + m[0].length) });
    }
  }
}

function snippet(text, idx, radius = 50) {
  return text.slice(Math.max(0, idx - radius), idx + radius).replace(/\n/g, '\\n');
}

function emptyHits() {
  return { aud1: [], aud2: [], aud3: [], aud3_ok: [], aud4: [], aud4b: [] };
}

function scanQuestionsJson(data) {
  const hits = emptyHits();
  for (const p of data.passages || []) {
    const ctx = { id: p.id, module: p.module, teil: p.teil, type: 'passage' };
    scanText(p.text, 'passages.text', ctx, hits);
    scanText(p.title, 'passages.title', ctx, hits);
    scanText(p.transcript, 'passages.transcript', ctx, hits);
    for (const [ai, ad] of (p.ads || []).entries()) {
      if (typeof ad === 'string') scanText(ad, `passages.ads[${ai}]`, ctx, hits);
    }
  }
  for (const q of data.questions || []) {
    const ctx = { id: q.id, module: q.module, teil: q.teil, type: 'question' };
    scanText(q.question, 'questions.question', ctx, hits);
    scanText(q.explanation, 'questions.explanation', ctx, hits);
    scanText(q.signText, 'questions.signText', ctx, hits);
    for (const [oi, opt] of (q.options || []).entries()) {
      const t = typeof opt === 'string' ? opt : opt?.text || '';
      scanText(t, `questions.options[${oi}]`, ctx, hits);
    }
  }
  return hits;
}

function scanServedExam(data) {
  const hits = emptyHits();
  for (const exam of data) {
    const examCtx = { examId: exam.examId || exam.id, slot: exam.slot };
    for (const part of exam.lesenParts || []) {
      const ctx = { ...examCtx, teil: part.teil, type: 'lesenPart' };
      scanText(part.text, 'lesenParts.text', ctx, hits);
      scanText(part.textTitle, 'lesenParts.textTitle', ctx, hits);
      for (const q of part.questions || []) {
        const qctx = { ...ctx, id: q.id, qType: 'lesenQuestion' };
        scanText(q.question, 'lesenParts.questions.question', qctx, hits);
        scanText(q.explanation, 'lesenParts.questions.explanation', qctx, hits);
        for (const [oi, opt] of (q.options || []).entries()) {
          const t = typeof opt === 'string' ? opt : opt?.text || opt?.body || '';
          scanText(t, `lesenParts.questions.options[${oi}]`, qctx, hits);
        }
      }
    }
    for (const part of exam.horenParts || []) {
      const ctx = { ...examCtx, teil: part.teil, type: 'horenPart' };
      scanText(part.transcript, 'horenParts.transcript', ctx, hits);
      scanText(part.text, 'horenParts.text', ctx, hits);
    }
  }
  return hits;
}

function summarize(label, hits, meta = {}) {
  const unique = (arr, keyFn) => new Set(arr.map(keyFn)).size;
  return {
    label,
    ...meta,
    aud1_lang_lower: {
      occurrences: hits.aud1.length,
      unique_entities: unique(hits.aud1, (h) => `${h.id}|${h.field}`),
      by_teil: groupBy(hits.aud1, (h) => h.teil ?? h.module ?? '?'),
    },
    aud2_im_freien: {
      occurrences: hits.aud2.length,
      unique_entities: unique(hits.aud2, (h) => `${h.id}|${h.field}`),
      by_teil: groupBy(hits.aud2, (h) => h.teil ?? '?'),
    },
    aud3_ein_paar: {
      flagged_occurrences: hits.aud3.length,
      flagged_unique: unique(hits.aud3, (h) => `${h.id}|${h.field}`),
      ok_pair_objects: hits.aud3_ok.filter((h) => h.kind === 'ok_pair_object').length,
      by_teil: groupBy(hits.aud3, (h) => h.teil ?? '?'),
    },
    aud4_bold: {
      occurrences: hits.aud4.length,
      unique_passages: unique(
        hits.aud4.filter((h) => h.field?.includes('text') || h.field?.includes('title') || h.field?.includes('transcript')),
        (h) => `${h.id}|${h.field}`,
      ),
      by_teil: groupBy(hits.aud4, (h) => h.teil ?? '?'),
    },
    aud4b_bullets: {
      occurrences: hits.aud4b.length,
      unique_passage_fields: unique(hits.aud4b, (h) => `${h.id}|${h.field}`),
      by_teil: groupBy(hits.aud4b, (h) => h.teil ?? '?'),
    },
    samples: {
      aud1: hits.aud1.slice(0, 3),
      aud2: hits.aud2.slice(0, 3),
      aud3: hits.aud3.slice(0, 5),
      aud4: hits.aud4.slice(0, 3),
      aud4b: hits.aud4b.slice(0, 3),
    },
  };
}

function groupBy(arr, fn) {
  const m = {};
  for (const x of arr) {
    const k = String(fn(x));
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function main() {
  const reports = [];
  for (const { label, file } of TARGETS) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const hits = label === 'served' ? scanServedExam(raw) : scanQuestionsJson(raw);
    const meta =
      label === 'bank'
        ? {
            passages: (raw.passages || []).length,
            questions: (raw.questions || []).length,
            version: raw.meta?.version,
          }
        : { exams: raw.length };
    reports.push({ summary: summarize(label, hits, meta), hits });
  }
  const out = path.join(ROOT, 'batches/ready/gate-logs/bank-aud-scope-scan.json');
  fs.writeFileSync(out, `${JSON.stringify(reports, null, 2)}\n`);
  for (const r of reports) {
    console.log(`\n=== ${r.summary.label} ===`);
    console.log(JSON.stringify(r.summary, null, 2));
  }
  console.log(`\nFull report: ${path.relative(ROOT, out)}`);
}

main();
