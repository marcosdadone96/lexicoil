#!/usr/bin/env node
/**
 * Scan + migrate user flashcards for German function words saved as noun/verb/adjective.
 *
 * Sources: Netlify Blobs (sync:) and Supabase (lc_user_flashcards).
 *
 * Usage:
 *   node scripts/dev/scan-user-vocab-function-words.mjs --email user@example.com
 *   node scripts/dev/scan-user-vocab-function-words.mjs --file path/to/sync.json
 *   node scripts/dev/scan-user-vocab-function-words.mjs --all
 *   node scripts/dev/scan-user-vocab-function-words.mjs --all --migrate
 *   node scripts/dev/scan-user-vocab-function-words.mjs --all --source supabase
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from '../lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { isFunctionWord } = require(path.join(ROOT, 'js/data/functionWords.js'));
const { syncKey, normalizeEmail } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const ManualVocab = require(path.join(ROOT, 'js/data/manualVocab.js'));
const sb = require(path.join(ROOT, 'netlify/functions/lib/supabaseAdmin.js'));

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
  const out = { email: '', file: '', all: false, migrate: false, source: 'both' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) out.email = String(argv[++i]).trim().toLowerCase();
    else if (a === '--file' && argv[i + 1]) out.file = argv[++i];
    else if (a === '--all') out.all = true;
    else if (a === '--migrate') out.migrate = true;
    else if (a === '--source' && argv[i + 1]) out.source = String(argv[++i]).trim().toLowerCase();
  }
  return out;
}

function fcSourceLang(fc) {
  return fc?.sourceLang || fc?.lang || 'de';
}

function listFunctionWordsInDeck(flashcards) {
  const found = [];
  for (const fc of flashcards || []) {
    const word = String(fc?.word || '').trim();
    if (!word) continue;
    const sub = fcSourceLang(fc);
    if (sub === 'de' && isFunctionWord(word)) {
      found.push({
        word,
        type: fc.type || fc.pos || fc.wordType || '',
      });
    }
  }
  return found;
}

function analyzeFlashcards(flashcards, label) {
  const hits = [];
  const functionWords = listFunctionWordsInDeck(flashcards);
  for (const fc of flashcards || []) {
    const word = String(fc?.word || '').trim();
    const low = word.toLowerCase();
    if (!low) continue;
    const sub = fcSourceLang(fc);
    if (sub !== 'de' || !isFunctionWord(low)) continue;
    const stored = normWordType(fc.type || fc.pos || fc.wordType);
    if (stored === 'verb' || stored === 'noun' || stored === 'adjective') {
      hits.push({
        word,
        stored,
        inferred: normWordType(ManualVocab.inferPos(fc, sub)),
        sourceLang: sub,
        level: fc.sourceLevel || fc.level,
        savedAt: fc.savedAt,
      });
    }
  }
  return { label, total: (flashcards || []).length, functionWords: functionWords.length, hits };
}

function migrateFlashcards(flashcards) {
  const removed = [];
  const kept = [];
  for (const fc of flashcards || []) {
    const word = String(fc?.word || '').trim();
    const sub = fcSourceLang(fc);
    if (sub === 'de' && isFunctionWord(word)) {
      removed.push({ word, type: fc.type || fc.pos || fc.wordType, savedAt: fc.savedAt });
      continue;
    }
    kept.push(fc);
  }
  return { flashcards: kept, removed, before: (flashcards || []).length, after: kept.length };
}

function sbRowToFc(row) {
  return {
    id: row.id,
    word: row.word,
    type: row.word_type,
    pos: row.word_type,
    wordType: row.word_type,
    sourceLang: row.lang,
    lang: row.lang,
    sourceLevel: row.level,
    level: row.level,
    savedAt: row.created_at ? Date.parse(row.created_at) : null,
    userId: row.user_id,
  };
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

async function scanBlobs(store, migrate) {
  const emails = await listSyncEmails(store);
  const accounts = [];
  let totalHits = 0;
  let totalFunctionWords = 0;
  let totalRemoved = 0;
  let accountsWithHits = 0;
  let accountsWithFunctionWords = 0;

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
    if (migrate && report.functionWords > 0) {
      const mig = migrateFlashcards(cards);
      removed = mig.removed;
      sync.flashcards = mig.flashcards;
      if (sync.deck) sync.deck = mig.flashcards;
      await saveToBlobs(store, email, sync);
      totalRemoved += removed.length;
    }
    if (report.hits.length) accountsWithHits++;
    if (report.functionWords > 0) accountsWithFunctionWords++;
    totalHits += report.hits.length;
    totalFunctionWords += report.functionWords;
    accounts.push({
      email,
      total: report.total,
      functionWords: report.functionWords,
      hits: report.hits.length,
      samples: report.hits.slice(0, 5),
      removed: removed.length,
    });
  }

  return {
    store: 'netlify-blobs',
    mode: migrate ? 'scan+migrate' : 'scan',
    accountCount: emails.length,
    accountsWithFunctionWords,
    accountsWithHits,
    totalFunctionWordEntries: totalFunctionWords,
    totalPoisonedEntries: totalHits,
    totalRemoved,
    accounts,
  };
}

async function fetchAllRows(sbClient, table, select = '*', pageSize = 1000) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sbClient.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function scanSupabase(migrate) {
  if (!sb.isConfigured()) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  const client = sb.getClient();
  if (!client) throw new Error('Supabase client unavailable');

  const [rows, profiles] = await Promise.all([
    fetchAllRows(client, 'lc_user_flashcards'),
    fetchAllRows(client, 'lc_user_profiles', 'id, email'),
  ]);

  const emailByUserId = new Map(
    profiles.map((p) => [String(p.id), normalizeEmail(p.email)]).filter(([, e]) => e),
  );

  const byUser = new Map();
  for (const row of rows) {
    const uid = String(row.user_id);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(row);
  }

  const accounts = [];
  let totalHits = 0;
  let totalFunctionWords = 0;
  let totalRemoved = 0;
  let accountsWithHits = 0;
  let accountsWithFunctionWords = 0;

  for (const [userId, userRows] of byUser) {
    const cards = userRows.map(sbRowToFc);
    const email = emailByUserId.get(userId) || null;
    const label = email || userId;
    const report = analyzeFlashcards(cards, label);
    let removed = [];

    if (migrate && report.functionWords > 0) {
      const toDelete = userRows.filter((row) => row.lang === 'de' && isFunctionWord(row.word));
      for (const row of toDelete) {
        const { error } = await client.from('lc_user_flashcards').delete().eq('id', row.id);
        if (error) throw new Error(`delete ${row.id}: ${error.message}`);
        removed.push({ word: row.word, type: row.word_type, id: row.id });
      }
      totalRemoved += removed.length;
    }

    if (report.hits.length) accountsWithHits++;
    if (report.functionWords > 0) accountsWithFunctionWords++;
    totalHits += report.hits.length;
    totalFunctionWords += report.functionWords;
    accounts.push({
      userId,
      email,
      total: report.total,
      functionWords: report.functionWords,
      hits: report.hits.length,
      samples: report.hits.slice(0, 5),
      removed: removed.length,
    });
  }

  return {
    store: 'supabase-lc_user_flashcards',
    mode: migrate ? 'scan+migrate' : 'scan',
    accountCount: byUser.size,
    totalRows: rows.length,
    accountsWithFunctionWords,
    accountsWithHits,
    totalFunctionWordEntries: totalFunctionWords,
    totalPoisonedEntries: totalHits,
    totalRemoved,
    accounts: accounts.sort((a, b) => (b.functionWords - a.functionWords) || (b.hits - a.hits)),
  };
}

async function scanSupabaseSafe(migrate) {
  if (!sb.isConfigured()) {
    return {
      store: 'supabase-lc_user_flashcards',
      reachable: false,
      error: 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY not configured',
    };
  }
  const url = String(process.env.SUPABASE_URL || '').trim();
  try {
    const probe = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!probe.ok && probe.status !== 404) {
      return {
        store: 'supabase-lc_user_flashcards',
        reachable: false,
        error: `HTTP ${probe.status} from ${url}`,
      };
    }
  } catch (err) {
    return {
      store: 'supabase-lc_user_flashcards',
      reachable: false,
      error: err.cause?.message || err.message || String(err),
      url,
    };
  }
  try {
    return { reachable: true, ...(await scanSupabase(migrate)) };
  } catch (err) {
    return {
      store: 'supabase-lc_user_flashcards',
      reachable: false,
      error: err.message || String(err),
      url,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.all) {
    const out = { mode: args.migrate ? 'scan+migrate' : 'scan' };
    if (args.source === 'both' || args.source === 'blobs') {
      out.blobs = await scanBlobs(await getBlobStore(), args.migrate);
    }
    if (args.source === 'both' || args.source === 'supabase') {
      out.supabase = await scanSupabaseSafe(args.migrate);
    }
    console.log(JSON.stringify(out, null, 2));
    const poisoned =
      (out.blobs?.totalPoisonedEntries || 0) +
      (out.supabase?.totalPoisonedEntries || 0);
    const fnWords =
      (out.blobs?.totalFunctionWordEntries || 0) +
      (out.supabase?.totalFunctionWordEntries || 0);
    if ((poisoned > 0 || fnWords > 0) && !args.migrate) process.exit(1);
    return;
  }

  if (args.file || args.email) {
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
      console.error('Usage: --email user@example.com | --file sync.json | --all [--migrate] [--source blobs|supabase|both]');
      process.exit(2);
    }

    const cards = sync.flashcards || sync.deck || [];
    const report = analyzeFlashcards(cards, label);
    if (args.migrate && report.functionWords > 0) {
      const mig = migrateFlashcards(cards);
      sync.flashcards = mig.flashcards;
      if (sync.deck) sync.deck = mig.flashcards;
      if (args.email && store) await saveToBlobs(store, args.email, sync);
      report.migrated = { removed: mig.removed.length, samples: mig.removed.slice(0, 10) };
    }
    console.log(JSON.stringify(report, null, 2));
    if (report.hits.length && !args.migrate) process.exit(1);
    return;
  }

  console.error('Usage: --email user@example.com | --file sync.json | --all [--migrate] [--source blobs|supabase|both]');
  process.exit(2);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
