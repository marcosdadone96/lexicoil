#!/usr/bin/env node
/**
 * FIX-E — Construye para-claude-verificacion/ con auditorías, muestras aleatorias y ZIP.
 * Uso: node scripts/_build-verificacion.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN  = path.join(ROOT, 'batches', 'generated');
const OUT  = path.join(ROOT, 'para-claude-verificacion');
const MUESTRAS = path.join(OUT, 'muestras-aleatorias');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(args, { json = false } = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  return json ? r.stdout : r.stdout + r.stderr;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomSample(arr, n) {
  return shuffle(arr).slice(0, n);
}

function copyFile(src, destDir) {
  try {
    fs.copyFileSync(src, path.join(destDir, path.basename(src)));
  } catch { /* silencio */ }
}

// ─── Limpiar y crear estructura ───────────────────────────────────────────────

console.log('🧹  Limpiando para-claude-verificacion/…');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(MUESTRAS, { recursive: true });

// ─── 1. Auditar banco ─────────────────────────────────────────────────────────

console.log('🔍  Auditando batches/generated…');
const bancoPipe = spawnSync(process.execPath,
  ['scripts/audit-pass-2.mjs', 'batches/generated', '--json'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
fs.writeFileSync(path.join(OUT, 'audit-banco.json'), bancoPipe.stdout);
const bancoAudit = JSON.parse(bancoPipe.stdout);
console.log(`   banco: ${bancoAudit.summary.filesScanned} archivos | CRITICAL=${bancoAudit.summary.critical} IMPORTANT=${bancoAudit.summary.important}`);

// ─── 2. Auditar pool ──────────────────────────────────────────────────────────

const POOL_FILE = path.join(ROOT, 'library', 'pool-seed', 'de_B1.json');
console.log('🔍  Auditando library/pool-seed/de_B1.json…');
const poolPipe = spawnSync(process.execPath,
  ['scripts/audit-pass-2.mjs', 'library/pool-seed/de_B1.json', '--json'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
fs.writeFileSync(path.join(OUT, 'audit-pool.json'), poolPipe.stdout);
const poolAudit = JSON.parse(poolPipe.stdout);
console.log(`   pool:  ${poolAudit.summary.filesScanned} archivos | questionsScanned=${poolAudit.summary.questionsScanned} CRITICAL=${poolAudit.summary.critical} IMPORTANT=${poolAudit.summary.important}`);

// ─── 3. Muestras aleatorias ───────────────────────────────────────────────────

console.log('🎲  Copiando muestras aleatorias…');
const PREFIXES = [
  'lesen-t1', 'lesen-t2', 'lesen-t3', 'lesen-t4', 'lesen-t5',
  'horen-t1', 'horen-t2', 'horen-t3', 'horen-t4',
  'schreiben', 'sprechen',
];
let sampleCount = 0;
for (const pfx of PREFIXES) {
  const files = fs.readdirSync(GEN).filter(f => f.startsWith(pfx) && f.endsWith('.json') && !f.startsWith('.'));
  const sample = randomSample(files, 3);
  for (const f of sample) {
    copyFile(path.join(GEN, f), MUESTRAS);
    sampleCount++;
  }
}

// Foco extra: 5 Lesen T1 aleatorios adicionales para verificar correlación rota
const l1Files = fs.readdirSync(GEN).filter(f => f.startsWith('lesen-t1') && f.endsWith('.json') && !f.startsWith('.'));
const extra5 = randomSample(l1Files, 5);
for (const f of extra5) {
  copyFile(path.join(GEN, f), MUESTRAS);
}
console.log(`   ${sampleCount} archivos por tipo + 5 L1 extra → ${fs.readdirSync(MUESTRAS).length} en muestras-aleatorias/`);

// ─── 4. Listado de .rejected ──────────────────────────────────────────────────

const rejDir = path.join(GEN, '.rejected');
const rejList = fs.existsSync(rejDir) ? fs.readdirSync(rejDir).sort().join('\n') : '(vacío)';
fs.writeFileSync(path.join(OUT, 'rejected-listado.txt'), rejList + '\n');

// ─── 5. Copiar scripts y plantilla ───────────────────────────────────────────

console.log('📋  Copiando scripts, plantilla y README…');
copyFile(path.join(ROOT, 'scripts', 'audit-pass-2.mjs'), OUT);
copyFile(path.join(ROOT, 'scripts', 'blacklist.mjs'), OUT);
copyFile(path.join(ROOT, 'plantillas-lesen-b1', 'lesen-teil1.md'), OUT);
copyFile(path.join(ROOT, 'README.md'), OUT);

// ─── 6. Stats del corpus ──────────────────────────────────────────────────────

console.log('📊  Generando corpus-stats…');
const stats = spawnSync(process.execPath, ['scripts/print-corpus-stats.mjs'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
fs.writeFileSync(path.join(OUT, 'corpus-stats.txt'), stats.stdout);

// ─── 7. 2 exámenes completos del pool ────────────────────────────────────────

if (fs.existsSync(POOL_FILE)) {
  const poolArr = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  for (let i = 0; i < Math.min(2, poolArr.length); i++) {
    fs.writeFileSync(
      path.join(OUT, `pool-examen-0${i + 1}.json`),
      JSON.stringify(poolArr[i], null, 2) + '\n'
    );
  }
}

// ─── 8. CAMBIOS.md ───────────────────────────────────────────────────────────

console.log('📝  Escribiendo CAMBIOS.md…');
const l1Regenerados = fs.readdirSync(rejDir).filter(f => /^lesen-t1-gemini-0[2-9]\d|lesen-t1-gemini-1[01]\d/.test(f)).length;
const rejTotal = fs.readdirSync(rejDir).length;
const cambios = `# CAMBIOS.md — Paquete de verificación (${new Date().toISOString().slice(0, 10)})

## Resumen de cambios aplicados

### FIX-A — Plantilla lesen-teil1.md: regla anti-correlación
- Se añadió la **Regla 6 ANTI-CORRELACIÓN** que prohíbe que las palabras de alcance
  (alle/jede/immer/nie/nur/ausschließlich/komplett/stets) predigan la respuesta.
- Máximo 2 de 6 enunciados pueden contener una palabra de alcance, y deben repartirse
  entre ítems Richtig y Falsch — nunca todas en Falsch.
- El checklist de autorrevisión fue actualizado con la comprobación de correlación.
- El ejemplo JSON de la plantilla fue corregido para mostrar la distribución correcta.

### FIX-B — CHK-10 basado en correlación (no en presencia en Richtig)
- El gate CHK-10 anterior solo marcaba palabras absolutas en ítems **Richtig**.
  Eso ocultaba la correlación real: hasta 88 % de ítems Falsch con absoluta vs 0 % en Richtig.
- El nuevo CHK-10 detecta:
  (1) Sobre-uso: >2 de 6 enunciados con palabra de alcance → IMPORTANT
  (2) Correlación perfecta: ≥2 con absoluta y todas en Falsch → IMPORTANT
  (3) Caso aislado: 1 enunciado con absoluta → MINOR (aceptable)
- Resultado: el banco volvió a exponer los 33 archivos con correlación que la redefinición
  anterior había ocultado. Todos fueron regenerados (swap atómico).

### FIX-C — Pool auditada de verdad (loadBatchFile aplanado)
- La función \`loadBatchFile\` en \`audit-pass-2.mjs\` no entendía el esquema de examen
  ensamblado \`{exam:{lesenParts, horenParts, …}}\`, resultando en \`questionsScanned: 0\`.
- Se añadió la función \`flattenExam()\` que aplanar el examen a \`{passages, questions}\`
  inyectando \`module\` y \`teil\` (necesarios para CHK-3/4/10).
- Ahora la pool reporta \`questionsScanned > 0\` (≈46 preguntas por examen).

### FIX-D — Regeneración de Lesen T1 con swap atómico
- El gate interno del generador exigía "≥2 Falsch con trampa de alcance", lo que generaba
  exactamente el patrón de correlación que detectamos. Se eliminó ese requisito de
  \`lesenBatchQuality.mjs\` para alinear el generador con la nueva regla anti-correlación.
- **${rejTotal} archivos en .rejected/** en total (incluidos los de rondas anteriores).
- Los archivos rechazados en esta ronda son todos los lesen-t1-gemini de numeración baja
  que presentaban correlación perfecta (todas las absolutas en Falsch).
- Cada viejo archivo fue sustituido por un nuevo generado con Gemini + plantilla FIX-A,
  verificado por CHK-10 nuevo antes del swap.

## Cómo verificar

1. \`audit-banco.json\` debe mostrar \`critical: 0\` e \`important: 0\` (o solo CHK-10 MINOR).
2. \`audit-pool.json\` debe mostrar \`questionsScanned > 0\` — confirma que la pool se audita.
3. En los 5 Lesen T1 de \`muestras-aleatorias/lesen-t1-*\`: revisar que las palabras de
   alcance (alle/immer/nur/…) **no estén todas en ítems Falsch** — la correlación está rota.
`;

fs.writeFileSync(path.join(OUT, 'CAMBIOS.md'), cambios);

// ─── 9. ZIP ───────────────────────────────────────────────────────────────────

console.log('📦  Creando ZIP…');
const zipPath = path.join(ROOT, 'para-claude-verificacion.zip');
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

// Usar PowerShell Compress-Archive (disponible en Windows)
const zip = spawnSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path "${OUT}" -DestinationPath "${zipPath}" -Force`
], { cwd: ROOT, encoding: 'utf8' });

if (zip.error || zip.status !== 0) {
  console.warn('⚠  ZIP via PowerShell falló — intenta: Compress-Archive manualmente');
  console.warn(zip.stderr || zip.error?.message);
} else {
  const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log(`✅  Listo: para-claude-verificacion.zip (${sizeMB} MB)`);
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('VERIFICACIÓN FINAL:');
console.log(`  banco CRITICAL: ${bancoAudit.summary.critical}  IMPORTANT: ${bancoAudit.summary.important}`);
console.log(`  pool  questionsScanned: ${poolAudit.summary.questionsScanned}  IMPORTANT: ${poolAudit.summary.important}`);
const chk10imp = bancoAudit.findings.filter(f => f.id === 'CHK-10' && f.severity === 'IMPORTANT').length;
console.log(`  CHK-10 IMPORTANT restantes: ${chk10imp}`);
console.log('═══════════════════════════════════════════');
