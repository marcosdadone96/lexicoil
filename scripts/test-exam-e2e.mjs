#!/usr/bin/env node
/**
 * @deprecated Use test-exam-engine-e2e.mjs (engine v2). This script delegates to it.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-exam-engine-e2e.mjs');
const live = process.argv.includes('--live');
const args = [script, ...(live ? ['--live'] : ['--dry'])];
const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
