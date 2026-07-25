#!/usr/bin/env node
/**
 * push-seed-to-blobs — propaga el seed local a los blobs de producción.
 *
 *   SIEMPRE empieza con --dry-run para revisar el diff antes de escribir.
 *
 *   node scripts/push-seed-to-blobs.mjs --dry-run             # muestra diff completo
 *   node scripts/push-seed-to-blobs.mjs --dry-run --only-missing  # solo las que faltan
 *   node scripts/push-seed-to-blobs.mjs --apply --only-missing    # sube solo las ausentes
 *   node scripts/push-seed-to-blobs.mjs --apply                   # sube + actualiza todas
 *
 * Opciones:
 *   --dry-run        Solo muestra qué haría. NO escribe en blobs.
 *   --apply          Escribe en blobs. Requiere confirmación sin --yes.
 *   --yes            Salta confirmación interactiva (para scripts CI).
 *   --only-missing   Solo procesa partes que NO existen en blobs (más seguro).
 *   --only-updates   Solo procesa partes que SÍ existen en blobs pero con contenido distinto.
 *   --normalize-keys Normaliza correct:"A"→"a" en partes existentes durante el update.
 *   --seed <path>    Seed JSON alternativo (default: library/reusable-seed/de_B1.json).
 *   --module <m>     Filtra por módulo (lesen|horen|schreiben).
 *   --teil <n>       Filtra por teil.
 *   --ids <id,...>   Solo estos part IDs.
 *   --allow-empty-index  Si falla la lectura del índice, continuar asumiendo tienda vacía
 *                        (solo primer push / error de red conocido). Por defecto: DESACTIVADO.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  buildUpdatedPayload,
  previewPayloadMerge,
  keySeqForPart,
  passageTextLen,
  mcqCorrectText,
  normalizeCompareText,
  countRealAds,
} from './lib/mergeSeedBlobPayload.mjs';
import {
  BlobStoreReadError,
  loadBlobIndexStrict,
  planPushOperations,
  abortMessage,
} from './lib/pushSeedBlobStrict.mjs';
loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { addReusablePart, partPayloadKey } =
  require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { applyPartIndex } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isDryRun    = argv.includes('--dry-run');
const isApply     = argv.includes('--apply');
const skipConfirm = argv.includes('--yes');
const onlyMissing = argv.includes('--only-missing');
const onlyUpdates = argv.includes('--only-updates');
const normalizeKeys = argv.includes('--normalize-keys');
const filterModule = argv.includes('--module') ? argv[argv.indexOf('--module') + 1] : null;
const filterTeil   = argv.includes('--teil') ? Number(argv[argv.indexOf('--teil') + 1]) : null;
const seedPath     = argv.includes('--seed')
  ? path.resolve(argv[argv.indexOf('--seed') + 1])
  : path.join(ROOT, 'library/reusable-seed/de_B1.json');
const previewIds   = argv.includes('--preview')
  ? argv[argv.indexOf('--preview') + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const filterIds    = argv.includes('--ids')
  ? new Set(argv[argv.indexOf('--ids') + 1].split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const allowEmptyIndex = argv.includes('--allow-empty-index');

if (!isDryRun && !isApply) {
  console.error('Indica --dry-run o --apply.');
  process.exit(1);
}
if (isDryRun && isApply) {
  console.error('--dry-run y --apply son mutuamente excluyentes.');
  process.exit(1);
}
if (onlyMissing && onlyUpdates) {
  console.error('--only-missing y --only-updates son mutuamente excluyentes.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a question's `correct` field: uppercase letter → lowercase for multiple_choice */
function normalizeQuestion(q) {
  const out = { ...q };
  if ((out.type === 'multiple_choice' || out.type === 'multiple') && out.correct != null) {
    const cs = String(out.correct);
    if (/^[A-Z]$/.test(cs)) out.correct = cs.toLowerCase();
  }
  if (out.correct != null) out.correctAnswer = out.correct;
  return out;
}

