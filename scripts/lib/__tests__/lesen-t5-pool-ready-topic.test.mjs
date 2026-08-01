/**
 * Lesen T5 pool-ready must use checkLesenT5BatchTopic (subtype-aligned Freizeit×sportverein
 * skips naive contentTopic «Sport» vs «Freizeit»).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { poolReadyCheck } from '../poolReadyCheck.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const samplePath = path.join(
  ROOT,
  'batches/needs-regeneration/B1/lesen-t5-gemini-108.json',
);

test('lesen T5 Freizeit×sportverein: no content_topic_mismatch when subtype allowed', async () => {
  if (!fs.existsSync(samplePath)) {
    console.log('skip: sample batch not present');
    return;
  }
  const batch = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  assert.equal(batch._textSubtype, 'sportverein');
  assert.equal(batch.topicTag, 'Freizeit');

  const verdict = await poolReadyCheck(batch, {
    file: 'lesen-t5-gemini-108.json',
    skipQ1: true,
    skipQ2: true,
  });

  assert.ok(
    !verdict.reasons.includes('content_topic_mismatch'),
    `unexpected content_topic_mismatch: ${JSON.stringify(verdict.details?.filter((d) => d.rule === 'content_topic_mismatch'))}`,
  );
});
