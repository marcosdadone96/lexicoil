#!/usr/bin/env node
/**
 * Bloc de notas → validar → guardar solo si OK → ingest → banco → (opcional) pool Netlify.
 *
 *   node scripts/paste-lesen-inbox.mjs --file batches/inbox/todo.txt --tag gemini --continue --publish
 *   node scripts/paste-lesen-inbox.mjs --file batches/inbox/todo.txt --tag gemini --continue --publish --sync-pool
 *
 * --publish     Tras cada batch OK: ingest (auto-approve) + promote-approved al banco
 * --sync-pool     Al final (si hubo OK): seed-reusable-from-bank + enrich vocab (Netlify)
 * --save-only     Solo validar y guardar en batches/generated/ (sin subir)
 * --continue      Sigue aunque uno falle; los fallidos NO se guardan
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { extractAllLesenBatches } from './lib/extractJson.mjs';
import { parsePasteArgs, processLesenBatch, syncLesenPool } from './lib/pasteLesenBatchLib.mjs';

loadEnvFile();

function readFile(relOrAbs) {
  const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  if (!fs.existsSync(p)) throw new Error(`No existe: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function main() {
  const args = parsePasteArgs(process.argv.slice(2));
  if (!args.file) {
    console.error(`Uso:
  node scripts/paste-lesen-inbox.mjs --file batches/inbox/todo.txt --tag gemini --continue --publish
  node scripts/paste-lesen-inbox.mjs --file batches/inbox/todo.txt --tag gemini --continue --publish --sync-pool

Flujo por batch: validar (3 puertas) → guardar solo si OK → ingest → banco
Con --sync-pool al final: sube partes nuevas al pool Netlify + etiqueta vocab`);
    process.exit(1);
  }

  const raw = readFile(args.file);
  const items = extractAllLesenBatches(raw);

  if (!items.length) {
    console.error('No se encontró ningún batch JSON.');
    process.exit(1);
  }

  console.log(`Encontrados ${items.length} batch(es) en ${args.file}`);
  if (args.publish) console.log('Modo: validar + guardar + publicar al banco');
  else console.log('Modo: validar + guardar (--publish para subir al banco)');

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const { batch, teil: teilHint } = items[i];
    const label = `#${i + 1}/${items.length}`;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Procesando ${label}${teilHint ? ` (Teil ${teilHint})` : ''}`);
    console.log('═'.repeat(60));

    const res = processLesenBatch(batch, args, { teil: teilHint, tag: args.tag, label });
    results.push(res);

    if (!res.ok && !args.continueOnError) {
      console.error(`\nDetenido en ${label}. Usa --continue para el resto.`);
      process.exit(1);
    }
  }

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESUMEN: ${ok.length} OK, ${fail.length} fallidos, ${results.length} total`);
  if (ok.length) {
    console.log('\nPublicados:');
    for (const r of ok) console.log(`  ✅ Teil ${r.teil}: ${r.relFile}`);
  }
  if (fail.length) {
    console.log('\nRechazados (no guardados):');
    for (const r of fail) {
      console.log(`  ❌ ${r.label || '?'}: ${r.errors.join('; ')}`);
    }
  }

  if (args.syncPool && ok.length) {
    try {
      syncLesenPool(args);
    } catch (err) {
      console.error(`\nSync pool falló: ${err.message}`);
      console.error('¿NETLIFY_SITE_ID y NETLIFY_API_TOKEN en el entorno?');
      process.exit(1);
    }
  } else if (args.publish && ok.length && !args.syncPool) {
    console.log('\nPool Netlify: ejecuta una vez al terminar la tanda:');
    console.log(`  node scripts/paste-lesen-inbox.mjs --file batches/inbox/.noop --publish --sync-pool`);
    console.log('  (o: seed-reusable-from-bank --apply && enrich-reusable-vocab --apply)');
  }

  process.exit(fail.length ? 1 : 0);
}

main();
