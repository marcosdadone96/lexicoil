#!/usr/bin/env node
/**
 * Fetch one reusable part from Netlify Blobs (production) and print answer keys.
 *
 *   node scripts/fetch-blob-keys.mjs bank-de-B1-lesen-t5-f78f75b335a557c4
 *   node scripts/fetch-blob-keys.mjs --id bank-de-B1-lesen-t5-f78f75b335a557c4 --module lesen
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { partPayloadKey } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));

const argv = process.argv.slice(2);
const id = argv.includes('--id')
  ? argv[argv.indexOf('--id') + 1]
  : argv.find((a) => !a.startsWith('--')) || null;
const moduleArg = argv.includes('--module') ? argv[argv.indexOf('--module') + 1] : null;

if (!id) {
  console.error('Usage: node scripts/fetch-blob-keys.mjs <part-id> [--module lesen]');
  process.exit(1);
}

const module = moduleArg || (id.match(/^bank-de-B1-(lesen|horen|schreiben|sprechen|pool3)-/)?.[1] ?? 'lesen');
const lang = 'de';
const level = 'B1';

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) {
  console.error('Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN / NETLIFY_AUTH_TOKEN in .env');
  process.exit(1);
}

const store = getStore({ name: 'lexicoil-data', siteID, token });
const key = partPayloadKey(lang, level, module, id);

console.log(`blob key: ${key}`);
console.log(`module:   ${module}`);

const payload = await store.get(key, { type: 'json' }).catch((err) => {
  console.error(`store.get failed: ${err.message}`);
  return null;
});

if (!payload) {
  console.error('Blob not found or unreadable.');
  process.exit(1);
}

const questions = payload.questions || [];
const keys = questions.map((q) => String(q.correct ?? q.correctAnswer ?? '').toLowerCase());

console.log(`questions: ${questions.length}`);
console.log(`sequence:  ${keys.join(',')}`);
for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  console.log(`  [${i + 1}] ${q.id || '?'}  correct=${q.correct ?? q.correctAnswer ?? '?'}`);
}
