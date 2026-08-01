#!/usr/bin/env node
/**
 * Smoke: POST quality-gate repair gate uses geminiApiKey (not readAnthropicKey).
 * Local: runs runPartQualityGate with repair:true when GEMINI key present (1 LLM call if repair fires).
 * Does not POST to production unless EXAM_PART_REPAIR_SMOKE_HTTP=1 (auth required).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { readAnthropicKey } = require(path.join(ROOT, 'netlify/functions/lib/anthropicKey.js'));
const { geminiApiKey } = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));
const { runPartQualityGate, partMinTargetFromBlueprint } = require(path.join(
  ROOT,
  'netlify/functions/lib/partQualityGate.js',
));
const { resolveFromRoot } = require(path.join(ROOT, 'netlify/functions/lib/projectRoot.js'));

function keyFingerprint(k) {
  if (!k) return { present: false };
  return { present: true, prefix: String(k).slice(0, 6), len: String(k).length };
}

async function localRepairGateSmoke() {
  const anthropic = readAnthropicKey();
  const gemini = geminiApiKey();
  const gateBefore = { repairWouldRunWithAnthropicKey: !!anthropic, repairWouldRunWithGeminiKey: !!gemini };
  console.log('KEY_GATE', JSON.stringify({ anthropic: keyFingerprint(anthropic), gemini: keyFingerprint(gemini), gateBefore }));

  if (!gemini) {
    console.log('SKIP_REPAIR_RUN', 'no GEMINI_API_KEY/GOOGLE_API_KEY in env — gate comparison only');
    return { skippedRepairRun: true, gateBefore };
  }

  const blueprint = require(resolveFromRoot('library', 'blueprints', 'goethe_B1.json'));
  const lang = 'de';
  const level = 'B1';
  const module = 'lesen';
  const teil = 1;
  const target = partMinTargetFromBlueprint(blueprint, module, teil) || 5;

  const passage = {
    id: 'smoke-passage-1',
    title: 'Smoke Test',
    text:
      'Anna geht jeden Tag in die Schule. Sie lernt Deutsch und liest viele Bücher. ' +
      'Am Wochenende trifft sie Freunde im Park.',
  };

  const oneQuestion = {
    id: 'smoke-q-1',
    module: 'lesen',
    teil: 1,
    lang: 'de',
    level: 'B1',
    type: 'mcq',
    question: 'Was macht Anna am Wochenende?',
    options: [
      { key: 'a', text: 'Sie arbeitet.' },
      { key: 'b', text: 'Sie trifft Freunde im Park.' },
      { key: 'c', text: 'Sie fährt in den Urlaub.' },
    ],
    correct: 'b',
    passageId: passage.id,
  };

  const partInput = {
    lang,
    level,
    module,
    teil,
    passage,
    questions: [oneQuestion],
    targetCount: target,
  };

  const result = await runPartQualityGate(partInput, {
    blueprint,
    apiKey: gemini,
    repair: true,
    topic: 'Alltag',
    lang,
    level,
    module,
    teil,
    skipTopicCoherence: true,
  });

  const repairAttempted = result.repaired === true || (result.itemCount > 1 && result.itemCount < target);
  console.log('REPAIR_RUN', JSON.stringify({
    target,
    itemCount: result.itemCount,
    targetCount: result.targetCount,
    complete: result.complete,
    discarded: result.discarded,
    repaired: result.repaired,
    reason: result.reason,
    repairAttempted,
  }));

  return { gateBefore, repairRun: { target, itemCount: result.itemCount, repaired: result.repaired, discarded: result.discarded, reason: result.reason } };
}

localRepairGateSmoke().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
