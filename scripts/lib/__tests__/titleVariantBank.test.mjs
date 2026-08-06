import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadPersistedCellMolds } from '../persistedCellPool.mjs';
import {
  buildT5TitleCandidates,
  pickMandatedTitle,
  checkT4TitleContentCoherence,
} from '../titleVariantBank.mjs';
import { normTitle } from '../structuralMoldDedup.mjs';
import { resolveT5GenerationMolds } from '../lesenSubtypeRotation.mjs';

describe('persistedCellPool — Konsum×T5', () => {
  it('incluye títulos de pool-verified, no solo manifest', () => {
    const manifestOnly = loadPersistedCellMolds({
      lang: 'de',
      level: 'B1',
      topicTag: 'Konsum',
      teil: 5,
    });
    const titles = manifestOnly.titles.map(normTitle);
    assert.ok(
      titles.some((t) => t.includes('einkaufszentrum') || t.includes('city galerie')),
      `falta título pool-verified einkaufszentrum: ${manifestOnly.titles.slice(0, 5).join(' | ')}`,
    );
    assert.ok(
      titles.some((t) => t.includes('wochenmarkt') || t.includes('am ring')),
      `falta título pool-verified markthalle: ${manifestOnly.titles.slice(0, 5).join(' | ')}`,
    );
    assert.ok(manifestOnly.persistedBatchCount >= 2, 'esperaba ≥2 batches persistidos Konsum T5');
  });

  it('exclusión de sesión se suma al pool persistido', () => {
    const withSession = loadPersistedCellMolds({
      topicTag: 'Konsum',
      teil: 5,
      extraExcludeTitles: ['Título de sesión único XYZ'],
    });
    assert.ok(withSession.normalizedTitles.includes(normTitle('Título de sesión único XYZ')));
  });
});

describe('titleVariantBank', () => {
  it('genera candidatos T5 distintos por institución', () => {
    const a = buildT5TitleCandidates('kantine', 'Mensa Am Campus', 'standard');
    const b = buildT5TitleCandidates('kantine', 'Betriebskantine Werk Nord', 'prepaid');
    assert.ok(a.length >= 4);
    assert.notDeepEqual(a, b);
  });

  it('pickMandatedTitle evita títulos ya usados en pool persistido', () => {
    const persisted = loadPersistedCellMolds({ topicTag: 'Konsum', teil: 5 });
    const title = pickMandatedTitle({
      teil: 5,
      textSubtype: 'markthalle',
      institutionName: 'Wochenmarkt Testplatz',
      variantProfile: 'standard',
      excludeNormalized: persisted.normalizedTitles,
      entropy: 'test-konsum-pick',
    });
    assert.ok(title.length >= 12);
    assert.ok(!persisted.normalizedTitles.includes(normTitle(title)));
  });

  it('resolveT5GenerationMolds asigna mandatedTitle con pool completo', () => {
    const molds = resolveT5GenerationMolds({
      lang: 'de',
      level: 'B1',
      topicTag: 'Konsum',
      seedEntropy: 'unit-test-konsum',
    });
    assert.ok(molds.mandatedTitle);
    assert.ok(molds.institutionSeed?.mandatedTitle === molds.mandatedTitle);
    assert.ok(molds.cellCount >= molds.persistedBatchCount);
    const nt = normTitle(molds.mandatedTitle);
    for (const used of molds.excludeMolds.titles) {
      if (normTitle(used) === nt) {
        assert.fail(`mandatedTitle colisiona con pool: ${molds.mandatedTitle}`);
      }
    }
  });
});

describe('T4 title↔content coherence', () => {
  it('acepta batch coherente con semilla', () => {
    const seed = 'In der Stadt sollen nur Autos fahren, die wenig CO2 ausstoßen.';
    const batch = {
      passages: [{
        title: 'Forum: CO2-Autos in der Stadt — ja oder nein?',
        text: `In unserer Stadt diskutieren viele: ${seed} Lesen Sie die Meinungen.`,
      }],
      _debateSeed: seed,
    };
    const chk = checkT4TitleContentCoherence(batch, seed);
    assert.equal(chk.ok, true);
  });

  it('rechaza batch desconectado de la semilla', () => {
    const seed = 'In der Stadt sollen nur Autos fahren, die wenig CO2 ausstoßen.';
    const batch = {
      passages: [{
        title: 'Forum: Handyverbot in der Schule?',
        text: 'In unserer Stadt diskutieren viele über Smartphones in Schulen.',
      }],
      _debateSeed: seed,
    };
    const chk = checkT4TitleContentCoherence(batch, seed);
    assert.equal(chk.ok, false);
  });
});
