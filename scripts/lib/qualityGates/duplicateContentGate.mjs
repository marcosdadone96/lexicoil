/**
 * duplicateContentGate.mjs — Q1a (determinista).
 *
 * Dos fases de escalado (documentado en código):
 *   1) Hash exacto SHA-256 del texto normalizado → O(1) lookup en byExactHash.
 *   2) Shingle prefilter (5-gramas de palabras) → solo candidatos con ≥20% overlap
 *      reciben Jaccard completo. Evita O(n²) cuando el bank crece a miles de archivos.
 */
import { buildVerdict, pushFinding, inferTeil } from './qualityGateCommon.mjs';
import {
  fingerprintsFromBatch,
  buildDedupCorpus,
  tokenJaccard,
  normalizeComparableText,
  logicalBatchId,
} from './dedupCorpus.mjs';
import { shingleCandidates, loadDedupIndex } from './dedupIndex.mjs';
import { wordShingles, jaccardSets } from './dedupNormalize.mjs';

const NEAR_THRESHOLD = 0.90;
const WARN_THRESHOLD = 0.70;
const SHINGLE_PREFILTER_RATIO = 0.20;

/**
 * @param {object} batch
 * @param {object} opts
 * @param {string} [opts.file]
 * @param {object} [opts.corpus] — resultado de buildDedupCorpus()
 * @param {object} [opts.index] — índice precalculado
 * @param {string} [opts.selfSource] — excluir self en matches
 * @param {number} [opts.nearThreshold=0.90]
 */
export function runDuplicateContentGate(batch, opts = {}) {
  const file = opts.file || opts.selfSource || '';
  const selfSource = opts.selfSource || file;
  const findings = [];
  const nearThreshold = opts.nearThreshold ?? NEAR_THRESHOLD;
  const warnThreshold = opts.warnThreshold ?? WARN_THRESHOLD;

  let index = opts.index;
  if (!index && opts.corpus?.index) index = opts.corpus.index;
  if (!index && opts.indexPath) index = loadDedupIndex(opts.indexPath);

  if (!index) {
    pushFinding(findings, {
      rule: 'corpus_missing',
      severity: 'warn',
      detail: 'Sin corpus/index de dedup — gate omitido',
    });
    return buildVerdict('Q1-duplicateContent', file, findings);
  }

  const fps = fingerprintsFromBatch(batch, selfSource);

  for (const fp of fps) {
    if (fp.kind === 'passage_hash') {
      checkPassageHash(fp, index, selfSource, findings, nearThreshold, warnThreshold, opts.corpus);
    } else if (fp.kind === 't3_matching_fp') {
      checkT3Fp(fp, index, selfSource, findings);
    } else if (fp.kind === 'questions_set') {
      checkExactKind(fp, index, selfSource, findings, 'near_duplicate', 'questions_set');
    }
  }

  return buildVerdict('Q1-duplicateContent', file, findings);
}

function isOtherSource(matchSource, selfSource) {
  if (!matchSource || !selfSource) return Boolean(matchSource);
  if (matchSource === selfSource || matchSource.startsWith(`${selfSource}::`)) return false;
  // Same logical batch ID under different folders (ready ↔ generated ↔ needs-regen) = self
  const a = logicalBatchId(matchSource);
  const b = logicalBatchId(selfSource);
  if (a && b && a === b) return false;
  return true;
}

function checkT3Fp(fp, index, selfSource, findings) {
  const match = index.byT3Fp?.[fp.id];
  if (match && isOtherSource(match, selfSource)) {
    pushFinding(findings, {
      rule: 'near_duplicate',
      detail:
        `T3 matching fingerprint idéntico (${fp.id}) con «${match}» ` +
        `(invariante a reordenación A–J)`,
      span: fp.preview,
    });
    return;
  }
  // Fallback: buscar otra entrada t3 con mismo id en entries
  for (const e of index.entries || []) {
    if (e.kind === 't3_matching_fp' && e.id === fp.id && isOtherSource(e.source, selfSource)) {
      pushFinding(findings, {
        rule: 'near_duplicate',
        detail: `T3 fingerprint ${fp.id} coincide con «${e.source}»`,
        span: fp.preview,
      });
      return;
    }
  }
}

function checkExactKind(fp, index, selfSource, findings, rule, kind) {
  for (const e of index.entries || []) {
    if (e.kind !== kind || e.id !== fp.id) continue;
    if (!isOtherSource(e.source, selfSource)) continue;
    pushFinding(findings, {
      rule,
      detail: `${kind} idéntico con «${e.source}»`,
      span: fp.preview,
    });
    return;
  }
}

function checkPassageHash(fp, index, selfSource, findings, nearThreshold, warnThreshold, corpus) {
  const exact = index.byExactHash?.[fp.id];
  if (exact && isOtherSource(exact, selfSource)) {
    pushFinding(findings, {
      rule: 'exact_duplicate',
      detail: `Pasaje idéntico (hash) con «${exact}»`,
      span: fp.preview,
    });
    return;
  }

  const shingles = new Set(fp.shingles || []);
  const candidates = shingleCandidates(shingles, index, 1);

  let best = { sim: 0, source: '', preview: '' };
  const entries = corpus?.entries || index.entries || [];

  for (const src of candidates) {
    const cand = entries.find((e) => e.source === src && e.kind === 'passage_hash');
    if (!cand || !isOtherSource(cand.source, selfSource)) continue;
    const candSh = new Set(cand.shingles || []);
    const shSim = jaccardSets(shingles, candSh);
    let sim = shSim;
    if (cand._tokens && (fp.tokens || fp._tokens)) {
      sim = Math.max(sim, tokenJaccard(fp.tokens || fp._tokens, cand._tokens));
    }
    if (sim > best.sim) {
      best = { sim, source: cand.source, preview: cand.preview };
    }
  }

  if (best.sim >= nearThreshold) {
    pushFinding(findings, {
      rule: 'near_duplicate',
      detail: `Pasaje similitud ${(best.sim * 100).toFixed(0)}% con «${best.source}»`,
      span: fp.preview,
    });
  } else if (best.sim >= warnThreshold) {
    pushFinding(findings, {
      rule: 'possible_duplicate',
      severity: 'warn',
      detail: `Posible duplicado ${(best.sim * 100).toFixed(0)}% con «${best.source}»`,
      span: fp.preview,
    });
  }
}

export const GATE_NAME = 'Q1-duplicateContent';
