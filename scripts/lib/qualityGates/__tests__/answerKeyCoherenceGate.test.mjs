#!/usr/bin/env node
/**
 * Tests Q2 answerKeyCoherenceGate — fixtures + mock LLM.
 * Live LLM (opcional): node ... --live
 *
 *   node scripts/lib/qualityGates/__tests__/answerKeyCoherenceGate.test.mjs
 *   node scripts/lib/qualityGates/__tests__/answerKeyCoherenceGate.test.mjs --live
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from '../../loadEnv.mjs';
import {
  runAnswerKeyCoherenceGate,
  buildAnswerKeyCoherencePrompt,
  parseAnswerKeyCoherenceResponse,
  repairMotivoQuoteBreaks,
  answerKeysEquivalent,
  collectAnswerKeyItems,
  ANSWER_KEY_COHERENCE_PROMPT_HEADER,
} from '../answerKeyCoherenceGate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, '../__fixtures__/answerKeyCoherence');
const LIVE = process.argv.includes('--live');

loadEnvFile();

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
}

function mockInferFactory(responsesByItemId) {
  return async (items) =>
    items.map((item) => {
      const row = responsesByItemId[item.itemId];
      if (!row) throw new Error(`missing mock for ${item.itemId}`);
      return { itemId: item.itemId, declaredKey: item.declaredKey, ...row };
    });
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅  ${msg}`);
    passed++;
  } else {
    console.error(`  ❌  ${msg}`);
    failed++;
  }
}

console.log('\n── Q2 unit: helpers ──');
assert(answerKeysEquivalent('a', 'A'), 'keys a≡A');
assert(answerKeysEquivalent('Ja', 'ja'), 'keys Ja≡ja');
assert(!answerKeysEquivalent('a', 'b'), 'keys a≠b');

const mismatchBatch = loadFixture('mismatch-horen2-lesen.json');
const items = collectAnswerKeyItems(mismatchBatch);
assert(items.length === 1, 'mismatch fixture: 1 item');
assert(items[0].declaredKey === 'a', 'declaredKey=a');

const prompt = buildAnswerKeyCoherencePrompt(items);
assert(prompt.includes(ANSWER_KEY_COHERENCE_PROMPT_HEADER.slice(0, 40)), 'prompt includes header');
assert(prompt.includes('fixture-q2-mismatch-horen2'), 'prompt includes itemId');

const parsed = parseAnswerKeyCoherenceResponse('[{"itemId":"x","inferredKey":"b","confidence":"high","justified":false,"motivo":"test"}]');
assert(parsed.length === 1 && parsed[0].inferredKey === 'b', 'parse JSON array');

const germanRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/q2-parse-diagnostics/lesen-t4-gemini-010-raw.json'), 'utf8'),
).rawText;
const parsedGerman = parseAnswerKeyCoherenceResponse(germanRaw);
assert(parsedGerman.length === 7 && parsedGerman[0].justified === true, 'parse German quotes in motivo (repair)');

const delimWrapped = '<<<Q2_JSON>>>\n[{"itemId":"b","inferredKey":"c","justified":true,"confidence":"high","motivo":"ok"}]\n<<<END_Q2>>>';
assert(parseAnswerKeyCoherenceResponse(delimWrapped)[0].inferredKey === 'c', 'parse delimiter wrapper');

console.log('\n── Q2 fixtures (mock LLM) ──');

async function testMismatchMock() {
  const batch = {
    teil: 2,
    questions: [{
      id: 'fixture-q2-mismatch-mock',
      teil: 2,
      type: 'multiple_choice',
      question: 'Was ist laut der Umfrage das Hauptproblem beim Handygebrauch in der Bahn?',
      options: [
        'a) Die Datentarife sind für viele Fahrgäste zu teuer.',
        'b) Laute Gespräche und Videos stören andere Fahrgäste.',
        'c) Die Internetverbindung in Zügen ist oft zu langsam.',
      ],
      correct: 'a',
      explanation:
        'Die Befragten kritisieren vor allem das Verhalten anderer Fahrgäger mit Mobilgeräten in der Kabine — nicht die Kosten der Tarife.',
    }],
  };
  const v = await runAnswerKeyCoherenceGate(batch, {
    file: 'fixture/mismatch',
    infer: mockInferFactory({
      'fixture-q2-mismatch-mock': {
        inferredKey: 'b',
        justified: false,
        confidence: 'high',
        motivo: 'Die Erklärung beschreibt störendes Verhalten, nicht teure Tarife.',
      },
    }),
  });
  assert(v.wouldBlock === true, 'mismatch mock → wouldBlock');
  assert(v.findings.some((f) => f.letraInferida === 'b' && f.confidence === 'high'), 'finding b high');
  assert(v.stats.llmCalls === 1, 'one LLM call');
}

async function testCorrectMock() {
  const batch = loadFixture('correct-aligned.json');
  const v = await runAnswerKeyCoherenceGate(batch, {
    file: 'fixture/correct',
    infer: mockInferFactory({
      'fixture-q2-correct': {
        inferredKey: 'c',
        justified: true,
        confidence: 'high',
        motivo: 'Die Erklärung nennt Aktivitäten im Freien, passend zu c.',
      },
    }),
  });
  assert(v.verdict === 'pass', 'correct mock → pass');
  assert(v.findings.filter((f) => f.rule === 'answer_key_mismatch').length === 0, 'no mismatch findings');
}

async function testChk18bEscalationDismissed() {
  const batch = {
    teil: 2,
    module: 'lesen',
    passages: [{
      id: 'p1',
      text: 'Einige Kollegen finden den Wandel schwierig, weil sie sich an neue Programme gewöhnen müssen.',
    }],
    questions: [{
      id: 'fixture-q2-chk18b-fp',
      teil: 2,
      type: 'multiple_choice',
      passageId: 'p1',
      question: 'Was bereitet manchen Angestellten Schwierigkeiten?',
      options: [
        'a) Die Notwendigkeit, sich an neue Arbeitsweisen anzupassen.',
        'b) Die zu hohen Kosten für die neuen Programme.',
        'c) Der Mangel an Platz im Bürogebäude.',
      ],
      correct: 'a',
      explanation: 'Der Wechsel zu neuen Programmen fällt einigen Mitarbeitern schwer.',
    }],
  };
  const v = await runAnswerKeyCoherenceGate(batch, {
    file: 'fixture/chk18b-fp',
    infer: mockInferFactory({
      'fixture-q2-chk18b-fp': {
        inferredKey: 'a',
        justified: true,
        confidence: 'high',
        motivo: 'Die Erklärung beschreibt die Anpassung an neue Programme, passend zu a.',
      },
    }),
  });
  assert(v.stats.chk18bHits === 1, 'CHK-18b prefilter fired');
  assert(v.verdict === 'pass', 'CHK-18b escalated + LLM justified → pass');
  assert(v.findings.filter((f) => f.rule === 'answer_key_mismatch').length === 0, 'no mismatch after LLM');
  assert(v.stats.llmCalls === 1, 'CHK-18b item included in LLM batch');
}

async function testAmbiguousMock() {
  const batch = loadFixture('ambiguous-vague.json');
  const v = await runAnswerKeyCoherenceGate(batch, {
    file: 'fixture/ambiguous',
    infer: mockInferFactory({
      'fixture-q2-ambiguous': {
        inferredKey: 'a',
        justified: false,
        confidence: 'medium',
        motivo: 'Die Erklärung ist zu vage, könnte aber eher auf Option a deuten.',
      },
    }),
  });
  assert(v.wouldBlock !== true, 'ambiguous mock → no block');
  assert(
    v.findings.some((f) => f.severity === 'warn' && f.confidence === 'medium'),
    'ambiguous → warn medium',
  );
}

async function testLiveMismatch() {
  if (!LIVE) return;
  console.log('\n── Q2 live LLM (mismatch fixture) ──');
  const batch = loadFixture('mismatch-horen2-lesen.json');
  const v = await runAnswerKeyCoherenceGate(batch, { file: 'fixture/mismatch-live' });
  console.log('  live result:', JSON.stringify(v.findings, null, 2));
  assert(v.wouldBlock === true, 'live mismatch → wouldBlock');
  const f = v.findings.find((x) => x.rule === 'answer_key_mismatch');
  assert(f && ['b', 'B'].includes(f.letraInferida) || f?.letraInferida === 'b', `live inferred b (got ${f?.letraInferida})`);
}

await testMismatchMock();
await testChk18bEscalationDismissed();
await testCorrectMock();
await testAmbiguousMock();
await testLiveMismatch();

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
