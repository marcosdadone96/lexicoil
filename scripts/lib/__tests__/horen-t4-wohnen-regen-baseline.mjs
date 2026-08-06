#!/usr/bin/env node
/**
 * Baseline regen Hören T4 Wohnen — mismo vocab que el lote fallido (sin fix aplicado).
 */
import { loadEnvFile } from '../loadEnv.mjs';
import { generateExamPartSingle } from '../generatePartGeminiLib.mjs';

loadEnvFile();

const words = ['küche', 'nachhaltigkeit', 'wochenende', 'anmeldung', 'hobby', 'urlaub', 'umzug'];

console.log('Baseline Hören T4 Wohnen (sin fix vocab/longitud dual-hint)');
console.log(`Palabras (pick simulado): ${words.join(', ')}`);

const result = await generateExamPartSingle({
  module: 'horen',
  teil: 4,
  topic: 'Wohnen',
  words,
  fixRetries: 2,
  skipPoolReady: true,
  keepFailed: true,
  maxApiCalls: 12,
});

console.log('\n--- Resultado ---');
console.log(
  JSON.stringify(
    {
      ok: result.ok,
      file: result.file,
      reason: result.reason,
      gate: result.gate,
      apiCalls: result.apiCalls,
      issues: result.issues?.slice?.(0, 6),
    },
    null,
    2,
  ),
);

process.exit(result.ok ? 0 : 1);
