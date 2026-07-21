#!/usr/bin/env node
/**
 * Verifica perfiles de variante T5 + CHK-29 para Konsum×T5.
 */
import assert from 'node:assert/strict';
import { resolveT5GenerationMolds } from './lib/lesenSubtypeRotation.mjs';
import { checkStructuralMoldDuplicate, extractStructuralMold, structuralMoldKey } from './lib/structuralMoldDedup.mjs';
import { pickT5InstitutionSeed } from './lib/lesenT5InstitutionSeeds.mjs';

const corpusKantine = {
  topicTag: 'Konsum',
  _textSubtype: 'kantine',
  passages: [{ title: 'Regeln Mensa Campus', topicTag: 'Konsum' }],
  questions: [{ teil: 5 }],
};

const molds1 = resolveT5GenerationMolds({ topicTag: 'Konsum', seedEntropy: 'test-1' });
assert.notEqual(molds1.textSubtype, 'kantine', 'kantine saturado → elige otro subtipo');
assert.ok(['markthalle', 'einkaufszentrum', 'park', 'freizeitzentrum'].includes(molds1.textSubtype));

const batch1 = {
  topicTag: 'Konsum',
  _textSubtype: molds1.textSubtype,
  _t5VariantProfile: molds1.variantProfile,
  passages: [{ title: `Regeln ${molds1.institutionSeed.institutionName}`, topicTag: 'Konsum' }],
  questions: [{ teil: 5 }],
};

const chk1 = checkStructuralMoldDuplicate(batch1, [corpusKantine], { teil: 5 });
assert.equal(chk1.ok, true, `CHK-29 OK para ${molds1.textSubtype}:${molds1.variantProfile}`);

const moldsFz = resolveT5GenerationMolds({
  topicTag: 'Konsum',
  seedEntropy: 'test-fz',
  extraExcludeSubtypes: ['markthalle', 'einkaufszentrum', 'park'],
});
assert.equal(moldsFz.textSubtype, 'freizeitzentrum');

const seed2 = pickT5InstitutionSeed('freizeitzentrum', {
  entropy: 'test-2',
  topicTag: 'Konsum',
  excludeProfiles: [moldsFz.variantProfile],
});
assert.notEqual(seed2.variantProfile, moldsFz.variantProfile, 'segundo perfil distinto freizeitzentrum');

const batchFz1 = {
  topicTag: 'Konsum',
  _textSubtype: 'freizeitzentrum',
  _t5VariantProfile: moldsFz.variantProfile,
  passages: [{ title: `Regeln ${moldsFz.institutionSeed.institutionName}`, topicTag: 'Konsum' }],
  questions: [{ teil: 5 }],
};
const batchFz2 = {
  topicTag: 'Konsum',
  _textSubtype: 'freizeitzentrum',
  _t5VariantProfile: seed2.variantProfile,
  passages: [{ title: `Ordnung ${seed2.institutionName}`, topicTag: 'Konsum' }],
  questions: [{ teil: 5 }],
};

const chkFz = checkStructuralMoldDuplicate(batchFz2, [corpusKantine, batchFz1], { teil: 5 });
assert.equal(chkFz.ok, true, 'segundo perfil freizeitzentrum pasa CHK-29');

const chkFzDup = checkStructuralMoldDuplicate(
  { ...batchFz1, id: 'dup', passages: [{ title: batchFz1.passages[0].title, topicTag: 'Konsum' }] },
  [batchFz1],
  { teil: 5 },
);
assert.equal(chkFzDup.ok, false, 'mismo subtipo:perfil bloqueado');

console.log('OK  test-t5-konsum-variant-mold.mjs');
console.log(`  pick1: ${molds1.textSubtype}:${molds1.variantProfile} (${molds1.institutionSeed.institutionName})`);
console.log(`  pick2 fz: freizeitzentrum:${seed2.variantProfile} (${seed2.institutionName})`);
