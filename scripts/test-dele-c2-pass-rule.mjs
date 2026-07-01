#!/usr/bin/env node
/**
 * DELE C2 — three-test pass rule (≥20/25 per prueba).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MG = require(path.join(ROOT, 'js/ui/exam/moduleGrading.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  }
}

const bp = loadBlueprintFileSync('dele_C2');

assert(
  MG.getGradingScope(bp, { lang: 'es', level: 'C2' }) === 'dele-c2-three-tests',
  'DELE C2 scope dele-c2-three-tests',
);
assert(bp.passRule?.minPointsPerTest === 20, 'minPointsPerTest 20');
assert(bp.passRule?.tests?.length === 3, 'three pruebas defined');

const modPts = (points) => ({ evaluated: true, points, maxPoints: 25 });

const failOne = {
  lesen: modPts(25),
  horen: modPts(25),
  schreiben: modPts(19),
  sprechen: modPts(25),
};
const failSummary = MG.summarizeExam(failOne, { blueprint: bp });
assert(failSummary.globalPassed === false, '19 in prueba 2 => No apto');
assert(failSummary.pruebas?.[1]?.points === 19, 'prueba 2 points 19');
assert(failSummary.pruebas?.[1]?.passed === false, 'prueba 2 not passed');

const passAll = {
  lesen: modPts(20),
  horen: modPts(20),
  schreiben: modPts(20),
  sprechen: modPts(20),
};
const passSummary = MG.summarizeExam(passAll, { blueprint: bp });
assert(passSummary.globalPassed === true, '20/20/20 => Apto');
assert(passSummary.pruebas?.every((p) => p.passed), 'all three pruebas passed');
assert(passSummary.pruebas?.[0]?.points === 20, 'prueba 1 combined average 20');

const label = MG.globalResultLabel(failSummary, false);
assert(label.includes('No apto') || label.includes('Fail'), 'fail label mentions not pass');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('test-dele-c2-pass-rule: OK');
