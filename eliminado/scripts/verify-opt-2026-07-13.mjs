#!/usr/bin/env node
/**
 * Verify optimizations 2026-07-13: surgical thinkingBudget:0 + exclusions.
 * Run: NODE_OPTIONS=--use-system-ca node scripts/verify-opt-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import { parseUsageMetadata, costUsdFromTokens } from './lib/generationCostLog.mjs';
import { SURGICAL_THINKING_CONFIG, wrapSurgicalCallLlm } from './lib/surgicalRepairRouter.mjs';
import { buildMcqWordCopyRepairPrompt, buildMcqLengthBiasBatchRepairPrompt } from './lib/lesenTemplatePrompt.mjs';
import { extractJson } from './lib/extractJson.mjs';
import { hasLongLiteralOverlap, sharedContentTokens } from './lib/lesenBatchQuality.mjs';
import { failsLengthBiasGate } from './lib/mcqLengthBiasRepair.mjs';
import { mcqOptionBody, mcqCorrectLetter } from './lib/mcqLengthBias.mjs';
import {
  pickNextT4DebateTopic,
  pickNextT5Subtype,
  resolveT4GenerationMolds,
  T4_TOPIC_DEBATE_BLOCKED,
  T5_TOPIC_SUBTYPE_SATURATED_BLOCK,
} from './lib/lesenSubtypeRotation.mjs';

loadEnvFile();

async function callRepair(prompt) {
  const res = await generateContent({
    prompt,
    jsonMode: true,
    maxTokens: 2048,
    temperature: 0.3,
    thinkingConfig: SURGICAL_THINKING_CONFIG,
  });
  const parsed = parseUsageMetadata(res.usage);
  return { json: extractJson(res.text), parsed, costUsd: costUsdFromTokens(parsed.promptTokens, parsed.outputTokensBilled) };
}

function validateWordCopy(patch, passageText) {
  const letter = String(patch.correct || patch.correctAnswer || 'a').toLowerCase()[0];
  const idx = { a: 0, b: 1, c: 2 }[letter];
  const optBody = (patch.options?.[idx] || '').replace(/^[abc]\)\s*/i, '');
  return {
    pass: !hasLongLiteralOverlap(optBody, passageText, 4) && sharedContentTokens(optBody, passageText).length <= 3,
    thoughts: 0,
  };
}

const repairResults = [];

// 1 word-copy
{
  const batch = JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/generated/.rejected/lesen-t2-gemini-046-2026-06-29T14-32-09-686Z.json'), 'utf8'));
  const q = batch.questions[0];
  const passage = batch.passages.find((p) => p.id === q.passageId);
  const prompt = buildMcqWordCopyRepairPrompt({ teil: 2, passage, question: q, findings: [{ detail: batch._rejectedReason }], minWords: 4 });
  const { json, parsed, costUsd } = await callRepair(prompt);
  const val = validateWordCopy(json, passage.text);
  repairResults.push({ kind: 'word_match', qualityPass: val.pass, thoughtsTokens: parsed.thoughtsTokens, costUsd });
}

// 2 length-bias
{
  const hb = JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/ready/pool-verified/horen-t2-gemini-033.json'), 'utf8'));
  const biased = { ...hb.questions[0] };
  biased.options = ['a) Nur am Wochenende.', 'b) Immer nach 22 Uhr.', 'c) Am Sonntag und nachts sowie an Wochentagen in der Mittagszeit für Besucher mit maximal zwei Stunden Kurzzeitparken.'];
  biased.correct = 'c';
  const passage = hb.passages[0];
  const letter = mcqCorrectLetter(biased);
  const prompt = buildMcqLengthBiasBatchRepairPrompt({
    teil: 2,
    passages: hb.passages,
    items: [{ question: biased, passage, sourceText: passage.transcript || passage.text, letter, correctBody: mcqOptionBody(biased.options[{ a: 0, b: 1, c: 2 }[letter]]) }],
  });
  const { json, parsed, costUsd } = await callRepair(prompt);
  const item = Array.isArray(json) ? json[0] : json;
  const merged = { ...biased, ...item, options: item.options || biased.options };
  repairResults.push({ kind: 'mcq_length_bias', qualityPass: !failsLengthBiasGate(merged), thoughtsTokens: parsed.thoughtsTokens, costUsd });
}

// Exclusions unit checks
const exclusionChecks = [
  { label: 'Gesundheit×autofrei blocked', pass: pickNextT4DebateTopic([], 0, 'Gesundheit').id !== 'autofrei' },
  { label: 'Familie×vereinsfoerderung blocked', pass: pickNextT4DebateTopic([], 0, 'Familie').id !== 'vereinsfoerderung' },
  { label: 'Konsum×mensa_vegetarisch blocked', pass: pickNextT4DebateTopic([], 0, 'Konsum').id !== 'mensa_vegetarisch' },
  { label: 'Konsum first pick CHK-27-safe', pass: pickNextT4DebateTopic([], 0, 'Konsum').id === 'muelltrennung' },
  { label: 'Bildung×schule saturated skip', pass: pickNextT5Subtype(['schule'], 0, 'Bildung').id !== 'schule' },
  { label: 'Bildung×bibliothek saturated skip', pass: pickNextT5Subtype(['bibliothek'], 0, 'Bildung').id !== 'bibliothek' },
  { label: 'Reisen×bibliothek saturated skip', pass: pickNextT5Subtype(['bibliothek'], 0, 'Reisen').id !== 'bibliothek' },
  { label: 'resolveT4 Gesundheit excludes autofrei in molds', pass: !(resolveT4GenerationMolds({ topicTag: 'Gesundheit' }).excludeMolds.subtypes.includes('autofrei') === false) },
];

const out = {
  generatedAt: new Date().toISOString(),
  surgicalThinkingConfig: SURGICAL_THINKING_CONFIG,
  wrapSurgicalCallLlmWorks: typeof wrapSurgicalCallLlm(() => {}) === 'function',
  repairResults,
  allRepairsThoughtsZero: repairResults.every((r) => r.thoughtsTokens === 0),
  exclusionChecks,
  blockedMaps: { T4_TOPIC_DEBATE_BLOCKED, T5_TOPIC_SUBTYPE_SATURATED_BLOCK },
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/verify-opt-2026-07-13.json');
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
