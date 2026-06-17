#!/usr/bin/env node
/** Goethe B1 official blueprint smoke tests (Modellsatz delivery). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'));

assert(bp.structureVersion === 3, 'structureVersion 3');
assert(bp.modules.length === 4, '4 official modules (no grammatik)');
assert(!bp.modules.some((m) => m.id === 'grammatik'), 'no grammatik module');

const lesen = bp.modules.find((m) => m.id === 'lesen');
const horen = bp.modules.find((m) => m.id === 'horen');
assert(lesen.parts.map((p) => p.itemsTotal).join('/') === '6/6/7/7/4', 'Lesen 6/6/7/7/4');
assert(horen.parts.map((p) => p.itemsTotal).join('/') === '10/5/7/8', 'Hören 10/5/7/8');
assert(lesen.parts[2].passageLengthExempt === true, 'Teil 3 passageLengthExempt');
assert(lesen.parts[3].passageLengthExempt === true, 'Teil 4 passageLengthExempt');
assert(horen.parts[0].plays === 2 && horen.parts[3].plays === 2, 'Hören plays 2/1/1/2');
assert(horen.parts[1].plays === 1 && horen.parts[2].plays === 1, 'Hören Teil 2/3 einmal');

const shortExempt = CefrGate.validatePassage('Kurze Anzeige für Gartenkurs.', {
  level: 'B1',
  lang: 'de',
  passageLengthExempt: true,
});
assert(!shortExempt.reasons.some((r) => r.startsWith('length_below_min')), 'exempt skips min length');

const shortNormal = CefrGate.validatePassage('Kurzer Text.', { level: 'B1', lang: 'de' });
assert(shortNormal.reasons.some((r) => r.startsWith('length_below_min')), 'normal part fails min length');

const examExempt = CefrGate.validateExam(
  {
    level: 'B1',
    lang: 'de',
    lesenParts: [{ teil: 3, ads: [{ key: 'A', text: 'Kurze Anzeige.' }], questions: [] }],
  },
  { blueprint: bp },
);
assert(!examExempt.reasons.some((r) => r.startsWith('length_below_min')), 'validateExam uses blueprint exempt');

console.log('\nGoethe B1 Modellsatz tests passed.');
