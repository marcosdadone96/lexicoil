#!/usr/bin/env node
/**
 * print-corpus-stats.mjs — Genera tabla de estadísticas del banco de contenido.
 *
 * Uso:
 *   node scripts/print-corpus-stats.mjs              # salida texto
 *   node scripts/print-corpus-stats.mjs --markdown   # salida Markdown (para README)
 *   node scripts/print-corpus-stats.mjs --json       # salida JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN  = path.join(ROOT, 'batches', 'generated');

const args = process.argv.slice(2);
const MD   = args.includes('--markdown');
const JSON_OUT = args.includes('--json');
const today = new Date().toISOString().slice(0, 10);

// ── Count files and questions by (module, teil) ──────────────────────────────

const stats = {};  // { "lesen-1": { files: N, questions: N } }

const files = fs.readdirSync(GEN).filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'));

for (const fname of files) {
  let batch;
  try { batch = JSON.parse(fs.readFileSync(path.join(GEN, fname), 'utf8')); }
  catch { continue; }

  const qs = batch.questions || [];
  if (qs.length === 0) continue;

  // Detect module/teil from questions
  const q0 = qs[0];
  const mod  = q0.module || 'unknown';
  const teil = q0.teil   || 0;
  const key  = `${mod}-${teil}`;

  if (!stats[key]) stats[key] = { module: mod, teil, files: 0, questions: 0 };
  stats[key].files++;
  stats[key].questions += qs.length;
}

// Sort by module then teil
const rows = Object.values(stats).sort((a, b) => {
  if (a.module < b.module) return -1;
  if (a.module > b.module) return 1;
  return a.teil - b.teil;
});

// ── Output ────────────────────────────────────────────────────────────────────

if (JSON_OUT) {
  console.log(JSON.stringify({ date: today, total_files: files.length, breakdown: rows }, null, 2));
  process.exit(0);
}

const totalFiles = rows.reduce((s, r) => s + r.files, 0);
const totalQs    = rows.reduce((s, r) => s + r.questions, 0);

if (MD) {
  console.log(`\n### Estado del corpus (${today})\n`);
  console.log(`| Módulo | Teil | Archivos | Preguntas |`);
  console.log(`|--------|------|----------|-----------|`);
  for (const r of rows) {
    console.log(`| ${r.module.padEnd(8)} | ${String(r.teil).padStart(4)} | ${String(r.files).padStart(8)} | ${String(r.questions).padStart(9)} |`);
  }
  console.log(`| **TOTAL** | — | **${totalFiles}** | **${totalQs}** |`);
  console.log();
} else {
  console.log(`\nEstado del corpus — ${today}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`${'Módulo'.padEnd(10)} ${'Teil'.padStart(4)} ${'Archivos'.padStart(9)} ${'Preguntas'.padStart(10)}`);
  console.log(`${'─'.repeat(50)}`);
  for (const r of rows) {
    console.log(`${r.module.padEnd(10)} ${String(r.teil).padStart(4)} ${String(r.files).padStart(9)} ${String(r.questions).padStart(10)}`);
  }
  console.log(`${'─'.repeat(50)}`);
  console.log(`${'TOTAL'.padEnd(10)} ${''.padStart(4)} ${String(totalFiles).padStart(9)} ${String(totalQs).padStart(10)}`);
  console.log(`\nBanco: ${files.length} archivos JSON en batches/generated/`);
}
