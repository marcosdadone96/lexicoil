#!/usr/bin/env node
/**
 * Scan + migrate German verb deck entries to canonical lowercase infinitives (P0+P1 only).
 *
 * Usage:
 *   node scripts/dev/scan-user-vocab-verb-forms.mjs --all
 *   node scripts/dev/scan-user-vocab-verb-forms.mjs --all --migrate
 *   node scripts/dev/scan-user-vocab-verb-forms.mjs --email user@example.com [--migrate]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from '../lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { syncKey, normalizeEmail } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));

function loadBrowserVerbStack() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.normWordType = (pos) => {
    const p = String(pos || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (p.startsWith('verb') || p === 'v') return 'verb';
    if (p.startsWith('noun') || p === 'n') return 'noun';
    if (p.startsWith('adj')) return 'adjective';
    if (p.startsWith('adv')) return 'adverb';
    return p || 'other';
  };
  vm.createContext(ctx);
  for (const rel of [
    'js/engine/validation/lemmatizer.js',
    'js/engine/separableResolve.js',
    'js/data/verbConjugation.js',
    'js/data/manualVocab.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx);
  }
  return { VerbConjugation: ctx.VerbConjugation, ManualVocab: ctx.ManualVocab, SeparableResolve: ctx.SeparableResolve };
}

const { VerbConjugation, ManualVocab } = loadBrowserVerbStack();

function normWordType(pos) {
  const p = String(pos || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (p.startsWith('verb') || p === 'v') return 'verb';
  return p || 'other';
}

function prepareForEligibility(fc, sub = 'de') {
  const copy = { ...fc };
  VerbConjugation.enrichVerbConjugation(copy, sub);
  return copy;
}

function listP0P1(flashcards) {
  const hits = [];
  for (const raw of flashcards || []) {
    const fc = prepareForEligibility(raw, raw.sourceLang || raw.lang || 'de');
    const hit = VerbConjugation.migrationEligible(fc, fc.sourceLang || fc.lang || 'de');
    if (hit) {
      hits.push({
        before: raw.word,
        after: hit.target,
        reason: hit.reason,
        surface: raw.surface || null,
      });
    }
  }
  return hits;
}

function migrateFlashcards(flashcards) {
  const migrated = [];
  const kept = [];
  for (const raw of flashcards || []) {
    const fc = { ...raw };
    VerbConjugation.enrichVerbConjugation(fc, fc.sourceLang || fc.lang || 'de');
    const hit = VerbConjugation.migrationEligible(fc, fc.sourceLang || fc.lang || 'de');
    if (hit) {
      const before = fc.word;
      VerbConjugation.canonicalizeForDeck(fc, fc.sourceLang || fc.lang || 'de');
      migrated.push({
        before,
        after: fc.word,
        surface: fc.surface || null,
        reason: hit.reason,
      });
    }
    kept.push(fc);
  }
  return { flashcards: kept, migrated };
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
      if (key.startsWith('sync:')) emails.push(normalizeEmail(key.slice(5)));
    }
    if (!page?.hasMore) break;
    cursor = page.cursor;
  }
  return emails.filter(Boolean).sort();
}

async function scanEmails(emails, migrate) {
  const store = await getBlobStore();
  const accounts = [];
  let totalP0P1 = 0;
  let totalMigrated = 0;

  for (const email of emails) {
    const raw = await store.get(syncKey(email), { type: 'text' });
    if (!raw) continue;
    const sync = JSON.parse(raw);
    const cards = sync.flashcards || sync.deck || [];
    const hits = listP0P1(cards);
    let migrated = [];
    if (migrate && hits.length) {
      const result = migrateFlashcards(cards);
      sync.flashcards = result.flashcards;
      if (sync.deck) sync.deck = result.flashcards;
      await store.set(syncKey(email), JSON.stringify(sync));
      migrated = result.migrated;
      totalMigrated += migrated.length;
    }
    totalP0P1 += hits.length;
    accounts.push({
      email,
      p0p1: hits.length,
      migrated: migrated.length,
      samples: (migrate ? migrated : hits).slice(0, 10),
    });
  }

  return {
    mode: migrate ? 'scan+migrate' : 'scan',
    store: 'netlify-blobs',
    accountCount: emails.length,
    totalP0P1Eligible: totalP0P1,
    totalMigrated,
    accounts,
  };
}

async function scanAll(migrate, emailFilter) {
  const store = await getBlobStore();
  let emails = await listSyncEmails(store);
  if (emailFilter) {
    const want = normalizeEmail(emailFilter);
    emails = emails.filter((e) => normalizeEmail(e) === want);
    if (!emails.length) throw new Error(`No sync blob for ${emailFilter}`);
  }
  return scanEmails(emails, migrate);
}

function parseArgs(argv) {
  const out = { all: false, migrate: false, file: '', email: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--all') out.all = true;
    else if (argv[i] === '--migrate') out.migrate = true;
    else if (argv[i] === '--email' && argv[i + 1]) out.email = String(argv[++i]).trim();
    else if (argv[i] === '--file' && argv[i + 1]) out.file = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.all || args.email) {
    const report = await scanAll(args.migrate, args.email || '');
    console.log(JSON.stringify(report, null, 2));
    if (report.totalP0P1Eligible > 0 && !args.migrate) process.exit(1);
    return;
  }
  if (args.file) {
    const sync = JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
    const hits = listP0P1(sync.flashcards || []);
    console.log(JSON.stringify({ p0p1: hits.length, hits }, null, 2));
    return;
  }
  console.error('Usage: --all [--migrate] | --email user@example.com [--migrate] | --file sync.json');
  process.exit(2);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
