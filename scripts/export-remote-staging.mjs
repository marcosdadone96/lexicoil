#!/usr/bin/env node
/**
 * Pull remote staging candidates from Netlify Blobs into local staging/{lang}/{level}/.
 * Requires NETLIFY_BLOBS_CONTEXT or local .netlify/blobs-serve in dev.
 *
 * Usage:
 *   node scripts/export-remote-staging.mjs --lang de --level B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveCandidate } from './pipeline/lib/stagingStore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function loadBlobStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'lexicoil-data', consistency: 'strong' });
  } catch (e) {
    console.warn('Netlify Blobs unavailable:', e.message);
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));
const store = await loadBlobStore();
if (!store) {
  console.error('Cannot connect to Netlify Blobs. Run with netlify dev or set deploy context.');
  process.exit(1);
}

const indexKey = `staging_index:${args.lang}:${args.level}`;
let index = [];
try {
  index = (await store.get(indexKey, { type: 'json' })) || [];
} catch (_) {
  index = [];
}

if (!index.length) {
  console.log(`No remote staging entries for ${args.lang}/${args.level}.`);
  process.exit(0);
}

let imported = 0;
for (const row of index) {
  const key = `staging_candidate:${args.lang}:${args.level}:${row.id}`;
  let candidate;
  try {
    candidate = await store.get(key, { type: 'json' });
  } catch (_) {
    continue;
  }
  if (!candidate) continue;
  if (args.dryRun) {
    console.log(`DRY-OK ${candidate.id} ${candidate.module} teil ${candidate.teil}`);
    imported++;
    continue;
  }
  saveCandidate(candidate);
  console.log(`IMPORT ${candidate.id}`);
  imported++;
}

console.log(`\nImported ${imported} candidate(s) → staging/${args.lang}/${args.level}/`);
