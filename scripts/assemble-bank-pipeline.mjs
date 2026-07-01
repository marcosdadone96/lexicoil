#!/usr/bin/env node
/**
 * Merge validated batches → sync passages → promote curated exams → coverage report.
 *
 * Usage:
 *   node scripts/assemble-bank-pipeline.mjs --lang de --level B1
 *   npm run pipeline:assemble -- --lang de --level B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', target: 5, maxExams: 5, skipCurated: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--max') out.maxExams = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--no-curated') out.skipCurated = true;
    else if (a === '--verify') out.verify = true;
  }
  return out;
}

function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const args = parseArgs(process.argv.slice(2));

console.log(`\n══ Montar exámenes ${args.lang}/${args.level} ══\n`);

run('scripts/process-all-batches.mjs', ['--lang', args.lang, '--level', args.level]);
run('scripts/normalize-bank.mjs', ['--lang', args.lang, '--level', args.level]);
run('scripts/sync-passages-mirror.mjs', ['--lang', args.lang, '--level', args.level]);

if (!args.skipCurated) {
  run('scripts/promote-bank-to-curated.mjs', [
    '--lang',
    args.lang,
    '--level',
    args.level,
    '--min-coverage',
    '1.0',
    '--max',
    String(args.maxExams),
  ]);

  const curatedDir = `library/curated/${args.lang}/${args.level}`;
  const bankPath   = `library/${args.lang}/${args.level}/questions.json`;
  const passPath   = `library/${args.lang}/${args.level}/passages.json`;

  // GATE determinista: arregla tipos, ids duplicados, preguntas huérfanas y cuenta ítems.
  run('scripts/sanitize-curated.mjs', ['--dir', curatedDir, '--write']);

  // FIX coherencia T3/T4: asegura que todos los ítems de una parte usen el mismo pool.
  // Silencioso si no hay ítems de matching o ja_nein que reparar.
  run('scripts/fix-exam-coherence.mjs', [
    '--dir', curatedDir,
    '--bank', bankPath,
    '--write',
  ]);

  // FIX preguntas faltantes: rellena T1/T2/T5 con preguntas del banco cuando hay huecos.
  // Solo actúa si passages.json existe para este idioma/nivel.
  if (fs.existsSync(passPath)) {
    run('scripts/fill-missing-questions.mjs', [
      '--dir', curatedDir,
      '--bank', bankPath,
      '--passages', passPath,
      '--write',
    ]);
    // Second sanitize pass to clean up after fill (orphan check, type normalization).
    run('scripts/sanitize-curated.mjs', ['--dir', curatedDir, '--write']);
  }

  // GATE semántico (opcional, requiere ANTHROPIC_API_KEY): elimina preguntas no respondibles.
  if (args.verify) {
    run('scripts/verify-curated.mjs', ['--dir', curatedDir, '--drop']);
  }

  // INFORME de auditoría estructural: muestra el estado final de los exámenes curated.
  // No se usa run() porque audit puede salir con código 1 (críticos detectados) sin abortar el pipeline.
  console.log('\n── Auditoría estructural de exámenes curated ──');
  spawnSync(process.execPath, [path.join(ROOT, 'scripts/audit-curated.mjs'), '--dir', curatedDir], {
    cwd: ROOT, stdio: 'inherit',
  });

  // PROMOCIÓN al archivo servido por el cliente (ExamLibrary): data/exams/<lang>_<level>.json.
  // Sin esto, los exámenes curated no llegan al usuario.
  run('scripts/curated-to-served.mjs', ['--lang', args.lang, '--level', args.level]);
}

run('scripts/bank-coverage-report.mjs', [
  '--lang',
  args.lang,
  '--levels',
  args.level,
  '--target',
  String(args.target),
  '--detail',
]);

console.log('\nPipeline de montaje completado.\n');
