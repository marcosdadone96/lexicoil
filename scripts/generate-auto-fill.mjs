#!/usr/bin/env node
/**
 * Generación automática todo-en-uno: Gemini → validación → batches/generated/
 * Rota vocabulario cada N partes OK y continúa hasta --target.
 *
 * Uso:
 *   npm run auto:fill:horen:t3
 *   npm run auto:fill:horen:t3 -- --target 3 --rotate-every 5
 *   node scripts/generate-auto-fill.mjs --profile schreiben --target 2 --verify-exam
 *   node scripts/generate-auto-fill.mjs --profile horen:t2 --dry-run
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
import {
  CHECKPOINT_FILE,
  DailyQuotaError,
  EXIT_DAILY_QUOTA,
  clearCheckpoint,
  generateOnePart,
  loadCheckpoint,
  parseAutoFillArgs,
  pickWordsForPart,
  profileCheckpointKey,
  publishGeneratedFiles,
  refreshVocabReport,
  resolveProfile,
  runVerifyExam,
  saveCheckpoint,
} from './lib/autoFillLib.mjs';

loadEnvFile();

async function main() {
  const args = parseAutoFillArgs(process.argv.slice(2));
  const profile = resolveProfile(args);
  const checkpointKey = profileCheckpointKey(profile, args);

  if (!args.dryRun && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Falta GEMINI_API_KEY en .env');
    process.exit(1);
  }

  if (args.resetCheckpoint) clearCheckpoint();

  let saved = 0;
  let savedFiles = [];
  let attempts = 0;

  if (args.resume && !args.resetCheckpoint) {
    const cp = loadCheckpoint(checkpointKey);
    if (cp?.saved > 0) {
      saved = cp.saved;
      savedFiles = Array.isArray(cp.files) ? cp.files.slice() : [];
      console.log(`Reanudando checkpoint: ${saved}/${profile.target} OK (${CHECKPOINT_FILE})`);
    }
  }

  const maxAttempts =
    args.maxAttempts ?? Math.max(profile.target * 4, profile.target + 10);

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║ Auto-fill ${profile.label.padEnd(42)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`Perfil:        ${profile.key}`);
  console.log(`Objetivo:      ${profile.target} parte(s) validada(s)`);
  console.log(`Rotar vocab:   cada ${profile.rotateEvery} OK`);
  console.log(`Salida:        batches/generated/ (${args.tag})`);
  console.log(`Pausa API:     ${args.pauseMs}ms`);
  if (args.dryRun) console.log(`Modo:          DRY-RUN (sin API)`);

  refreshVocabReport(args.lang, args.level);

  while (saved < profile.target && attempts < maxAttempts) {
    attempts++;
    const partIndex = saved + 1;

    if (saved > 0 && saved % profile.rotateEvery === 0) {
      refreshVocabReport(args.lang, args.level);
    }

    const words = pickWordsForPart(args);

    try {
      const result = await generateOnePart({
        args,
        profile,
        words,
        partIndex,
        savedSoFar: saved,
        target: profile.target,
      });

      if (result.dryRun) {
        saved++;
        if (result.file) savedFiles.push(result.file);
        break;
      }

      saved++;
      savedFiles.push(result.file);

      saveCheckpoint({
        key: checkpointKey,
        profile: profile.key,
        saved,
        target: profile.target,
        files: savedFiles,
        updatedAt: new Date().toISOString(),
      });

      if (saved < profile.target && args.pauseMs > 0) {
        console.log(`Pausa ${args.pauseMs / 1000}s…`);
        await new Promise((r) => setTimeout(r, args.pauseMs));
      }
    } catch (err) {
      if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') throw err;
      console.error(`\n⚠ Intento ${attempts} fallido: ${err.message}`);
      saveCheckpoint({
        key: checkpointKey,
        profile: profile.key,
        saved,
        target: profile.target,
        files: savedFiles,
        lastError: err.message,
        updatedAt: new Date().toISOString(),
      });
      if (args.pauseMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(args.pauseMs, 8000)));
      }
    }
  }

  console.log(`\n── Resumen auto-fill ──`);
  console.log(`Guardadas: ${saved}/${profile.target}`);
  console.log(`Intentos:  ${attempts}`);
  if (savedFiles.length) {
    console.log('Archivos:');
    for (const f of savedFiles) console.log(`  • ${f}`);
  }

  if (saved < profile.target) {
    console.error(`\n❌ Objetivo no alcanzado (${saved}/${profile.target}). Reanuda mañana o aumenta --max-attempts.`);
    process.exit(1);
  }

  clearCheckpoint();
  console.log('\n✅ Objetivo completado. Checkpoint borrado.');

  if (args.publish && !args.dryRun && savedFiles.length) {
    const pub = publishGeneratedFiles(args, profile, savedFiles);
    if (!pub.ok) process.exit(1);
    console.log(`Publicados: ${pub.published}/${savedFiles.length}`);
  }

  if (args.verifyExam) {
    const mergeArgs = savedFiles.flatMap((f) => ['--merge-file', f]);
    const ok = runVerifyExam(mergeArgs);
    if (!ok) process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
    console.error(`\n${err.message}`);
    process.exit(EXIT_DAILY_QUOTA);
  }
  console.error(err.message || err);
  process.exit(1);
});
