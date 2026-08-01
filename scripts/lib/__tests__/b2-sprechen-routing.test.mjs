#!/usr/bin/env node
/** B2 Sprechen T1/T2 — plantillas-sprechen-b2 + instrucciones Modellsatz. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../loadEnv.mjs';
import {
  examTemplatePath,
  buildExamStaticCore,
  isSprechenPerTeil,
} from '../examTemplatePrompt.mjs';
import {
  GOETHE_B2_INSTRUCTIONS,
  assertSprechenInstructionsMatch,
} from '../goethe-b2-modellsatz.mjs';
import { loadVocabBankLemmaSet } from '../vocabBank.mjs';

const L = 'B2';

assert.equal(isSprechenPerTeil('sprechen', L), true);
assert.equal(isSprechenPerTeil('sprechen', 'B1'), false);

for (const t of [1, 2]) {
  const rel = path.relative(ROOT, examTemplatePath('sprechen', t, L)).replace(/\\/g, '/');
  assert.ok(rel.includes('plantillas-sprechen-b2'), `T${t} dir: ${rel}`);
  assert.ok(!rel.includes('sprechen-b1'), `T${t} must not use B1: ${rel}`);
}

const b1Mono = path.join(ROOT, 'plantillas-sprechen-b1', 'sprechen-b1.md');
const t1Core = buildExamStaticCore('sprechen', 1, L);
const t2Core = buildExamStaticCore('sprechen', 2, L);
const b1Head = fs.readFileSync(b1Mono, 'utf8').slice(0, 120);

assert.ok(t1Core.includes(GOETHE_B2_INSTRUCTIONS.sprechen[0]), 'T1 official Vortrag line');
assert.ok(t2Core.includes(GOETHE_B2_INSTRUCTIONS.sprechen[1]), 'T2 official Diskussion line');
assert.ok(!t1Core.includes(b1Head.slice(0, 60)), 'T1 must not be B1 monolith');

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B2.json'), 'utf8'));
const sp = assertSprechenInstructionsMatch(bp);
assert.equal(sp.ok, true, sp.issues.join(', '));

const b2Bank = loadVocabBankLemmaSet('de', 'B2');
assert.ok(b2Bank.size >= 1000, 'B2 vocab bank loaded');
assert.ok(fs.existsSync(path.join(ROOT, 'library/vocab/de/B2.json')));

console.log('PASS: B2 Sprechen routing (plantillas-sprechen-b2, official instructions, B2 vocab bank)');
