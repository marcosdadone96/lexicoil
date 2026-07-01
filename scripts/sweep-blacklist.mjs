#!/usr/bin/env node
/**
 * sweep-blacklist.mjs — Barrido C1/C2 sobre carpetas de batches y muestras.
 *
 * Uso:
 *   node scripts/sweep-blacklist.mjs                              # solo batches/generated
 *   node scripts/sweep-blacklist.mjs batches/generated muestras   # múltiples carpetas
 *   node scripts/sweep-blacklist.mjs --fix                        # corregir automáticamente (solo grammar: true)
 *
 * Salida: lista de archivo + término + sugerencia. Exit 1 si hay hits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLACKLIST } from './blacklist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const targets = args.filter(a => !a.startsWith('--'));
const dirs = targets.length ? targets : ['batches/generated'];

function collectFiles(dir) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (!fs.existsSync(abs)) { console.warn(`⚠ No existe: ${abs}`); return []; }
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  return fs.readdirSync(abs)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.includes('.rejected'))
    .map(f => path.join(abs, f));
}

function extractTexts(batch) {
  const out = [];
  for (const p of batch.passages || []) {
    if (p.text)     out.push({ field: `passage:${p.id}:text`,     text: p.text });
    if (p.title)    out.push({ field: `passage:${p.id}:title`,    text: p.title });
    if (p.signText) out.push({ field: `passage:${p.id}:signText`, text: p.signText });
  }
  for (const q of batch.questions || []) {
    if (q.question) out.push({ field: `q:${q.id}:question`,  text: q.question });
    if (q.signText) out.push({ field: `q:${q.id}:signText`,  text: q.signText });
    for (const o of q.options || []) out.push({ field: `q:${q.id}:option`, text: String(o) });
  }
  return out;
}

let totalHits = 0;
let totalFixed = 0;

for (const dir of dirs) {
  const files = collectFiles(dir);
  for (const filePath of files) {
    let raw;
    try { raw = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    const batch = JSON.parse(raw);
    const texts = extractTexts(batch);
    const fileHits = [];

    for (const { field, text } of texts) {
      for (const entry of BLACKLIST) {
        if (!entry.term.test(text)) continue;
        const match = text.match(entry.term)?.[0] || '';
        fileHits.push({ field, match, suggestion: entry.suggestion, grammar: !!entry.grammar });
      }
    }

    if (fileHits.length) {
      const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
      console.log(`\n❌ ${rel}`);
      for (const h of fileHits) {
        const tag = h.grammar ? '[GRAM]' : '[C1/C2]';
        console.log(`   ${tag} "${h.match}" → ${h.suggestion}  (${h.field})`);
        totalHits++;
      }
    }
  }
}

console.log(`\n${'─'.repeat(60)}`);
if (totalHits === 0) {
  console.log('✅ Barrido completado: 0 hits C1/C2 — corpus limpio.');
} else {
  console.log(`❌ Total hits: ${totalHits}`);
  if (!fix) console.log('   Ejecuta con --fix para corregir errores gramaticales automáticamente.');
}

process.exit(totalHits > 0 ? 1 : 0);
