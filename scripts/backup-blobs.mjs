#!/usr/bin/env node
/**
 * backup-blobs — exporta todos los blobs de producción a un archivo local.
 *
 *   node scripts/backup-blobs.mjs
 *   node scripts/backup-blobs.mjs --module horen
 *   node scripts/backup-blobs.mjs --ids gen-h4-003,bank-de-B1-lesen-t2-5b2b…
 *   node scripts/backup-blobs.mjs --out backups/pre-repair-2026-07-03.json
 *
 * El archivo resultante sirve como snapshot de restauración.
 * Para restaurar: node scripts/restore-blobs.mjs --from <archivo>
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
const filterModule = argv.includes('--module') ? argv[argv.indexOf('--module') + 1] : null;
const filterTeil   = argv.includes('--teil') ? Number(argv[argv.indexOf('--teil') + 1]) : null;
const specificIds  = argv.includes('--ids')
  ? new Set(argv[argv.indexOf('--ids') + 1].split(',').map(s => s.trim()))
  : null;
const timestamp    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const defaultOut   = path.join(ROOT, `backups/blobs-backup-${timestamp}.json`);
const outPath      = argv.includes('--out')
  ? path.resolve(argv[argv.indexOf('--out') + 1])
  : defaultOut;

const store = getStore({
  name: 'lexicoil-data',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN,
});

const MODULES = filterModule ? [filterModule] : ['lesen', 'horen', 'schreiben', 'sprechen'];

console.log(`\n${'═'.repeat(64)}`);
console.log(`  backup-blobs → ${outPath}`);
if (filterModule) console.log(`  Módulo: ${filterModule}${filterTeil ? ` T${filterTeil}` : ''}`);
if (specificIds)  console.log(`  IDs: ${[...specificIds].join(', ')}`);
console.log(`${'═'.repeat(64)}\n`);

// Ensure output directory exists
const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const snapshots = [];
let errors = 0;

for (const mod of MODULES) {
  const idx = await listPartsIndex(store, 'de', 'B1', mod);
  let modCount = 0;
  process.stdout.write(`  ${mod}: `);

  for (const row of idx) {
    if (filterTeil != null && row.teil !== filterTeil) continue;
    if (specificIds && !specificIds.has(row.id)) continue;

    const pKey = partPayloadKey('de', 'B1', mod, row.id);
    try {
      // Get raw string to preserve exact blob content byte-for-byte
      const raw = await store.get(pKey, { type: 'text' });
      if (!raw) { errors++; continue; }
      snapshots.push({
        _blobKey: pKey,
        _module:  mod,
        _id:      row.id,
        _backedUpAt: new Date().toISOString(),
        payload: JSON.parse(raw),   // parsed for readability; restore re-serializes
      });
      modCount++;
      process.stdout.write('.');
    } catch (err) {
      process.stdout.write('✗');
      errors++;
    }
  }
  console.log(` ${modCount} blobs`);
}

const backup = {
  _format:    'lexiloop-blob-backup-v1',
  _createdAt: new Date().toISOString(),
  _siteID:    process.env.NETLIFY_SITE_ID,
  _storeName: 'lexicoil-data',
  _count:     snapshots.length,
  _errors:    errors,
  snapshots,
};

fs.writeFileSync(outPath, JSON.stringify(backup, null, 2) + '\n', 'utf8');

console.log(`\n${'═'.repeat(64)}`);
if (errors > 0) {
  console.log(`  ⚠  Backup con ${errors} errores. Revisa antes de proceder.`);
} else {
  console.log(`  ✅ Backup completo: ${snapshots.length} blobs → ${outPath}`);
}
console.log(`  Restaurar con: node scripts/restore-blobs.mjs --from "${outPath}"`);
console.log(`${'═'.repeat(64)}\n`);

process.exit(errors > 0 ? 1 : 0);
