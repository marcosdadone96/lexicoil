'use strict';

const fs = require('fs');
const path = require('path');

/** Resolve repo root for Netlify dev (cwd) and bundled functions. */
function findProjectRoot() {
  const candidates = [
    process.cwd(),
    path.join(__dirname, '..', '..', '..'),
    path.join(__dirname, '..', '..'),
  ];
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, 'js', 'engine', 'validation', 'ExamValidator.js'))) {
      return root;
    }
  }
  return process.cwd();
}

const ROOT = findProjectRoot();

function resolveFromRoot(...segments) {
  return path.join(ROOT, ...segments);
}

module.exports = { findProjectRoot, ROOT, resolveFromRoot };
