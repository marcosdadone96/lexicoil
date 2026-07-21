'use strict';

/**
 * Lazy ESM loader for scripts/lib/partGate.mjs (+ normalizeBatch) in Netlify runtime.
 * Paths resolve via projectRoot (repo root in dev + included_files bundle).
 */
const { pathToFileURL } = require('url');
const { resolveFromRoot } = require('./projectRoot.js');

let _partGate = null;
let _normalizeBatch = null;

async function loadPartGate() {
  if (!_partGate) {
    const href = pathToFileURL(resolveFromRoot('scripts/lib/partGate.mjs')).href;
    _partGate = await import(href);
  }
  return _partGate;
}

async function loadNormalizeBatch() {
  if (!_normalizeBatch) {
    const href = pathToFileURL(resolveFromRoot('scripts/lib/normalizeBatch.mjs')).href;
    _normalizeBatch = await import(href);
  }
  return _normalizeBatch;
}

async function validatePart(partObject, opts) {
  const mod = await loadPartGate();
  return mod.validatePart(partObject, opts);
}

async function buildDedupCorpusFromBatches(batches) {
  const mod = await loadPartGate();
  return mod.buildDedupCorpusFromBatches(batches);
}

async function coerceGeneratedLesenPart(batch, ctx) {
  const mod = await loadNormalizeBatch();
  return mod.coerceGeneratedLesenPart(batch, ctx);
}

module.exports = {
  validatePart,
  buildDedupCorpusFromBatches,
  coerceGeneratedLesenPart,
  loadPartGate,
};