/** Normalize all questions in a seed part */
function normalizePart(part) {
  const out = { ...part };
  if (normalizeKeys && Array.isArray(out.questions)) {
    out.questions = out.questions.map(normalizeQuestion);
  }
  // Segments (H1/H3/H4)
  if (normalizeKeys && Array.isArray(out.segments)) {
    out.segments = out.segments.map(seg => ({
      ...seg,
      questions: Array.isArray(seg.questions) ? seg.questions.map(normalizeQuestion) : seg.questions,
    }));
  }
  return out;
}

function confirm(msg) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${msg} [y/N] `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const store = getStore({
  name: 'lexicoil-data',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN,
});

// Load local seed
const seedRaw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
let seedArr = Array.isArray(seedRaw) ? seedRaw : (seedRaw.records || []);

// Apply filters
if (filterModule) seedArr = seedArr.filter(p => p.module === filterModule);
if (filterTeil != null) seedArr = seedArr.filter(p => (p.teil === filterTeil || p.part === filterTeil));
if (filterIds) seedArr = seedArr.filter(p => filterIds.has(p.partId || p.id));

console.log(`\n${'═'.repeat(68)}`);
console.log(`  push-seed-to-blobs${isDryRun ? '  [DRY RUN — no se escribe nada]' : '  [APPLY — ESCRIBE EN PRODUCCIÓN]'}`);
console.log(`${'═'.repeat(68)}`);
console.log(`  Seed: ${seedPath}`);
if (filterModule) console.log(`  Módulo: ${filterModule}${filterTeil ? ` T${filterTeil}` : ''}`);
if (filterIds) console.log(`  IDs: ${[...filterIds].join(', ')}`);
console.log(`  Partes en seed${filterModule ? ` (${filterModule}${filterTeil ? ` T${filterTeil}` : ''})` : ''}: ${seedArr.length}`);
if (normalizeKeys) console.log(`  --normalize-keys activo: correct:"A"→"a" en múltiple_choice`);
if (allowEmptyIndex) console.log(`  --allow-empty-index activo (continúa si falla lectura del índice)`);
console.log('');

// Build blob index (fail-closed: error de red ≠ tienda vacía)
console.log('Cargando índice de blobs (fail-closed)...');
let blobIndex;
let indexStats;
try {
  ({ blobIndex, indexStats } = await loadBlobIndexStrict(store));
} catch (err) {
  if (!(err instanceof BlobStoreReadError) || !allowEmptyIndex) {
    console.error(abortMessage(err, { allowEmptyIndex }));
    process.exit(1);
  }
  console.error(`\n⚠  ${err.message}`);
  console.error('  --allow-empty-index: continuando asumiendo tienda vacía (sin lectura verificada).\n');
  blobIndex = new Map();
  indexStats = { total: 0, readOk: false, assumedEmpty: true, modules: {} };
}

if (indexStats.readOk && indexStats.total === 0) {
  console.log('  Índice OK — tienda vacía (0 entradas). Upload permitido para partes ausentes.');
} else if (indexStats.readOk) {
  console.log(`  Índice OK — ${indexStats.total} partes en blobs`);
} else {
  console.log('  Índice NO verificado (--allow-empty-index)');
}
console.log('');

// Categorize seed parts (payload fetch failure → abort, never → MISSING)
let missing;
let differs;
let matching;
let mergeErrors;
let blobCache;

process.stdout.write('Comparando payload merge vs blobs');
try {
  ({ missing, differs, matching, mergeErrors, blobCache } = await planPushOperations(
    seedArr,
    store,
    blobIndex,
    { normalizeKeys },
  ));
  console.log(' done\n');
} catch (err) {
  console.log(' ABORT\n');
  console.error(abortMessage(err, { allowEmptyIndex }));
  process.exit(1);
}

// ── Print report ─────────────────────────────────────────────────────────────

console.log(`${'─'.repeat(68)}`);
console.log(`  MISSING (en seed, no en blobs): ${missing.length}`);
for (const { id, seedPart } of missing) {
  const mod = seedPart.module || '?';
  const teil = seedPart.teil ?? seedPart.part ?? '?';
  const nq = (seedPart.questions || []).length;
  console.log(`    ↑ SUBIR  ${id.padEnd(42)} ${mod} T${teil} (${nq} preguntas)`);
}

console.log('');
console.log(`  DIFFERS (en blobs pero contenido distinto): ${differs.length}`);
for (const { id, diffs, keyDiffs } of differs) {
  const row = blobIndex.get(id);
  const mod = row?.module || '?'; const teil = row?.teil ?? '?';
  const summary = diffs.slice(0, 3).map(d => `${d.path}: ${d.from}→${d.to}`).join(' | ');
  const keyNote = keyDiffs > 0 ? ` [${keyDiffs} correct uppercase→lower]` : '';
  console.log(`    ≠ UPDATE ${id.padEnd(42)} ${mod} T${teil}${keyNote}`);
  console.log(`              ${summary.slice(0, 90)}`);
}

console.log('');
console.log(`  OK (payload merge = blob): ${matching.length}`);

if (mergeErrors.length) {
  console.log(`\n  MERGE ERRORS (no se escribirían): ${mergeErrors.length}`);
  for (const e of mergeErrors.slice(0, 5)) {
    console.log(`    ✗ ${e.id}: ${e.message}`);
    for (const d of (e.details || []).slice(0, 2)) console.log(`        · ${d}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
