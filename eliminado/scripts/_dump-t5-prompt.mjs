#!/usr/bin/env node
/** One-off: dump full T5 Freizeit prompt (same path as dry-run). */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { buildLesenPrompt } from './lib/lesenTemplatePrompt.mjs';
import { resolveLesenGenerationMolds } from './lib/lesenSubtypeRotation.mjs';
import { injectTopicIntoPrompt } from './lib/topicRotation.mjs';
import { resolveTargetWordsForArgs } from './lib/resolveGenerationInput.mjs';

loadEnvFile();

const args = { lang: 'de', level: 'B1', teil: 5, topic: 'Freizeit', fromCoverage: true, wordCount: 5 };
const words = resolveTargetWordsForArgs(args);
const chosenTopic = 'Freizeit';
const molds = resolveLesenGenerationMolds(5, { lang: 'de', level: 'B1', topicTag: chosenTopic });
if (!molds?.subtypeDef) throw new Error('No molds resolved');
const idSuffix = randomBytes(4).toString('hex');
let prompt = buildLesenPrompt(5, words, {
  idSuffix,
  textSubtype: molds.textSubtype,
  subtypeDef: molds.subtypeDef,
  excludeMolds: molds.excludeMolds,
});
prompt = injectTopicIntoPrompt(prompt, chosenTopic);

const meta = [
  '=== META ===',
  `words: ${words.join(', ')}`,
  `subtipo: ${molds.textSubtype} — ${molds.subtypeDef.label} (${molds.pickTier})`,
  `exclude subtypes: ${molds.excludeMolds.subtypes.join(', ')}`,
  `exclude titles (${molds.excludeMolds.titles.length}):`,
  ...molds.excludeMolds.titles.map((t) => `  - ${t}`),
  `prompt chars: ${prompt.length}`,
  '',
  '=== PROMPT COMPLETO ===',
  '',
  prompt,
].join('\n');

const out = path.join(ROOT, 'scripts', '_dryrun-t5-freizeit-prompt.txt');
fs.writeFileSync(out, `${meta}\n`, 'utf8');
console.log(`Written: ${path.relative(ROOT, out)} (${prompt.length} chars)`);
