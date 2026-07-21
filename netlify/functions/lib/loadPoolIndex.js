'use strict';

/**
 * Load merged pool index rows for planHybridDecision / buscar().
 * Uses poolSearchCache — seed + blob metadata cached per container; payloads lazy-loaded.
 */
const { loadModuleSearchRows, resolveRowPart } = require('./poolSearchCache.js');
const { partPassesPublishGate } = require('./partPublishGate.js');

function isPoolReadyRecord(rec, module) {
  if (!partPassesPublishGate(rec)) return false;
  if (module && String(rec.module || '').toLowerCase() !== String(module).toLowerCase()) return false;
  return true;
}

async function loadPoolIndex(store, lang, level, module) {
  const normLang = String(lang || 'de').toLowerCase();
  const normLevel = String(level || 'B1').toUpperCase();
  const normModule = module ? String(module).toLowerCase() : null;
  if (!normModule) return [];

  const { rows } = await loadModuleSearchRows(store, normLang, normLevel, normModule);
  const out = [];
  for (const row of rows) {
    let part = row.part;
    if (!part) part = await resolveRowPart(store, row);
    if (isPoolReadyRecord(part, normModule)) out.push(part);
  }
  return out;
}

module.exports = { loadPoolIndex, isPoolReadyRecord };
