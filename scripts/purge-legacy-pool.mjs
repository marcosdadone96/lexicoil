#!/usr/bin/env node
/**
 * purge-legacy-pool — remove legacy/invalid pool entries from the Netlify Blobs
 * store that production serves from. Shares logic with the admin endpoint
 * (netlify/functions/lib/poolPurge.js).
 *
 * Auth: needs Netlify Blobs credentials in env when run against production:
 *   NETLIFY_SITE_ID   (Site ID from Netlify → Site settings → General)
 *   NETLIFY_API_TOKEN (Personal access token from Netlify → User settings → Applications)
 * Alternatively run it through `netlify dev` / `netlify functions` where the
 * Blobs context is injected automatically.
 *
 * Usage:
 *   node scripts/purge-legacy-pool.mjs --lang de --level B1 --dry-run
 *   node scripts/purge-legacy-pool.mjs --lang de --level B1 --apply
 *   node scripts/purge-legacy-pool.mjs --lang de --level B1 --apply --no-needs-curation
 *   node scripts/purge-legacy-pool.mjs --lang de --level B1 --apply --id curated_de_B1_aaa,seed_de_B1_bbb
 *
 * Default behaviour (no flags) is a DRY-RUN (prints what WOULD be deleted).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { getStore } = require('@netlify/blobs');
const { purgePool } = require(path.join(ROOT, 'netlify/functions/lib/poolPurge.js'));

const STORE_NAME = 'lexicoil-data';

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', apply: false, needsCuration: true, invalid: true, idPrefixes: null, ids: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--no-needs-curation') o.needsCuration = false;
    else if (a === '--no-invalid') o.invalid = false;
    else if (a === '--id-prefix') o.idPrefixes = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--id') o.ids = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return o;
}

function getStoreForCli() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    console.error('Could not connect to Netlify Blobs. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN, or run via the Netlify CLI.');
    console.error(err.message);
    process.exit(1);
  }

  const report = await purgePool(store, opts.lang, opts.level, {
    dryRun: !opts.apply,
    needsCuration: opts.needsCuration,
    invalid: opts.invalid,
    idPrefixes: opts.idPrefixes || undefined,
    ids: opts.ids || undefined,
  });

  console.log(`\nPool ${opts.lang}/${opts.level} — total index entries: ${report.total}`);
  if (!opts.apply) {
    console.log(`DRY-RUN — ${report.candidates} entr${report.candidates === 1 ? 'y' : 'ies'} WOULD be purged:`);
    report.items.forEach((it) => console.log(`  • ${it.id}  [${it.reasons.join(', ')}]  ${it.topic || ''}`));
    console.log('\nRe-run with --apply to delete.');
  } else {
    console.log(`APPLIED — deleted ${report.deleted} entr${report.deleted === 1 ? 'y' : 'ies'}.`);
    report.items.forEach((it) => console.log(`  • ${it.id}  [${it.reasons.join(', ')}]`));
    if (report.errors.length) {
      console.log(`Errors (${report.errors.length}):`);
      report.errors.forEach((e) => console.log(`  ! ${e.id}: ${e.error}`));
    }
  }
})();
