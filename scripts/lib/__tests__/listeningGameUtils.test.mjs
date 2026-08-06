/**
 * listeningGameUtils.test.mjs
 * Run: node scripts/lib/__tests__/listeningGameUtils.test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  targetAppearsInPassage,
  detectAppearedWords,
  scoreListeningRound,
} = require('../../../netlify/functions/lib/listeningGameUtils.js');

let passed = 0;
let failed = 0;

function assertOk(desc, value) {
  if (value) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

const passage =
  'Gestern im Büro schlägt meine Kollegin vor, dass wir früher aufstehen und zusammen Mittag essen gehen.';

console.log('targetAppearsInPassage');
assertOk('split separable vorschlagen', targetAppearsInPassage('vorschlagen', passage, 'de'));
assertOk('finite aufstehen', targetAppearsInPassage('aufstehen', passage, 'de'));
assertOk('absent word', !targetAppearsInPassage('schwimmen', passage, 'de'));

console.log('detectAppearedWords');
const det = detectAppearedWords(['vorschlagen', 'aufstehen', 'schwimmen', 'Mittag'], passage, 'de');
assertOk('detects vorschlagen', det.appeared.includes('vorschlagen'));
assertOk('detects aufstehen', det.appeared.includes('aufstehen'));
assertOk('marks schwimmen absent', det.absent.includes('schwimmen'));

console.log('scoreListeningRound');
const round = { displayWords: det.all, appeared: det.appeared, absent: det.absent };
const score = scoreListeningRound(round, ['vorschlagen', 'aufstehen', 'schwimmen']);
assertOk('penalizes false alarm', score.falseAlarms.includes('schwimmen'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
