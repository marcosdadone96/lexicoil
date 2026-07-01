#!/usr/bin/env node
/**
 * Bloc de notas → validar → guardar → banco (Hören / Schreiben / Sprechen).
 *
 *   node scripts/paste-exam-inbox.mjs --module horen --teil 1 --file batches/inbox/todo-horen-teil1.txt --continue --publish
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { extractAllExamBatches } from './lib/extractJson.mjs';
import { parsePasteArgs, processExamBatch, syncExamPool } from './lib/pasteExamBatchLib.mjs';

loadEnvFile();

function readFile(relOrAbs) {
  const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  if (!fs.existsSync(p)) throw new Error(`No existe: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function main() {
  const args = parsePasteArgs(process.argv.slice(2));
  if (!args.file || !args.module) {
    console.error(`Uso:
  node scripts/paste-exam-inbox.mjs --module horen --teil 1 --file batches/inbox/todo-horen-teil1.txt --continue --publish
  node scripts/paste-exam-inbox.mjs --module schreiben --file batches/inbox/todo-schreiben.txt --continue --publish --sync-pool

Atajos: npm run horen:upload:t1 | schreiben:upload | sprechen:upload`);
    process.exit(1);
  }

  const raw = readFile(args.file);
  const items = extractAllExamBatches(raw, args.module);

  if (!items.length) {
    console.error('No se encontró ningún batch JSON.');
    process.exit(1);
  }

  console.log(`Encontrados ${items.length} batch(es) en ${args.file} (${args.module})`);
  if (args.publish) console.log('Modo: validar + guardar + publicar al banco');
  else console.log('Modo: validar + guardar (--publish para subir al banco)');

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const { batch, teil: teilHint } = items[i];
    const label = `#${i + 1}/${items.length}`;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Procesando ${label}${teilHint ? ` (Teil ${teilHint})` : ''}`);
    console.log('═'.repeat(60));

    const res = processExamBatch(batch, args, { teil: teilHint, tag: args.tag, label });
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
    for (const r of ok) {
      const t = r.teil != null ? `T${r.teil}` : 'T1–3';
      console.log(`  ✅ ${r.module} ${t}: ${r.relFile}`);
    }
  }
  if (fail.length) {
    console.log('\nRechazados (no guardados):');
    for (const r of fail) console.log(`  ❌ ${r.label || '?'}: ${r.errors.join('; ')}`);
  }

  if (args.syncPool && ok.length) {
    try {
      syncExamPool(args);
    } catch (err) {
      console.error(`\nSync pool falló: ${err.message}`);
      process.exit(1);
    }
  }

  process.exit(fail.length ? 1 : 0);
}

main();
