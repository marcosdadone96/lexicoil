#!/usr/bin/env node
/**
 * Analiza todos los JSON de batches/inbox/ (read-only — mismas puertas que paste-*-inbox).
 *
 *   node scripts/analyze-inbox.mjs
 *   node scripts/analyze-inbox.mjs --dir batches/inbox --fix-suggestions
 *   node scripts/analyze-inbox.mjs --allow-bank-dup batches/ready/pool-verified/B1/schreiben-gemini-005.json
 */
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import {
  analyzeJsonFile,
  formatResultsTable,
  listInboxJsonFiles,
} from './lib/analyzeInboxLib.mjs';
import path from 'node:path';

loadEnvFile();

function parseArgs(argv) {
  const out = {
    dir: 'batches/inbox',
    files: [],
    fixSuggestions: false,
    allowBankDup: false,
    verbose: false,
    lang: 'de',
    level: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = argv[++i];
    else if (a === '--fix-suggestions') out.fixSuggestions = true;
    else if (a === '--allow-bank-dup') out.allowBankDup = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-')) out.files.push(a);
  }
  return out;
}

function printHelp() {
  console.log(`Uso:
  node scripts/analyze-inbox.mjs [opciones] [archivo.json ...]

Opciones:
  --dir <carpeta>       Carpeta a escanear (default: batches/inbox)
  --fix-suggestions     Sugerencias de reemplazo para errores conocidos (no modifica archivos)
  --allow-bank-dup      Ignorar IDs duplicados vs banco (útil al probar pool-verified)
  --verbose             Muestra salida completa de cada gate
  --lang de             Idioma (default: de)
  --level B1            Nivel por defecto si el JSON no lo trae

Puertas por módulo (solo lectura):
  Lesen     → validate-batch + calidad pedagógica + pre-ingest CEFR
  Hören/Schreiben/Sprechen → validate-batch + sweep-blacklist + audit-pass-2 (IMPORTANT)

Ejemplos:
  node scripts/analyze-inbox.mjs
  node scripts/analyze-inbox.mjs --fix-suggestions
  node scripts/analyze-inbox.mjs --allow-bank-dup batches/ready/pool-verified/B1/sprechen-gemini-005.json`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let files = args.files.map((f) => (path.isAbsolute(f) ? f : path.join(ROOT, f)));
  if (!files.length) {
    files = listInboxJsonFiles(args.dir);
  }

  if (!files.length) {
    console.error(`No hay archivos .json en ${args.dir}`);
    process.exit(1);
  }

  console.log(`\nAnalizando ${files.length} archivo(s) (modo read-only)…\n`);

  const results = [];
  for (const abs of files) {
    if (args.verbose) {
      console.log(`\n${'═'.repeat(60)}\n${path.basename(abs)}\n${'═'.repeat(60)}`);
    }
    const r = analyzeJsonFile(abs, {
      lang: args.lang,
      level: args.level,
      fixSuggestions: args.fixSuggestions,
      allowBankDup: args.allowBankDup,
      verbose: args.verbose,
    });
    results.push(r);

    if (args.fixSuggestions && r.suggestions?.length) {
      console.log(`\n💡 Sugerencias para ${path.basename(r.file)}:`);
      for (const s of r.suggestions) {
        console.log(`   • [${s.reason}] «${s.match}» en ${s.field}`);
        console.log(`     → ${s.replaceWith}`);
      }
    }
  }

  console.log(`\n${formatResultsTable(results)}\n`);

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`RESUMEN: ${ok.length} listos para publicar · ${fail.length} con errores · ${results.length} total`);

  if (fail.length) {
    console.log('\nDetalle de fallos:');
    for (const r of fail) {
      console.log(`\n❌ ${r.file} [${r.gate}]`);
      for (const e of r.errors) console.log(`   - ${e}`);
    }
  }

  process.exit(fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
