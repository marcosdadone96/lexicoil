#!/usr/bin/env node
/**
 * Alias: usa check-horen-batch-quality.mjs
 *
 *   node scripts/check-horen-quality.mjs --teil N --file path.json
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-horen-batch-quality.mjs');
const res = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);