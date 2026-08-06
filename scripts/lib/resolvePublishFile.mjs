/**
 * Resolve batch JSON path after finalizePoolReady moves files out of batches/generated/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import {
  GENERATED_DIR,
  POOL_VERIFIED_DIR,
  POOL_CONTENT_OK_DIR,
  normalizeLevel,
  allStagingScanDirs,
  generatedDir,
  poolVerifiedDir,
  poolContentOkDir,
  poolContentOkLesenDir,
  needsRegenerationDir,
} from './batchPaths.mjs';

/**
 * @param {string} relFile — path returned by generator (often batches/generated/…)
 * @param {string} [level] — B1|A2|…; when set, level subdir is tried first
 * @returns {{ relFile: string, absPath: string, source: string } | null}
 */
export function resolvePublishFile(relFile, level = null) {
  const base = path.basename(String(relFile || '').replace(/\\/g, '/'));
  if (!base) return null;

  const lv = level ? normalizeLevel(level) : null;
  const candidates = [];

  if (String(relFile || '').includes('/')) {
    candidates.push({ rel: String(relFile).replace(/\\/g, '/'), source: 'given' });
  }

  if (lv) {
    for (const d of allStagingScanDirs(lv)) {
      const rel = path.relative(ROOT, path.join(d, base)).replace(/\\/g, '/');
      candidates.push({ rel, source: d.includes('pool-verified') ? 'pool-verified' : d.split('/').slice(-2).join('/') });
    }
  }

  candidates.push(
    { rel: `batches/generated/${base}`, source: 'generated-legacy' },
    { rel: `batches/ready/pool-verified/${base}`, source: 'pool-verified-legacy' },
    { rel: `batches/ready/pool-content-ok/${base}`, source: 'pool-content-ok-legacy' },
    { rel: `batches/needs-regeneration/${base}`, source: 'needs-regeneration-legacy' },
  );

  const seen = new Set();
  for (const c of candidates) {
    if (!c.rel || seen.has(c.rel)) continue;
    seen.add(c.rel);
    const abs = path.isAbsolute(c.rel) ? c.rel : path.join(ROOT, c.rel);
    if (fs.existsSync(abs)) {
      return {
        relFile: path.relative(ROOT, abs).replace(/\\/g, '/'),
        absPath: abs,
        source: c.source,
      };
    }
  }
  return null;
}

export function relPathAfterPoolReady(originalRel, poolPath) {
  if (poolPath) {
    return path.relative(ROOT, poolPath).replace(/\\/g, '/');
  }
  const resolved = resolvePublishFile(originalRel);
  return resolved?.relFile || String(originalRel || '').replace(/\\/g, '/');
}

export {
  GENERATED_DIR,
  POOL_VERIFIED_DIR,
  POOL_CONTENT_OK_DIR,
  generatedDir,
  poolVerifiedDir,
  poolContentOkDir,
  poolContentOkLesenDir,
  needsRegenerationDir,
};
