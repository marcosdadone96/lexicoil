/**
 * PASO 13 P0-3/P0-4 — vocabIndex quality + canonicalize tests.
 *   node scripts/lib/__tests__/vocabIndexQuality.test.mjs
 */
import {
  qualityFilterToken,
  canonicalizeVocabQuery,
  buildVocabIndex,
  applyPartIndex,
  scorePartWordCoverage,
  buscar,
  resolveConcept,
  NEVER_INDEX,
  TYPO_OR_TRUNCATED,
} from '../vocabIndexQuality.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 1) mitmachen no genera "machen"
{
  const q = qualityFilterToken('mitmachen', { source: 'vocabularyTag' });
  assert(q.ok && q.lemma === 'mitmachen', 'mitmachen kept');
  assert(q.lemma !== 'machen', 'not machen');
  const bare = qualityFilterToken('machen', { source: 'vocabularyTag' });
  assert(!bare.ok && bare.reason === 'bare_light_verb', 'bare machen rejected');
  const fromText = buildVocabIndex(
    { questions: [{ vocabularyTags: ['mitmachen', 'machen'] }] },
    { text: 'Wir wollen mitmachen und etwas machen.', lang: 'de', level: 'B1' },
  );
  const lemmas = fromText.map((e) => e.lemma);
  assert(lemmas.includes('mitmachen'), 'index has mitmachen');
  assert(!lemmas.includes('machen'), 'index has no bare machen');
}

// 2) "verzichtet auf" encuentra "verzichten"
{
  const part = applyPartIndex(
    {
      id: 'p1',
      lang: 'de',
      level: 'B1',
      module: 'lesen',
      teil: 1,
      complete: true,
      verified: true,
      passage: { text: 'Viele Menschen verzichten auf Plastik.' },
      questions: [
        {
          id: 'q1',
          vocabularyTags: ['verzichten auf', 'Nachhaltigkeit'],
          question: 'Was machen sie?',
        },
      ],
    },
    { lang: 'de', level: 'B1', force: true },
  );
  const lemmas = part.vocabIndex.map((e) => e.lemma);
  assert(
    lemmas.some((l) => l === 'verzichten_auf' || l === 'verzichten'),
    'has verzichten family: ' + lemmas.join(','),
  );
  const hit = scorePartWordCoverage(part, ['verzichten'], { lang: 'de', literal: false });
  assert(hit.score >= 1, 'verzichten matches verzichtet/auf index');
  const hit2 = scorePartWordCoverage(part, ['verzichtet auf'], { lang: 'de', literal: false });
  assert(hit2.score >= 1, 'verzichtet auf query matches');
}

// 3) "ihren" nunca entra
{
  assert(NEVER_INDEX.has('ihren'), 'ihren in NEVER_INDEX');
  const q = qualityFilterToken('ihren', { source: 'vocabularyTag' });
  assert(!q.ok, 'ihren rejected');
  const idx = buildVocabIndex(
    { questions: [{ vocabularyTags: ['ihren', 'Naturschutz'] }] },
    { text: 'Sie schützen ihren Naturschutz.', lang: 'de', level: 'B1' },
  );
  assert(!idx.some((e) => e.lemma === 'ihren' || e.word?.toLowerCase() === 'ihren'), 'no ihren in index');
  assert(idx.some((e) => /naturschutz/i.test(e.lemma) || /naturschutz/i.test(e.word)), 'Naturschutz kept');
}

// 4) typos conocidos nunca entran
{
  for (const t of ['vergisen', 'geword', 'nießen', 'gestalt']) {
    assert(TYPO_OR_TRUNCATED.has(t) || !qualityFilterToken(t).ok, t + ' blocked');
    assert(!qualityFilterToken(t, { source: 'vocabularyTag' }).ok, t + ' not indexed');
  }
  const idx = buildVocabIndex(
    { questions: [{ vocabularyTags: ['vergisen', 'geword', 'Recycling'] }] },
    { text: 'Recycling ist wichtig.', lang: 'de', level: 'B1' },
  );
  assert(!idx.some((e) => ['vergisen', 'geword'].includes(e.lemma)), 'typos absent');
}

