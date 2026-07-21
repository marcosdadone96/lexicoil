/**
 * Métricas de defectos por lote (experimento generador vs gates).
 */
import fs from 'node:fs';
import path from 'node:path';
import { scanP2CapitalizationViolations } from './capitalizeNouns.mjs';
import { findKeyExplanationMismatches } from './keyExplanationGate.mjs';
import { checkLesenBatchQuality } from './lesenBatchQuality.mjs';
import { detectT4DebateTopic, detectT5Subtype } from './lesenSubtypeRotation.mjs';

const OPTION_CAP_RE =
  /\b(?:[A-ZÄÖÜ][a-zäöüß]*\s+){0,2}(?:Besuchen|Verantwortlich|Wissen|Online|Virtuell)\b/;

export { findKeyExplanationMismatches };

/** Mayúsculas sospechosas en opciones MCQ (P2 block + patrones empíricos Flash). */
export function findCapsInOptions(batch) {
  const hits = [];
  for (const q of batch.questions || []) {
    for (const opt of q.options || []) {
      const text = String(opt);
      if (text.length < 8) continue;
      const blocks = scanP2CapitalizationViolations(text).filter((v) => v.severity === 'block');
      for (const v of blocks) {
        hits.push({ itemId: q.id, kind: 'p2_block', word: v.word, snippet: text.slice(0, 90) });
      }
      if (OPTION_CAP_RE.test(text)) {
        hits.push({ itemId: q.id, kind: 'pattern', snippet: text.slice(0, 90) });
      }
    }
  }
  return hits;
}

/** Word-matching / calidad pedagógica determinista. */
export function findWordMatchIssues(batch, teil) {
  const t = Number(teil ?? batch.teil ?? batch.questions?.[0]?.teil);
  const { ok, issues } = checkLesenBatchQuality(batch, t);
  if (ok) return [];
  return (issues || []).filter((i) =>
    /palabras idénticas|copia literal|copia ≥|word-matching|opción correcta copia|comparten demasiadas/i.test(
      String(i),
    ),
  );
}

export function moldKey(batch, topicTag) {
  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil);
  const topic = topicTag || batch.topicTag || batch._requestedTopic || '?';
  if (teil === 5) {
    const st = batch._textSubtype || detectT5Subtype(batch);
    return `${topic}×T5:${st || '?'}`;
  }
  if (teil === 4) {
    const dt = batch._debateTopic || detectT4DebateTopic(batch);
    return `${topic}×T4:${dt || '?'}`;
  }
  return null;
}

/** Clones estructurales dentro de un lote OK (mismo molde×celda). */
export function findStructuralClones(okRows) {
  const byMold = new Map();
  for (const row of okRows) {
    const key = row.moldKey;
    if (!key) continue;
    if (!byMold.has(key)) byMold.set(key, []);
    byMold.get(key).push(row.file || row.id);
  }
  const hits = [];
  for (const [key, files] of byMold) {
    if (files.length > 1) hits.push({ moldKey: key, count: files.length, files });
  }
  return hits;
}

export function analyzeBatchFile(absPath, meta = {}) {
  const batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const teil = Number(meta.teil ?? batch.teil ?? batch.questions?.[0]?.teil);
  return analyzeBatch(batch, { ...meta, teil, file: meta.file || path.basename(absPath) });
}

export function analyzeBatch(batch, meta = {}) {
  const teil = Number(meta.teil ?? batch.teil ?? batch.questions?.[0]?.teil);
  const caps = findCapsInOptions(batch);
  const keyMismatch = findKeyExplanationMismatches(batch);
  const wordMatch = findWordMatchIssues(batch, teil);
  const mold = moldKey(batch, meta.topic ?? batch.topicTag);

  return {
    file: meta.file || null,
    teil,
    topic: meta.topic ?? batch.topicTag ?? batch._requestedTopic,
    moldKey: mold,
    defects: {
      capsInOptions: caps.length,
      keyExplanationMismatch: keyMismatch.length,
      wordMatching: wordMatch.length,
    },
    details: { caps, keyMismatch, wordMatch },
  };
}

/** Agrega defectos por lote (N partes OK). */
export function summarizeDefectRates(analyses) {
  const n = analyses.length || 1;
  const sum = (k) => analyses.reduce((a, x) => a + (x.defects[k] || 0), 0);
  return {
    parts: analyses.length,
    capsInOptions: sum('capsInOptions'),
    capsPerPart: Number((sum('capsInOptions') / n).toFixed(2)),
    keyMismatch: sum('keyExplanationMismatch'),
    keyMismatchPerPart: Number((sum('keyExplanationMismatch') / n).toFixed(2)),
    wordMatching: sum('wordMatching'),
    wordMatchingPerPart: Number((sum('wordMatching') / n).toFixed(2)),
  };
}

/** Coste estimado Gemini (USD) — precios orientativos jul 2026. */
export function estimateGeminiCostUsd(model, usage) {
  const m = String(model || '').toLowerCase();
  const inTok = Number(usage?.promptTokens || usage?.promptTokenCount || 0);
  const outTok = Number(usage?.outputTokens || usage?.candidatesTokenCount || 0);
  const isPro = /pro/.test(m);
  const inRate = isPro ? 1.25 : 0.15;
  const outRate = isPro ? 10.0 : 0.6;
  return (inTok * inRate + outTok * outRate) / 1_000_000;
}
