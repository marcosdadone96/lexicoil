#!/usr/bin/env node
/** Unit test anthropicKey resolver (no API call). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const modPath = path.join(ROOT, 'netlify/functions/lib/anthropicKey.js');

const saved = process.env.ANTHROPIC_API_KEY;
const savedDirect = process.env.ANTHROPIC_API_KEY_DIRECT;

function load() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const jwt = 'eyJhbGci.test.jwt.token.for.gateway.simulation.only.xxxxxxxxxxxxxxxxxxxx';

process.env.ANTHROPIC_API_KEY = jwt;
delete process.env.ANTHROPIC_API_KEY_DIRECT;
const { readAnthropicKey } = load();
const resolved = readAnthropicKey();
ok(resolved.startsWith('sk-ant-'), 'JWT in process.env → falls back to .env sk-ant');
ok(resolved.length >= 40, 'resolved key length ok');

process.env.ANTHROPIC_API_KEY = jwt;
process.env.ANTHROPIC_API_KEY_DIRECT = 'sk-ant-api03-direct-override-key-for-test-only-xx';
const resolved2 = load().readAnthropicKey();
ok(resolved2.includes('direct-override'), 'ANTHROPIC_API_KEY_DIRECT wins over JWT');

if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
else delete process.env.ANTHROPIC_API_KEY;
if (savedDirect !== undefined) process.env.ANTHROPIC_API_KEY_DIRECT = savedDirect;
else delete process.env.ANTHROPIC_API_KEY_DIRECT;

console.log('\nanthropicKey resolver tests passed.');
