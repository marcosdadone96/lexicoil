/**
 * Construcción de corpus e fingerprints para duplicateContentGate (Q1a).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeComparableText,
  stripOptionLetter,
  wordShingles,
  jaccardSets,
} from './dedupNormalize.mjs';
import { inferTeil } from './qualityGateCommon.mjs';
import { buildIndexFromEntries } from './dedupIndex.mjs';

/**
 * Canonicalización por ID lógico (nombre base del batch, ej. lesen-t1-gemini-166).
 *
 * El mismo ID lógico no debe aparecer dos veces en el índice. Prioridad al colapsar:
 *   bank > pool-verified > ready/lesen > pool-content-ok-lesen > pool-content-ok
 *   > generated > needs-regeneration
 *
 * Solo aplica a archivos batch (lesen-t*.json). Entradas bank (::passage id) no
 * comparten ID lógico de batch y siempre se indexan.
 */
export function logicalBatchId(source) {
  if (!source || source.startsWith('library/')) return null;
  const base = path.basename(String(source).split('::')[0]);
  return base.replace(/\.json$/i, '');
}

/** @returns {number} higher = preferred canonical path */
export function sourceTier(source) {
  const s = String(source || '').replace(/\\/g, '/');
  if (s.startsWith('library/')) return 60;
  if (s.includes('/ready/pool-verified/')) return 50;
  if (s.includes('/ready/lesen/')) return 40;
  if (s.includes('/ready/pool-content-ok-lesen/')) return 35;
  if (s.includes('/ready/pool-content-ok/')) return 30;
  if (s.includes('/generated/')) return 20;
  if (s.includes('/needs-regeneration/')) return 10;
  if (s.includes('/ready/')) return 25;
  return 0;
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function optionByLetter(options, letter) {
  const lc = String(letter || '').toLowerCase().replace(/[^a-j0-9]/g, '');
  if (!lc) return '';
  for (const opt of options || []) {
    const s = String(opt);
    if (s.toLowerCase().startsWith(`${lc})`)) return stripOptionLetter(s);
    if (lc === '0' && /^0\)/i.test(s)) return stripOptionLetter(s);
  }
  return '';
}

/**
 * T3 fingerprint invariante al reordenamiento de letras A–J.
 *
 * Para cada una de las 7 preguntas emparejamos:
 *   (pregunta_normalizada, texto_del_anuncio_correcto_sin_letra)
 * El conjunto de 7 pares se ordena lexicográficamente y se hashea.
 *
 * Caso real qeh7ew↔tz7n7y: mismas situaciones y mismos anuncios, solo permutadas
 * las etiquetas A–J; el par (situación, anuncio correcto) permanece igual.
 *
 * @param {object} batch
 * @returns {string|null} 16-char hex prefix
 */
export function t3MatchingFingerprint(batch) {
  const questions = (batch?.questions || []).filter((q) => Number(q.teil) === 3);
  if (questions.length !== 7) return null;

  const pairs = questions.map((q) => {
    const qn = normalizeComparableText(q.question);
    const letter = q.correct ?? q.correctAnswer;
    const ad = normalizeComparableText(optionByLetter(q.options, letter));
    return `${qn}|${ad}`;
  });

  pairs.sort();
  return sha256Hex(pairs.join('\n')).slice(0, 16);
}

/**
 * Multiset de enunciados de pregunta (Teil 3/4), ordenado alfabéticamente.
 * @param {object} batch
 * @returns {string|null} hash hex
 */
export function questionsSetFingerprint(batch) {
  const teil = inferTeil(batch);
  if (![3, 4].includes(teil)) return null;
  const texts = (batch.questions || [])
    .map((q) => normalizeComparableText(q.question))
    .filter(Boolean)
    .sort();
  if (!texts.length) return null;
  return sha256Hex(texts.join('\n'));
}

/**
 * @param {object} batch
 * @returns {Array<{ kind: string, id: string, teil: number, preview: string, shingles: string[], tokens?: Set<string> }>}
 */
export function fingerprintsFromBatch(batch, source = '') {
  const teil = inferTeil(batch);
  const out = [];

  for (const p of batch.passages || []) {
    const norm = normalizeComparableText(p.text);
    if (norm.length < 40) continue;
    const hash = sha256Hex(norm);
    const shingles = [...wordShingles(norm)];
    out.push({
      kind: 'passage_hash',
      id: hash,
      teil,
      source,
      preview: String(p.title || p.text || '').slice(0, 60),
      shingles,
      tokens: new Set(norm.split(/\s+/).filter((w) => w.length >= 4)),
    });
  }

  const t3fp = t3MatchingFingerprint(batch);
  if (t3fp) {
    const preview = (batch.questions?.[0]?.question || '').slice(0, 60);
    const normQ = normalizeComparableText(
      (batch.questions || []).map((q) => q.question).join(' '),
    );
    out.push({
      kind: 't3_matching_fp',
      id: t3fp,
      teil: 3,
      source,
      preview,
      shingles: [...wordShingles(normQ)],
    });
  }

  const qset = questionsSetFingerprint(batch);
  if (qset && teil === 4) {
    out.push({
      kind: 'questions_set',
      id: qset,
      teil: 4,
      source,
      preview: (batch.questions?.[0]?.question || '').slice(0, 60),
      shingles: [...wordShingles(
        (batch.questions || []).map((q) => q.question).join(' '),
      )],
    });
  }

  return out;
}

function listLesenJsonFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && /lesen-t/i.test(f) && !f.startsWith('.'))
    .map((f) => path.join(dir, f));
}

/**
 * Extrae entradas de passage desde library/de/B1/questions.json
 * @param {string} bankPath
 * @param {string} sourceLabel
 */
export function fingerprintsFromBank(bankPath, sourceLabel = 'library/de/B1/questions.json') {
  if (!fs.existsSync(bankPath)) return [];
  const data = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const out = [];

  for (const p of data.passages || []) {
    if (String(p.module || '').toLowerCase() !== 'lesen') continue;
    const norm = normalizeComparableText(p.text);
    if (norm.length < 40) continue;
    out.push({
      kind: 'passage_hash',
      id: sha256Hex(norm),
      teil: Number(p.teil) || 0,
      source: `${sourceLabel}::${p.id || 'passage'}`,
      preview: String(p.title || p.text || '').slice(0, 60),
      shingles: [...wordShingles(norm)],
      tokens: new Set(norm.split(/\s+/).filter((w) => w.length >= 4)),
    });
  }

  return out;
}

/**
 * @param {object} [opts]
 * @param {string[]} [opts.dirs] — carpetas con lesen-t*.json
 * @param {string} [opts.bankPath]
 * @param {string[]} [opts.excludeSources] — fuentes a omitir (ej. archivo bajo test)
 */
export function buildDedupCorpus(opts = {}) {
  const dirs = opts.dirs || [];
  const entries = [];
  const seen = new Set();

  const pushEntry = (fp) => {
    const key = `${fp.kind}:${fp.id}:${fp.logicalId || fp.source}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      kind: fp.kind,
      id: fp.id,
      teil: fp.teil,
      source: fp.source,
      logicalId: fp.logicalId ?? logicalBatchId(fp.source),
      preview: fp.preview,
      shingles: fp.shingles,
      _tokens: fp.tokens,
    });
  };

  // Paso 1: elegir una sola ruta física por ID lógico (ready > generated)
  const bestFileByLogicalId = new Map();
  for (const dir of dirs) {
    for (const fp of listLesenJsonFiles(dir)) {
      const rel = fp.replace(/\\/g, '/');
      const source = rel.includes('batches/') ? rel.slice(rel.indexOf('batches/')) : path.basename(fp);
      if ((opts.excludeSources || []).includes(source)) continue;
      const logicalId = logicalBatchId(source);
      const tier = sourceTier(source);
      const prev = bestFileByLogicalId.get(logicalId);
      if (!prev || tier > prev.tier) {
        bestFileByLogicalId.set(logicalId, { abs: fp, source, tier });
      }
    }
  }

  // Paso 2: indexar solo la ruta ganadora por ID lógico
  for (const { abs, source } of bestFileByLogicalId.values()) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    const logicalId = logicalBatchId(source);
    for (const f of fingerprintsFromBatch(batch, source)) {
      pushEntry({ ...f, logicalId });
    }
  }

  if (opts.bankPath) {
    for (const f of fingerprintsFromBank(opts.bankPath)) {
      pushEntry({ ...f, logicalId: null });
    }
  }

  return { entries, index: buildIndexFromEntries(entries) };
}

/**
 * Jaccard token similarity between two normalized token sets.
 */
export function tokenJaccard(tokensA, tokensB) {
  if (!tokensA?.size || !tokensB?.size) return 0;
  return jaccardSets(tokensA, tokensB);
}

/**
 * Excluye entradas del mismo batch (todas las rutas espejo) al evaluar un archivo.
 * @param {object} corpus
 * @param {string} source — ruta del archivo bajo test
 */
export function corpusExcludingSource(corpus, source) {
  const logicalId = logicalBatchId(source);
  const entries = (corpus.entries || []).filter((e) => {
    if (e.source === source) return false;
    if (logicalId && e.logicalId === logicalId) return false;
    return true;
  });
  return { entries, index: buildIndexFromEntries(entries) };
}

export { sha256Hex, normalizeComparableText };
