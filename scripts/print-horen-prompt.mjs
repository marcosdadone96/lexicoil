#!/usr/bin/env node
/**
 * Imprime el prompt de Hören listo para pegar en Gemini/Claude.
 *
 * Uso:
 *   node scripts/print-horen-prompt.mjs --teil 1
 *   node scripts/print-horen-prompt.mjs --teil 2
 *   node scripts/print-horen-prompt.mjs --teil 3
 *   node scripts/print-horen-prompt.mjs --teil 4
 *
 * Copia la salida completa y pégala en Gemini/Claude.
 * Guarda la respuesta JSON en:  batches/inbox/horen-t{N}.txt
 * Luego valida con:
 *   node scripts/import-manual-batch.mjs --module horen --teil N --file batches/inbox/horen-tN.txt
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { buildExamPromptFull } = await import('./lib/examTemplatePrompt.mjs');
const { loadWeakLemmas, pickTargetWords } = await import('./lib/lesenTemplatePrompt.mjs');

// Parsear args
let teil = null;
let words = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--teil') teil = Number(process.argv[++i]);
  else if (process.argv[i] === '--words') words = process.argv[++i].split(',').map(s => s.trim());
}

if (!teil || teil < 1 || teil > 4) {
  console.error('Uso: node scripts/print-horen-prompt.mjs --teil 1|2|3|4');
  process.exit(1);
}

// Seleccionar palabras objetivo desde la cobertura (si no se proporcionan)
if (!words) {
  try {
    const lemmas = loadWeakLemmas('de', 'B1', 5);
    words = lemmas.length ? lemmas : ['reise', 'arbeit', 'gesundheit', 'freizeit', 'schule'];
  } catch (_) {
    words = ['reise', 'arbeit', 'gesundheit', 'freizeit', 'schule'];
  }
}

const prompt = buildExamPromptFull('horen', teil, words);

// Cabecera de instrucciones
console.log('═'.repeat(70));
console.log(`  PROMPT HÖREN TEIL ${teil} — copia TODO lo que hay debajo de la línea`);
console.log('═'.repeat(70));
console.log();
console.log(prompt);
console.log();
console.log('═'.repeat(70));
console.log(`  Guarda la respuesta JSON de Gemini/Claude en:`);
console.log(`    batches/inbox/horen-t${teil}.txt`);
console.log();
console.log(`  Luego valida e importa con:`);
console.log(`    node scripts/import-manual-batch.mjs --module horen --teil ${teil} --file batches/inbox/horen-t${teil}.txt`);
console.log('═'.repeat(70));
