#!/usr/bin/env node
/**
 * Topic coherence integration — mocked verifier (no Anthropic calls).
 * Off-topic => discarded; on-topic + correct level => accepted.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

process.env.TOPIC_COHERENCE_GATE = '1';
process.env.EXAM_ANSWER_KEY_VERIFY = '0';

const gate = require(path.join(ROOT, 'netlify/functions/lib/topicCoherenceGate.js'));
delete require.cache[path.join(ROOT, 'netlify/functions/lib/partQualityGate.js')];
const { runPartQualityGate } = require(path.join(ROOT, 'netlify/functions/lib/partQualityGate.js'));

const origVerify = gate.verifyTopicCoherence;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  }
}

function tfQuestion(i) {
  return {
    id: `q${i}`,
    type: 'richtig_falsch',
    question: `Aussage ${i} zum Transportthema.`,
    correct: 'Richtig',
  };
}

function makePart() {
  return {
    module: 'lesen',
    teil: 1,
    lang: 'de',
    level: 'B1',
    topic: 'transport',
    passage: { id: 'passage-transport-1', text: 'Der Zug fährt pünktlich nach Berlin.' },
    questions: Array.from({ length: 5 }, (_, i) => tfQuestion(i + 1)),
    targetCount: 5,
  };
}

async function main() {
  gate.verifyTopicCoherence = async () => ({
    onTopic: false,
    cefrOk: true,
    issues: ['content_about_cooking_not_transport'],
    skipped: false,
  });

  const offTopic = await runPartQualityGate(makePart(), {
    apiKey: 'mock-key',
    repair: false,
    topic: 'transport',
    lang: 'de',
    level: 'B1',
    skipTopicCoherence: false,
  });
  assert(offTopic.discarded === true, 'off-topic part discarded');
  assert(offTopic.reason === 'topic_coherence_failed', 'discard reason topic_coherence_failed');

  gate.verifyTopicCoherence = async () => ({
    onTopic: true,
    cefrOk: true,
    issues: [],
    skipped: false,
  });

  const onTopic = await runPartQualityGate(makePart(), {
    apiKey: 'mock-key',
    repair: false,
    topic: 'transport',
    lang: 'de',
    level: 'B1',
    skipTopicCoherence: false,
  });
  assert(onTopic.discarded !== true, 'on-topic part accepted');
  assert(onTopic.validItems?.length === 5, 'on-topic keeps all items');

  gate.verifyTopicCoherence = origVerify;

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('test-topic-coherence: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