const toUpload = onlyUpdates ? [] : missing;
const toUpdate = onlyMissing ? [] : differs.filter((d) => d.payload);
const totalOps = toUpload.length + toUpdate.length;

const keySeqChanges = toUpdate.filter(({ blobPart, payload }) =>
  keySeqForPart(blobPart) !== keySeqForPart(payload)).length;

console.log(`\n${'─'.repeat(68)}`);
console.log(`  Operaciones pendientes (payload merge quirúrgico):`);
console.log(`    Subir (nuevas):        ${toUpload.length}`);
console.log(`    Actualizar (fix):      ${toUpdate.length}`);
console.log(`    Con cambio secuencia:  ${keySeqChanges}`);
console.log(`    Sin cambio vs blob:    ${matching.length}`);
console.log(`    TOTAL acciones:        ${totalOps}`);

const defaultPreview = [
  'bank-de-B1-lesen-t5-f78f75b335a557c4',
  'bank-de-B1-lesen-t4-513735270e5eda6f',
  'bank-de-B1-lesen-t2-b9b664e0ae81fd5d',
];
const previewList = previewIds || defaultPreview;

function printPayloadPreview(id) {
  const seedPart = seedArr.find((p) => (p.id || p.partId) === id);
  const blobPart = blobCache.get(id);
  if (!seedPart) {
    console.log(`\n  [preview] ${id} — no encontrado en seed`);
    return;
  }
  if (!blobPart) {
    const seedAds = seedPart.passage?.ads ?? seedPart.ads ?? [];
    console.log(`\n${'─'.repeat(68)}`);
    console.log(`  PREVIEW UPLOAD (nueva en blobs): ${id}  (${seedPart.module} T${seedPart.teil})`);
    console.log(`  passage.ads seed: ${seedAds.length} (${countRealAds(seedAds)} reales)`);
    if (seedAds[0]) console.log(`  ad A seed: ${JSON.stringify(seedAds[0]).slice(0, 90)}…`);
    console.log(`  questions: ${(seedPart.questions || []).length}  Q1 correct: ${seedPart.questions?.[0]?.correct}`);
    return;
  }
  let payload;
  try {
    payload = buildUpdatedPayload(blobPart, seedPart, { normalizeKeys });
  } catch (err) {
    console.log(`\n  [preview] ${id} — MERGE ERROR: ${err.message}`);
    return;
  }
  const mod = seedPart.module || '?';
  const teil = seedPart.teil ?? '?';
  console.log(`\n${'─'.repeat(68)}`);
  console.log(`  PREVIEW PAYLOAD: ${id}  (${mod} T${teil})`);
  console.log(previewPayloadMerge(blobPart, seedPart, payload));
  const passOk = passageTextLen(payload) >= passageTextLen(blobPart);
  console.log(`  ✓ passage no reducido: ${passOk ? 'SÍ' : 'NO ⚠'}`);
  const qs = payload.questions || [];
  const t = String(qs[0]?.type || '').toLowerCase();
  if (t === 'multiple' || t === 'multiple_choice') {
    const allTextOk = (blobPart.questions || []).every((bq) => {
      const pq = qs.find((q) => q.id === bq.id);
      return pq && normalizeCompareText(mcqCorrectText(bq)) === normalizeCompareText(mcqCorrectText(pq));
    });
    console.log(`  ✓ textos correctos MCQ preservados: ${allTextOk ? 'SÍ' : 'NO ⚠'}`);
  }
}

