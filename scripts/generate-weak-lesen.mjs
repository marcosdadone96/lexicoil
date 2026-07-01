#!/usr/bin/env node
/**
 * generate-weak-lesen.mjs — genera N partes por Teil de Lesen B1, cada una apuntando
 * a un lote distinto de lemas flojos (data/coverage/weak-{lang}_{level}.json del report).
 * Incremental: cada ejecución re-lee el weak list (que encoge al subir la cobertura).
 *
 * Uso:
 *   node scripts/vocab-coverage-report.mjs --lang de --level B1        (1º: medir → weak file)
 *   node scripts/generate-weak-lesen.mjs --lang de --level B1 --per-teil 10
 *   node scripts/generate-weak-lesen.mjs --lang de --level B1 --teil 1 --per-teil 1  (prueba)
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const lang = String(arg('--lang', 'de')).toLowerCase();
const level = String(arg('--level', 'B1')).toUpperCase();
const perTeil = Math.max(1, Number(arg('--per-teil', 10)) || 10);
const onlyTeil = arg('--teil', null);
const WORDS_PER_PART = 10;

const weakFile = path.join(ROOT, 'data', 'coverage', `weak-${lang}_${level}.json`);
if (!fs.existsSync(weakFile)) {
  console.error(`No existe ${weakFile}. Ejecuta antes vocab-coverage-report.mjs.`);
  process.exit(1);
}
const weak = JSON.parse(fs.readFileSync(weakFile, 'utf8')).weakLemmas || [];
if (!weak.length) {
  console.log('No hay lemas flojos. Cobertura OK.');
  process.exit(0);
}

const teils = onlyTeil ? [Number(onlyTeil)] : [1, 2, 3, 4, 5];
let cursor = 0;
const nextBatch = () => {
  const b = weak.slice(cursor, cursor + WORDS_PER_PART);
  cursor += WORDS_PER_PART;
  if (cursor >= weak.length) cursor = 0; // reusa si se acaban
  return b;
};

for (const teil of teils) {
  for (let i = 0; i < perTeil; i++) {
    const batch = nextBatch();
    console.log(`\n=== Lesen T${teil} · parte ${i + 1}/${perTeil} · objetivo: ${batch.join(', ')} ===`);
    const r = spawnSync('node', [
      path.join(ROOT, 'scripts', 'generate-batch-gemini.mjs'),
      '--lang', lang,
      '--level', level,
      '--module', 'lesen',
      '--teil', String(teil),
      '--count', '1',
      '--target-words', batch.join(','),
    ], { stdio: 'inherit', cwd: ROOT });
    if (r.status !== 0) {
      console.warn(`  ⚠ Teil ${teil} parte ${i + 1} falló (status ${r.status}), sigo.`);
    }
  }
}

console.log('\nGenerado. Pasos siguientes:');
console.log(`  1) Promover al pool (sube el tope):  npm run promote:b1:12 -- --max 50 --max-per-topic 4`);
console.log(`  2) Etiquetar vocab + schemaVersion:  node scripts/enrich-reusable-vocab.mjs --lang ${lang} --level ${level} --apply`);
console.log(`  3) Re-medir cobertura:               node scripts/vocab-coverage-report.mjs --lang ${lang} --level ${level}`);
