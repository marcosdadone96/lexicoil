#!/usr/bin/env node
/** Goethe A2 official blueprint smoke tests (Modellsatz Erwachsene). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  GOETHE_A2_MODELSATZ,
  GOETHE_A2_PASS_RULE,
  assertModellsatzCounts,
} from './lib/goethe-a2-modellsatz.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_A2.json'), 'utf8'));

assert(bp.structureVersion === 3, 'structureVersion 3');
assert(bp.modules.length === 4, '4 official modules (no grammatik)');
assert(!bp.modules.some((m) => m.id === 'grammatik'), 'no grammatik module');
assert(bp.modularGrading === false, 'non-modular grading');
assert(bp.passPercentPerModule == null, 'no passPercentPerModule (whole-exam rule)');

const passRule = bp.passRule;
assert(passRule?.scope === GOETHE_A2_PASS_RULE.scope, 'passRule scope whole-exam');
assert(passRule?.writtenMin?.points === 45 && passRule?.writtenMin?.of === 75, 'passRule writtenMin 45/75');
assert(passRule?.speakingMin?.points === 15 && passRule?.speakingMin?.of === 25, 'passRule speakingMin 15/25');

const counts = assertModellsatzCounts(bp);
assert(counts.ok, `Modellsatz counts: ${counts.issues.join(', ') || 'ok'}`);

const lesen = bp.modules.find((m) => m.id === 'lesen');
const horen = bp.modules.find((m) => m.id === 'horen');
const schreiben = bp.modules.find((m) => m.id === 'schreiben');
const sprechen = bp.modules.find((m) => m.id === 'sprechen');

assert(lesen.parts.map((p) => p.itemsTotal).join('/') === '5/5/5/5', 'Lesen 5/5/5/5');
assert(horen.parts.map((p) => p.itemsTotal).join('/') === '5/5/5/5', 'Hören 5/5/5/5');
assert(schreiben.parts.length === 2, 'Schreiben 2 Teile');
assert(sprechen.parts.length === 3, 'Sprechen 3 Teile');
assert(bp.itemsTotalByModule.lesen === GOETHE_A2_MODELSATZ.lesenTotal, 'itemsTotalByModule lesen 20');
assert(bp.itemsTotalByModule.horen === GOETHE_A2_MODELSATZ.horenTotal, 'itemsTotalByModule horen 20');
assert(bp.itemsTotalByModule.schreiben === 2, 'itemsTotalByModule schreiben 2');
assert(bp.itemsTotalByModule.sprechen === 3, 'itemsTotalByModule sprechen 3');

assert(lesen.parts[3].passageLengthExempt === true, 'Lesen Teil 4 passageLengthExempt');
assert(horen.parts[0].plays === 2 && horen.parts[3].plays === 2, 'Hören Teil 1/4 zweimal');
assert(horen.parts[1].plays === 1 && horen.parts[2].plays === 1, 'Hören Teil 2/3 einmal');

const shortExempt = CefrGate.validatePassage('Kurze Anzeige für Sprachkurs.', {
  level: 'A2',
  lang: 'de',
  passageLengthExempt: true,
});
assert(!shortExempt.reasons.some((r) => r.startsWith('length_below_min')), 'exempt skips min length');

console.log('\nGoethe A2 Modellsatz tests passed.');
