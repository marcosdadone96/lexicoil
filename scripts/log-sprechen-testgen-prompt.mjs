#!/usr/bin/env node
/**
 * Write dry-run prompt verification log for SP-2 (points 1–3).
 *   node scripts/log-sprechen-testgen-prompt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExamPrompt } from './lib/examTemplatePrompt.mjs';
import { resolveTargetWordsForArgs } from './lib/resolveGenerationInput.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = { lang: 'de', level: 'B1', fromCoverage: true, wordCount: 8, module: 'sprechen' };
const words = resolveTargetWordsForArgs(args, { module: 'sprechen', teil: 1 });
const prompt = buildExamPrompt('sprechen', 1, words, { idSuffix: 'testsp1' });

const checks = [
  ['OPCIONALES oral', 'consigna de examen oral B1'],
  ['frase forzada = rechazo', 'frase forzada'],
  ['Perspectiva PROHIBIDO stelle ich', 'stelle ich Ihnen Fragen'],
  ['type planungsaufgabe', 'planungsaufgabe'],
  ['type feedback_diskussion', 'feedback_diskussion'],
  ['Sie obligatorio', 'Sie obligatorio'],
  ['tema concreto T2', 'Tema **CONCRETO**'],
  ['puntos sin * ni •', 'sin** `*`'],
  ['Beispielfragen etiqueta', 'Beispielfragen:'],
  ['Premisas usadas', 'PREMISAS YA USADAS'],
  ['difficulty 5', 'difficulty:5'],
];

const lines = [
  '# Sprechen testgen dry-run (SP-2) — verificación puntos 1–3',
  '',
  'Live API: **fetch failed** en este entorno (2026-07-10). Verificación por dry-run de prompt + wiring.',
  '',
  'Intento live previo: `node scripts/generate-part-gemini.mjs --module sprechen --from-coverage --count 1` → `Error gemini: fetch failed`.',
  '',
  '## Vocab resuelto (post blacklist/sanitize)',
  '',
  `\`${words.join(', ')}\``,
  '',
  `Tema rotación: \`${args._resolvedTopic || ''}\``,
  '',
  '## Checks',
  '',
  '| Check | Presente |',
  '|-------|----------|',
  ...checks.map(([label, needle]) => `| ${label} | ${prompt.includes(needle) ? 'YES' : 'NO'} |`),
  '',
  '## Prompt completo',
  '',
  '~~~',
  prompt,
  '~~~',
  '',
];

const out = path.join(ROOT, 'batches/ready/SPRECHEN-TESTGEN-PROMPT-DRYRUN-2026-07-10.md');
fs.writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${path.relative(ROOT, out)}`);
console.log(`words=${words.join(', ')} topic=${args._resolvedTopic} chars=${prompt.length}`);
for (const [label, needle] of checks) {
  console.log(`  ${prompt.includes(needle) ? 'OK' : 'MISS'} ${label}`);
}
