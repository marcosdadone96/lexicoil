#!/usr/bin/env node
/**
 * horenPassageSync writer-contract tests (mirror balanceMcq.writerContract).
 *   node scripts/lib/__tests__/horenPassageSync.writerContract.test.mjs
 */
import {
  assertHorenPassageSyncContract,
  checkHorenPassageSync,
  replaceAcrossHorenPassageSync,
  HOREN_PASSAGE_SYNC_VERSION,
} from '../horenPassageSync.mjs';

let passed = 0;
let failed = 0;
function ok(d) {
  console.log(`  ✅  ${d}`);
  passed++;
}
function fail(d, detail) {
  console.error(`  ❌  ${d}`);
  if (detail) console.error(`       ${detail}`);
  failed++;
}

const base = {
  passages: [
    {
      id: 'p1',
      text: 'Anna: Hallo.\nBen: Ich trinke nur noch Kaffee.\nAnna: Das gab mir neue Impulse.',
      audio: [
        { speaker: 'Anna', text: 'Hallo.' },
        { speaker: 'Ben', text: 'Ich trinke nur noch Kaffee.' },
        { speaker: 'Anna', text: 'Das gab mir neue Impulse.' },
      ],
    },
  ],
  questions: [
    {
      id: 'q1',
      explanation: 'Anna sagt: "Das gab mir neue Impulse."',
    },
  ],
};

console.log('\n── happy path ──');
{
  const before = structuredClone(base);
  const { batch: after, hits } = replaceAcrossHorenPassageSync(
    structuredClone(base),
    'Ich trinke nur noch Kaffee.',
    'Ich trinke nur noch Tee.',
  );
  try {
    assertHorenPassageSyncContract(before, after, { label: 'happy' });
    ok(`synced replace hits=${hits.length} version=${HOREN_PASSAGE_SYNC_VERSION}`);
  } catch (e) {
    fail('happy path assert', e.message);
  }
  const chk = checkHorenPassageSync(after);
  if (chk.ok) ok('checkHorenPassageSync ok after sync replace');
  else fail('check after sync', JSON.stringify(chk.violations));
}

console.log('\n── forced violation: text edited, audio stale ──');
{
  const before = structuredClone(base);
  const after = structuredClone(base);
  after.passages[0].text = after.passages[0].text.replace(
    'Ich trinke nur noch Kaffee.',
    'Ich trinke nur noch Tee.',
  );
  let threw = false;
  try {
    assertHorenPassageSyncContract(before, after, { label: 'force-audio' });
  } catch (e) {
    threw = /contract:a/.test(e.message) || /audio_text_desync/.test(e.message) || /audio\[\] texts unchanged/.test(e.message);
    if (threw) ok(`rejected stale audio: ${e.message.split('\n')[0]}`);
    else fail('wrong error', e.message);
  }
  if (!threw) fail('expected throw on text≠audio');
}

console.log('\n── forced violation: explanation quote stale ──');
{
  const after = structuredClone(base);
  after.passages[0].text = after.passages[0].text.replace(
    'Das gab mir neue Impulse.',
    'Das gab mir gute Ideen.',
  );
  after.passages[0].audio[2].text = 'Das gab mir gute Ideen.';
  // explanation still quotes old phrase
  const chk = checkHorenPassageSync(after);
  if (chk.violations.some((v) => v.code === 'explanation_quote_desync')) {
    ok('detected stale explanation quote');
  } else {
    fail('missed explanation desync', JSON.stringify(chk.violations));
  }
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
