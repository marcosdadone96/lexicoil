#!/usr/bin/env node
/** B2 Hören T1–T4 — plantillas-horen-b2 + instrucciones Modellsatz. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../loadEnv.mjs';
import { examTemplatePath, buildExamStaticCore } from '../examTemplatePrompt.mjs';
import {
  GOETHE_B2_INSTRUCTIONS,
  assertHorenInstructionsMatch,
} from '../goethe-b2-modellsatz.mjs';
import { loadVocabBankLemmaSet } from '../vocabBank.mjs';

const L = 'B2';

for (const t of [1, 2, 3, 4]) {
  const rel = path.relative(ROOT, examTemplatePath('horen', t, L)).replace(/\\/g, '/');
  assert.ok(rel.includes('plantillas-horen-b2'), `T${t}: ${rel}`);
  assert.ok(!rel.includes('horen-b1'), `T${t} must not use B1: ${rel}`);
  const b1 = fs.readFileSync(path.join(ROOT, `plantillas-horen-b1/horen-teil${t}.md`), 'utf8').slice(0, 100);
  const core = buildExamStaticCore('horen', t, L);
  assert.ok(!core.includes(b1.slice(0, 40)), `T${t} core must not match B1 head`);
  assert.ok(core.includes(GOETHE_B2_INSTRUCTIONS.horen[t - 1].split('\n')[0]), `T${t} official line in checklist/static`);
}

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B2.json'), 'utf8'));
const ho = assertHorenInstructionsMatch(bp);
assert.equal(ho.ok, true, ho.issues.join(', '));
for (let i = 0; i < 4; i++) {
  assert.equal(
    bp.modules.find((m) => m.id === 'horen').parts[i].instruction,
    GOETHE_B2_INSTRUCTIONS.horen[i],
    `blueprint horen T${i + 1} byte match`,
  );
}

assert.ok(loadVocabBankLemmaSet('de', 'B2').size >= 1000);
console.log('PASS: B2 Hören routing (plantillas-horen-b2, Modellsatz instructions, B2 vocab)');
