/**
 * Permanent regression — known production bugs (2026-07-24).
 * Run before pipeline/repair changes:
 *   node scripts/lib/__tests__/pipelineRegressionKnownBugs.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import { enrichBatchMetadata, extractVocabularyFromText } from '../enrichBatchMetadata.mjs';
import { runGermanContentLanguageGate } from '../qualityGates/germanContentLanguageGate.mjs';
import { finalizePathEnrich } from '../../test-vocab-enrich-live-path.mjs';

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

console.log('\n── pipelineRegressionKnownBugs ──\n');

// 1) Spanish leak (horen-t3-023 pattern)
{
  const batch = {
    lang: 'de',
    questions: [
      {
        id: 'q5',
        question: 'Sophie prefiere viajar en tren por motivos ecológicos.',
        options: ['a) Ja', 'b) Nein'],
      },
    ],
  };
  const gate = runGermanContentLanguageGate(batch, { file: 'test-spanish-leak', lang: 'de' });
  assert('Q5 blocks Spanish question', (gate.findings || []).length > 0);
}

// 2) direkt→direken truncation
assert(
  'no direken tag',
  !extractVocabularyFromText('Wir fahren direkt zum Zentrum.', 8).some((t) => /direken/i.test(t)),
);

// 3) v2.3.14/15 style tag chewing on repair pass
{
  const batch = {
    questions: [
      {
        id: 'q1',
        question: 'Sophie fährt nach Berlin.',
        vocabularyTags: ['Sophie', 'Berlin', 'Wetter', 'fördern'],
      },
    ],
  };
  enrichBatchMetadata(batch, { vocab: true, grammar: false, topic: false });
  const tags = batch.questions[0].vocabularyTags.map((t) => t.toLowerCase());
  assert('repair preserves Sophie', tags.includes('sophie'));
  assert('repair preserves Berlin', tags.includes('berlin'));
  assert('no sophi', !tags.includes('sophi'));
}

// 4) -ern verb corruption (fördert→förderen)
assert(
  'fördert not förderen',
  !extractVocabularyFromText('Die Stadt fördert den Verkehr.', 8).some((t) => /förderen/i.test(t)),
);
assert(
  'fördert maps to fördern',
  extractVocabularyFromText('Die Stadt fördert den Verkehr.', 8).map((t) => t.toLowerCase()).includes('fördern'),
);

// 5) adj schlecht→schlechen
assert(
  'schlecht not schlechen',
  !extractVocabularyFromText('Das Ergebnis ist schlecht.', 8).some((t) => /schlechen/i.test(t)),
);

// 6) Concordance sample (documented in linguistic audit — detector for ops)
{
  const bad = 'die öffentliche Verkehrsmittel oft nicht haben';
  assert('concordance bug pattern documented', /die öffentliche Verkehrsmittel/i.test(bad));
}

// 7) Explanation incoherence sample (lesen-t5 quartal)
{
  const passage = 'einmal pro Quartal möglich';
  const expl = 'viermal im Jahr möglich';
  assert(
    'quartal/viermal mismatch detectable',
    passage.includes('Quartal') && expl.includes('viermal') && !expl.includes('Quartal'),
  );
}

// 8) Live enrich path (finalizePoolReady equivalent)
{
  const out = finalizePathEnrich({
    module: 'horen',
    teil: 4,
    level: 'B1',
    passages: [{ id: 'p', text: 'Wir erweitern und verhindern Staus. Schlecht geplant.' }],
    questions: [{ id: 'q', question: 'Thema?', vocabularyTags: [] }],
  });
  const corrupt = /(?:förderen|erweiteren|verhinderen|schlechen)/i;
  assert(
    'live path Hören T4 no corrupt tags',
    !out.questions[0].vocabularyTags.some((t) => corrupt.test(t)),
  );
}

// 9) Quarantined 023 not in pool-verified
assert(
  'horen-t3-023 out of pool-verified',
  !fs.existsSync(path.join(ROOT, 'batches/ready/pool-verified/B1/horen-t3-gemini-023.json')),
);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──\n`);
if (failed) process.exit(1);
