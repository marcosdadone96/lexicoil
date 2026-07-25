'use strict';

const fs = require('fs');
const path = require('path');

/** Resolve repo root for Netlify dev (cwd) and bundled functions. */
function findProjectRoot() {
  const candidates = [
    __dirname,
    process.cwd(),
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..'),
    path.join(__dirname, '..', '..', '..'),
  ];
  const seen = new Set();
  for (const root of candidates) {
    const norm = path.resolve(root);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (fs.existsSync(path.join(norm, 'js', 'engine', 'validation', 'ExamValidator.js'))) {
      return norm;
    }
  }
  return process.cwd();
}

const ROOT = findProjectRoot();

function resolveFromRoot(...segments) {
  return path.join(ROOT, ...segments);
}

module.exports = { findProjectRoot, ROOT, resolveFromRoot };
