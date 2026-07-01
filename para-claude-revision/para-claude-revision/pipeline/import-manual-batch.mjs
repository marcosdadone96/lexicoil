#!/usr/bin/env node
/**
 * Importa un batch generado manualmente (pegado de Gemini/Claude) y lo valida
 * con el mismo pipeline completo que el generador automático.
 *
 * Flujo: leer .txt → extraer JSON → normalizar → validate-batch
 *        → calidad pedagógica → léxico → dedup → audit-pass-2 → guardar
 *
 * Uso:
 *   node scripts/import-manual-batch.mjs --module horen --teil 1 --file batches/inbox/horen-t1.txt
 *   node scripts/import-manual-batch.mjs --module horen --teil 2 --file batches/inbox/horen-t2.txt
 *   node scripts/import-manual-batch.mjs --module schreiben --file batches/inbox/schreiben.txt
 *   node scripts/import-manual-batch.mjs --module sprechen --file batches/inbox/sprechen.txt
 *
 * El archivo .txt puede contener texto libre con uno o varios bloques JSON.
 * Si pasa todos los gates, se guarda en batches/generated/ con el nombre correcto.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');

// ── Imports del pipeline ──────────────────────────────────────────────────────
const { normalizeBatch } = await import('./lib/normalizeBatch.mjs');
const { extractAllExamBatches } = await import('./lib/extractJson.mjs');
const { nextExamOutputBasename } = await import('./lib/pasteExamBatchLib.mjs');
const { checkHorenBatchQuality, formatHorenQualityReport } = await import('./lib/horenBatchQuality.mjs');
const { checkPromptBatchQuality, formatPromptQualityReport } = await import('./lib/promptBatchQuality.mjs');
const { checkLexical, formatLexicalReport } = await import('./lib/lexicalCheck.mjs');
const { buildCorpusFromDirSync, checkDuplicate } = await import('./lib/semanticDedup.mjs');

// ── validate-batch vía child process (igual que el generador) ─────────────────
function validateBatchFile(lang, level, relFile) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'validate-batch.mjs'), relFile, '--lang', lang, '--level', level],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, cwd: ROOT },
  );
  const output = (result.stdout || '') + (result.stderr || '');
  const ok = result.status === 0;
  return { ok, output };
}

// ── Parseo de argumentos ──────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { module: null, teil: null, file: null, lang: 'de', level: 'B1', continueOnError: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') out.module = String(argv[++i] || '').toLowerCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--continue') out.continueOnError = true;
  }
  return out;
}

// ── Calidad pedagógica según módulo ──────────────────────────────────────────
function runQuality(batch, module, teil) {
  if (module === 'horen') {
    const r = checkHorenBatchQuality(batch, teil);
    return { ok: r.ok, report: formatHorenQualityReport(r, teil) };
  }
  if (module === 'schreiben' || module === 'sprechen') {
    const r = checkPromptBatchQuality(batch, module, teil);
    return { ok: r.ok, report: formatPromptQualityReport(r, module, teil) };
  }
  return { ok: true, report: '(sin gate pedagógico para este módulo)' };
}

// ── Pipeline completo para un batch ──────────────────────────────────────────
function processBatch(rawBatch, args, index, total) {
  const label = `#${index + 1}/${total}`;
  const sep = '═'.repeat(60);
  console.log(`\n${sep}`);
  console.log(`Procesando ${label}  [${args.module}${args.teil ? ' T' + args.teil : ''}]`);
  console.log(sep);

  // 1. Normalizar
  const batch = normalizeBatch(rawBatch, {
    module: args.module,
    teil: args.teil ?? undefined,
    lang: args.lang,
    level: args.level,
  });

  if (!batch?.questions?.length) {
    console.error('❌ JSON sin array questions válido');
    return { ok: false };
  }

  // Nombre de archivo de salida
  const basename = nextExamOutputBasename(args.module, args.teil, 'manual');
  const absPath = path.join(GENERATED_DIR, basename);
  const relFile = path.relative(ROOT, absPath).replace(/\\/g, '/');

  // Escribir al disco para validate-batch
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const { _rejectedReason: _r, _scoreEstimate: _s, ...cleanBatch } = batch;
  fs.writeFileSync(absPath, `${JSON.stringify(cleanBatch, null, 2)}\n`, 'utf8');

  const cleanup = () => { try { fs.unlinkSync(absPath); } catch (_) { /* ignore */ } };

  // 2. Gate: validate-batch (formato + blueprint)
  console.log('\n── Gate 1: validate-batch ──');
  const validation = validateBatchFile(args.lang, args.level, relFile);
  console.log(validation.output.trim());
  if (!validation.ok) {
    cleanup();
    console.error('❌ RECHAZADO en validate-batch');
    return { ok: false };
  }
  console.log('✅ validate-batch OK');

  // 3. Gate: calidad pedagógica
  console.log('\n── Gate 2: calidad pedagógica ──');
  const quality = runQuality(cleanBatch, args.module, args.teil);
  console.log(quality.report);
  if (!quality.ok) {
    cleanup();
    console.error('❌ RECHAZADO en calidad pedagógica');
    return { ok: false };
  }
  console.log('✅ Calidad OK');

  // 4. Gate: léxico C1/C2
  console.log('\n── Gate 3: léxico C1/C2 ──');
  const lex = checkLexical(cleanBatch);
  if (!lex.ok) {
    console.log(formatLexicalReport(lex));
    cleanup();
    console.error('❌ RECHAZADO en léxico');
    return { ok: false };
  }
  if (lex.warnings?.length) console.log(formatLexicalReport(lex));
  console.log('✅ Léxico OK');

  // 5. Gate: deduplicación semántica
  console.log('\n── Gate 4: deduplicación ──');
  try {
    const currentIds = new Set((cleanBatch.passages || []).map(p => p.id).filter(Boolean));
    const corpus = buildCorpusFromDirSync(GENERATED_DIR, fs, path)
      .filter(e => !currentIds.has(e.id));
    const dedup = checkDuplicate(cleanBatch, corpus, { threshold: 0.55 });
    if (!dedup.ok) {
      console.log(`Dedup FAIL: ${dedup.issues[0]}`);
      cleanup();
      console.error('❌ RECHAZADO en deduplicación');
      return { ok: false };
    }
    if (dedup.warnings?.length) {
      for (const w of dedup.warnings) console.log(`  ⚠ dedup: ${w}`);
    }
    console.log('✅ Dedup OK');
  } catch (e) {
    console.warn(`  ⚠ dedup omitido: ${e.message}`);
  }

  // 6. Gate: audit-pass-2
  console.log('\n── Gate 5: audit-pass-2 ──');
  const auditScript = path.join(ROOT, 'scripts', 'audit-pass-2.mjs');
  const auditResult = spawnSync(
    process.execPath,
    [auditScript, absPath, '--json', '--fail-on=CRITICAL'],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, cwd: ROOT },
  );
  if (auditResult.status !== 0) {
    let criticals = [];
    try {
      const p = JSON.parse(auditResult.stdout || '{}');
      criticals = (p.findings || []).filter(f => f.severity === 'CRITICAL').map(f => f.message);
    } catch (_) { /* ignore */ }
    console.log(criticals[0] || 'audit-pass-2 CRITICAL');
    cleanup();
    console.error('❌ RECHAZADO en audit-pass-2');
    return { ok: false };
  }
  try {
    const p = JSON.parse(auditResult.stdout || '{}');
    const imp = (p.findings || []).filter(f => f.severity === 'IMPORTANT');
    if (imp.length) {
      console.log(`  ⚠ ${imp.length} IMPORTANTE(S) (no bloquean):`);
      for (const f of imp.slice(0, 3)) console.log(`    - [${f.id}] ${f.message}`);
    }
  } catch (_) { /* ignore */ }
  console.log('✅ audit-pass-2 OK');

  // ✅ Todos los gates pasados — guardar con el nombre limpio
  fs.writeFileSync(absPath, `${JSON.stringify(cleanBatch, null, 2)}\n`, 'utf8');
  const qCount = cleanBatch.questions?.length ?? 0;
  const pCount = cleanBatch.passages?.length ?? 0;
  const teilLabel = args.teil != null ? `Teil ${args.teil}` : 'Teile 1–3';
  console.log(`\n✅ GUARDADO: ${relFile} (${qCount} preguntas, ${pCount} pasajes · ${args.module} ${teilLabel})`);
  return { ok: true, file: relFile };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));

