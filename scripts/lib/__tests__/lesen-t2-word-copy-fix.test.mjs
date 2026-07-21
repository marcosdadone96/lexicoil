#!/usr/bin/env node
/**
 * Opción B+E: hint detallado word-copy + reparación batch T2 en 1 llamada LLM.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const {
  buildWordCopyFixHint,
  extractLiteralSnippetsFromIssues,
  parseWordMatchFindings,
  repairT2McqWordCopyBatch,
} = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/wordMatchRepair.mjs')).href);
const { buildT2McqWordCopyBatchRepairPrompt } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/lesenTemplatePrompt.mjs')).href,
);

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const COPY_ISSUES = [
  'gen-q-2-abc-1: opción correcta copia ≥4 palabras del pasaje («die miete ist niedriger als»)',
  'gen-q-2-abc-3: opción correcta copia ≥4 palabras del pasaje («gemeinsame räume nutzen»)',
];

const literals = extractLiteralSnippetsFromIssues(COPY_ISSUES);
pass('extracts literal snippets', literals.length === 2);
pass('includes miete snippet', literals.some((s) => /miete/i.test(s)));

const hint = buildWordCopyFixHint(COPY_ISSUES, 2);
pass('hint includes detected literals', hint.includes('«die miete ist niedriger als»'));
pass('hint includes MALO example', hint.includes('❌ MALO'));
pass('hint includes BUENO example', hint.includes('✅ BUENO'));

const findings = parseWordMatchFindings(COPY_ISSUES);
pass('parseWordMatchFindings finds 2 items', findings.length === 2);

const batch = {
  passages: [
    {
      id: 'gen-l2-test-a',
      text: 'Die Miete ist niedriger als auf dem freien Markt. Die Bewohner können gemeinsame Räume nutzen.',
    },
  ],
  questions: [
    {
      id: 'gen-q-2-abc-1',
      passageId: 'gen-l2-test-a',
      question: 'Was ist mit der Miete?',
      correct: 'a',
      correctAnswer: 'a',
      options: ['a) Die Miete ist niedriger als auf dem freien Markt', 'b) teuer', 'c) unbekannt'],
      explanation: 'Im Text steht dass die Miete niedriger ist als auf dem freien Markt laut dem Artikel.',
    },
    {
      id: 'gen-q-2-abc-3',
      passageId: 'gen-l2-test-a',
      question: 'Was können Bewohner nutzen?',
      correct: 'b',
      correctAnswer: 'b',
      options: ['a) Garage', 'b) Bewohner können gemeinsame Räume nutzen', 'c) Pool'],
      explanation: 'Der Text sagt dass die Bewohner gemeinsame Räume nutzen können im Haus.',
    },
  ],
};

const prompt = buildT2McqWordCopyBatchRepairPrompt({
  passages: batch.passages,
  items: findings.map((f) => ({
    question: batch.questions.find((q) => q.id === f.itemId),
    passage: batch.passages[0],
    findings: [f],
  })),
  minWords: 4,
  forbiddenTokens: ['miete', 'bewohner'],
  literalSnippets: literals,
});
pass('batch prompt mentions both question ids', prompt.includes('gen-q-2-abc-1') && prompt.includes('gen-q-2-abc-3'));
pass('batch prompt asks for questions array', prompt.includes('"questions"'));

let llmCalls = 0;
const mockResponse = {
  questions: [
    {
      id: 'gen-q-2-abc-1',
      question: 'Was ist mit der Miete?',
      correct: 'a',
      correctAnswer: 'a',
      options: [
        'a) Die Wohnungen sind günstiger als üblich',
        'b) teuer',
        'c) unbekannt',
      ],
      explanation: 'Der Text erklärt dass die Miete unter dem Marktniveau liegt wegen städtischer Förderung.',
    },
    {
      id: 'gen-q-2-abc-3',
      question: 'Was können Bewohner nutzen?',
      correct: 'b',
      correctAnswer: 'b',
      options: ['a) Garage', 'b) Sie dürfen geteilte Bereiche im Haus benutzen', 'c) Pool'],
      explanation: 'Laut Artikel stehen den Bewohnern gemeinschaftliche Räume zur Verfügung im Gebäude.',
    },
  ],
};

const repaired = await repairT2McqWordCopyBatch(batch, findings, async () => {
  llmCalls += 1;
  return { text: JSON.stringify(mockResponse) };
});

pass('batch repair uses exactly 1 LLM call', llmCalls === 1);
pass('batch repair returns patched batch', repaired?.questions?.length === 2);
pass('repaired q1 no longer copies passage', !repaired.questions[0].options[0].includes('niedriger als auf dem freien'));

assert.ok(repaired, 'expected repaired batch');
