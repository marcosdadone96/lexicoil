#!/usr/bin/env node
/**
 * Topic mold circuit breaker → session topic exclusion (generate-cli rotation).
 */
import assert from 'node:assert/strict';
import {
  recordTopicMoldAttempt,
  assessTopicMoldCircuitBreaker,
  isTopicMoldSessionBlockReason,
  excludeTopicMoldForSession,
  VOCAB_FIT_TRIP_THRESHOLD,
} from '../topicMoldCircuitBreaker.mjs';
import { planRotation } from '../poolFillTeilLib.mjs';

const session = {};
const topic = 'Freizeit';
const teil = 4;

recordTopicMoldAttempt(session, {
  topic,
  teil,
  vocabRatio: 0.2,
  remainingMolds: 1,
  moldGateFailure: true,
  ok: false,
});
recordTopicMoldAttempt(session, {
  topic,
  teil,
  vocabRatio: 0.25,
  remainingMolds: 0,
  moldGateFailure: true,
  ok: false,
});

const trip = assessTopicMoldCircuitBreaker(session, topic, teil, { remainingMolds: 0 });
assert.equal(trip.trip, true, 'breaker should trip after 2 low-vocab + exhausted molds');

const reason =
  'Circuit breaker: vocab <40% en 2 intentos consecutivos (ratios: 20%, 25%) y pool casi agotado (0 molde(s) restante(s)) — revisión manual';
assert.ok(
  isTopicMoldSessionBlockReason({ reason, gate: 'topic-mold-block' }),
  'detect circuit block reason',
);

excludeTopicMoldForSession(session, topic, teil);
assert.ok(session._topicMoldExcludedTopics?.has('Freizeit|lesen-t4'));

const exhausted = ['Freizeit'];
const plan = planRotation({
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 4,
  targetPerCell: 17,
  rotateEvery: 3,
  wordCount: 6,
  vocabCursor: 0,
  recentTopics: [],
  forcedTopic: null,
  exhaustedTopics: exhausted,
});

assert.notEqual(plan.topic, 'Freizeit', 'planRotation must not re-pick exhausted Freizeit');
assert.ok(plan.topic, 'should pick another topic');

console.log('OK topic-mold-circuit-rotation.test.mjs');
console.log(`  next topic after Freizeit excluded: ${plan.topic}`);
