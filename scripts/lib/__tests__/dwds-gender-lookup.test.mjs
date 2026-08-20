#!/usr/bin/env node
import assert from 'node:assert';
import { parseGenderFromDwdsHtml, genderFromGoetheRow } from '../dwdsGenderLookup.mjs';

const SUP = 'Grammatik</span><span class="dwdswb-ft-blocktext"><span>Substantiv (Maskulinum)</span>';
const FEM = 'Grammatik</span><span class="dwdswb-ft-blocktext"><span>Substantiv (Femininum)</span>';
const NEU = 'Grammatik</span><span class="dwdswb-ft-blocktext"><span>Substantiv (Neutrum)</span>';

assert.strictEqual(parseGenderFromDwdsHtml(`<html>${SUP}</html>`, 'Supermarkt').gender, 'm');
assert.strictEqual(parseGenderFromDwdsHtml(`<html>${FEM}</html>`, 'Nachricht').gender, 'f');
assert.strictEqual(parseGenderFromDwdsHtml(`<html>${NEU}</html>`, 'Smartphone').gender, 'n');
assert.strictEqual(parseGenderFromDwdsHtml('<html>404 – Seite nicht gefunden</html>', 'x').status, 'not_found');

assert.strictEqual(
  genderFromGoetheRow({ pos: 'Substantiv', genera: ['fem.'], articles: ['die'], sch: [{ lemma: 'Ampel' }] }),
  'f',
);
assert.strictEqual(genderFromGoetheRow({ pos: 'Verb', genera: [], sch: [{ lemma: 'gehen' }] }), null);

console.log('OK dwdsGenderLookup');
