#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  buildT4TitleCandidates,
  checkT4TitleSeedAlignment,
  isT4TitlePhraseGrammaticallyComplete,
} from '../titleVariantBank.mjs';
import { checkLesenT4TitleComplete } from '../lesenBatchQuality.mjs';

const SEEDS = [
  'Jeder Bürger soll Pfandflaschen aus Plastik und Recycling-Material beim Einkauf bekommen.',
  'In der Stadt sollen nur Autos fahren, die wenig CO2 ausstoßen.',
  'Alle Schüler sollen ab nächstem Jahr eine Schuluniform tragen müssen.',
  'Jeder Haushalt soll eine eigene Komposttonne für Bioabfälle erhalten.',
  'In öffentlichen Gebäuden soll es nur noch vegane Speisen in der Kantine geben.',
  'Der Mindestlohn soll auf 15 Euro pro Stunde erhöht werden.',
  'Jeder Bürger soll ein kostenloses Jahresticket für den öffentlichen Nahverkehr bekommen.',
  'In der Innenstadt soll es ab 22 Uhr ein generelles Alkoholverbot geben.',
];

console.log('t4-title-seed-phrase.test.mjs');

for (const seed of SEEDS) {
  const titles = buildT4TitleCandidates(seed);
  assert.ok(titles.length >= 4, `candidates for seed: ${seed.slice(0, 40)}`);
  for (const title of titles) {
    const align = checkT4TitleSeedAlignment(title, seed);
    assert.equal(align.ok, true, `bad title «${title}» seed «${seed.slice(0, 50)}…» ${align.issue || ''}`);
    const gate = checkLesenT4TitleComplete(title, seed);
    assert.equal(gate.ok, true, `gate fail «${title}»: ${gate.reason}`);
    assert.ok(!/\bbeim\s*[—–-]/i.test(title), `truncated beim: ${title}`);
  }
}

const broken =
  'Forum: Jeder Bürger soll Pfandflaschen aus Plastik und Recycling-Material beim — ja oder nein?';
const seed080 =
  'Jeder Bürger soll Pfandflaschen aus Plastik und Recycling-Material beim Einkauf bekommen.';
assert.equal(checkT4TitleSeedAlignment(broken, seed080).ok, false);
assert.equal(checkLesenT4TitleComplete(broken, seed080).ok, false);

const fixed = buildT4TitleCandidates(seed080).find((t) => t.includes('ja oder nein'));
assert.ok(fixed.includes('Einkauf bekommen'), fixed);
assert.ok(isT4TitlePhraseGrammaticallyComplete('beim Einkauf bekommen'));

console.log('OK all seeds + 080 regression');
