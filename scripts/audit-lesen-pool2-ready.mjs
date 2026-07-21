#!/usr/bin/env node
/**
 * Audita SOLO las partes Lesen que pasaron POOL-2 (lista de audit-exam-pool).
 * Filtros: normalize → calidad → léxico → POOL-2 → conflicto CHK-29 (stock).
 *
 * Partes perfectas (mirror): batches/ready/lesen/ — sincroniza con:
 *   node scripts/sync-lesen-ready.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAllPool2ReadyLesen, GENERATED_DIR } from './lib/lesenReadyLib.mjs';
import { READY_LESEN_DIR } from './lib/batchPaths.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  process.stderr.write('Descubriendo POOL-2 ready…\n');
  const { all } = await auditAllPool2ReadyLesen(GENERATED_DIR);

  const moldMap = new Map();
  for (const r of all.filter((x) => [4, 5].includes(x.teil))) {
    const mk = `${r.teil}:${r.mold.key}:${r.mold.title?.slice(0, 30)}`;
    if (!moldMap.has(mk)) moldMap.set(mk, []);
    moldMap.get(mk).push(r.file);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('  AUDITORÍA POOL-2 READY — calidad + léxico + POOL-2 (normalizado)');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  console.log(`  Perfectas (mirror): ${path.relative(ROOT, READY_LESEN_DIR).replace(/\\/g, '/')}`);
  console.log('  Sync: node scripts/sync-lesen-ready.mjs\n');

  for (const teil of [1, 2, 3, 4, 5]) {
    const rows = all.filter((r) => r.teil === teil);
    const perfect = rows.filter((r) => r.perfect);
    const not = rows.filter((r) => !r.perfect);
    console.log(`T${teil}: ${rows.length} POOL-2 ready → ${perfect.length} perfectas, ${not.length} con fallos extra`);

    const opinions = {};
    for (const r of not) opinions[r.opinion] = (opinions[r.opinion] || 0) + 1;
    for (const [op, n] of Object.entries(opinions).sort((a, b) => b[1] - a[1])) {
      console.log(`  · ${op}: ${n}`);
    }
    if (not.length && not.length <= 5) {
      for (const r of not) console.log(`    ${r.file}: ${r.fails.join(' | ')}`);
    }
    if (perfect.length) {
      console.log(`  ✅ Subir (${perfect.length}): ${perfect.slice(0, 4).map((r) => r.file).join(', ')}${perfect.length > 4 ? '…' : ''}`);
    }
    console.log('');
  }

  console.log('── Conflictos molde T4/T5 (no usar 2 del mismo subtipo en un examen) ──');
  for (const [mk, files] of moldMap) {
    if (files.length > 1) console.log(`  ${mk}: ${files.join(', ')}`);
  }

  const perfectTotal = all.filter((r) => r.perfect).length;
  console.log(`\nRESUMEN: ${perfectTotal}/${all.length} listas para subir sin reservas (${Math.round(100 * perfectTotal / all.length)}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
