import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLexical } from '../lexicalCheck.mjs';
import { tagBatchWithTopic } from '../topicRotation.mjs';
import { isPartPoolReady } from '../../audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/generated', name), 'utf8'));
}

// ── tagBatchWithTopic forces requested topic on all passages ──
{
  const batch = tagBatchWithTopic({
    passages: [{ id: 'p1', text: 'Freizeit Hobby', topicTag: 'Freizeit' }],
    questions: [],
    topicTag: 'Technik',
  }, 'Technik');
  assert.equal(batch.passages[0].topicTag, 'Technik');
  assert.equal(batch.topicTag, 'Technik');
  console.log('OK   tagBatchWithTopic fuerza tema en passages');
}

// ── P0: legacy batch 157 rejected ──
{
  const b157 = load('lesen-t1-gemini-157.json');
  const lex = checkLexical(b157);
  assert.equal(lex.ok, false, '157 debe fallar checkLexical');
  assert.ok(lex.issues.some((i) => /Gelassenheit|modifizieren|Angehörig/i.test(i)));
  const pool = await isPartPoolReady(b157);
  assert.equal(pool.ok, false, '157 debe fallar isPartPoolReady');
  assert.ok(pool.blocking.some((f) => f.id === 'CHK-26'));
  console.log('OK   157 rechazada por P0+P1');
}

// ── P1: legacy batch 075 rejected ──
{
  const b075 = load('lesen-t2-gemini-075.json');
  const pool = await isPartPoolReady(b075);
  assert.equal(pool.ok, false, '075 debe fallar isPartPoolReady');
  assert.ok(pool.blocking.filter((f) => f.id === 'CHK-26').length >= 2);
  console.log('OK   075 rechazada por CHK-26 (dos temas T2)');
}

console.log('p0p1Gates.test.mjs: all passed');
