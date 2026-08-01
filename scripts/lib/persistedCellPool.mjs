/**
 * Celda topic×Teil — moldes y títulos desde pool persistido completo
 * (manifest + pool-verified + generated + rejected), no solo sesión ni de_B1.json.
 */
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './loadEnv.mjs';
import { normalizeB1Topic } from './b1Topics.mjs';
import {
  loadPoolRecords,
  filterCellRecords,
  collectCellMolds,
  detectT5Subtype,
  detectT4DebateTopic,
} from './lesenSubtypeRotation.mjs';
import { extractStructuralMold, structuralMoldKey, normTitle } from './structuralMoldDedup.mjs';

/** Solo partes publicables / en vuelo OK — no .rejected ni needs-regeneration (CHK-29 / picker). */
export const PERSISTED_POOL_SCAN_DIRS = Object.freeze([
  path.join(ROOT, 'batches/ready/pool-verified/B1'),
  path.join(ROOT, 'batches/ready/pool-content-ok-lesen/B1'),
  path.join(ROOT, 'batches/ready/lesen/B1'),
  path.join(ROOT, 'batches/generated/B1'),
]);

function walkJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonFiles(abs, out);
    else if (ent.name.endsWith('.json') && !ent.name.startsWith('.')) out.push(abs);
  }
  return out;
}

function batchTopicTag(batch) {
  return normalizeB1Topic(
    batch.topicTag || batch._requestedTopic || batch.passages?.[0]?.topicTag || batch.passage?.topicTag,
  );
}

function batchTeil(batch) {
  return Number(batch.teil ?? batch.passages?.[0]?.teil ?? batch.questions?.[0]?.teil);
}

function batchLangLevel(batch, lang, level) {
  const bl = String(batch.lang || batch.passages?.[0]?.lang || 'de').toLowerCase();
  const bLv = String(batch.level || batch.passages?.[0]?.level || 'B1').toUpperCase();
  return bl === String(lang).toLowerCase() && bLv === String(level).toUpperCase();
}

/**
 * @param {object} opts
 * @returns {object[]}
 */
export function loadPersistedCellBatches(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const topic = normalizeB1Topic(opts.topicTag);
  const teil = Number(opts.teil);
  if (!topic || ![4, 5].includes(teil)) return [];

  const seen = new Set();
  const rows = [];
  for (const dir of PERSISTED_POOL_SCAN_DIRS) {
    for (const abs of walkJsonFiles(dir)) {
      const base = path.basename(abs);
      if (seen.has(base)) continue;
      try {
        const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
        if (batchTeil(b) !== teil) continue;
        if (!batchLangLevel(b, lang, level)) continue;
        if (batchTopicTag(b) !== topic) continue;
        seen.add(base);
        rows.push({ ...b, _file: base, _path: abs });
      } catch {
        /* skip corrupt */
      }
    }
  }
  return rows;
}

/**
 * Moldes/títulos usados en celda — manifest + JSON persistidos + extras de sesión.
 */
export function loadPersistedCellMolds(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const topic = normalizeB1Topic(opts.topicTag);
  const teil = Number(opts.teil);
  const records = loadPoolRecords({ lang, level, poolFile: opts.poolFile });
  const cellRecs = filterCellRecords(records, { lang, level, teil, topicTag: topic });
  const manifest = collectCellMolds(cellRecs, { teil });

  const moldKeys = new Set(manifest.moldKeys);
  const titles = new Set(manifest.titles.map((t) => String(t).trim()).filter(Boolean));
  const subtypes = new Set(manifest.subtypes);
  const normalizedTitles = new Set(
    manifest.titles.map(normTitle).filter((t) => t.length >= 8),
  );

  const persistedBatches = loadPersistedCellBatches({ lang, level, topicTag: topic, teil });
  for (const batch of persistedBatches) {
    const mold = extractStructuralMold(batch, teil);
    const mk = structuralMoldKey(mold);
    if (mk) moldKeys.add(mk);
    if (mold.key && !mold.profile) moldKeys.add(mold.key);

    const title = batch.passages?.[0]?.title || batch.passage?.title;
    if (title) {
      const trimmed = String(title).trim();
      titles.add(trimmed);
      const nt = normTitle(trimmed);
      if (nt.length >= 8) normalizedTitles.add(nt);
    }

    if (teil === 5) {
      const st = batch._textSubtype || detectT5Subtype(batch);
      if (st) subtypes.add(st);
    } else if (batch._debateSeed) {
      subtypes.add(String(batch._debateSeed));
    } else if (batch.debateSeed) {
      subtypes.add(String(batch.debateSeed));
    } else {
      const dt = detectT4DebateTopic(batch);
      if (dt) subtypes.add(dt);
    }
  }

  for (const t of opts.extraExcludeTitles || []) {
    if (!t) continue;
    titles.add(String(t).trim());
    const nt = normTitle(t);
    if (nt.length >= 8) normalizedTitles.add(nt);
  }
  for (const k of opts.extraMoldKeys || []) {
    if (k) moldKeys.add(k);
  }
  for (const s of opts.extraSubtypes || []) {
    if (s) subtypes.add(s);
  }

  return {
    moldKeys: [...moldKeys],
    titles: [...titles],
    normalizedTitles: [...normalizedTitles],
    subtypes: [...subtypes],
    manifestRecordCount: cellRecs.length,
    persistedBatchCount: persistedBatches.length,
    cellCount: cellRecs.length + persistedBatches.length,
    persistedBatches,
  };
}

/** Corpus CHK-29 alineado con el picker de títulos (misma fuente persistida). */
export function buildPersistedStructuralCorpus(opts = {}) {
  const teil = Number(opts.teil);
  const topic = normalizeB1Topic(opts.topicTag);
  if (!topic || ![4, 5].includes(teil)) return [];
  return loadPersistedCellBatches(opts).map((b) => ({
    ...b,
    id: b.id || String(b._file || '').replace(/\.json$/i, '') || undefined,
  }));
}
