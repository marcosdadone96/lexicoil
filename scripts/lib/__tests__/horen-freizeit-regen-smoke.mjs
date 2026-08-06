#!/usr/bin/env node
/**
 * Smoke: regenerar Hören T2 Freizeit (similar a 024/025) y registrar reintentos con dual-hint.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../loadEnv.mjs';
import { generateExamPartSingle } from '../generatePartGeminiLib.mjs';

loadEnvFile();

const words = ['freizeit', 'wochenende', 'spaziergang', 'hobby', 'urlaub', 'vorteil', 'entspannung'];

console.log('Regeneracion Hören T2 Freizeit (Opcion A dual-hint activa)');
console.log(`Palabras: ${words.join(', ')}`);

const result = await generateExamPartSingle({
  module: 'horen',
  teil: 2,
  topic: 'Freizeit',
  words,
  fixRetries: 2,
  skipPoolReady: true,
  keepFailed: true,
  maxApiCalls: 12,
});

console.log('\n--- Resultado ---');
console.log(JSON.stringify({
  ok: result.ok,
  file: result.file,
  reason: result.reason,
  gate: result.gate,
  apiCalls: result.apiCalls,
  ms: result.ms,
  issues: result.issues?.slice?.(0, 4),
}, null, 2));

process.exit(result.ok ? 0 : 1);
