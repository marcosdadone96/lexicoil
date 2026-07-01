#!/usr/bin/env node
/**
 * Optional: re-translate vocab-cache blob entries that used MyMemory (source:'dict').
 *
 * Does NOT run automatically. Use when you want to refresh stale dictionary translations
 * after switching to Gemini (freeTranslate.js).
 *
 * Usage:
 *   node scripts/refresh-vocab-dict-translations.mjs --dry-run
 *   node scripts/refresh-vocab-dict-translations.mjs --limit 50
 *   node scripts/refresh-vocab-dict-translations.mjs --from de --to en
 *
 * Requires Netlify Blobs credentials (same as local blob dev) OR run against production
 * by invoking vocab-cache GET with force (not implemented) — this script is for operators
 * with blob store access via NETLIFY_BLOBS_* env.
 *
 * Safer alternative without blob access: delete dict entries in Netlify dashboard, or wait
 * for natural cache expiry; new lookups use Gemini automatically.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { freeTranslate } = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));

function parseArgs(argv) {
  const out = { dryRun: false, limit: 100, from: null, to: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = Math.max(1, Number(argv[++i]) || 100);
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`Usage: node scripts/refresh-vocab-dict-translations.mjs [--dry-run] [--limit N] [--from de] [--to en]

This script documents the refresh workflow. Full blob enumeration requires Netlify Blobs
list API wired to your deployment store — implement list+patch when you need bulk refresh.

For now, operators can:
  1. Let old 'dict' entries age out (users keep cached translation until word is new to cache)
  2. Manually DELETE xlat:* keys with source dict in Netlify Blobs UI
  3. Call vocab-cache GET for specific words (cache miss after delete → Gemini)

Example single-word refresh (after deleting blob key):
  curl "https://lexicoil.com/.netlify/functions/vocab-cache?from=de&to=en&text=Schloss&context=Das+Schloss+ist+sehr+alt"
`);
    return;
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Set GEMINI_API_KEY to test translation.');
    process.exit(1);
  }

  // Smoke: verify Gemini path works (does not bulk-scan blobs without store list wiring)
  const sample = await freeTranslate('Schloss', 'de', 'en', 'Das Schloss auf dem Berg ist sehr alt.');
  console.log(`Sample: Schloss (castle context) → ${sample || '(null)'}`);
  console.log(
    opts.dryRun
      ? '[dry-run] Bulk blob refresh not implemented — see --help for manual steps.'
      : 'Bulk blob refresh not implemented — see --help for manual steps.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
