#!/usr/bin/env node
/**
 * Alias: usa check-prompt-batch-quality.mjs
 *
 *   node scripts/check-prompt-quality.mjs --module schreiben --teil 1 --file path.json
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-prompt-batch-quality.mjs');
const res = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);