if (!args.file || !args.module) {
  console.error(`Uso:
  node scripts/import-manual-batch.mjs --module horen --teil 1 --file batches/inbox/horen-t1.txt
  node scripts/import-manual-batch.mjs --module horen --teil 2 --file batches/inbox/horen-t2.txt
  node scripts/import-manual-batch.mjs --module horen --teil 3 --file batches/inbox/horen-t3.txt
  node scripts/import-manual-batch.mjs --module horen --teil 4 --file batches/inbox/horen-t4.txt
  node scripts/import-manual-batch.mjs --module schreiben  --file batches/inbox/schreiben.txt
  node scripts/import-manual-batch.mjs --module sprechen   --file batches/inbox/sprechen.txt

El archivo .txt puede contener el JSON directamente o con texto alrededor.
Se pueden incluir múltiples bloques JSON separados (uno por línea/sección).`);
  process.exit(1);
}

const filePath = path.isAbsolute(args.file) ? args.file : path.join(ROOT, args.file);
if (!fs.existsSync(filePath)) {
  console.error(`Archivo no encontrado: ${filePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(filePath, 'utf8');
const batches = extractAllExamBatches(raw, args.module);

if (!batches.length) {
  console.error('No se encontró ningún batch JSON válido en el archivo.');
  process.exit(1);
}

console.log(`\nEncontrados ${batches.length} batch(es) en ${path.basename(args.file)}`);
console.log(`Módulo: ${args.module}${args.teil ? ' · Teil ' + args.teil : ' (todos los teile)'}`);
console.log('Pipeline: validate-batch → calidad → léxico → dedup → audit-pass-2\n');

let saved = 0;
let failed = 0;

for (let i = 0; i < batches.length; i++) {
  const { batch, teil: teilHint } = batches[i];
  const teilToUse = args.teil ?? teilHint ?? null;
  const result = processBatch(batch, { ...args, teil: teilToUse }, i, batches.length);
  if (result.ok) saved++;
  else {
    failed++;
    if (!args.continueOnError && batches.length > 1) {
      console.error('\nDetenido. Usa --continue para procesar el resto.');
      break;
    }
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`Resumen: ${saved} guardados, ${failed} rechazados (de ${batches.length} total)`);
if (failed > 0) process.exit(1);
