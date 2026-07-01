#!/usr/bin/env node
/**
 * Audita todos los archivos en batches/generated/ con las gates de calidad
 * pedagógica correctas según módulo y teil.
 *
 * Uso:
 *   node scripts/audit-generated-quality.mjs [--dry-run] [--module lesen] [--teil 4]
 *
 * Por defecto mueve los archivos que fallan a batches/generated/.rejected/
 * Con --dry-run solo imprime el diagnóstico sin mover nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkPromptBatchQuality } from './lib/promptBatchQuality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'batches', 'generated');
const REJECTED = path.join(GENERATED, '.rejected');

// ── CLI args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const filterModule = (() => { const i = argv.indexOf('--module'); return i >= 0 ? argv[i + 1] : null; })();
const filterTeil = (() => { const i = argv.indexOf('--teil'); return i >= 0 ? Number(argv[i + 1]) : null; })();

// ── helpers ────────────────────────────────────────────────────────────────
function parseName(filename) {
  // lesen-t2-gemini-034.json → { module: 'lesen', teil: 2 }
  // schreiben-gemini-001.json → { module: 'schreiben', teil: null }
  const base = filename.replace(/\.json$/i, '');
  const parts = base.split('-');
  const mod = parts[0];
  const tPart = parts.find((p) => /^t\d$/i.test(p));
  const teil = tPart ? Number(tPart.slice(1)) : null;
  return { module: mod, teil };
}

function runQualityCheck(batch, mod, teil) {
  if (mod === 'lesen') return checkLesenBatchQuality(batch, teil);
  if (mod === 'horen') return checkHorenBatchQuality(batch, teil);
  if (mod === 'schreiben' || mod === 'sprechen') {
    // Files may contain all teils; if teil is null, check each present teil separately
    const teils = teil != null
      ? [teil]
      : [...new Set((batch.questions || []).map((q) => q.teil).filter((t) => t != null))];
    if (teils.length === 0) return checkPromptBatchQuality(batch, mod, null);
    const allIssues = [];
    const allWarnings = [];
    let minScore = 100;
    for (const t of teils) {
      const subset = {
        passages: batch.passages || [],
        questions: (batch.questions || []).filter((q) => q.teil === t),
      };
      if (!subset.questions.length) continue;
      const r = checkPromptBatchQuality(subset, mod, t);
      allIssues.push(...r.issues);
      allWarnings.push(...(r.warnings || []));
      minScore = Math.min(minScore, r.scoreEstimate);
    }
    return { ok: allIssues.length === 0, issues: allIssues, warnings: allWarnings, scoreEstimate: minScore };
  }
  return null;
}

function rejectFile(filePath, result) {
  if (DRY_RUN) return;
  fs.mkdirSync(REJECTED, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = path.basename(filePath).replace(/\.json$/i, '');
  const dest = path.join(REJECTED, `${name}-${stamp}.json`);
  const batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  fs.writeFileSync(
    dest,
    `${JSON.stringify({ _rejectedReason: result.issues.join(' | '), _scoreEstimate: result.scoreEstimate, ...batch }, null, 2)}\n`,
    'utf8',
  );
  fs.unlinkSync(filePath);
}

// ── main ───────────────────────────────────────────────────────────────────
const files = fs.readdirSync(GENERATED)
  .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
  .sort();

const stats = { total: 0, ok: 0, fail: 0, skipped: 0 };
const failedFiles = [];

console.log(`Auditando ${files.length} archivos en batches/generated/${DRY_RUN ? ' [DRY-RUN]' : ''}\n`);

for (const file of files) {
  const { module: mod, teil } = parseName(file);

  if (filterModule && mod !== filterModule) { stats.skipped++; continue; }
  if (filterTeil != null && teil !== filterTeil) { stats.skipped++; continue; }
  if (!['lesen', 'horen', 'schreiben', 'sprechen'].includes(mod)) {
    stats.skipped++;
    continue;
  }
  if (teil == null && mod !== 'schreiben' && mod !== 'sprechen') {
    stats.skipped++;
    continue;
  }

  stats.total++;
  const filePath = path.join(GENERATED, file);
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.log(`⚠  ${file}: JSON inválido — omitiendo`);
    stats.skipped++;
    continue;
  }

  const result = runQualityCheck(batch, mod, teil);
  if (!result) { stats.skipped++; continue; }

  if (result.ok) {
    stats.ok++;
    process.stdout.write('.');
  } else {
    stats.fail++;
    failedFiles.push({ file, issues: result.issues, score: result.scoreEstimate });
    const tag = DRY_RUN ? '[DRY]' : '[MOVED]';
    console.log(`\n${tag} FAIL ${file} (score=${result.scoreEstimate}%)`);
    for (const issue of result.issues.slice(0, 3)) console.log(`     - ${issue}`);
    if (result.issues.length > 3) console.log(`     … +${result.issues.length - 3} más`);
    if (!DRY_RUN) rejectFile(filePath, result);
  }
}

// ── summary ────────────────────────────────────────────────────────────────
console.log('\n\n══════════════════════════════════════════');
console.log(`Total auditados : ${stats.total}`);
console.log(`Pasaron (OK)    : ${stats.ok}`);
console.log(`Fallaron (FAIL) : ${stats.fail}`);
console.log(`Omitidos        : ${stats.skipped}`);
if (failedFiles.length) {
  const byIssue = {};
  for (const { issues } of failedFiles) {
    for (const iss of issues) {
      // Categorize by first keyword
      const cat = iss.match(/sesgo|literal|copia|tono|personaje|pregunta|anuncio|situación|0 \(ning|marcas|turno/i)?.[0]?.toLowerCase() || 'otro';
      byIssue[cat] = (byIssue[cat] || 0) + 1;
    }
  }
  console.log('\nProblemas más frecuentes:');
  for (const [cat, n] of Object.entries(byIssue).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${cat.padEnd(20)} × ${n}`);
  }
}
if (DRY_RUN) {
  console.log('\n⚠  Modo DRY-RUN: ningún archivo movido.');
  console.log('   Ejecuta sin --dry-run para mover los archivos fallidos a .rejected/');
}
