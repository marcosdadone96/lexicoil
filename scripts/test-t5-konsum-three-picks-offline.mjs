#!/usr/bin/env node
/**
 * Simula 3 picks Konsum×T5 con perfiles ampliados y valida CHK-29 offline.
 */
import assert from 'node:assert/strict';
import { resolveT5GenerationMolds } from './lib/lesenSubtypeRotation.mjs';
import { checkStructuralMoldDuplicate } from './lib/structuralMoldDedup.mjs';
import { loadPoolRecords, filterCellRecords } from './lib/lesenSubtypeRotation.mjs';

const corpus = filterCellRecords(loadPoolRecords(), { teil: 5, topicTag: 'Konsum' }).map((r) => ({
  ...r,
  topicTag: 'Konsum',
  passages: r.passages || (r.passage ? [r.passage] : []),
  questions: r.questions || [{ teil: 5 }],
}));

const simulated = [];

for (let i = 0; i < 3; i++) {
  const extraUsedMoldKeys = simulated.map(
    (b) => `${b._textSubtype}:${b._t5VariantProfile}`,
  );
  const molds = resolveT5GenerationMolds({
    topicTag: 'Konsum',
    seedEntropy: `konsum-sim-${i}`,
    extraUsedMoldKeys,
  });
  const batch = {
    id: `sim-konsum-${i}`,
    topicTag: 'Konsum',
    _textSubtype: molds.textSubtype,
    _t5VariantProfile: molds.variantProfile,
    _t5InstitutionSeed: molds.institutionSeed.institutionName,
    passages: [{
      title: `Regeln — ${molds.institutionSeed.institutionName}`,
      topicTag: 'Konsum',
      text: `Ordnung für ${molds.institutionSeed.institutionName}. ${molds.institutionSeed.rule1} ${molds.institutionSeed.rule2}`,
    }],
    questions: [{ teil: 5, type: 'multiple_choice' }],
  };
  const chk = checkStructuralMoldDuplicate(batch, [...corpus, ...simulated], { teil: 5 });
  assert.equal(chk.ok, true, `sim ${i + 1} CHK-29: ${molds.textSubtype}:${molds.variantProfile}`);
  simulated.push(batch);
  console.log(
    `  ${i + 1}. ${molds.textSubtype}:${molds.variantProfile} · ${molds.institutionSeed.institutionName} · tier=${molds.pickTier}`,
  );
}

const keys = simulated.map((b) => `${b._textSubtype}:${b._t5VariantProfile}`);
assert.equal(new Set(keys).size, 3, '3 moldes distintos');
console.log('OK  test-t5-konsum-three-picks-offline.mjs — 3× Konsum×T5 sin colisión CHK-29');
