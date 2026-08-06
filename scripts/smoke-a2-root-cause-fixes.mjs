#!/usr/bin/env node
/**
 * Smoke test (sin API) — verifica rotación B+C tras fixes.
 *   node scripts/smoke-a2-root-cause-fixes.mjs
 */
import {
  pickNextHorenT2ActivitySchedule,
  scheduleSignature,
} from './lib/horenT2ActivityScheduleBank.mjs';
import { pickDialogueNameCast } from './lib/dialogueNamesBank.mjs';
import { vocabNarrativeCoherenceGate } from './lib/vocabNarrativeCoherence.mjs';

let failed = 0;

function assert(label, cond) {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}`);
    failed += 1;
  }
}

console.log('\n── B: activity schedule rotation (n=6) ──');
const schedules = new Set();
const exclude = new Set();
for (let i = 0; i < 6; i += 1) {
  const pick = pickNextHorenT2ActivitySchedule(exclude, `smoke:${i}`);
  if (pick.schedule) {
    schedules.add(pick.schedule.id);
    exclude.add(pick.schedule.id);
    exclude.add(scheduleSignature(pick.schedule));
  }
}
assert(`≥4 schedules distintos en 6 picks (${schedules.size})`, schedules.size >= 4);

console.log('\n── C: dialogue name cast rotation (n=6, T3) ──');
const casts = new Set();
const sessionExcludeCasts = new Set();
const castLog = [];
for (let i = 0; i < 6; i += 1) {
  const pick = pickDialogueNameCast(5, {
    level: 'A2',
    module: 'horen',
    teil: 3,
    entropy: `smoke-t3:${i}`,
    sessionExcludeCasts,
  });
  castLog.push({ i, sig: pick.castSignature });
  sessionExcludeCasts.add(pick.castSignature);
  casts.add(pick.castSignature);
}
for (const row of castLog) console.log(`  pick ${row.i}: ${row.sig.slice(0, 72)}${row.sig.length > 72 ? '…' : ''}`);
assert(`6 elencos distintos en 6 picks (${casts.size})`, casts.size === 6);

console.log('\n── A: vocab coherence gate rejects 199-pattern ──');
const badBatch = {
  passages: [{
    text:
      'Die Firma Müller in Köln hat neue Arbeitszeiten. Mitarbeiter arbeiten flexibler. ' +
      'Das Krankenhaus in der Nähe hat auch Interesse gezeigt. Sie erhielt ein Stipendium.',
  }],
  userVocabFeedback: { used: ['krankenhaus', 'stipendium'] },
};
const gate = vocabNarrativeCoherenceGate(badBatch);
assert('gate blocks disconnected vocab', !gate.ok);

console.log(`\n── Result: ${failed ? 'FAIL' : 'PASS'} ──\n`);
process.exit(failed ? 1 : 0);
