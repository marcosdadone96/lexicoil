/**
 * P0-5 reindex helpers — skip v3, content safety, diff metrics.
 *   node scripts/lib/__tests__/reindexVocabV3.test.mjs
 */
import {
  VOCAB_INDEX_VERSION,
  isAlreadyV3,
  reindexPartVocab,
  analyzeVocabDiff,
  contentFingerprint,
  asIndexablePart,
  verifySamplePart,
} from '../reindexVocabV3.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// already v3 → skip, no rewrite
{
  const part = {
    id: 'p-v3',
    lang: 'de',
    level: 'B1',
    passage: { text: 'Wir wollen mitmachen.' },
    questions: [{ vocabularyTags: ['mitmachen'] }],
    vocabIndex: [{ word: 'mitmachen', lemma: 'mitmachen', concept: 'mitmachen', aliases: [], sources: ['text'], quality: 'validated' }],
    vocabIndexVersion: VOCAB_INDEX_VERSION,
  };
  const fp = contentFingerprint(part);
  const r = reindexPartVocab(part, { lang: 'de', level: 'B1' });
  assert(r.skipped && r.reason === 'already_v3', 'skips already v3');
  assert(contentFingerprint(part) === fp, 'content unchanged on skip');
  assert(isAlreadyV3(part), 'isAlreadyV3 true');
}

// legacy {word} → v3 rebuild, content untouched
{
  const part = {
    id: 'p-legacy',
    lang: 'de',
    level: 'B1',
    passage: { text: 'Viele Menschen verzichten auf Plastik und wollen mitmachen. Am Wochenende.' },
    questions: [
      {
        id: 'q1',
        question: 'Was?',
        correct: 'Richtig',
        correctAnswer: 'Richtig',
        explanation: 'Text.',
        vocabularyTags: ['verzichten auf', 'machen', 'ihren', 'Anmeldung', 'anmelden', 'vergisen'],
      },
    ],
    vocabIndex: [
      { word: 'machen' },
      { word: 'ihren' },
      { word: 'vergisen' },
      { word: 'Anmeldung' },
      { word: 'anmelden' },
      { word: 'Wochenende' },
    ],
  };
  const fp = contentFingerprint(part);
  const r = reindexPartVocab(part, { lang: 'de', level: 'B1' });
  assert(!r.skipped, 'rebuilds legacy');
  assert(part.vocabIndexVersion === VOCAB_INDEX_VERSION, 'version set');
  assert(contentFingerprint(part) === fp, 'content fingerprint stable');
  assert(part.questions[0].correct === 'Richtig', 'answers untouched');
  assert(part.passage.text.includes('verzichten'), 'text untouched');
  const lemmas = part.vocabIndex.map((e) => e.lemma);
  assert(lemmas.includes('mitmachen'), 'mitmachen kept');
  assert(!lemmas.includes('machen'), 'bare machen gone');
  assert(!lemmas.includes('ihren'), 'ihren gone');
  assert(!lemmas.includes('vergisen'), 'typo gone');
  const anmeld = part.vocabIndex.filter((e) => e.concept === 'anmelden' || e.lemma === 'anmelden');
  assert(anmeld.length <= 1, 'Anmeldung/anmelden one concept');
  assert(r.diff.noiseRemoved >= 1, 'noise counted');
  assert(r.diff.typosRemoved >= 1, 'typos counted');
}

// pool-verified batch shape
{
  const data = {
    passages: [{ id: 'p1', text: 'Am Wochentag arbeite ich.', module: 'lesen', lang: 'de', level: 'B1' }],
    questions: [{ vocabularyTags: ['Wochentag'], question: 'x', correct: 'Richtig' }],
  };
  const part = asIndexablePart(data);
  const r = reindexPartVocab(part, { lang: 'de', level: 'B1' });
  assert(!r.skipped, 'batch reindexed');
  assert(data.vocabIndexVersion === VOCAB_INDEX_VERSION, 'version on batch root');
  const v = verifySamplePart(data, 'batch');
  assert(v.ok, 'verification ok: ' + JSON.stringify(v.checks.filter((c) => !c.ok)));
}

// diff metrics
{
  const d = analyzeVocabDiff(
    [{ word: 'machen' }, { word: 'vergisen' }, { word: 'Haus' }],
    [{ word: 'Haus', lemma: 'haus', concept: 'haus', aliases: [] }],
  );
  assert(d.noiseRemoved >= 1, 'noise');
  assert(d.typosRemoved >= 1, 'typo');
  assert(d.newCount === 1, 'new count');
}

console.log('reindexVocabV3.test.mjs: OK');
