#!/usr/bin/env node
/**
 * Pick random batch generation params (module, teil, topic, slug).
 *
 * Usage:
 *   node scripts/random-batch-params.mjs
 *   node scripts/random-batch-params.mjs --lang de --level B1
 *   npm run random:batch
 *
 * Generación automática con API:
 *   npm run generate:batch -- --lang de --level B1 --merge
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBatchParams,
  formatParamBlock,
  LANG_META,
  loadPools,
  MERGED_DIR,
} from './lib/batchParams.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

function main() {
  const lang = (arg('--lang', 'de') || 'de').toLowerCase();
  const levelArg = arg('--level');
  const meta = LANG_META[lang] || LANG_META.de;
  const pools = loadPools(lang);
  const count = Math.max(1, Number(arg('--count', '1')) || 1);
  const opts = {
    module: arg('--module'),
    teil: arg('--teil'),
    level: levelArg,
  };

  console.log(`\n🎲 Parámetros aleatorios — ${lang.toUpperCase()} / ${levelArg || 'nivel aleatorio'}\n`);

  for (let i = 0; i < count; i++) {
    const p = buildBatchParams(pools, lang, opts);
    if (count > 1) console.log(`── Batch ${i + 1} ──`);
    console.log(formatParamBlock(p));
    console.log(`PROMPT = ${meta.masterPrompt}`);
    console.log(`\nGuardar como: batches/merged/${p.outputFile}`);
    if (i < count - 1) console.log('');
  }

  console.log('\n── Siguiente paso ──');
  console.log(`Automático: npm run generate:batch -- --lang ${lang} --level ${levelArg || 'B1'} --merge`);
  console.log(`Manual: pega ${meta.masterPrompt} + bloque de arriba en Gemini`);
  console.log(`Valida: node scripts/validate-batch.mjs --lang ${lang} --level ${levelArg || 'B1'} --file batches/merged/<archivo>.json`);
  console.log('');
}

main();
