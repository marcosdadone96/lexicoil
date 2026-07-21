#!/usr/bin/env node
/**
 * T4 Sport seed preflight + intro gate regression tests.
 * Run: node scripts/lib/__tests__/t4-sport-seed-preflight.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  T4_DEBATE_SEEDS,
  checkT4DebateSeedPreflight,
  pickNextT4DebateSeed,
} from '../t4DebateSeeds.mjs';
import { checkPassageContentTopic } from '../qualityGates/contentTopicCheck.mjs';
import { adaptT4WordsForDebate, T4_DEBATE_META_LEMMAS } from '../lesenT4TopicVocab.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TOXIC =
  'Schulen sollen mehr Zeit für Mannschaftssport wie Fußball im Unterricht haben.';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('t4 Sport seed preflight');

test('semilla tóxica Schul×Sport falla preflight', () => {
  const pf = checkT4DebateSeedPreflight(TOXIC, 'Sport');
  assert.equal(pf.ok, false);
  assert.equal(pf.reason, 'intro_topic_mismatch');
  assert.equal(pf.detected, 'Bildung');
});

test('semilla tóxica ya no está en T4_DEBATE_SEEDS.Sport', () => {
  assert.ok(!T4_DEBATE_SEEDS.Sport.some((s) => s.includes('Schulen sollen mehr Zeit')));
});

test('todas las semillas Sport actuales pasan preflight', () => {
  for (const seed of T4_DEBATE_SEEDS.Sport) {
    const pf = checkT4DebateSeedPreflight(seed, 'Sport');
    assert.equal(pf.ok, true, `${seed}: ${pf.detail}`);
  }
});

test('pickNextT4DebateSeed Sport devuelve semilla usable', () => {
  const pick = pickNextT4DebateSeed([], 0, 'Sport');
  assert.ok(pick.seed);
  assert.notEqual(pick.tier, 'exhausted');
});

test('adaptT4WordsForDebate Sport filtra meta-lemas', () => {
  const { words, swapped } = adaptT4WordsForDebate(
    ['aufgabe', 'situation', 'aktuell', 'fitness'],
    'Sport',
  );
  assert.ok(swapped.some((s) => s.startsWith('aufgabe→') || s.startsWith('situation→')));
  assert.ok(words.some((w) => ['training', 'mannschaft', 'turnier', 'verein'].includes(w)));
  for (const w of words) {
    assert.ok(!T4_DEBATE_META_LEMMAS.has(w.toLowerCase()) || w === 'fitness');
  }
});

test('lesen-t4-gemini-045 (Stadtparks) intro pasa content_topic', () => {
  const p = path.join(ROOT, 'batches/ready/pool-verified/B1/lesen-t4-gemini-045.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  const p0 = b.passages[0];
  const ct = checkPassageContentTopic({ ...p0, topicTag: 'Sport' });
  assert.equal(ct.mismatch, false, ct.detail);
});

console.log(`\n${passed} tests passed`);
