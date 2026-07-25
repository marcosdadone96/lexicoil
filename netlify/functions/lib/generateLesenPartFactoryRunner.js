'use strict';

const { pathToFileURL } = require('url');
const { resolveFromRoot } = require('./projectRoot.js');

let _mod = null;

async function loadFactory() {
  if (!_mod) {
    const href = pathToFileURL(resolveFromRoot('scripts/lib/generateLesenPartFactory.mjs')).href;
    _mod = await import(href);
  }
  return _mod;
}

async function createLesenFactorySession(opts) {
  const mod = await loadFactory();
  return mod.createLesenFactorySession(opts);
}

async function generateLesenPart(opts) {
  const mod = await loadFactory();
  return mod.generateLesenPart(opts);
}

module.exports = {
  createLesenFactorySession,
  generateLesenPart,
  loadFactory,
};
