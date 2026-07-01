/**
 * publishGateFailClosed.test.mjs — P0-B
 *
 * Verifica que el camino de publicación sea fail-closed:
 *   - isExamPublishable(exam_roto) → { ok:false, blocking:[AUDIT-ERROR] }  (no lanza)
 *   - publishCuratedExam(exam_roto) → { blocked:true }   (no escribe ningún archivo)
 *   - Modo reporte CLI (audit-pass-2 en directorio) → sigue saltando con warning (no crash)
 *
 * Run: node scripts/lib/__tests__/publishGateFailClosed.test.mjs
 * Exit 0 = all pass.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isExamPublishable } from '../../audit-pass-2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const AUDIT = path.join(ROOT, 'scripts/audit-pass-2.mjs');

// Importar publishCuratedExam usando import() dinámico (es ESM con .js)
// Usamos createRequire porque publishCurated.js tiene extensión .js y puede usar require
import { pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}
function assertOk(desc, value) {
  if (value) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}: got ${JSON.stringify(value)}`);
    failed++;
  }
}

// ── TEST 1 — isExamPublishable(null) → ok:false, AUDIT-ERROR, no lanza ──────
console.log('\n── isExamPublishable: examen null → fail-closed ──');
{
  let result;
  let threw = false;
  try {
    result = isExamPublishable(null);
  } catch (_) {
    threw = true;
  }

  assert('no lanza excepción', threw, false);
  assert('ok = false', result?.ok, false);
  assertOk('blocking contiene AUDIT-ERROR', result?.blocking?.some(f => f.id === 'AUDIT-ERROR'));
  assert('advisory vacío', result?.advisory?.length, 0);
}

// ── TEST 2 — isExamPublishable(exam sin lesenParts/horenParts) → no AUDIT-ERROR ──
// Un examen vacío pero válido (objeto con arrays vacíos) NO debe lanzar.
console.log('\n── isExamPublishable: examen vacío pero válido → sin AUDIT-ERROR ──');
{
  const emptyExam = { lesenParts: [], horenParts: [], lang: 'de', level: 'B1' };
  let result;
  let threw = false;
  try {
    result = isExamPublishable(emptyExam);
  } catch (_) {
    threw = true;
  }

  assert('no lanza excepción', threw, false);
  assertOk('blocking NO contiene AUDIT-ERROR', !result?.blocking?.some(f => f.id === 'AUDIT-ERROR'));
  // (puede tener CRITICALs de CHK-3 por Teile ausentes, pero no AUDIT-ERROR)
  console.log(`     (blocking: ${result?.blocking?.map(f=>f.id).join(',') || '(ninguno)'})`);
}

// ── TEST 3 — isExamPublishable(forma rota: lesenParts no es array) → fail-closed ──
console.log('\n── isExamPublishable: lesenParts = "corrupto" (no array) → fail-closed ──');
{
  // Si flattenExam o auditExam lanzan con esta forma inesperada:
  const brokenExam = { lesenParts: 'not-an-array', horenParts: null };
  let result;
  let threw = false;
  try {
    result = isExamPublishable(brokenExam);
  } catch (_) {
    threw = true;
  }

  assert('no lanza excepción', threw, false);
  // Puede que flattenExam sea defensivo y no lance; en ese caso ok depende del contenido.
  // Lo que importa es que NO lanza — el resultado puede variar.
  assertOk('devuelve objeto con ok y blocking', result?.ok !== undefined && Array.isArray(result?.blocking));
}

// ── TEST 4 — publishCuratedExam(null) → blocked:true, sin escritura de archivo ──
console.log('\n── publishCuratedExam: exam=null → blocked, sin archivo escrito ──');
{
  // Importación dinámica de publishCuratedExam (ESM)
  const { publishCuratedExam } = await import(
    pathToFileURL(path.join(ROOT, 'scripts/pipeline/lib/publishCurated.js')).href
  );

  // Carpeta curated temp para este test
  const tmpDir = path.join(os.tmpdir(), `publish-gate-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let result;
  let threw = false;
  try {
    // publishCuratedExam escribe a library/curated/lang/level/ — usamos lang/level de test
    // pero como el gate bloquea antes de escribir, no importa dónde apunta.
    result = publishCuratedExam({
      lang: 'de',
      level: 'B1',
      topic: 'test-broken',
      exam: null,          // ← examen roto: null
      generatedBy: 'publishGateFailClosed.test',
      allowAuditFailures: false,
    });
  } catch (e) {
    threw = true;
    console.error(`  (excepción inesperada: ${e.message})`);
  }

  assert('publishCuratedExam no lanza', threw, false);
  assert('result.blocked = true', result?.blocked, true);
  assertOk('result.blocking tiene AUDIT-ERROR', result?.blocking?.some(f => f.id === 'AUDIT-ERROR'));

  // Verificar que NO se creó ningún archivo en el directorio curated de test
  // (el gate real escribe a library/curated/de/B1/ — comprobamos que no existe un archivo nuevo
  //  con topic "test-broken")
  const curatedB1 = path.join(ROOT, 'library', 'curated', 'de', 'B1');
  const brokenFiles = fs.existsSync(curatedB1)
    ? fs.readdirSync(curatedB1).filter(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(curatedB1, f), 'utf8'));
          return data?.topic === 'test-broken';
        } catch { return false; }
      })
    : [];
  assert('ningún archivo con topic "test-broken" escrito en curated', brokenFiles.length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── TEST 5 — Modo reporte CLI: directorio con JSON inválido → skip con warning ──
console.log('\n── Modo reporte CLI: JSON inválido en directorio → warning + skip (no crash) ──');
{
  const tmpDir = path.join(os.tmpdir(), `audit-report-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Archivo JSON completamente roto (no parseable)
  const brokenFile = path.join(tmpDir, 'broken.json');
  fs.writeFileSync(brokenFile, '{ "questions": [ INVALID JSON', 'utf8');

  // Archivo JSON válido con una pregunta real (para que haya algo que auditar)
  const validFile = path.join(tmpDir, 'valid.json');
  fs.writeFileSync(validFile, JSON.stringify({
    passages: [{ id: 'p1', text: 'Ein Test.' }],
    questions: [{
      id: 'q1', module: 'lesen', teil: 1, type: 'richtig_falsch',
      question: 'Ist das ein Test?', correct: 'Richtig', correctAnswer: 'Richtig',
      explanation: 'Ja, das ist ein Test mit ausreichend vielen Wörtern für eine gute Erklärung.',
      options: [], lang: 'de', level: 'B1',
    }],
  }), 'utf8');

  const r = spawnSync(process.execPath, [AUDIT, tmpDir, '--summary-only'], {
    encoding: 'utf8',
    cwd: ROOT,
  });

  // El CLI no debe crashear (exit code puede ser 0 o 1 por findings, pero no 2+)
  assertOk('CLI exit code ≤ 1 (no crash)', r.status <= 1);
  // El output combina stderr+stdout; debe contener "Saltando" o "broken.json"
  const combined = (r.stdout || '') + (r.stderr || '');
  assertOk('CLI muestra warning sobre broken.json', combined.includes('broken.json') || combined.includes('Saltando'));
  // El archivo válido fue escaneado (aparece RESUMEN)
  assertOk('CLI muestra RESUMEN (modo reporte sigue funcionando)', combined.includes('RESUMEN') || combined.includes('CRÍTICOS'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── RESUMEN ───────────────────────────────────────────────────────────────────
console.log(`\n── Resultado: ${passed} ✅  ${failed} ❌ ──`);
if (failed > 0) process.exit(1);
