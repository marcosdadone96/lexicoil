#!/usr/bin/env node
/**
 * Unit checks for topicCoherenceGate (no API calls).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const gate = require(path.join(ROOT, 'netlify/functions/lib/topicCoherenceGate.js'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  }
}

async function main() {
  delete process.env.TOPIC_COHERENCE_GATE;
  const disabled = await gate.verifyTopicCoherence(
    { module: 'lesen', teil: 1, questions: [{ id: 'q1', question: 'Test?' }] },
    { topic: 'transport', lang: 'de', level: 'B1', apiKey: 'sk-test' },
  );
  assert(disabled.skipped === true, 'gate disabled when env unset');
  assert(disabled.onTopic === true, 'disabled gate passes onTopic');

  const sample = gate.summarizePartContent(
    {
      passage: { text: 'Der Zug fährt nach Berlin.' },
      questions: [{ id: 'q1', question: 'Wohin fährt der Zug?' }],
    },
    'lesen',
  );
  assert(sample.includes('Berlin'), 'summarizePartContent includes passage text');

  const parts = gate.listScorableParts({
    topic: 'arbeit',
    lesenParts: [{ teil: 1, questions: [{ id: 'q1' }] }],
    horenParts: [{ teil: 2, segments: [{ transcript: 'Hallo' }] }],
  });
  assert(parts.length === 2, 'listScorableParts finds lesen + horen');
  assert(parts[0].topic === 'arbeit', 'listScorableParts carries exam topic');

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('test-topic-coherence-gate: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
