#!/usr/bin/env node
/**
 * Genera partes Hören / Schreiben / Sprechen B1 con Gemini (u otros providers).
 * Puertas: validate-batch + calidad pedagógica del módulo. Hören = transcripción + preguntas (sin TTS).
 *
 *   node scripts/generate-part-gemini.mjs --module horen --teil 1 --from-coverage
 *   node scripts/generate-part-gemini.mjs --module schreiben --from-coverage --fix-retries 5
 *   node scripts/generate-part-gemini.mjs --module sprechen --from-coverage --count 2
 *
 * Lesen sigue en generate-lesen-part-gemini.mjs (sin cambios).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { runExamGenerator, DailyQuotaError } from './lib/generatePartGeminiLib.mjs';
import { runLesenGenerator } from './generate-lesen-part-gemini.mjs';

loadEnvFile();

const EXIT_DAILY_QUOTA = 2;

function hasFlag(argv, name) {
  return argv.includes(name);
}

function stripModuleArg(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--module') {
      i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const moduleIdx = argv.indexOf('--module');
  if (moduleIdx < 0) {
    console.error(
      'Indica --module horen|schreiben|sprechen (Lesen: scripts/generate-lesen-part-gemini.mjs)',
    );
    process.exit(1);
  }
  const module = String(argv[moduleIdx + 1] || '').toLowerCase();

  if (module === 'lesen') {
    return runLesenGenerator(stripModuleArg(argv));
  }

  return runExamGenerator(argv);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main()
    .then(({ exitCode }) => process.exit(exitCode ?? 0))
    .catch((err) => {
      if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
        console.error(`\n${err.message}`);
        process.exit(EXIT_DAILY_QUOTA);
      }
      console.error(err.message || err);
      process.exit(1);
    });
}
