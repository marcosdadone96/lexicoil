/**
 * Tests: Lesen T5 bank blocklist + institution seeds.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import {
  loadGlobalT5BlocklistEntries,
  assertLesenT5NotBankDuplicate,
  resetGlobalT5BlocklistCache,
} from '../lesenT5BankBlocklist.mjs';
import {
  pickT5InstitutionSeed,
  buildT5InstitutionSeedPromptBlock,
} from '../lesenT5InstitutionSeeds.mjs';
import {
  buildT5SubtypeCandidateOrder,
  resolveT5GenerationMolds,
  T5_EARLY_PRIORITY_SUBTYPES,
} from '../lesenSubtypeRotation.mjs';

resetGlobalT5BlocklistCache();
const entries = loadGlobalT5BlocklistEntries({ lang: 'de', level: 'B1' });
assert(entries.length >= 28, `expected ≥28 global T5 entries, got ${entries.length}`);
assert(entries.some((e) => e.source.includes('gen-l5-04a7ab0b')), 'bank passage 04a7ab0b missing');

const bankPath = path.join(ROOT, 'library/de/B1/questions.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const bankPassage = bank.passages.find((p) => p.id === 'gen-l5-04a7ab0b');
assert(bankPassage, 'bank fixture missing');

const dupBatch = {
  passages: [{ id: 'gen-l5-04a7ab0b', teil: 5, text: bankPassage.text }],
  questions: [{ teil: 5 }],
};
const dupCheck = assertLesenT5NotBankDuplicate(dupBatch, { lang: 'de', level: 'B1' });
assert.equal(dupCheck.ok, false);
assert.match(dupCheck.issue, /idéntico|identico/i);

const novelBatch = {
  passages: [{
    id: 'gen-l5-testnovel',
    teil: 5,
    text: 'Willkommen im Testzentrum Nordlicht! Bitte beachten Sie: Schuhe müssen gewechselt werden. '
      + 'Getränke sind nur in der Eingangshalle erlaubt. Parken kostet zwei Euro pro Stunde.',
  }],
  questions: [{ teil: 5 }],
};
assert.equal(assertLesenT5NotBankDuplicate(novelBatch, { lang: 'de', level: 'B1' }).ok, true);

const seedA = pickT5InstitutionSeed('park', 'test-a');
const seedB = pickT5InstitutionSeed('park', 'test-b');
assert.notEqual(seedA.institutionName, seedB.institutionName);
const block = buildT5InstitutionSeedPromptBlock(seedA);
assert.match(block, /INSTITUCIÓN OBLIGATORIA/);
assert(block.includes(seedA.institutionName), 'institution name in prompt block');

const order = buildT5SubtypeCandidateOrder('Kultur');
for (const id of T5_EARLY_PRIORITY_SUBTYPES) {
  if (order.includes(id)) {
    assert(order.indexOf(id) < order.indexOf('bibliothek') || order[0] === id,
      `expected ${id} early in order for Kultur`);
  }
}

const molds = resolveT5GenerationMolds({ lang: 'de', level: 'B1', topicTag: 'Familie' });
assert(molds.institutionSeed?.institutionName, 'institution seed missing');
assert((molds.excludeMolds?.publishedPassages || []).length >= 28, 'published passages in molds');

console.log('lesenT5BankBlocklist.test.mjs — 8/8 pass');
