#!/usr/bin/env node
/**
 * restore-blobs — restaura blobs desde un archivo de backup.
 *
 *   node scripts/restore-blobs.mjs --from backups/blobs-backup-2026-07-03T10-00-00.json
 *   node scripts/restore-blobs.mjs --from backups/... --dry-run        # solo muestra qué haría
 *   node scripts/restore-blobs.mjs --from backups/... --ids id1,id2    # restaura IDs específicos
 *   node scripts/restore-blobs.mjs --from backups/... --yes            # sin confirmación
 *
 * ADVERTENCIA: sobreescribe los blobs actuales con el contenido del backup.
 * Úsalo solo para revertir un push fallido o incorrecto.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');

const argv = process.argv.slice(2);
const fromPath   = argv.includes('--from') ? path.resolve(argv[argv.indexOf('--from') + 1]) : null;
const isDryRun   = argv.includes('--dry-run');
const skipConfirm = argv.includes('--yes');
const specificIds = argv.includes('--ids')
  ? new Set(argv[argv.indexOf('--ids') + 1].split(',').map(s => s.trim()))
  : null;

if (!fromPath) {
  console.error('Indica el archivo de backup con --from <path>');
  process.exit(1);
}
if (!fs.existsSync(fromPath)) {
  console.error(`Archivo no encontrado: ${fromPath}`);
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
if (backup._format !== 'lexiloop-blob-backup-v1') {
  console.error('Formato de backup no reconocido. Espera _format: "lexiloop-blob-backup-v1"');
  process.exit(1);
}

let snapshots = backup.snapshots || [];
if (specificIds) snapshots = snapshots.filter(s => specificIds.has(s._id));

console.log(`\n${'═'.repeat(64)}`);
console.log(`  restore-blobs${isDryRun ? '  [DRY RUN]' : '  [APPLY — ESCRIBE EN PRODUCCIÓN]'}`);
console.log(`  Backup: ${fromPath}`);
console.log(`  Creado: ${backup._createdAt}`);
console.log(`  Snapshots a restaurar: ${snapshots.length}`);
console.log(`${'═'.repeat(64)}\n`);

for (const s of snapshots) {
  const mod = s._module || s.payload?.module || '?';
  const id = s._id || s.payload?.id || '?';
  const teil = s.payload?.teil ?? '?';
  console.log(`  ${isDryRun ? '[DRY]' : '→'} ${s._blobKey.padEnd(60)} ${mod} T${teil}`);
}

if (isDryRun) {
  console.log(`\n  [DRY RUN] Nada fue modificado.`);
  console.log(`  Para aplicar: node scripts/restore-blobs.mjs --from "${fromPath}"\n`);
  process.exit(0);
}

function confirm(msg) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${msg} [y/N] `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

if (!skipConfirm) {
  const ok = await confirm(`\n  ¿Restaurar ${snapshots.length} blobs en PRODUCCIÓN desde el backup?`);
  if (!ok) { console.log('  Cancelado.\n'); process.exit(0); }
}

const store = getStore({
  name: 'lexicoil-data',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN,
});

let restored = 0; let errors = 0;

for (const snapshot of snapshots) {
  try {
    await store.set(snapshot._blobKey, JSON.stringify(snapshot.payload));
    console.log(`  ✓ Restaurado: ${snapshot._id}`);
    restored++;
  } catch (err) {
    console.error(`  ✗ Error restaurando ${snapshot._id}: ${err.message}`);
    errors++;
  }
}

console.log(`\n${'═'.repeat(64)}`);
console.log(`  Restaurados: ${restored} · Errores: ${errors}`);
if (errors === 0) {
  console.log(`  ✅ Restauración completa.`);
} else {
  console.log(`  ⚠  ${errors} blobs no restaurados. Revisa y reintenta con --ids.`);
}
console.log(`${'═'.repeat(64)}\n`);
process.exit(errors > 0 ? 1 : 0);
