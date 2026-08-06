#!/usr/bin/env node
/**
 * Real LLM test: corrected CHK-18b explanation repair prompt must output German only.
 * Uses one contaminated question pattern from pool (Spanish meta explanation).
 *
 *   node scripts/test-explanation-repair-german-prompt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir, needsRegenerationDir } from './lib/batchPaths.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import { extractJson } from './lib/extractJson.mjs';
import {
  buildExplanationRepairPrompt,
  findSpanishExplanationFindings,
} from './lib/explanationRepair.mjs';
import { assessGermanExamText } from './lib/qualityGates/germanContentLanguageGate.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import { findKeyExplanationMismatches } from './lib/keyExplanationGate.mjs';

loadEnvFile();

const SAMPLE_FILE = 'lesen-t5-gemini-009.json';
const OUT = path.join(ROOT, 'batches/ready/gate-logs/test-explanation-repair-german-prompt.json');

function findBatchPath(file) {
  for (const dir of [poolVerifiedDir('B1'), needsRegenerationDir('B1')]) {
    const abs = path.join(dir, file);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

const abs = findBatchPath(SAMPLE_FILE);
if (!abs) {
  console.error(`Sample not found: ${SAMPLE_FILE}`);
  process.exit(1);
}

const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
const findings = findSpanishExplanationFindings(batch);
if (!findings.length) {
  console.error('No Spanish explanations in sample — pick another file');
  process.exit(1);
}

const itemId = findings[0].itemId;
const question = batch.questions.find((q) => q.id === itemId);
const passage =
  batch.passages.find((p) => p.id === question.passageId) || batch.passages[0];
const teil = Number(question.teil ?? batch.questions?.[0]?.teil ?? 5);

const prompt = buildExplanationRepairPrompt({
  passage,
  question,
  teil,
  findings: [findings[0]],
});

console.log(`Testing CHK-18b repair prompt on ${itemId} (${SAMPLE_FILE})…`);
console.log(`Old explanation: ${String(question.explanation).slice(0, 100)}…\n`);

const callLlm = wrapSurgicalCallLlm(async (opts) => {
  const res = await generateContent({
    ...opts,
    thinkingConfig: SURGICAL_THINKING_CONFIG,
    jsonMode: true,
  });
  return { text: res.text };
});

const raw = await callLlm({ prompt, maxTokens: 1024 });
const parsed = extractJson(raw.text);
const newExpl =
  parsed?.explanations?.[itemId] ??
  parsed?.explanations?.[question.id] ??
  parsed?.explanation;

if (typeof newExpl !== 'string' || !newExpl.trim()) {
  console.error('LLM did not return explanation JSON');
  process.exit(1);
}

const langCheck = assessGermanExamText(newExpl.trim(), { minTokens: 6, mode: 'question' });
const mismatchHits = findKeyExplanationMismatches({
  passages: [passage],
  questions: [{ ...question, explanation: newExpl.trim(), module: 'lesen', teil }],
});

const result = {
  generatedAt: new Date().toISOString(),
  sampleFile: SAMPLE_FILE,
  itemId,
  oldExplanation: question.explanation,
  newExplanation: newExpl.trim(),
  germanOk: langCheck.ok,
  langReason: langCheck.reason,
  chk18bHits: mismatchHits.length,
  pass: langCheck.ok && mismatchHits.length === 0 && newExpl.trim().split(/\s+/).length >= 10,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);

console.log(`New explanation: ${newExpl.trim()}`);
console.log(`German gate: ${langCheck.ok ? 'OK' : 'FAIL'} (${langCheck.reason})`);
console.log(`CHK-18b hits: ${mismatchHits.length}`);
console.log(`Word count: ${newExpl.trim().split(/\s+/).length}`);
console.log(`\n${result.pass ? 'PASS' : 'FAIL'} — wrote ${path.relative(ROOT, OUT)}`);

process.exit(result.pass ? 0 : 1);
