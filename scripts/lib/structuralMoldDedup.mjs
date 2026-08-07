/**
 * CHK-29 — dedup estructural (subtipo T4/T5 + título) en la misma celda topicTag×Teil.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { detectT4DebateTopic, detectT5Subtype } from './lesenSubtypeRotation.mjs';
import { inferBatchLevel, normalizeLevel } from './batchPaths.mjs';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

export function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim();
}

function a2LesenT4MoldKey(batch) {
  const titles = (batch.passages || [])
    .map((p) => normTitle(p.title))
    .filter((t) => t.length >= 3)
    .sort();
  if (titles.length < 6) return 'a2_anzeigen:incomplete';
  return `a2_anzeigen:${titles.join('|')}`;
}

export function extractStructuralMold(batch, teil, opts = {}) {
  const t = Number(teil ?? batch.teil ?? batch.questions?.[0]?.teil);
  const title = normTitle(batch.passages?.[0]?.title || batch.passage?.title || '');
  const level = String(opts.level || inferBatchLevel(batch)).toUpperCase();
  if (t === 5) {
    const subtype = batch._textSubtype || detectT5Subtype(batch);
    const profile = batch._t5VariantProfile || null;
    return { kind: 't5_subtype', key: subtype || null, profile, title };
  }
  if (t === 4) {
    if (level === 'A2') {
      return { kind: 'a2_anzeigen', key: a2LesenT4MoldKey(batch), profile: null, title };
    }
    const debate = batch._debateSeed || batch._debateTopic || detectT4DebateTopic(batch);
    return { kind: 't4_debate', key: debate || null, profile: null, title };
  }
  return { kind: null, key: null, profile: null, title };
}

/** Mold key for CHK-29 dedup (subtype + optional variant profile). */
export function structuralMoldKey(mold) {
  if (!mold?.key) return null;
  if (mold.profile) return `${mold.key}:${mold.profile}`;
  return mold.key;
}

function batchTopicTag(batch) {
  return normalizeB1Topic(batch.topicTag || batch._requestedTopic || batch.passages?.[0]?.topicTag);
}

/**
 * @param {object} batch
 * @param {object[]} corpus — batches previos (misma sesión o pool)
 * @param {object} [opts]
 * @returns {{ ok: boolean, issue?: string, moldKey?: string, similarTo?: string }}
 */
export function checkStructuralMoldDuplicate(batch, corpus, opts = {}) {
  const teil = Number(opts.teil ?? batch.teil ?? batch.questions?.[0]?.teil);
  const topicTag = batchTopicTag(batch);
  const batchLevel = normalizeLevel(opts.level || inferBatchLevel(batch));
  const mold = extractStructuralMold(batch, teil, { level: batchLevel });

  if (![4, 5].includes(teil) || !topicTag) {
    return { ok: true, skipped: 'not_t4_t5' };
  }

  for (const other of corpus || []) {
    if (other === batch) continue;
    const oTeil = Number(other.teil ?? other.questions?.[0]?.teil);
    if (oTeil !== teil) continue;
    if (batchTopicTag(other) !== topicTag) continue;
    if (normalizeLevel(inferBatchLevel(other)) !== batchLevel) continue;

    const oMold = extractStructuralMold(other, oTeil, { level: batchLevel });
    const ref = other.id || other.file || oMold.title?.slice(0, 40) || 'corpus';

    const moldKey = structuralMoldKey(mold);
    const oMoldKey = structuralMoldKey(oMold);

    if (moldKey && oMoldKey && moldKey === oMoldKey) {
      return {
        ok: false,
        moldKey,
        similarTo: ref,
        issue:
          `CHK-29: molde estructural «${moldKey}» ya usado en ${topicTag}×T${teil} ` +
          `(similar a ${ref}). Elige otro subtipo/perfil de variante.`,
      };
    }

    if (mold.title && oMold.title && mold.title.length >= 12 && mold.title === oMold.title) {
      return {
        ok: false,
        moldKey: mold.title,
        similarTo: ref,
        issue:
          `CHK-29: título idéntico «${batch.passages?.[0]?.title || mold.title}» en celda ${topicTag}×T${teil}.`,
      };
    }
  }

  return { ok: true };
}

/** Carga batches T4/T5 desde un directorio (terminal pool-fill). */
export function loadStructuralCorpusFromDir(dir) {
  const batches = [];
  if (!dir || !fs.existsSync(dir)) return batches;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const teil = Number(raw.teil ?? raw.questions?.[0]?.teil);
      if (![4, 5].includes(teil)) continue;
      batches.push({ ...raw, id: raw.id || name.replace(/\.json$/i, '') });
    } catch {
      /* skip corrupt */
    }
  }
  return batches;
}
