#!/usr/bin/env node
/**
 * verify-pool-index.mjs — comprueba cobertura topicTag + vocabIndex en el pool.
 *
 *   node scripts/verify-pool-index.mjs
 *   node scripts/verify-pool-index.mjs --strict   # exit 1 si falta alguno
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { listPartsIndex } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));

function parseArgs(argv) {
  return { strict: argv.includes('--strict'), blobs: argv.includes('--blobs') };
}

function auditRecords(records, label) {
  const stats = {
    label,
    total: records.length,
    topicTag: 0,
    vocabIndex: 0,
    vocabIndexNonEmpty: 0,
    missingTopicTag: [],
    missingVocabIndex: [],
    emptyVocabIndex: [],
  };

  for (const r of records) {
    if (r.topicTag) stats.topicTag++;
    else stats.missingTopicTag.push(r.id);

    if (Array.isArray(r.vocabIndex)) {
      stats.vocabIndex++;
      if (r.vocabIndex.length) stats.vocabIndexNonEmpty++;
      else stats.emptyVocabIndex.push(r.id);
    } else {
      stats.missingVocabIndex.push(r.id);
    }
  }
  return stats;
}

function printStats(stats) {
  console.log(`\n── ${stats.label} ──`);
  console.log(`  Partes:                 ${stats.total}`);
  console.log(`  Con topicTag:           ${stats.topicTag}/${stats.total}`);
  console.log(`  Con vocabIndex[]:       ${stats.vocabIndex}/${stats.total}`);
  console.log(`  vocabIndex no vacío:    ${stats.vocabIndexNonEmpty}/${stats.total}`);
  if (stats.missingTopicTag.length) {
    console.log(`  ⚠ sin topicTag:         ${stats.missingTopicTag.slice(0, 5).join(', ')}${stats.missingTopicTag.length > 5 ? '…' : ''}`);
  }
  if (stats.missingVocabIndex.length) {
    console.log(`  ⚠ sin vocabIndex:       ${stats.missingVocabIndex.slice(0, 5).join(', ')}${stats.missingVocabIndex.length > 5 ? '…' : ''}`);
  }
  if (stats.emptyVocabIndex.length) {
    console.log(`  ⚠ vocabIndex vacío:     ${stats.emptyVocabIndex.slice(0, 5).join(', ')}${stats.emptyVocabIndex.length > 5 ? '…' : ''}`);
  }
  const ok = !stats.missingTopicTag.length && !stats.missingVocabIndex.length;
  console.log(`  Estado:                 ${ok ? '✓ índice completo' : '✗ faltan campos — ejecuta enrich-reusable-index --apply'}`);
  return ok;
}

function loadSeedRecords() {
  const dir = path.join(ROOT, 'library/reusable-seed');
  const records = [];
  for (const suffix of ['.json', '.bank.json']) {
    const file = path.join(dir, `de_B1${suffix}`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data.records)) records.push(...data.records);
  }
  return records;
}

async function loadBlobRecords(lang, level) {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) return null;

  const store = getStore({ name: STORE_NAME, siteID, token });
  const modules = ['lesen', 'horen', 'schreiben', 'sprechen'];
  const records = [];

  for (const module of modules) {
    const index = await listPartsIndex(store, lang, level, module);
    for (const row of index) {
      try {
        const part = await store.get(row.partKey, { type: 'json' });
        if (part) records.push(part);
      } catch (_) { /* skip */ }
    }
  }
  return records;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  console.log('Verificación índice pool (topicTag + vocabIndex)');

  const seedRecords = loadSeedRecords();
  const seedOk = printStats(auditRecords(seedRecords, 'Seed local de_B1'));

  if (opts.blobs) {
    const blobRecords = await loadBlobRecords('de', 'B1');
    if (blobRecords) {
      printStats(auditRecords(blobRecords, 'Blobs producción de/B1'));
    } else {
      console.log('\n[blobs] omitido — NETLIFY_SITE_ID + NETLIFY_API_TOKEN');
    }
  } else {
    console.log('\nTip: añade --blobs para auditar Netlify Blobs prod.');
  }

  console.log('\nPasada offline existentes:  node scripts/enrich-reusable-index.mjs --apply');
  console.log('Propagación a Blobs:        node scripts/push-seed-to-blobs.mjs --apply');
  console.log('Nuevas partes (automático): addReusablePart → applyPartIndex en cada ingest');

  if (opts.strict && !seedOk) process.exit(1);
})().catch((err) => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});
