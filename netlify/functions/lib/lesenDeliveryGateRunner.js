'use strict';

const { pathToFileURL } = require('url');
const { resolveFromRoot } = require('./projectRoot.js');

let _mod = null;

async function loadLesenDeliveryGate() {
  if (!_mod) {
    const href = pathToFileURL(resolveFromRoot('scripts/lib/lesenDeliveryGate.mjs')).href;
    _mod = await import(href);
  }
  return _mod;
}

async function validateLesenDelivery(batch, opts) {
  const mod = await loadLesenDeliveryGate();
  return mod.validateLesenDelivery(batch, opts);
}

async function lesenDeliveryGateOpts(teil) {
  const mod = await loadLesenDeliveryGate();
  return mod.lesenDeliveryGateOpts(teil);
}

module.exports = {
  validateLesenDelivery,
  lesenDeliveryGateOpts,
  loadLesenDeliveryGate,
};
