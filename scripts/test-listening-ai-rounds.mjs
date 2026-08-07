/**
 * Listening AI multi-round — billing + quality gates (no live Anthropic).
 * Run: node scripts/test-listening-ai-rounds.mjs
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  LISTENING_AI_ROUND_COUNT,
  LISTENING_POOL_MAX,
  validateListeningPassage,
  shouldBillListeningAiSession,
  detectAppearedWords,
} = require('../netlify/functions/lib/listeningGameUtils.js');

const passage =
  'Gestern im Büro schlägt meine Kollegin vor, dass wir früher aufstehen und zusammen Mittag essen gehen. Das Wetter war schön.';

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else console.log('ok', msg);
}

console.log('── Proposal constant ──');
ok(LISTENING_AI_ROUND_COUNT === 3, 'LISTENING_AI_ROUND_COUNT is 3 (2 credits / session)');
ok(LISTENING_POOL_MAX === 6, 'pool capped at 6 words');

console.log('\n── validateListeningPassage (A2 / B1 / B2) ──');
const pool = ['vorschlagen', 'aufstehen', 'schwimmen', 'Mittag', 'Büro', 'Wetter'];
for (const level of ['A2', 'B1', 'B2']) {
  const v = validateListeningPassage(passage, pool, 'de', level);
  ok(v.ok, `${level} valid passage passes quality gate`);
}
const short = validateListeningPassage('Kurz.', pool, 'de', 'B1');
ok(!short.ok && short.reason === 'passage_too_short', 'rejects too-short passage');

const missing = validateListeningPassage(
  'Heute arbeite ich nur zu Hause und trinke viel Kaffee. Am Abend lese ich ein Buch und gehe spät schlafen.',
  pool,
  'de',
  'B1',
);
ok(!missing.ok && missing.reason === 'passage_missing_words', 'rejects missing vocab');

console.log('\n── Deferred billing (same rule as vocab quiz) ──');
ok(!shouldBillListeningAiSession([], 3), 'total fail: 0 rounds → no bill');
ok(!shouldBillListeningAiSession([{ valid: true }, { valid: true }], 3), 'partial 2/3 → no bill');
ok(
  shouldBillListeningAiSession([{ valid: true }, { valid: true }, { valid: true }], 3),
  'full 3/3 → bill',
);
ok(!shouldBillListeningAiSession([{ valid: true }, { valid: false }], 3), 'invalid round in array → no bill');

console.log('\n── Partial session simulation ──');
const r1 = validateListeningPassage(passage, pool.slice(0, 6), 'de', 'A2');
const roundsPartial = [{ valid: true }, { valid: true }];
ok(r1.ok && !shouldBillListeningAiSession(roundsPartial, 3), 'A2 partial: user plays 2, billed=false');

console.log('\n── Word pool never exceeds 6 ──');
const big = Array.from({ length: 12 }, (_, i) => `wort${i}`);
const det = detectAppearedWords(big.slice(0, LISTENING_POOL_MAX), passage, 'de');
ok(det.all.length <= LISTENING_POOL_MAX, 'detect uses capped pool size');

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll listening AI round tests passed (simulated — no API spend).');
