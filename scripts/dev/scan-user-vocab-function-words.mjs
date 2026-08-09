#!/usr/bin/env node
/**
 * Scan + migrate user flashcards for German function words saved as noun/verb/adjective.
 *
 * Usage:
 *   node scripts/dev/scan-user-vocab-function-words.mjs --email user@example.com
 *   node scripts/dev/scan-user-vocab-function-words.mjs --file path/to/sync.json
 *   node scripts/dev/scan-user-vocab-function-words.mjs --all
 *   node scripts/dev/scan-user-vocab-function-words.mjs --all --migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from '../lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { isFunctionWord } = require(path.join(ROOT, 'js/data/functionWords.js'));
const { syncKey, normalizeEmail } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const ManualVocab = require(path.join(ROOT, 'js/data/manualVocab.js'));

function normWordType(pos) {
  const p = String(pos || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (p.startsWith('noun') || p === 'n') return 'noun';
  if (p.startsWith('verb') || p === 'v') return 'verb';
  if (p.startsWith('adj')) return 'adjective';
  if (p.startsWith('adv')) return 'adverb';
  return 'other';
}

function parseArgs(argv) {
  const out = { email: '', file: '', all: false, migrate: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) out.email = String(argv[++i]).trim().toLowerCase();
    else if (a === '--file' && argv[i + 1]) out.file = argv[++i];
    else if (a === '--all') out.all = true;
    else if (a === '--migrate') out.migrate = true;
  }
  return out;
}

function analyzeFlashcards(flashcards, label) {
  const hits = [];
  for (const fc of flashcards || []) {
    const word = String(fc?.word || '').trim();
    const low = word.toLowerCase();
    if (!low) continue;
    const sub = fc?.sourceLang || 'de';
    if (sub !== 'de' || !isFunctionWord(low)) continue;
    const stored = normWordType(fc.type || fc.pos);
    if (stored === 'verb' || stored === 'noun' || stored === 'adjective') {
      hits.push({
        word,
        stored,
        inferred: normWordType(ManualVocab.inferPos(fc, sub)),
        sourceLang: sub,
        level: fc.sourceLevel,
        savedAt: fc.savedAt,
      });
    }
  }
  return { label, total: (flashcards || []).length, hits };
}

function migrateFlashcards(flashcards) {
  const before = (flashcards || []).length;
  const removed = [];
  const kept = [];
  for (const fc of flashcards || []) {
    const word = String(fc?.word || '').trim();
    const sub = fc?.sourceLang || 'de';
    if (sub === 'de' && isFunctionWord(word)) {
      removed.push({ word, type: fc.type || fc.pos, savedAt: fc.savedAt });
      continue;
    }
    kept.push(fc);
  }
  return { flashcards: kept, removed, before, after: kept.length };
}

async function getBlobStore() {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (!siteId || !token) throw new Error('NETLIFY_SITE_ID + NETLIFY_API_TOKEN required');
  const { getStore } = await import('@netlify/blobs');
  const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));
  return getStore({ name: STORE_NAME, siteID: siteId, token });
}

async function listSyncEmails(store) {
  const emails = [];
  let cursor;
  for (;;) {
    const page = await store.list({ prefix: 'sync:', cursor, directories: false });
    for (const b of page?.blobs || []) {
      const key = String(b?.key || '');
      if (!key.startsWith('sync:')) continue;
      const email = normalizeEmail(key.slice(5));
      if (email) emails.push(email);
    }
    if (!page?.hasMore) break;
    cursor = page.cursor;
  }
  return emails.sort();
}

async function loadFromBlobs(store, email) {
  const key = syncKey(email);
  const raw = await store.get(key, { type: 'text' });
  if (!raw) return null;
  return JSON.parse(raw);
}

async function saveToBlobs(store, email, sync) {
  const key = syncKey(email);
  await store.set(key, JSON.stringify(sync));
}

async function scanAll(store, migrate) {
  const emails = await listSyncEmails(store);
  const accounts = [];
  let totalHits = 0;
  let totalRemoved = 0;
  let accountsWithHits = 0;

  for (const email of emails) {
    let sync;
    try {
      sync = await loadFromBlobs(store, email);
    } catch (err) {
      accounts.push({ email, error: err.message || String(err) });
      continue;
    }
    if (!sync) continue;
    const cards = sync.flashcards || sync.deck || [];
    const report = analyzeFlashcards(cards, email);
    let removed = [];
    if (migrate && report.hits.length) {
      const mig = migrateFlashcards(cards);
      removed = mig.removed;
      sync.flashcards = mig.flashcards;
      if (sync.deck) sync.deck = mig.flashcards;
      await saveToBlobs(store, email, sync);
      totalRemoved += removed.length;
    }
    if (report.hits.length) accountsWithHits++;
    totalHits += report.hits.length;
    accounts.push({
      email,
      total: report.total,
      hits: report.hits.length,
      samples: report.hits.slice(0, 5),
      removed: removed.length,
    });
  }

  return {
    mode: migrate ? 'scan+migrate' : 'scan',
    syncAccounts: emails.length,
    accountsWithHits,
    totalPoisonedEntries: totalHits,
    totalRemoved,
    accounts,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.all) {
    const store = await getBlobStore();
    const summary = await scanAll(store, args.migrate);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.totalPoisonedEntries > 0 && !args.migrate) process.exit(1);
    return;
  }

  let sync = null;
  let label = 'inline';
  let store = null;

  if (args.file) {
    sync = JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
    label = path.basename(args.file);
  } else if (args.email) {
    store = await getBlobStore();
    sync = await loadFromBlobs(store, args.email);
    if (!sync) throw new Error(`No sync blob for ${args.email}`);
    label = args.email;
  } else {
    console.error('Usage: --email user@example.com | --file sync.json | --all [--migrate]');
    process.exit(2);
  }

  const cards = sync.flashcards || sync.deck || [];
  const report = analyzeFlashcards(cards, label);
  if (args.migrate && report.hits.length) {
    const mig = migrateFlashcards(cards);
    sync.flashcards = mig.flashcards;
    if (sync.deck) sync.deck = mig.flashcards;
    if (args.email && store) await saveToBlobs(store, args.email, sync);
    report.migrated = { removed: mig.removed.length, samples: mig.removed.slice(0, 10) };
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.hits.length && !args.migrate) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