// 5) Anmeldung/anmelden no duplican concepto
{
  const idx = buildVocabIndex(
    { questions: [{ vocabularyTags: ['Anmeldung', 'anmelden'] }] },
    { text: 'Die Anmeldung ist online. Bitte anmelden.', lang: 'de', level: 'B1' },
  );
  const concepts = idx.map((e) => e.concept || e.lemma);
  const anmeld = concepts.filter((c) => c === 'anmelden' || c === 'anmeldung');
  assert(anmeld.length <= 1, 'single anmelden concept, got: ' + concepts.join(','));
  assert(resolveConcept('anmeldung') === 'anmelden', 'Anmeldung→anmelden concept');
}

// 6) Wochenende / Wochentag siguen separados
{
  assert(resolveConcept('wochenende') !== resolveConcept('wochentag'), 'weekend≠weekday');
  const idx = buildVocabIndex(
    { questions: [{ vocabularyTags: ['Wochenende', 'Wochentag'] }] },
    { text: 'Am Wochenende und an jedem Wochentag.', lang: 'de', level: 'B1' },
  );
  const lemmas = idx.map((e) => e.lemma);
  const hasWe = lemmas.some((l) => l.includes('wochenend'));
  const hasWt = lemmas.some((l) => l.includes('wochentag'));
  assert(hasWe && hasWt, 'both weekend and weekday present: ' + lemmas.join(','));
  assert(resolveConcept('wochenende') !== resolveConcept('wochentag'), 'concepts stay distinct');
}

// 7) Búsqueda con vocabulario seleccionado devuelve partes correctas
{
  const parts = [
    applyPartIndex(
      {
        id: 'green',
        lang: 'de',
        level: 'B1',
        module: 'lesen',
        teil: 1,
        complete: true,
        verified: true,
        sem1VerifiedAt: '2026-07-10T00:00:00.000Z',
        passage: {
          text: 'Nachhaltigkeit und Naturschutz in der Gemeinschaft. Viele verzichten auf Plastik.',
        },
        questions: [
          {
            id: 'q1',
            vocabularyTags: ['Nachhaltigkeit', 'verzichten auf', 'Gemeinschaft', 'Naturschutz'],
          },
        ],
      },
      { force: true, lang: 'de', level: 'B1' },
    ),
    applyPartIndex(
      {
        id: 'other',
        lang: 'de',
        level: 'B1',
        module: 'lesen',
        teil: 1,
        complete: true,
        verified: true,
        sem1VerifiedAt: '2026-07-10T00:00:00.000Z',
        passage: { text: 'Im Café trinken wir Kaffee und essen Kuchen.' },
        questions: [{ id: 'q1', vocabularyTags: ['Kaffee', 'Kuchen'] }],
      },
      { force: true, lang: 'de', level: 'B1' },
    ),
  ];

  const words = ['Nachhaltigkeit', 'verzichten', 'Gemeinschaft'];
  const ranked = buscar(parts, {
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    words,
    rank: true,
  });
  assert(ranked.length >= 1, 'has results');
  assert(ranked[0].id === 'green', 'green part ranks first, got ' + ranked[0]?.id);
  assert(ranked[0].exactMatches >= 2 || ranked[0].score >= 2, 'multiple matches on green');
  assert(ranked[0].coveragePct > 0, 'coverage pct set');
}

// sources + version metadata
{
  const part = applyPartIndex(
    {
      id: 'meta',
      lang: 'de',
      level: 'B1',
      module: 'lesen',
      teil: 2,
      complete: true,
      verified: true,
      passage: { text: 'Der Naturschutz ist wichtig.' },
      questions: [{ vocabularyTags: ['Naturschutz', 'Recycling'] }],
    },
    { force: true },
  );
  assert(part.vocabIndexVersion === 'v3-quality', 'version stamped');
  const ns = part.vocabIndex.find((e) => /naturschutz/i.test(e.lemma) || /naturschutz/i.test(e.word));
  assert(ns && Array.isArray(ns.sources) && ns.sources.length, 'sources present');
  assert(ns.quality === 'validated', 'quality validated');
}

// canonicalize query expansions
{
  const c = canonicalizeVocabQuery(['verzichtet', 'Verzicht auf', 'gegangen']);
  assert(c.words.includes('verzichten') || c.words.includes('verzichten_auf'), 'verzichten family in query');
  assert(c.words.includes('gehen') || c.words.includes('gegangen'), 'gehen from gegangen');
}

console.log('vocabIndexQuality tests passed.');
