#!/usr/bin/env node
/**
 * pull-seed-from-blobs — descarga todos los blobs de producción y escribe de_B1.json.
 *
 *   node scripts/pull-seed-from-blobs.mjs
 *   node scripts/pull-seed-from-blobs.mjs --out library/reusable-seed/de_B1.json
 *
 * El JSON resultante incluye "_pulledAt" en el objeto raíz.
 * El pre-commit hook usa ese campo para distinguir archivos generados de ediciones manuales.
 * NO edites de_B1.json directamente — ejecuta este script para actualizarlo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { listPartsIndex, partPayloadKey } =
  require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));

const argv = process.argv.slice(2);
const outPath = argv.includes('--out')
  ? path.resolve(argv[argv.indexOf('--out') + 1])
  : path.join(ROOT, 'library/reusable-seed/de_B1.json');

const lang = 'de'; const level = 'B1';
const MODULES = ['lesen', 'horen', 'schreiben', 'sprechen'];

const store = getStore({
  name: 'lexicoil-data',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN,
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`  pull-seed-from-blobs → ${outPath}`);
console.log(`${'═'.repeat(60)}\n`);

const records = [];
let total = 0;

for (const mod of MODULES) {
  const idx = await listPartsIndex(store, lang, level, mod);
  if (!idx.length) { console.log(`  ${mod}: 0 partes`); continue; }

  process.stdout.write(`  ${mod}: ${idx.length} partes`);
  let fetched = 0; let errors = 0;

  for (const row of idx) {
    // Skip curated-exam snapshots (cur-*) — they are website pipeline artifacts,
    // not standalone reusable pool parts, and would corrupt pool-health-report stats.
    if (String(row.id).startsWith('cur-')) continue;
    const payload = await store.get(partPayloadKey(lang, level, mod, row.id), { type: 'json' }).catch(() => null);
    if (!payload) { errors++; continue; }
    // Store the minimal seed shape (strip runtime fields that change constantly)
    records.push({
      id:          payload.id || row.id,
      lang:        payload.lang || lang,
      level:       payload.level || level,
      module:      payload.module || mod,
      teil:        payload.teil ?? null,
      passage:     payload.passage || null,
      questions:   payload.questions || [],
      segments:    payload.segments || null,
      ads:         payload.ads || null,
      instruction: payload.instruction || null,
      complete:    payload.complete ?? false,
      verified:    payload.verified ?? false,
      itemCount:   payload.itemCount ?? null,
      targetCount: payload.targetCount ?? null,
      contributor: payload.contributor || null,
      createdAt:   payload.createdAt || row.createdAt || null,
      // Preserve partKey so verify can cross-reference
      _blobKey:    partPayloadKey(lang, level, mod, row.id),
    });
    fetched++;
  }
  total += fetched;
  console.log(` · descargadas=${fetched}${errors > 0 ? ` · errores=${errors}` : ''}`);
}

// Write JSON with _pulledAt marker (required by pre-commit guard)
const output = {
  _pulledAt: new Date().toISOString(),
  _source:   'blobs',
  _count:    records.length,
  records,
};

const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(`\n  ✓ ${total} partes escritas en ${outPath}`);
console.log(`  _pulledAt: ${output._pulledAt}`);
console.log(`\n  NOTA: de_B1.json es ahora un snapshot de producción.`);
console.log(`  Para propagar fixes locales → use push-seed-to-blobs.mjs`);
console.log(`${'═'.repeat(60)}\n`);
