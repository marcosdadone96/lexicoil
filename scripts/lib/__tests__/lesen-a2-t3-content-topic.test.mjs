#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPassageContentTopic,
  isLesenA2T3GesundheitSportEmailCompat,
} from '../qualityGates/contentTopicCheck.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const A2_OPTS = { level: 'A2', teil: 3, module: 'lesen' };

function loadBatch(name) {
  const p = path.join(ROOT, `batches/needs-regeneration/A2/lesen-t3-gemini-${name}.json`);
  assert.ok(fs.existsSync(p), name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

for (const id of ['055', '056', '057']) {
  const batch = loadBatch(id);
  const p = batch.passages[0];
  const ct = checkPassageContentTopic({ ...p, topicTag: 'Gesundheit' }, A2_OPTS);
  assert.equal(ct.mismatch, false, `${id} should pass after lexicon+compat fix: ${ct.detail}`);
}

// Sport-only email without health framing — still incompatible
const sportOnly = {
  id: 'test-sport-only',
  type: 'email',
  level: 'A2',
  teil: 3,
  topicTag: 'Gesundheit',
  text: 'Liebe Anna, unser Fußballverein sucht neue Spieler für das Turnier am Samstag. Training ist jeden Dienstag.',
};
const sportBad = checkPassageContentTopic(sportOnly, A2_OPTS);
assert.equal(sportBad.mismatch, true, 'pure Sport email must still fail under Gesundheit tag');

assert.ok(
  isLesenA2T3GesundheitSportEmailCompat(
    { type: 'email', text: 'Ein neuer Sportkurs im Verein.' },
    'Gesundheit',
    'Sport',
    A2_OPTS,
  ),
);

console.log('PASS: lesen-a2-t3-content-topic');