if (isDryRun) {
  console.log(`\n${'═'.repeat(68)}`);
  console.log(`  MUESTRAS payload merge (blob richness + seed entropy)`);
  for (const id of previewList) printPayloadPreview(id);

  console.log(`\n${'═'.repeat(68)}`);
  console.log(`  [DRY RUN] Ningún dato fue modificado.`);
  console.log(`  Para aplicar: node scripts/push-seed-to-blobs.mjs --apply --yes`);
  console.log(`${'═'.repeat(68)}\n`);
  process.exit(mergeErrors.length ? 1 : 0);
}

// ── Apply ─────────────────────────────────────────────────────────────────────
if (totalOps === 0) {
  console.log('\n  Nada que hacer. Blobs ya coincide con el seed.\n');
  process.exit(0);
}

if (!skipConfirm) {
  const ok = await confirm(`\n  ¿Aplicar ${totalOps} operación(es) en blobs de PRODUCCIÓN?`);
  if (!ok) { console.log('  Cancelado.\n'); process.exit(0); }
}

let uploaded = 0; let updated = 0; let errors = 0;

// Upload missing parts
for (const { id, seedPart } of toUpload) {
  const part = normalizePart({
    ...seedPart,
    id,
    lang: seedPart.lang || 'de',
    level: seedPart.level || 'B1',
    complete: seedPart.complete ?? true,
    verified: seedPart.verified ?? false,
  });
  try {
    await addReusablePart(store, part, { deferRotate: true });
    console.log(`  ✓ Subido: ${id}`);
    uploaded++;
  } catch (err) {
    console.error(`  ✗ Error subiendo ${id}: ${err.message}`);
    errors++;
  }
}

// ── Update differing parts (merge quirúrgico: lib/mergeSeedBlobPayload.mjs) ───

for (const { id, blobPart, seedPart } of toUpdate) {
  const mod = blobPart.module || seedPart.module || 'lesen';
  const pKey = partPayloadKey('de', 'B1', mod, id);
  let updated_payload;
  try {
    updated_payload = buildUpdatedPayload(blobPart, seedPart, { normalizeKeys });
    applyPartIndex(updated_payload, {
      lang: updated_payload.lang || seedPart.lang || 'de',
      level: updated_payload.level || seedPart.level || 'B1',
      topicTag: updated_payload.topicTag || seedPart.topicTag || null,
    });
  } catch (err) {
    console.error(`  ✗ Merge rechazado ${id}: ${err.message}`);
    if (err.details?.length) console.error(`      ${err.details.slice(0, 3).join(' | ')}`);
    errors++;
    continue;
  }
  try {
    await store.set(pKey, JSON.stringify(updated_payload));
    console.log(`  ✓ Actualizado: ${id}`);
    updated++;
  } catch (err) {
    console.error(`  ✗ Error actualizando ${id}: ${err.message}`);
    errors++;
  }
}

console.log(`\n${'═'.repeat(68)}`);
console.log(`  Subidos: ${uploaded} · Actualizados: ${updated} · Errores: ${errors}`);
console.log(`  Para verificar: node scripts/verify-blobs-vs-seed.mjs`);
console.log(`${'═'.repeat(68)}\n`);
process.exit(errors > 0 ? 1 : 0);
