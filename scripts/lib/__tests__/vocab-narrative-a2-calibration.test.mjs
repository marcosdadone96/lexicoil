/**
 * A2 Lesen T1 vocab_narrative thresholds — no API.
 * Run: node scripts/lib/__tests__/vocab-narrative-a2-calibration.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectDisconnectedVocabSentences,
  vocabNarrativeCoherenceGate,
  resolveVocabNarrativeThresholds,
  VOCAB_NARRATIVE_THRESHOLDS_B1,
  VOCAB_NARRATIVE_THRESHOLDS_A2_LESEN_T1,
} from '../vocabNarrativeCoherence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

assert.deepEqual(resolveVocabNarrativeThresholds({ level: 'A2', teil: 1, module: 'lesen' }), {
  ...VOCAB_NARRATIVE_THRESHOLDS_A2_LESEN_T1,
  profile: 'A2-lesen-t1-medientext',
});
assert.deepEqual(resolveVocabNarrativeThresholds({ level: 'B1', teil: 1, module: 'lesen' }).minShared, 2);

/** Medientext A2: target word shares 1 content token with rest — old B1 gate flagged, A2 passes. */
const medientext =
  'Die Stadt plant ein neues Projekt für Gesundheit. ' +
  'Das Krankenhaus in der Stadt bekommt mehr Platz und modernere Geräte. ' +
  'Viele Patienten freuen sich schon. Die Arbeiten beginnen im Herbst.';
const marginal = detectDisconnectedVocabSentences(medientext, ['krankenhaus'], {
  ...VOCAB_NARRATIVE_THRESHOLDS_B1,
});
const marginalA2 = detectDisconnectedVocabSentences(medientext, ['krankenhaus'], {
  ...VOCAB_NARRATIVE_THRESHOLDS_A2_LESEN_T1,
});
assert.ok(marginal.length >= 1, 'B1 thresholds still flag marginal medientext insert');
assert.equal(marginalA2.length, 0, 'A2 thresholds accept shared-token medientext');

const a2BatchOk = {
  level: 'A2',
  module: 'lesen',
  teil: 1,
  passages: [{ text: medientext, level: 'A2' }],
  questions: [{ teil: 1, level: 'A2', module: 'lesen' }],
  userVocabFeedback: { used: ['krankenhaus'] },
};
assert.equal(vocabNarrativeCoherenceGate(a2BatchOk).ok, true);

/** Truly disconnected (199-pattern) — still blocked under A2. */
const badBatch = {
  level: 'A2',
  module: 'lesen',
  teil: 1,
  passages: [{
    text:
      'Die Firma Müller in Köln hat neue Arbeitszeiten. Mitarbeiter arbeiten flexibler. ' +
      'Das Krankenhaus in der Nähe hat auch Interesse gezeigt. Sie erhielt ein Stipendium.',
    level: 'A2',
  }],
  questions: [{ teil: 1, level: 'A2', module: 'lesen' }],
  userVocabFeedback: { used: ['krankenhaus', 'stipendium'] },
};
assert.equal(vocabNarrativeCoherenceGate(badBatch).ok, false);

/** Real pool slice if present. */
const poolSample = path.join(ROOT, 'batches/ready/pool-verified/A2/lesen-t1-cur-health.json');
if (fs.existsSync(poolSample)) {
  const batch = JSON.parse(fs.readFileSync(poolSample, 'utf8'));
  batch.userVocabFeedback = { used: ['krankenhaus', 'gesundheit'] };
  const g = vocabNarrativeCoherenceGate({ ...batch, level: 'A2', module: 'lesen', teil: 1 });
  assert.equal(g.ok, true, `pool health sample should pass A2 gate: ${g.reason || ''}`);
}

console.log('vocab-narrative-a2-calibration.test.mjs: OK');
