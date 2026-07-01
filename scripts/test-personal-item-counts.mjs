#!/usr/bin/env node
/**
 * Personal exam — hard item-count validation (Lesen 6/6/7/7/4, Hören 10/5/7/8)
 * and Hören T4 speaker coherence. Tests fail until runtime enforces counts.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PF = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const goetheBp = loadBlueprintFileSync('goethe_B1');

assert('lesen T1 expects 6', PF.lesenExpectedItemCount(1, goetheBp) === 6);
assert('lesen T2 expects 6', PF.lesenExpectedItemCount(2, goetheBp) === 6);
assert('lesen T5 expects 4', PF.lesenExpectedItemCount(5, goetheBp) === 4);
assert('horen T1 expects 10', PF.horenExpectedItemCount(1, goetheBp) === 10);
assert('horen T4 expects 8', PF.horenExpectedItemCount(4, goetheBp) === 8);

const mcq = (id) => ({
  id: String(id),
  type: 'multiple_choice',
  question: `Frage ${id}?`,
  correct: 'a',
  options: ['a) x', 'b) y', 'c) z'],
});

const rf = (id) => ({ id: String(id), type: 'richtig_falsch', question: `Aussage ${id}?`, correct: 'R' });

const matchingMAB = (id) => ({
  id: String(id),
  type: 'matching',
  question: `Wer sagt das? ${id}`,
  correct: 'A',
  options: ['a) M', 'b) A', 'c) B'],
});

const fullLesenT1 = {
  teil: 1,
  text: 'Ein langer Lesetext mit genug Inhalt.',
  questions: Array.from({ length: 6 }, (_, i) => mcq(i + 1)),
};
assert('lesen T1 full passes count', PF.partMeetsItemCount(fullLesenT1, 'lesen', 1, goetheBp));

const shortLesenT1 = { teil: 1, text: 'Text.', questions: Array.from({ length: 5 }, (_, i) => mcq(i + 1)) };
assert('lesen T1 short fails count', !PF.partMeetsItemCount(shortLesenT1, 'lesen', 1, goetheBp));

const fullHorenT1 = {
  teil: 1,
  segments: Array.from({ length: 5 }, (_, i) => ({
    transcript: `Kurzer Text ${i + 1}.`,
    questions: [rf(i * 2 + 1), mcq(i * 2 + 2)],
  })),
};
assert('horen T1 full passes count', PF.partMeetsItemCount(fullHorenT1, 'horen', 1, goetheBp));
assert('horen T1 9 items fails', !PF.partMeetsItemCount(
  { teil: 1, segments: [{ transcript: 'x', questions: Array.from({ length: 9 }, (_, i) => rf(i + 1)) }] },
  'horen',
  1,
  goetheBp,
));

const coherentT4 = {
  teil: 4,
  blueprintSlot: 'discussion_twice',
  segments: [{
    transcript: 'Moderator: Hallo.\nFrau A: Ja.\nHerr B: Nein.',
    speakerLegend: ['M = Moderator/in', 'A = Frau A', 'B = Herr B'],
    questions: Array.from({ length: 8 }, (_, i) => matchingMAB(23 + i)),
  }],
};
assert('horen T4 coherent speakers passes', PF.horenTeil4SpeakerCoherent(coherentT4));

const badT4ExtraGuest = {
  teil: 4,
  segments: [{
    transcript: 'Mod: Hi. A: Ja. B: Nein. C: Auch.',
    questions: Array.from({ length: 8 }, (_, i) => ({
      id: String(23 + i),
      type: 'matching',
      question: `S${i}?`,
      correct: 'A',
      options: ['a) M', 'b) A', 'c) B', 'd) C'],
    })),
  }],
};
assert('horen T4 third guest fails coherence', !PF.horenTeil4SpeakerCoherent(badT4ExtraGuest));

const badT4Count = {
  teil: 4,
  segments: [{ transcript: 'Diskussion.', questions: Array.from({ length: 6 }, (_, i) => matchingMAB(23 + i)) }],
};
assert('horen T4 6 items fails count', !PF.partMeetsItemCount(badT4Count, 'horen', 4, goetheBp));

assert('HOREN_POOL_FIRST includes T1 and T4', PF.HOREN_POOL_FIRST_TEILS.join(',') === '1,4');

const teils = PF.filterPersonalAiChunks(
  [
    { expectKey: 'horenParts', teil: 1, label: 'Hören Teil 1' },
    { expectKey: 'horenParts', teil: 2, label: 'Hören Teil 2' },
    { expectKey: 'horenParts', teil: 4, label: 'Hören Teil 4' },
    { expectKey: 'lesenParts', teil: 2, label: 'Lesen Teil 2' },
  ],
  { skills: ['horen'] },
);
assert(
  'pool-first filters horen T1/T4 from AI plan',
  teils.length === 2 &&
    teils.filter((c) => /horen/i.test(c.expectKey)).length === 1 &&
    Number(teils.find((c) => /horen/i.test(c.expectKey))?.teil) === 2,
);
assert('lesen T2 still in AI plan', teils.some((c) => c.teil === 2 && /lesen/i.test(c.expectKey)));

console.log('\nPersonal item-count tests passed.');
