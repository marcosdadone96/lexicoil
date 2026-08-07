#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  pickLesenT4ForumCast,
} from '../dialogueNamesBank.mjs';
import { extractLesenT4ForumNames, GERMAN_FIRST_NAMES } from '../nameRotation.mjs';
import { ROOT } from '../loadEnv.mjs';

console.log('lesen-t4-name-rotation.test.mjs');

const sampleBatch = (names) => ({
  questions: names.map((n) => ({ question: `Ist ${n} für den Vorschlag?` })),
});

assert.deepEqual(extractLesenT4ForumNames(sampleBatch(['Klara', 'Theo', 'Klara'])), ['Klara', 'Theo']);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'l4-names-'));
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/B1');
try {
  const batch1 = sampleBatch(['Klara', 'Theo', 'Matteo', 'Samuel', 'Anton', 'Moritz', 'Charlotte']);
  fs.writeFileSync(path.join(tmp, 'lesen-t4-gemini-test1.json'), JSON.stringify(batch1));
  const pick1 = pickLesenT4ForumCast({
    extraDirs: [],
    sessionExclude: [],
    entropy: 'test1',
  }).names;
  assert.equal(pick1.length, 7);
  const pick2 = pickLesenT4ForumCast({
    extraDirs: [],
    sessionExclude: pick1,
    entropy: 'test2',
  }).names;
  const overlap = pick2.filter((n) => pick1.includes(n));
  assert.equal(overlap.length, 0, `session overlap: ${overlap.join(', ')}`);

  const pick3 = pickLesenT4ForumCast({
    extraDirs: [poolDir],
    sessionExclude: [],
    entropy: 'test3',
  }).names;
  const recentOverlap = pick3.filter((n) =>
    ['Klara', 'Theo', 'Matteo', 'Samuel', 'Anton', 'Moritz'].includes(n),
  );
  assert.ok(
    recentOverlap.length <= 1,
    `expected recent pool names excluded, got overlap: ${recentOverlap.join(', ')}`,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

assert.ok(GERMAN_FIRST_NAMES.length >= 50, 'Lesen T4 uses expanded 55-name pool');

console.log('OK lesen T4 name rotation');
