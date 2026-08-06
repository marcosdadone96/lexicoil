/**
 * contentTopicCheck — Hören topicTag vs contenido.
 * Incluye caso t1-009 s4: tag Wohnen erróneo en tip de estrés (debe mismatch);
 * con Gesundheit + extras léxicos (Stress/Belastung) debe pasar.
 * También: Familie/Arbeit lexicon gaps + Laden noun-vs-verb.
 */
import assert from 'node:assert/strict';
import { checkPassageContentTopic, scorePassageTopics } from '../qualityGates/contentTopicCheck.mjs';

const S4_STRESS_TIP = {
  id: 'gen-p-h1-008a6e44-s4',
  title: 'Radio-Kurzgespräch',
  text:
    'Herzlich willkommen zu unserem Gesundheits-Tipp. Heute sprechen wir über Stress. ' +
    'Es ist wichtig, achtsam mit sich selbst umzugehen. Manchmal ist der Umgang mit Stress komplex, ' +
    'aber einfache Schritte können helfen. Zum Beispiel: Fünf Minuten tief atmen. ' +
    'Oder sprechen Sie mit einem Freund. Man sollte lernen, mit Belastungen umzugehen, bevor es zu viel wird.',
};

console.log('── contentTopicCheck Hören t1-009 s4 ──');

{
  const wrong = checkPassageContentTopic({ ...S4_STRESS_TIP, topicTag: 'Wohnen' });
  assert.equal(wrong.mismatch, true, 'Wohnen on stress tip → mismatch');
  assert.ok(
    wrong.reason === 'topic_mismatch' || wrong.reason === 'tag_unsupported',
    `expected topic_mismatch/tag_unsupported, got ${wrong.reason}`,
  );
  const scored = scorePassageTopics(S4_STRESS_TIP, 'Wohnen');
  assert.equal(scored.tagScore, 0, 'Wohnen must have 0 lexical hits on stress tip');
  console.log('  ✓ Wohnen → mismatch (tagScore=0); detector catches wrong tag');
}

{
  const ok = checkPassageContentTopic({ ...S4_STRESS_TIP, topicTag: 'Gesundheit' });
  assert.equal(ok.mismatch, false, 'Gesundheit on stress tip → ok');
  const scored = scorePassageTopics(S4_STRESS_TIP, 'Gesundheit');
  assert.ok(scored.tagScore >= 1, `Gesundheit tagScore expected ≥1, got ${scored.tagScore}`);
  console.log(`  ✓ Gesundheit → ok (tagScore=${scored.tagScore}, best=${scored.best})`);
}

console.log('\n── Laden noun vs verb ──');
{
  const invite = {
    id: 'test-laden-verb',
    title: 'Einladung',
    text: 'Wir laden Sie herzlich ein zu unserem Jährlichen Familienfest im Stadtpark.',
    topicTag: 'Familie',
  };
  const scored = scorePassageTopics(invite, 'Familie');
  assert.ok(!scored.scores.Konsum, `verb laden must not score Konsum; got ${JSON.stringify(scored.scores)}`);
  console.log('  ✓ «Wir laden Sie herzlich ein…» → no Konsum hit', scored.scores);

  const imperative = {
    id: 'test-laden-imperative',
    title: 'Einladung',
    text: 'Laden Sie Ihre Familie herzlich ein.',
    topicTag: 'Familie',
  };
  const impScored = scorePassageTopics(imperative, 'Familie');
  assert.ok(
    !impScored.scores.Konsum,
    `imperative Laden Sie must not score Konsum; got ${JSON.stringify(impScored.scores)}`,
  );
  console.log('  ✓ «Laden Sie Ihre Familie herzlich ein.» → no Konsum hit', impScored.scores);

  const imperativeMid = scorePassageTopics(
    { title: 'Hinweis', text: 'Willkommen. Laden Sie bitte Ihre Freunde ein.' },
    'Familie',
  );
  assert.ok(!imperativeMid.scores.Konsum, `mid-passage Laden Sie must not score Konsum`);
  console.log('  ✓ «… Laden Sie bitte …» → no Konsum hit');

  const shop = {
    id: 'test-laden-noun',
    title: 'Einkauf',
    text: 'Der Laden ist heute bis 20 Uhr geöffnet. Bitte kommen Sie in den Laden.',
    topicTag: 'Konsum',
  };
  const shopScored = scorePassageTopics(shop, 'Konsum');
  assert.ok(
    (shopScored.scores.Konsum || 0) >= 1,
    `noun Laden must score Konsum; got ${JSON.stringify(shopScored.scores)}`,
  );
  console.log('  ✓ «Der Laden…» → Konsum hit', shopScored.scores);

  const shopSentenceStart = scorePassageTopics(
    { title: 'Hinweis', text: 'Achtung. Laden und Café sind geschlossen.' },
    'Konsum',
  );
  assert.ok(
    (shopSentenceStart.scores.Konsum || 0) >= 1,
    `sentence-initial noun Laden (not +Sie) must still hit; got ${JSON.stringify(shopSentenceStart.scores)}`,
  );
  console.log('  ✓ «Laden und Café…» → Konsum hit', shopSentenceStart.scores);
}

console.log('\n── Familie / Arbeit lexicon ──');
{
  const fam = scorePassageTopics(
    { title: 'Fest', text: 'Die ganze Familie und viele Familien kommen zusammen.' },
    'Familie',
  );
  assert.ok(fam.tagScore >= 1, `Familie/Familien must hit; got tagScore=${fam.tagScore}`);
  console.log(`  ✓ Familie/Familien → tagScore=${fam.tagScore}`);

  const work = scorePassageTopics(
    { title: 'Tipp', text: 'Viele Arbeitnehmer planen eine Weiterbildung.' },
    'Arbeit',
  );
  assert.ok(work.tagScore >= 2, `Arbeitnehmer+Weiterbildung expected ≥2, got ${work.tagScore}`);
  console.log(`  ✓ Arbeitnehmer+Weiterbildung → tagScore=${work.tagScore}`);
}

console.log('\ncontentTopicCheck t1-009 s4 tests passed.');
