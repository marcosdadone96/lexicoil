import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLexical } from '../lexicalCheck.mjs';
import { tagBatchWithTopic } from '../topicRotation.mjs';
import { isPartPoolReady } from '../../audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function load(name) {
  const candidates = [
    path.join(ROOT, 'batches/generated', name),
    path.join(ROOT, 'batches/ready/pool-content-ok-lesen/B1', name),
    path.join(ROOT, 'batches/ready/pool-verified/B1', name),
    path.join(ROOT, 'batches/needs-regeneration/B1', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error(`Fixture not found: ${name} (tried ${candidates.join(', ')})`);
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

// Lesen T5: todas las questions llevan el tema de celda (no detectTopic en MCQ)
{
  const batch = tagBatchWithTopic(
    {
      module: 'lesen',
      teil: 5,
      passages: [{ id: 'p1', text: 'Die Mensa bietet vegetarisches Essen.' }],
      questions: [
        { id: 'q1', question: 'In der Mensa gibt es Salat und Suppe.', module: 'lesen', teil: 5 },
      ],
    },
    'Konsum',
  );
  assert.equal(batch.questions[0].topicTags[0], 'Konsum', 'T5 no debe etiquetar Ernährung por texto Mensa');
  console.log('OK   tagBatchWithTopic Lesen T5 tema uniforme');
}

// ── P0: legacy batch 157 rejected ──
{
  const b157 = load('lesen-t1-gemini-157.json');
  const lex = checkLexical(b157);
  assert.equal(lex.ok, false, '157 debe fallar checkLexical');
  assert.ok(lex.issues.some((i) => /Gelassenheit|modifizieren|Angehörig/i.test(i)));
  const pool = await isPartPoolReady(b157);
  assert.equal(pool.ok, false, '157 debe fallar isPartPoolReady');
  assert.ok((pool.blocking || []).length >= 1, '157 debe tener blocking P0/P1');
  console.log('OK   157 rechazada por P0+P1');
}

// ── P1: legacy batch 075 rejected ──
{
  const b075 = load('lesen-t2-gemini-075.json');
  const pool = await isPartPoolReady(b075);
  assert.equal(pool.ok, false, '075 debe fallar isPartPoolReady');
  assert.ok((pool.blocking || []).length >= 1, '075 debe tener blocking');
  console.log('OK   075 rechazada por pool gates');
}

console.log('p0p1Gates.test.mjs: all passed');
