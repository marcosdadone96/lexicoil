#!/usr/bin/env node
/** Minimal Blobs read/write probe from local CLI. */
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
loadEnvFile();

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
console.log('NETLIFY_SITE_ID:', siteID ? `${siteID.slice(0, 8)}…` : '(missing)');
console.log('NETLIFY_API_TOKEN:', token ? `set (${token.length} chars)` : '(missing)');
console.log('NETLIFY_BLOBS_CONTEXT:', process.env.NETLIFY_BLOBS_CONTEXT ?? '(unset)');

if (!siteID || !token) {
  console.error('Missing credentials');
  process.exit(1);
}

const { getStore } = require('@netlify/blobs');
const { listPartsIndex } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));

const STORE_NAME = 'lexicoil-data';
const store = getStore({ name: STORE_NAME, siteID, token });

const testKey = `reusable_part:de:B1:lesen:_probe_${Date.now()}`;

async function timed(label, fn) {
  const t0 = Date.now();
  console.log(`\n→ ${label}…`);
  try {
    const result = await fn();
    console.log(`✓ ${label} (${Date.now() - t0}ms)`);
    return result;
  } catch (err) {
    console.error(`✗ ${label} (${Date.now() - t0}ms):`, err.message || err);
    if (err.cause) console.error('  cause:', err.cause);
    throw err;
  }
}

try {
  await timed('listPartsIndex lesen (read)', () => listPartsIndex(store, 'de', 'B1', 'lesen'));
  await timed('setJSON probe write', () => store.setJSON(testKey, { probe: true, at: new Date().toISOString() }));
  const got = await timed('get probe', () => store.get(testKey, { type: 'json' }));
  console.log('  read back:', got);
  await timed('delete probe', () => store.delete(testKey));
  console.log('\nOK — local CLI can read/write Blobs.');
} catch (err) {
  console.error('\nFAIL — Blobs probe aborted.');
  process.exit(1);
}
