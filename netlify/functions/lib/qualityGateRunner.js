'use strict';

/**
 * CJS façade for PASO 9 QualityGateRunner (audit mode).
 * Prefer scripts/lib/qualityGates/qualityGateRunner.mjs from Node ESM.
 */
const path = require('path');
const { pathToFileURL } = require('url');

let _cached = null;

async function loadRunner() {
  if (_cached) return _cached;
  const modPath = path.join(__dirname, '../../../scripts/lib/qualityGates/qualityGateRunner.mjs');
  _cached = await import(pathToFileURL(modPath).href);
  return _cached;
}

async function runQualityGates(input) {
  const mod = await loadRunner();
  return mod.runQualityGates(input);
}

module.exports = {
  runQualityGates,
  loadRunner,
};
