#!/usr/bin/env node
/**
 * @deprecated Prefer scripts/reorder-horen-t3-char-chrono-2026-07-12.mjs
 *
 * This file previously verified chrono via audio-turn token overlap — that
 * metric is FORBIDDEN (false green on horen-t3-gemini-004). It now delegates
 * to the canonical char-position metric in horenRfChronoEvidence.mjs.
 *
 *   node scripts/reorder-horen-t3-004-chrono-2026-07-12.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'reorder-horen-t3-char-chrono-2026-07-12.mjs');
console.warn(
  '[deprecated] audio-turn chrono metric removed; running char-pos reorder:',
  path.basename(target),
);
const r = spawnSync(process.execPath, [target], { stdio: 'inherit' });
process.exit(r.status ?? 1);
