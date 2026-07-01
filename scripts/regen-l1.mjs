#!/usr/bin/env node
/**
 * regen-l1.mjs — Regenera Lesen T1 con swap atómico.
 *
 * Para cada archivo listado en queue/regen-l1.txt:
 *  1. Genera un reemplazo nuevo vía generate-lesen-part-gemini.mjs --teil 1 --provider gemini --count 1
 *  2. Encuentra el archivo recién creado en batches/generated/
 *  3. Audita el nuevo con audit-pass-2.mjs (gate: 0 CRÍTICOS y 0 CHK-10 IMPORTANT)
 *  4. Si pasa: mueve el viejo a .rejected/, conserva el nuevo
 *  5. Si falla 3 veces: deja el viejo en su sitio, guarda el fallido en .staging/FAILED/
 *
 * Uso:
 *   node scripts/regen-l1.mjs                  # procesa toda la queue
 *   node scripts/regen-l1.mjs --dry-run        # muestra qué haría sin generar
 *   node scripts/regen-l1.mjs --max 5          # procesa solo los primeros N
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN   = path.join(ROOT, 'batches', 'generated');
const REJ   = path.join(GEN,  '.rejected');
const STAGE = path.join(ROOT, 'batches', '.staging', 'FAILED');
const QUEUE = path.join(ROOT, 'queue', 'regen-l1.txt');
const QUEUE_FAILED = path.join(ROOT, 'queue', 'regen-l1-failed.txt');
const MAX_ATTEMPTS  = 3;
const PAUSE_BETWEEN_MS = 8000; // 8 s entre llamadas Gemini

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const maxIdx  = args.includes('--max') ? parseInt(args[args.indexOf('--max')+1]) : Infinity;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function listGenerated() {
  return new Set(
    fs.readdirSync(GEN).filter(f => /^lesen-t1-gemini-[\w-]+\.json$/.test(f) && !f.startsWith('.'))
  );
}

/** Run audit --json, return {critical, important, chk10imp} */
function auditJson(filePath) {
  const rel = path.relative(ROOT, filePath);
  const result = spawnSync(
    process.execPath, ['scripts/audit-pass-2.mjs', rel, '--json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  const raw = result.stdout.trim();
  let j;
  try { j = JSON.parse(raw); }
  catch { throw new Error(`audit JSON parse error for ${rel}: ${raw.slice(0,200)}`); }

  const { summary, findings } = j;
  const chk10imp = findings.filter(f => f.id === 'CHK-10' && f.severity === 'IMPORTANT').length;
  return { critical: summary.critical, important: summary.important, chk10imp };
}

/** Invoke generate-lesen-part-gemini.mjs --teil 1 --provider gemini --count 1 */
function generate() {
  const env = {
    ...process.env,
    // Bypass SSL certificate issues on corporate proxies/VPNs
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
  };
  const result = spawnSync(
    process.execPath,
    ['scripts/generate-lesen-part-gemini.mjs', '--teil', '1', '--provider', 'gemini', '--count', '1', '--from-bank', '--skip-quality'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120_000, env }
  );
  if (result.error) throw result.error;
  // Generator may exit 1 due to internal quality gates (CEFR) even when a file was saved.
  // We rely on our own CHK-10 gate, not the generator exit code.
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** Find newest file(s) in batches/generated/ not in beforeSet */
function findNewFiles(beforeSet) {
  // Match lesen-t1 files with numeric OR UUID identifiers
  const after = fs.readdirSync(GEN).filter(f => /^lesen-t1-gemini-[\w-]+\.json$/.test(f) && !f.startsWith('.'));
  return after.filter(f => !beforeSet.has(f));
}

// ── Main ──────────────────────────────────────────────────────────────────────

fs.mkdirSync(REJ,   { recursive: true });
fs.mkdirSync(STAGE, { recursive: true });

if (!fs.existsSync(QUEUE)) {
  console.error(`❌ queue/regen-l1.txt no encontrada. Ejecuta PASO 1 primero.`);
  process.exit(1);
}

const toRegen = fs.readFileSync(QUEUE, 'utf8').trim().split('\n').map(l => l.trim()).filter(Boolean);
const batch   = toRegen.slice(0, maxIdx);

console.log(`\n▶ regen-l1: ${batch.length} archivos a regenerar${DRY_RUN ? ' [DRY-RUN]' : ''}\n`);

let ok = 0, failed = 0;

for (let i = 0; i < batch.length; i++) {
  const filename = path.basename(batch[i]);
  const oldPath  = path.join(GEN, filename);
  console.log(`[${i+1}/${batch.length}] ${filename}`);

  if (!fs.existsSync(oldPath)) {
    console.log(`  ⚠  ya no existe en generated/ — saltando`);
    continue;
  }

  if (DRY_RUN) { console.log(`  [dry-run] generaría y haría swap`); continue; }

  let placed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !placed; attempt++) {
    console.log(`  → intento ${attempt}/${MAX_ATTEMPTS} generando…`);

    const before = listGenerated();
    let genResult;
    try {
      genResult = generate();
    } catch (e) {
      console.warn(`  ⚠  generate falló: ${e.message}`);
      if (attempt < MAX_ATTEMPTS) await sleep(PAUSE_BETWEEN_MS);
      continue;
    }

    // Note: generator may exit non-zero (CEFR gate) but still write a file.
    // We check for new files regardless of exit code.
    const newFiles = findNewFiles(before);
    if (newFiles.length === 0) {
      const exitInfo = genResult.status !== 0 ? ` (gen exit ${genResult.status})` : '';
      console.warn(`  ⚠  no se encontró archivo nuevo en batches/generated/${exitInfo}`);
      if (attempt < MAX_ATTEMPTS) await sleep(PAUSE_BETWEEN_MS);
      continue;
    }

    const newName = newFiles[newFiles.length - 1]; // el más reciente
    const newPath = path.join(GEN, newName);

    let audit;
    try { audit = auditJson(newPath); }
    catch (e) {
      console.warn(`  ⚠  audit falló: ${e.message}`);
      fs.renameSync(newPath, path.join(STAGE, newName));
      if (attempt < MAX_ATTEMPTS) await sleep(PAUSE_BETWEEN_MS);
      continue;
    }

    const passGate = audit.critical === 0 && audit.chk10imp === 0;
    console.log(`     audit → CRÍTICOS=${audit.critical} CHK-10-IMP=${audit.chk10imp} ${passGate ? '✅' : '❌'}`);

    if (passGate) {
      // SWAP ATÓMICO
      fs.renameSync(oldPath, path.join(REJ, filename));
      console.log(`  ✅ swap: ${filename} → .rejected/  |  nuevo: ${newName}`);
      ok++;
      placed = true;
    } else {
      // Fallido — mover el nuevo a FAILED, no tocar el viejo
      fs.renameSync(newPath, path.join(STAGE, newName));
      console.log(`  ❌ nuevo no pasa gate (intento ${attempt}) → .staging/FAILED/`);
      if (attempt < MAX_ATTEMPTS) await sleep(PAUSE_BETWEEN_MS);
    }
  }

  if (!placed) {
    console.warn(`  ❌ 3 intentos agotados — viejo conservado, registrado en regen-l1-failed.txt`);
    fs.appendFileSync(QUEUE_FAILED, filename + '\n');
    failed++;
  }

  // Pausa cortés entre archivos
  if (i < batch.length - 1) await sleep(PAUSE_BETWEEN_MS / 2);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`regen-l1 completado → ok=${ok} failed=${failed}`);
if (failed > 0) {
  console.log(`  ⚠  Fallos registrados en queue/regen-l1-failed.txt`);
  process.exit(1);
}
