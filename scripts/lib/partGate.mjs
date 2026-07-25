/**
 * partGate.mjs — shared in-memory part validation (terminal + future Netlify).
 *
 * Pipeline:
 *   normalizeBatch (decap + caps + MCQ/T3 fixes)
 *   → optional semantic dedup (corpus passed in memory)
 *   → isPartPoolReady (audit-pass-2 / POOL-2: CHK-1..25)
 *   → optional SEM-1 (semanticValidator via isPartPoolReady semantic:true)
 *
 * No temp files, no spawn, no reading batches/generated/ for the gate itself.
 */
import { normalizeBatch } from './normalizeBatch.mjs';
import { buildCorpus, buildCorpusFromDirSync, checkDuplicate } from './semanticDedup.mjs';
import {
  auditExam,
  isPartPoolReady,
  partToExamWrapper,
} from '../audit-pass-2.mjs';

function inferModuleTeil(part, opts = {}) {
  const q0 = (part.questions || part.items || [])[0];
  const module = String(opts.module || part.module || q0?.module || 'lesen').toLowerCase();
  const teilRaw = opts.teil ?? part.teil ?? q0?.teil ?? 1;
  const teil = Number(teilRaw);
  return { module, teil: Number.isFinite(teil) ? teil : 1 };
}

/**
 * Normalize seed record, exam part, or batch → batch { passages, questions, … }.
 */
export function partToBatch(part, opts = {}) {
  if (!part || typeof part !== 'object') {
    return { passages: [], questions: [] };
  }
  if (Array.isArray(part.passages) && Array.isArray(part.questions)) {
    return { ...part };
  }

  const { module, teil } = inferModuleTeil(part, opts);
  const questions = [...(part.questions || part.items || [])];
  let passages = Array.isArray(part.passages) ? [...part.passages] : [];

  if (!passages.length && part.passage) {
    const p = part.passage;
    passages = [{
      id: p.id || p.passageId || questions[0]?.passageId || `${module}-t${teil}-p1`,
      title: p.title || p.textTitle || '',
      text: p.text || '',
      transcript: p.transcript || '',
      module,
      teil,
    }];
  }

  const batch = { passages, questions, module, teil };
  if (part.ads) batch.ads = part.ads;
  if (Array.isArray(part.segments)) batch.segments = part.segments;
  return batch;
}

function batchToRecord(batch, module, teil) {
  return {
    module,
    teil,
    passage: batch.passages?.[0] || null,
    passages: batch.passages,
    questions: batch.questions,
    ads: batch.ads,
    segments: batch.segments,
  };
}

function dedupFinding(message) {
  return {
    id: 'DEDUP',
    severity: 'IMPORTANT',
    file: 'part',
    scope: 'dedup',
    message,
  };
}

function collectAdvisoryFindings(batch, module, teil) {
  const record = batchToRecord(batch, module, teil);
  const wrapper = partToExamWrapper(record);
  if (!wrapper) return [];
  const label = record.id || `${module}-t${teil}`;
  const audit = auditExam(wrapper, label);
  return (audit.findings || []).filter((f) => f.severity === 'MINOR' || f.severity === 'INFO');
}

/**
 * Build dedup corpus from in-memory batches (preferred for isomorphic callers).
 */
export function buildDedupCorpusFromBatches(batches) {
  return buildCorpus(Array.isArray(batches) ? batches : []);
}

/**
 * Build dedup corpus by scanning a directory (terminal/CLI only).
 * Prefer buildDedupCorpusFromBatches when batches are already in memory.
 */
export function buildDedupCorpusFromDir(dir, fs, pathMod) {
  return buildCorpusFromDirSync(dir, fs, pathMod);
}

/**
 * Validate one part/batch through normalizeBatch + POOL-2 (+ optional SEM-1 + optional dedup).
 *
 * @param {object} partObject — batch {passages,questions}, seed record, or exam part shape
 * @param {object} [opts]
 * @param {boolean} [opts.semantic=false] — run SEM-1 via isPartPoolReady
 * @param {boolean} [opts.skipNormalize=false] — set true when batch is already normalized (terminal post-tag)
 * @param {boolean} [opts.skipDedup=false]
 * @param {Array} [opts.dedupCorpus=null] — in-memory corpus from buildDedupCorpusFromBatches/Dir
 * @param {number} [opts.dedupThreshold=0.55]
 * @param {boolean} [opts.allowFailures=false]
 * @param {string} [opts.lang='de']
 * @param {string} [opts.level='B1']
 * @param {string} [opts.module]
 * @param {number} [opts.teil]
 * @returns {Promise<{ ok: boolean, blocking: object[], advisory: object[], batch: object, dedup?: object }>}
 */
export async function validatePart(partObject, opts = {}) {
  const {
    semantic = false,
    skipNormalize = false,
    skipDedup = false,
    dedupCorpus = null,
    dedupThreshold = 0.55,
    allowFailures = false,
    lang = 'de',
    level = 'B1',
  } = opts;

  const batchIn = partToBatch(partObject, opts);
  const { module, teil } = inferModuleTeil(batchIn, opts);

  let batch = skipNormalize
    ? batchIn
    : normalizeBatch(batchIn, { module, teil, lang, level });

  if (!skipDedup && Array.isArray(dedupCorpus) && dedupCorpus.length) {
    const dedup = checkDuplicate(batch, dedupCorpus, { threshold: dedupThreshold });
    if (!dedup.ok) {
      return {
        ok: false,
        blocking: dedup.issues.map(dedupFinding),
        advisory: [],
        batch,
        dedup,
      };
    }
  }

  const gate = await isPartPoolReady(batch, { allowFailures, semantic });
  const advisory = collectAdvisoryFindings(batch, module, teil);

  return {
    ok: gate.ok,
    blocking: gate.blocking || [],
    advisory,
    batch,
  };
}
