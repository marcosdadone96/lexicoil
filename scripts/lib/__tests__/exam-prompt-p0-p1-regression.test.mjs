#!/usr/bin/env node
/**
 * P0+P1 preventive audit fixes — checklist injection + A2 topic rotation.
 *   node scripts/lib/__tests__/exam-prompt-p0-p1-regression.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildExamStaticCore } from '../examTemplatePrompt.mjs';
import { buildLesenStaticCore } from '../lesenTemplatePrompt.mjs';
import { getTopicStats, pickNextTopic } from '../topicRotation.mjs';
import { resolveGenerationTopic } from '../resolveGenerationInput.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { A2_OFFICIAL_TOPICS } = require(path.join(ROOT, 'js/data/a2Topics.js'));

// ─── P0: A2 Hören T1 must NOT inject B1 10-question RF+MCQ checklist ───
const hA2T1 = buildExamStaticCore('horen', 1, 'A2');
assert.ok(!/10 questions \(sN-q1 RF/.test(hA2T1), 'A2 H T1: no B1 RF+MCQ checklist');
assert.ok(/5 preguntas.*1 MCQ/.test(hA2T1), 'A2 H T1: 5× MCQ checklist');
assert.ok(/PROHIBIDO richtig_falsch/.test(hA2T1), 'A2 H T1: forbids RF');
assert.ok(/Text 1.*Text 5/.test(hA2T1), 'A2 H T1: segmentLabel Text 1…5');
assert.ok(/20–70/.test(hA2T1), 'A2 H T1: length block for A2 T1');

// ─── P0: B2 Sprechen T1/T2 must NOT inject B1 3-Teile batch ───
for (const t of [1, 2]) {
  const core = buildExamStaticCore('sprechen', t, 'B2');
  assert.ok(!/exactamente 3 questions/.test(core), `B2 SP T${t}: no B1 3-teil batch`);
  assert.ok(/exactamente \*\*1\*\* question/.test(core), `B2 SP T${t}: 1 question per teil`);
}

// ─── P0: A2 topic rotation uses 5 official axes only ───
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexi-a2-topic-'));
try {
  fs.writeFileSync(
    path.join(tmpDir, 'lesen-t1-gemini-old.json'),
    JSON.stringify({ topicTag: 'Freizeit', passages: [{ topicTag: 'Freizeit', text: 'x' }] }),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'lesen-t1-gemini-official.json'),
    JSON.stringify({ topicTag: 'Stadtleben', passages: [{ topicTag: 'Stadtleben', text: 'y' }] }),
  );
  const stats = getTopicStats(tmpDir, { module: 'lesen', teil: 1, level: 'A2' });
  assert.equal(Object.keys(stats).length, 5, 'A2 stats: 5 keys only');
  assert.equal(stats.Stadtleben, 1, 'A2 stats: counts official slug');
  assert.equal(stats.Freizeit, undefined, 'A2 stats: no Freizeit bucket');
  for (let i = 0; i < 20; i += 1) {
    const picked = pickNextTopic(tmpDir, { module: 'lesen', teil: 1, level: 'A2' });
    assert.ok(A2_OFFICIAL_TOPICS.includes(picked), `pickNextTopic A2 ∈ official (got ${picked})`);
  }
  const resolved = resolveGenerationTopic({ level: 'A2' }, { module: 'lesen', teil: 1 });
  assert.ok(A2_OFFICIAL_TOPICS.includes(resolved), `resolveGenerationTopic A2 ∈ official (got ${resolved})`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ─── P1: CHK-34 in A2 Lesen MCQ checklists ───
for (const t of [1, 2, 3]) {
  const core = buildLesenStaticCore(t, { level: 'A2' });
  assert.ok(/CHK-34/.test(core), `A2 L T${t}: CHK-34 in checklist`);
}

// ─── P1: B2 Lesen question JSON key rule ───
for (const t of [1, 2, 3, 4, 5]) {
  const core = buildLesenStaticCore(t, { level: 'B2' });
  assert.ok(/clave JSON "question"/.test(core), `B2 L T${t}: question key rule`);
}

// ─── P1: CHK-34 in A2 Hören MCQ checklists ───
const hA2T3 = buildExamStaticCore('horen', 3, 'A2');
assert.ok(/CHK-34/.test(hA2T3), 'A2 H T3: CHK-34 in checklist');
assert.ok(/CHK-34/.test(hA2T1), 'A2 H T1: CHK-34 in checklist');

// ─── Lesen T1 A2: forbid RF-style correct true/false ───
const lA2T1 = buildLesenStaticCore(1, { level: 'A2' });
assert.ok(/correct:"true"/.test(lA2T1), 'A2 L T1: forbids correct true/false in checklist');

console.log('PASS: exam-prompt P0+P1 regression (checklist + A2 topic rotation)');
