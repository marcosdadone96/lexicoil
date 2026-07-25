'use strict';

const fs = require('fs');
const path = require('path');
const { resolveFromRoot, ROOT } = require('./projectRoot.js');

const ERROR_BASENAME = 'last-hybrid-error.json';

function errorFileCandidates() {
  const seen = new Set();
  const out = [];
  const add = (p) => {
    const norm = path.resolve(p);
    if (seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };
  add(resolveFromRoot(ERROR_BASENAME));
  add(path.join(ROOT, ERROR_BASENAME));
  add(path.join(process.cwd(), ERROR_BASENAME));
  return out;
}

function errorFilePath() {
  return errorFileCandidates()[0];
}

function serializeError(err) {
  if (!err) return { message: 'unknown', stack: null };
  const out = {
    name: err.name || 'Error',
    message: err.message || String(err),
    stack: err.stack || null,
  };
  if (err.status != null) out.status = err.status;
  if (err.code) out.code = err.code;
  if (err.details !== undefined) out.details = err.details;
  if (err.data !== undefined) out.data = err.data;
  if (err.cause) {
    out.cause = err.cause instanceof Error ? serializeError(err.cause) : err.cause;
  }
  return out;
}

/**
 * Log hybrid failure to console + repo-root last-hybrid-error.json (survives without terminal).
 */
function writeHybridError(source, err, context = {}) {
  const payload = {
    at: new Date().toISOString(),
    source,
    pid: process.pid,
    cwd: process.cwd(),
    root: ROOT,
    error: serializeError(err),
    context,
  };

  console.error(`[${source}] ERROR:`, payload.error.message);
  if (payload.error.stack) console.error(payload.error.stack);

  let written = null;
  for (const file of errorFileCandidates()) {
    try {
      fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      written = file;
      console.error(`[${source}] wrote ${file}`);
      break;
    } catch (writeErr) {
      console.error(`[${source}] failed to write ${file}:`, writeErr.message);
    }
  }
  payload.writtenTo = written;

  return payload;
}

module.exports = {
  ERROR_BASENAME,
  errorFilePath,
  errorFileCandidates,
  serializeError,
  writeHybridError,
};
