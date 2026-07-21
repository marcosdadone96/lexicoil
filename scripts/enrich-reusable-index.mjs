/**
 * enrich-reusable-index.mjs — PASO 1+2: topicTag (B1) + vocabIndex [{word}] extensible.
 *
 * Indexa TODAS las partes existentes del pool (seed local + Blobs prod).
 * Las partes nuevas reciben el mismo índice vía addReusablePart → applyPartIndex.
 *
 * Backups seed before write. Idempotent.
 *
 *   node scripts/enrich-reusable-index.mjs --lang de --level B1
 *   node scripts/enrich-reusable-index.mjs --lang de --level B1 --apply
 *   NETLIFY_SITE_ID=... NETLIFY_API_TOKEN=... node scripts/enrich-reusable-index.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { B1_TOPICS } from './lib/b1Topics.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { applyPartIndex, partText, resolveTopicTag } = require(
  path.join(ROOT, 'netlify/functions/lib/partIndex.js'),
);
const { listPartsIndex } = require(
  path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'),
);
const { STORE_NAME } = require(
  path.join(ROOT, 'netlify/functions/lib/blobStore.js'),
);

const MODULES = ['lesen', 'horen', 'schreiben', 'sprechen'];
const WRITE_TIMEOUT_MS = Number(process.env.REUSABLE_WRITE_TIMEOUT_MS || 20000);

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
  }
  return o;
}

function backupSeedFile(file) {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(file, '.json');
  const dest = path.join(dir, `${base}.${stamp}.json`);
  fs.copyFileSync(file, dest);
  return dest;
}

function summarizeRecords(records, lang, level) {
  const stats = {
    total: records.length,
    withTopicTag: 0,
    unknownTopic: 0,
    withVocabIndex: 0,
    topicCounts: Object.fromEntries(B1_TOPICS.map((t) => [t, 0])),
  };

  for (const rec of records) {
    const tagged = applyPartIndex({ ...rec }, { lang, level, force: true });
    if (tagged.topicTag) {
      stats.withTopicTag++;
      stats.topicCounts[tagged.topicTag] = (stats.topicCounts[tagged.topicTag] || 0) + 1;
    } else {
      stats.unknownTopic++;
    }
    if (Array.isArray(tagged.vocabIndex) && tagged.vocabIndex.length) {
      stats.withVocabIndex++;
    }
  }
  return stats;
}

function enrichSeedFile(file, lang, level, apply) {
  if (!fs.existsSync(file)) {
    return { file: null, stats: null, backup: null };
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(data.records) ? data.records : [];
  const dryStats = summarizeRecords(records, lang, level);

  if (!apply) {
    return { file, stats: dryStats, backup: null, written: false };
  }

  const backup = backupSeedFile(file);
  for (const rec of records) {
    applyPartIndex(rec, { lang, level, force: true });
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const stats = summarizeRecords(records, lang, level);
  return { file, stats, backup, written: true };
}

function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function enrichBlobs(lang, level) {
  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    console.error('No se pudo conectar a Netlify Blobs:', err.message);
    throw err;
  }

  const summary = { updated: 0, unknown: 0, failed: 0 };
  for (const module of MODULES) {
    const index = await listPartsIndex(store, lang, level, module);
    for (const row of index) {
      try {
        const part = await store.get(row.partKey, { type: 'json' });
        if (!part) continue;
        applyPartIndex(part, { lang, level, force: true });
        if (!part.topicTag) summary.unknown++;
        await withTimeout(store.setJSON(row.partKey, part), WRITE_TIMEOUT_MS, row.id);
        summary.updated++;
      } catch (err) {
        summary.failed++;
        console.warn(`  ✗ ${module} ${row.id}: ${err.message}`);
      }
    }
  }
  return summary;
}

function printStats(label, stats) {
  console.log(`\n── ${label} ──`);
  console.log(`  Total partes:        ${stats.total}`);
  console.log(`  Con topicTag B1:     ${stats.withTopicTag}`);
  console.log(`  Sin clasificar:      ${stats.unknownTopic}`);
  console.log(`  Con vocabIndex:      ${stats.withVocabIndex}`);
  const topTopics = Object.entries(stats.topicCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t, n]) => `${t}:${n}`)
    .join(', ');
  console.log(`  Distribución (top):  ${topTopics || '(ninguna)'}`);
}

function showExample(records) {
  const sample = records.find((r) =>
    r.module === 'lesen' && r.teil === 2 && r.topicTag === 'Umwelt' && r.vocabIndex?.length,
  ) || records.find((r) => r.vocabIndex?.length);
  if (!sample) {
    console.log('\n(no hay ejemplo con vocabIndex)');
    return;
  }
  console.log('\n── Ejemplo vocabIndex ──');
  console.log(`  id:       ${sample.id}`);
  console.log(`  module:   ${sample.module} T${sample.teil}`);
  console.log(`  topicTag: ${sample.topicTag || '(null)'}`);
  console.log(`  vocabIndex (${sample.vocabIndex.length} entradas, primeras 5):`);
  console.log(JSON.stringify(sample.vocabIndex.slice(0, 5), null, 2));
  console.log('  → objetos extensibles: mañana se añade { lemma, translations } sin migración.');
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const seedDir = path.join(ROOT, 'library', 'reusable-seed');
  const seedFiles = [
    path.join(seedDir, `${opts.lang}_${opts.level}.json`),
    path.join(seedDir, `${opts.lang}_${opts.level}.bank.json`),
  ];

  console.log(`Enrich pool index — ${opts.lang}_${opts.level} — ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);

  let allRecords = [];
  for (const file of seedFiles) {
    const { file: f, stats, backup, written } = enrichSeedFile(file, opts.lang, opts.level, opts.apply);
    if (!stats) continue;
    printStats(path.relative(ROOT, f), stats);
    if (backup) console.log(`  Backup: ${path.relative(ROOT, backup)}`);
    if (written) console.log('  ✓ Seed actualizado');
    if (fs.existsSync(f)) {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      allRecords.push(...(data.records || []));
    }
  }

  if (opts.apply) {
    if (process.env.NETLIFY_SITE_ID && (process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN)) {
      const blobs = await enrichBlobs(opts.lang, opts.level);
      console.log(`\n[blobs] actualizadas: ${blobs.updated}, sin topicTag: ${blobs.unknown}, fallos: ${blobs.failed}`);
    } else {
      console.log('\n[blobs] omitido — define NETLIFY_SITE_ID + NETLIFY_API_TOKEN para producción');
    }
    showExample(allRecords);
  } else {
    console.log('\nDRY-RUN — ejecuta con --apply para escribir (crea backup automático del seed).');
  }
})().catch((err) => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});
