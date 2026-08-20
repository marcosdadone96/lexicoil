#!/usr/bin/env node
/**
 * Revert erroneous verb-form migration (first --migrate pass, 2026-08-09).
 * Restores fc.word from fc.surface; clears surface/lemmaNormalized/conjugation.
 *
 * Manual overrides when surface was corrupted during migration (not the original word).
 *
 * Usage:
 *   node scripts/dev/revert-erroneous-verb-migration.mjs --all-affected --dry-run
 *   node scripts/dev/revert-erroneous-verb-migration.mjs --all-affected --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from '../lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { syncKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));

const AFFECTED = ['elverabel@yahoo.com.ar', 'marcosdadra@gmail.com'];

/** surface field is wrong — use migration log "before" word instead */
const MANUAL_BEFORE_BY_ID = {
  fc_mqy0wd6d_isrr1od: {
    word: 'Dienste',
    type: 'noun',
    pos: 'noun',
    article: 'die',
    gender: 'f',
    note: 'Migration log before=Dienste after=nsten surface=nste (corrupted)',
  },
};

function parseArgs(argv) {
  const out = { email: '', all: false, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) out.email = String(argv[++i]).trim().toLowerCase();
    else if (a === '--all-affected') out.all = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
  }
  return out;
}

function revertEntry(fc) {
  const manual = fc?.id && MANUAL_BEFORE_BY_ID[fc.id];
  if (manual) {
    const alreadyRestored =
      String(fc.word).trim() === manual.word && !fc.surface && (fc.type || fc.pos) === manual.type;
    if (alreadyRestored) return null;
    const before = { word: fc.word, surface: fc.surface, type: fc.type || fc.pos, id: fc.id };
    fc.word = manual.word;
    if (manual.type) {
      fc.type = manual.type;
      fc.pos = manual.pos || manual.type;
    }
    if (manual.article) fc.article = manual.article;
    if (manual.gender) fc.gender = manual.gender;
    delete fc.surface;
    delete fc.lemmaNormalized;
    delete fc.conjugation;
    delete fc.verbLemma;
    return { before, after: { word: fc.word, surface: null, type: fc.type }, manual: true, note: manual.note };
  }
  if (!fc?.surface) return null;
  const before = { word: fc.word, surface: fc.surface, verbLemma: fc.verbLemma || null, id: fc.id || null };
  fc.word = String(fc.surface).trim();
  delete fc.surface;
  delete fc.lemmaNormalized;
  delete fc.conjugation;
  delete fc.verbLemma;
  return { before, after: { word: fc.word, surface: null }, manual: false };
}

async function getStore() {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (!siteId || !token) throw new Error('NETLIFY_SITE_ID + NETLIFY_API_TOKEN required');
  const { getStore } = await import('@netlify/blobs');
  const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));
  return getStore({ name: STORE_NAME, siteID: siteId, token });
}

async function revertEmail(store, email, apply) {
  const key = syncKey(email);
  const raw = await store.get(key, { type: 'text' });
  if (!raw) throw new Error(`No sync blob for ${email}`);
  const sync = JSON.parse(raw);
  const cards = sync.flashcards || sync.deck || [];
  const changes = [];
  for (const fc of cards) {
    const change = revertEntry(fc);
    if (change) changes.push(change);
  }
  if (apply && changes.length) {
    sync.flashcards = cards;
    if (sync.deck) sync.deck = cards;
    await store.set(key, JSON.stringify(sync));
  }
  return { email, total: cards.length, reverted: changes.length, changes };
}

async function main() {
  const args = parseArgs(process.argv);
  const emails = args.all ? AFFECTED : args.email ? [args.email] : [];
  if (!emails.length) {
    console.error('Usage: --email user@example.com [--apply] | --all-affected [--apply|--dry-run]');
    process.exit(2);
  }
  const store = await getStore();
  const report = { mode: args.apply ? 'apply' : 'dry-run', accounts: [] };
  for (const email of emails) {
    report.accounts.push(await revertEmail(store, email, args.apply));
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
