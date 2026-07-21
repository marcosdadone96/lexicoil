#!/usr/bin/env node
/**
 * Copia partes Lesen perfectas de batches/generated/ → batches/ready/lesen/
 *
 *   node scripts/sync-lesen-ready.mjs
 *   node scripts/sync-lesen-ready.mjs --dry-run
 *
 * El generador sigue escribiendo en generated/; esta carpeta es solo la vista curada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAllPool2ReadyLesen, GENERATED_DIR } from './lib/lesenReadyLib.mjs';
import { READY_DIR, READY_LESEN_DIR } from './lib/batchPaths.mjs';
import { t3SituationFingerprintFromBatch } from './lib/t3GroupFingerprint.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  process.stderr.write('Auditando partes Lesen en generated/…\n');
  const { all } = await auditAllPool2ReadyLesen(GENERATED_DIR);
  const perfect = all.filter((r) => r.perfect);
  const perfectNames = new Set(perfect.map((r) => r.file));

  if (!DRY_RUN) {
    fs.mkdirSync(READY_LESEN_DIR, { recursive: true });
  }

  let copied = 0;
  let removed = 0;

  for (const row of perfect) {
    const src = path.join(GENERATED_DIR, row.file);
    const dest = path.join(READY_LESEN_DIR, row.file);
    if (DRY_RUN) {
      console.log(`  + ${row.file}`);
      copied += 1;
      continue;
    }
    fs.copyFileSync(src, dest);
    copied += 1;
  }

  if (fs.existsSync(READY_LESEN_DIR)) {
    for (const name of fs.readdirSync(READY_LESEN_DIR)) {
      if (!name.endsWith('.json')) continue;
      if (perfectNames.has(name)) continue;
      const stale = path.join(READY_LESEN_DIR, name);
      if (DRY_RUN) {
        console.log(`  - ${name} (obsoleto)`);
      } else {
        fs.unlinkSync(stale);
      }
      removed += 1;
    }
  }

  const byTeil = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of perfect) byTeil[r.teil] += 1;

  const entries = perfect
    .map((r) => {
      const entry = { file: r.file, teil: r.teil };
      if (r.teil !== 3) return entry;
      try {
        const batch = JSON.parse(
          fs.readFileSync(path.join(GENERATED_DIR, r.file), 'utf8'),
        );
        entry.t3SituationFp = t3SituationFingerprintFromBatch(batch);
        entry.blueprintSlug = batch._blueprintSlug || batch.blueprintSlug || null;
      } catch {
        entry.t3SituationFp = null;
      }
      return entry;
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  const manifest = {
    schema: 'lesen-ready/v2',
    syncedAt: new Date().toISOString(),
    source: 'batches/generated',
    dest: 'batches/ready/lesen',
    total: perfect.length,
    byTeil,
    files: entries.map((e) => e.file),
    entries,
  };

  if (!DRY_RUN) {
    fs.mkdirSync(READY_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(READY_DIR, '_manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  }

  console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}Sync Lesen ready: ${copied} copiadas, ${removed} eliminadas de ready/`);
  console.log(`  T1=${byTeil[1]} T2=${byTeil[2]} T3=${byTeil[3]} T4=${byTeil[4]} T5=${byTeil[5]}`);
  console.log(`  Carpeta: ${path.relative(ROOT, READY_LESEN_DIR).replace(/\\/g, '/')}`);
  if (!DRY_RUN) {
    console.log(`  Manifiesto: batches/ready/_manifest.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
