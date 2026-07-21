/**
 * partGate.mjs — shared in-memory part validation (terminal + future Netlify).
 *
 * Pipeline:
 *   normalizeBatch (decap + caps + MCQ/T3 fixes)
 *   → optional semantic dedup (corpus passed in memory)
 *   → isPartPoolReady (audit-pass-2 / POOL-2: CHK-1..25)
 *   → optional SEM-1 (semanticValidator via isPartPoolReady semantic:true)
 *   → optional SEM-2 advise-only on Lesen T2 (holisticJudge; skipSem2:true in factory gen loop)
 *
 * No temp files, no spawn, no reading batches/generated/ for the gate itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeBatch } from './normalizeBatch.mjs';
import { buildCorpus, buildCorpusFromDirSync, checkDuplicate } from './semanticDedup.mjs';
import { checkStructuralMoldDuplicate } from './structuralMoldDedup.mjs';
import { checkLesenBatchQuality } from './lesenBatchQuality.mjs';
import { READY_LESEN_DIR } from './batchPaths.mjs';
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

function structuralMoldFinding(message) {
  return {
    id: 'CHK-29',
    severity: 'IMPORTANT',
    file: 'part',
    scope: 'structural_dedup',
    message,
  };
}

function qualityFinding(message) {
  return {
    id: 'QUALITY',
    severity: 'IMPORTANT',
    file: 'part',
    scope: 'calidad',
    message,
  };
}

/**
 * CHK-29 corpus: batches/ready/lesen/ (perfectas) si existe; si no, filtra generated/.
 */
export async function loadCleanStructuralCorpusFromDir(dir, opts = {}) {
  const { lang = 'de', level = 'B1' } = opts;
  const batches = [];
  const useReady =
    fs.existsSync(READY_LESEN_DIR) &&
    fs.readdirSync(READY_LESEN_DIR).some((n) => /^lesen-t[45]-.*\.json$/i.test(n));
  const scanDir = useReady ? READY_LESEN_DIR : dir;
  if (!scanDir || !fs.existsSync(scanDir)) return batches;

  for (const name of fs.readdirSync(scanDir)) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    if (!/^lesen-t[45]-/i.test(name)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(scanDir, name), 'utf8'));
      const teil = Number(raw.teil ?? raw.questions?.[0]?.teil);
      if (![4, 5].includes(teil)) continue;
      const batch = normalizeBatch(raw, { module: 'lesen', teil, lang, level });
      if (useReady) {
        batches.push({ ...batch, id: batch.id || name.replace(/\.json$/i, '') });
        continue;
      }
      const quality = checkLesenBatchQuality(batch, teil);
      if (!quality.ok) continue;
      const gate = await isPartPoolReady(batch, { semantic: false, skipSem2: true });
      if (!gate.ok) continue;
      batches.push({ ...batch, id: batch.id || name.replace(/\.json$/i, '') });
    } catch {
      /* skip corrupt */
    }
  }
  return batches;
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
 * @param {boolean} [opts.skipSem2=false] — skip SEM-2 judge (factory generation loop)
 * @param {boolean} [opts.skipNormalize=false] — set true when batch is already normalized (terminal post-tag)
 * @param {boolean} [opts.skipDedup=false]
 * @param {Array} [opts.dedupCorpus=null] — in-memory corpus from buildDedupCorpusFromBatches/Dir
 * @param {Array} [opts.structuralCorpus=null] — T4/T5 batches for CHK-29 (sesión + pool)
 * @param {string} [opts.structuralCorpusDir=null] — scan dir for T4/T5 when corpus not passed
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
    skipSem2 = false,
    skipNormalize = false,
    skipDedup = false,
    dedupCorpus = null,
    structuralCorpus = null,
    structuralCorpusDir = null,
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

  if (module === 'lesen' && !opts.skipQuality) {
    const quality = checkLesenBatchQuality(batch, teil);
    if (!quality.ok && !allowFailures) {
      return {
        ok: false,
        blocking: quality.issues.map(qualityFinding),
        advisory: [],
        batch,
      };
    }
  }

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

  if ([4, 5].includes(teil)) {
    const moldCorpus = [
      ...(Array.isArray(structuralCorpus) ? structuralCorpus : []),
    ];
    if (structuralCorpusDir) {
      try {
        moldCorpus.push(...await loadCleanStructuralCorpusFromDir(structuralCorpusDir, { lang, level }));
      } catch {
        /* ignore */
      }
    }
    if (moldCorpus.length) {
      const mold = checkStructuralMoldDuplicate(batch, moldCorpus, { teil });
      if (!mold.ok) {
        return {
          ok: false,
          blocking: [structuralMoldFinding(mold.issue)],
          advisory: [],
          batch,
        };
      }
    }
  }

  const gate = await isPartPoolReady(batch, { allowFailures, semantic, skipSem2 });
  const advisory = collectAdvisoryFindings(batch, module, teil);

  return {
    ok: gate.ok,
    blocking: gate.blocking || [],
    advisory,
    batch,
  };
}
