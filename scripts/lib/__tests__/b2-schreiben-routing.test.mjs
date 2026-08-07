#!/usr/bin/env node
/** B2 Schreiben T1/T2 must load plantillas-schreiben-b2, not B1 monolith. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import {
  examTemplatePath,
  buildExamStaticCore,
  isSchreibenPerTeil,
} from '../examTemplatePrompt.mjs';
import { GOETHE_B2_INSTRUCTIONS, assertSchreibenInstructionsMatch } from '../goethe-b2-modellsatz.mjs';
import fs from 'node:fs';

const L = 'B2';

assert.equal(isSchreibenPerTeil('schreiben', L), true);
assert.equal(isSchreibenPerTeil('schreiben', 'B1'), false);

for (const t of [1, 2]) {
  const rel = path.relative(ROOT, examTemplatePath('schreiben', t, L)).replace(/\\/g, '/');
  assert.ok(rel.includes('plantillas-schreiben-b2'), `T${t} dir: ${rel}`);
  assert.ok(!rel.includes('schreiben-b1'), `T${t} must not use B1: ${rel}`);
}

const b1Fallback = path.join(ROOT, 'plantillas-schreiben-b1', 'schreiben-b1.md');
const t1Core = buildExamStaticCore('schreiben', 1, L);
const t2Core = buildExamStaticCore('schreiben', 2, L);
const b1Monolith = fs.readFileSync(b1Fallback, 'utf8').slice(0, 400);

assert.ok(t1Core.includes('Forumsbeitrag') && t1Core.includes('150'), 'T1 prompt mentions forum + 150');
assert.ok(t2Core.includes('Vorgesetzten') && t2Core.includes('100'), 'T2 prompt mentions Vorgesetzter + 100');
assert.ok(!t1Core.includes(b1Monolith.slice(0, 80)), 'T1 core must not be B1 monolith head');

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B2.json'), 'utf8'));
const instr = assertSchreibenInstructionsMatch(bp);
assert.equal(instr.ok, true, instr.issues.join(', '));
assert.equal(GOETHE_B2_INSTRUCTIONS.schreiben[0], bp.modules.find((m) => m.id === 'schreiben').parts[0].instruction);

console.log('PASS: B2 Schreiben routing (plantillas-schreiben-b2, official instructions)');
