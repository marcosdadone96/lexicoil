#!/usr/bin/env node
/** Goethe B2 official blueprint smoke tests (Modellsatz Erwachsene). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { GOETHE_B2_MODELSATZ, GOETHE_B2_INSTRUCTIONS, assertModellsatzCounts, assertSchreibenInstructionsMatch, assertSprechenInstructionsMatch, assertLesenInstructionsMatch, assertHorenInstructionsMatch } from './lib/goethe-b2-modellsatz.mjs';

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

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B2.json'), 'utf8'));

assert(bp.structureVersion === 3, 'structureVersion 3');
assert(bp.modules.length === 4, '4 official modules (no grammatik)');
assert(!bp.modules.some((m) => m.id === 'grammatik'), 'no grammatik module');
assert(bp.passPercentPerModule === 60, 'passPercentPerModule 60');
assert(bp.modularGrading === true, 'modular grading');

const counts = assertModellsatzCounts(bp);
assert(counts.ok, `Modellsatz counts: ${counts.issues.join(', ') || 'ok'}`);

const lesen = bp.modules.find((m) => m.id === 'lesen');
const horen = bp.modules.find((m) => m.id === 'horen');
const schreiben = bp.modules.find((m) => m.id === 'schreiben');
const sprechen = bp.modules.find((m) => m.id === 'sprechen');

assert(lesen.parts.map((p) => p.itemsTotal).join('/') === '9/6/6/6/3', 'Lesen 9/6/6/6/3');
assert(horen.parts.map((p) => p.itemsTotal).join('/') === '10/6/6/8', 'Hören 10/6/6/8');
assert(schreiben.parts.length === 2, 'Schreiben 2 Teile');
const schInstr = assertSchreibenInstructionsMatch(bp);
assert(schInstr.ok, `Schreiben instructions: ${schInstr.issues.join(', ') || 'ok'}`);
const lesInstr = assertLesenInstructionsMatch(bp);
assert(lesInstr.ok, `Lesen instructions: ${lesInstr.issues.join(', ') || 'ok'}`);
const horInstr = assertHorenInstructionsMatch(bp);
assert(horInstr.ok, `Hören instructions: ${horInstr.issues.join(', ') || 'ok'}`);
assert(
  horen.parts[0].instruction === GOETHE_B2_INSTRUCTIONS.horen[0],
  'Hören T1 instruction byte match',
);
assert(
  horen.parts[1].instruction === GOETHE_B2_INSTRUCTIONS.horen[1],
  'Hören T2 instruction byte match',
);
assert(
  horen.parts[2].instruction === GOETHE_B2_INSTRUCTIONS.horen[2],
  'Hören T3 instruction byte match',
);
assert(
  horen.parts[3].instruction === GOETHE_B2_INSTRUCTIONS.horen[3],
  'Hören T4 instruction byte match',
);
assert(
  lesen.parts[0].instruction === GOETHE_B2_INSTRUCTIONS.lesen[0],
  'Lesen T1 instruction byte match',
);
assert(
  lesen.parts[1].instruction === GOETHE_B2_INSTRUCTIONS.lesen[1],
  'Lesen T2 instruction byte match',
);
assert(
  lesen.parts[3].instruction === GOETHE_B2_INSTRUCTIONS.lesen[3],
  'Lesen T4 instruction byte match',
);
assert(
  lesen.parts[4].instruction === GOETHE_B2_INSTRUCTIONS.lesen[4],
  'Lesen T5 instruction byte match',
);
assert(
  GOETHE_B2_INSTRUCTIONS.lesen[4] ===
    'Lesen Sie die Studienordnung.\nWelche Überschriften aus dem Inhaltsverzeichnis passen zu den Paragrafen? Vier Überschriften werden nicht gebraucht.',
  'Lesen T5 canonical string',
);
assert(
  GOETHE_B2_INSTRUCTIONS.lesen[3] ===
    'Lesen Sie in einer Zeitschrift Meinungsäußerungen.\nWelche Äußerung passt zu welcher Überschrift? Eine Äußerung passt nicht.',
  'Lesen T4 canonical string',
);
assert(sprechen.parts.length === 2, 'Sprechen 2 Teile');
const spInstr = assertSprechenInstructionsMatch(bp);
assert(spInstr.ok, `Sprechen instructions: ${spInstr.issues.join(', ') || 'ok'}`);
assert(
  sprechen.parts[0].instruction === GOETHE_B2_INSTRUCTIONS.sprechen[0],
  'Sprechen T1 instruction byte match',
);
assert(
  sprechen.parts[1].instruction === GOETHE_B2_INSTRUCTIONS.sprechen[1],
  'Sprechen T2 instruction byte match',
);
assert(bp.itemsTotalByModule.lesen === GOETHE_B2_MODELSATZ.lesenTotal, 'itemsTotalByModule lesen 30');
assert(bp.itemsTotalByModule.horen === GOETHE_B2_MODELSATZ.horenTotal, 'itemsTotalByModule horen 30');
assert(bp.itemsTotalByModule.schreiben === 2, 'itemsTotalByModule schreiben 2');
assert(bp.itemsTotalByModule.sprechen === 2, 'itemsTotalByModule sprechen 2');

assert(lesen.parts[0].passageLengthExempt === true, 'Lesen Teil 1 passageLengthExempt');
assert(lesen.parts[3].passageLengthExempt === true, 'Lesen Teil 4 passageLengthExempt');
assert(horen.parts[0].plays === 1, 'Hören Teil 1 einmal');
assert(horen.parts[1].plays === 2 && horen.parts[3].plays === 2, 'Hören Teil 2/4 zweimal');
assert(horen.parts[2].plays === 1, 'Hören Teil 3 einmal');

const shortExempt = CefrGate.validatePassage('Kurze Meinung zum Thema.', {
  level: 'B2',
  lang: 'de',
  passageLengthExempt: true,
});
assert(!shortExempt.reasons.some((r) => r.startsWith('length_below_min')), 'exempt skips min length');

console.log('\nGoethe B2 Modellsatz tests passed.');
