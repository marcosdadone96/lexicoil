/**
 * enrichBatchMetadata vocab extractor tests (v2.3+).
 * Run: node scripts/lib/__tests__/enrichBatchMetadata.vocab.test.mjs
 */
import {
  extractVocabularyFromText,
  normalizeZuSeparable,
  VOCAB_TAGS_NORMALIZE_VERSION,
  SEPARABLE_INFINITIVES,
  separableRootsFromAllowlist,
  questionSpecificVocabBlob,
  enrichBatchMetadata,
} from '../enrichBatchMetadata.mjs';

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

function assertIncludes(desc, tags, needle) {
  const hit = tags.some(
    (t) =>
      String(t).toLowerCase() === String(needle).toLowerCase() || String(t).includes(needle),
  );
  assert(`${desc} (has «${needle}» in ${JSON.stringify(tags)})`, hit);
}

function assertExcludes(desc, tags, needle) {
  const hit = tags.some((t) => String(t).toLowerCase() === String(needle).toLowerCase());
  assert(`${desc} (no «${needle}» in ${JSON.stringify(tags)})`, !hit);
}

console.log(`\n── vocab extractor ${VOCAB_TAGS_NORMALIZE_VERSION} ──`);

assert(
  'stamp is v2.3.12+',
  String(VOCAB_TAGS_NORMALIZE_VERSION).startsWith('v2.3.12') ||
    String(VOCAB_TAGS_NORMALIZE_VERSION).startsWith('v2.3.11'),
);

assert('zu-separable auszuschalten→ausschalten', normalizeZuSeparable('auszuschalten') === 'ausschalten');
assert('zu-separable mitzumachen→mitmachen', normalizeZuSeparable('mitzumachen') === 'mitmachen');

{
  const t = extractVocabularyFromText('Geräte auszuschalten und Licht ausschalten.', 8);
  assertIncludes('zu-inf → ausschalten', t, 'ausschalten');
  assertExcludes('no auszuschalten dup', t, 'auszuschalten');
}

{
  const t = extractVocabularyFromText('in den vorgesehenen Fahrradständern', 8);
  assertExcludes('filter vorgesehenen', t, 'vorgesehenen');
  assertExcludes('filter vorgesehen', t, 'vorgesehen');
}

{
  const t = extractVocabularyFromText('Die Gartenpflanzen brauchen Wasser.', 8);
  assertIncludes('Gartenpflanze capitalized/lemmatized', t, 'Gartenpflanze');
  assertExcludes('no raw gartenpflanzen', t, 'gartenpflanzen');
}

{
  const t = extractVocabularyFromText('Alle sollen mitmachen können.', 6);
  assertIncludes('keep mitmachen', t, 'mitmachen');
}

{
  const t = extractVocabularyFromText('Bitte machen Sie mit und helfen.', 6);
  assertIncludes('split separable → mitmachen', t, 'mitmachen');
  assertExcludes('suppress bare machen', t, 'machen');
}

{
  const t = extractVocabularyFromText('Familie spielt eine wichtige Rolle im Alltag.', 6);
  assertIncludes('collocation Rolle spielen', t, 'eine Rolle spielen');
  assertExcludes('suppress bare spielen', t, 'spielen');
}

{
  const t = extractVocabularyFromText('Es geht um die Umwelt und Klima.', 6);
  assertIncludes('collocation es geht um', t, 'es geht um');
  assertExcludes('suppress bare gehen', t, 'gehen');
}

{
  const t = extractVocabularyFromText('Jedoch ist das am zweiten Tag bei bestimmten Regeln schwierig.', 8);
  assertExcludes('stop jedoch', t, 'jedoch');
  assertExcludes('stop zweiten', t, 'zweiten');
  assertExcludes('stop bestimmten', t, 'bestimmten');
}

{
  const t = extractVocabularyFromText('Das Projekt gestartet wird, um Menschen zu motivieren.', 8);
  assertExcludes('no starteen artifact', t, 'starteen');
  assertIncludes('gestartet→starten', t, 'starten');
}

// ── v2.3: exam-stem collocations (b) ──────────────────────────────────────
console.log('\n── v2.3 exam-stem / darum collocations ──');

{
  const t = extractVocabularyFromText(
    'Worum geht es hauptsächlich in diesem Vortrag? Die Herausforderungen des bewussten Konsums.',
    6,
  );
  assertExcludes('worum geht es → no gehen', t, 'gehen');
  assertExcludes('worum formula not emitted as tag', t, 'worum geht es');
  assertExcludes('full stem strip drops Vortrag boilerplate', t, 'Vortrag');
  assertExcludes('full stem strip drops hauptsächlich', t, 'hauptsächlich');
  assertIncludes('content after stem kept', t, 'Herausforderungen');
}

{
  const t = extractVocabularyFromText("Worum geht's in dem Text?", 6);
  assertExcludes("worum geht's → no gehen", t, 'gehen');
}

{
  const t = extractVocabularyFromText(
    'Es geht darum, dass jeder Bürger die Möglichkeit hat, aktiv zu sein.',
    6,
  );
  assertIncludes('es geht darum colloc', t, 'es geht darum');
  assertExcludes('darum suppresses gehen', t, 'gehen');
}

{
  const t = extractVocabularyFromText(
    'Am Ende geht es darum, einen gesunden Mittelweg zu finden.',
    6,
  );
  assertIncludes('geht es darum colloc', t, 'es geht darum');
  assertExcludes('geht es darum suppresses gehen', t, 'gehen');
}

// ── v2.3: light-verb demote (a) — fixtures from audit ─────────────────────
console.log('\n── v2.3 light-verb demote (audit fixtures) ──');

{
  // lesen-t2-gemini-057: mitmachen + Bewegung machen in same blob
  const t = extractVocabularyFromText(
    'Die Bewohner sollen mehr Bewegung machen können. Alle sollen mitmachen können. Deshalb sind die Kurse gratis. Sportzentren und Möglichkeit motivieren Bewohner.',
    6,
  );
  assertIncludes('057 keeps mitmachen', t, 'mitmachen');
  assertExcludes('057 no bare machen beside mitmachen', t, 'machen');
}

{
  // horen-t2-gemini-007 q1-style: exam stem must not yield gehen
  const t = extractVocabularyFromText(
    'Worum geht es hauptsächlich in diesem Vortrag? a) Neue Produkte auf dem Markt b) Die Geschichte des Einkaufens c) Die Herausforderungen des bewussten Konsums. Der Vortrag behandelt die Schwierigkeiten und Möglichkeiten, wie man heute bewusster und verantwortungsvoller konsumieren kann.',
    6,
  );
  assertExcludes('007-q1 no gehen from stem', t, 'gehen');
  assertIncludes('007-q1 keeps content lemma', t, 'konsumieren');
}

{
  const t = extractVocabularyFromText(
    'Sie mussten Überstunden machen und hätten vielleicht diesen Termin verschieben können. Herausforderung und Arbeitsalltag bleiben.',
    6,
  );
  assertExcludes('stop mussten', t, 'mussten');
  assertExcludes('stop vielleicht', t, 'vielleicht');
  assertExcludes('stop diesen', t, 'diesen');
  assertExcludes('stop hätten', t, 'hätten');
  assertExcludes('still demotes machen', t, 'machen');
}

{
  // Notizen machen + rich nouns → machen demoted out of top slots
  const t = extractVocabularyFromText(
    'Viele machen sich Notizen, bevor sie einkaufen gehen, um impulsiven Konsum zu vermeiden. Rückgabemöglichkeit und Herausforderung beim Online-Konsum.',
    6,
  );
  assertExcludes('rich blob demotes machen', t, 'machen');
  // gehen may still appear as filler if slots remain; prefer content
  const lower = t.map((x) => String(x).toLowerCase());
  const contentHit = lower.some((x) =>
    ['konsum', 'einkaufen', 'notizen', 'rückgabemöglichkeit', 'herausforderung', 'vermeiden'].includes(x),
  );
  assert(`rich blob prefers content over light (${JSON.stringify(t)})`, contentHit);
}

// ── v2.3.2: lexical ge- + zu-infinitive vs zumachen ───────────────────────
console.log('\n── v2.3.2 lexical ge- / zu-infinitive ──');

{
  const t = extractVocabularyFromText('Die Firma gewährleistet die Qualität der Lieferung.', 8);
  assertIncludes('gewährleistet→gewährleisten', t, 'gewährleisten');
  assertExcludes('no währleisten', t, 'währleisten');
}

{
  const t = extractVocabularyFromText('Lärm gefährdet die Gesundheit der Bewohner.', 8);
  assertIncludes('gefährdet→gefährden', t, 'gefährden');
  assertExcludes('no fährden', t, 'fährden');
}

{
  const t = extractVocabularyFromText('Sie genießt den Urlaub am Meer.', 8);
  assertIncludes('genießt→genießen', t, 'genießen');
  assertExcludes('no nießen', t, 'nießen');
}

{
  const t = extractVocabularyFromText(
    'Sie haben vor, in einer europäischen Stadt Urlaub zu machen.',
    8,
  );
  assertExcludes('zu-infinitive ≠ zumachen', t, 'zumachen');
}

{
  const t = extractVocabularyFromText('Machen Sie bitte die Tür zu.', 8);
  assertIncludes('true split zumachen', t, 'zumachen');
}
{
  const t = extractVocabularyFromText(
    'eine Sportart die Spaß macht und sich nicht zu überfordern',
    8,
  );
  assertExcludes('macht…zu+inf ≠ zumachen', t, 'zumachen');
}
{
  const t = extractVocabularyFromText(
    'Vorschläge machen und zu einer Einigung kommen',
    8,
  );
  assertExcludes('machen…zu einer ≠ zumachen', t, 'zumachen');
}
{
  const t = extractVocabularyFromText('bewusst Pausen zu machen', 8);
  assertExcludes('Pausen zu machen ≠ zumachen', t, 'zumachen');
}

// ── v2.3.3: -st / -sst / adj bewusst ─────────────────────────────────────
console.log('\n── v2.3.3 -st subtypes (irregular / sst / adj) ──');

{
  const t = extractVocabularyFromText('bewusst', 6);
  assertIncludes('bewusst stays adj', t, 'bewusst');
  assertExcludes('no bewusen', t, 'bewusen');
  assertExcludes('no bewussen', t, 'bewussen');
}
{
  const t = extractVocabularyFromText('Sie vergisst ihren Stress.', 6);
  assertIncludes('vergisst→vergessen', t, 'vergessen');
  assertExcludes('no vergisen', t, 'vergisen');
}
{
  const t = extractVocabularyFromText('Er lässt das Fenster offen.', 6);
  assertIncludes('lässt→lassen', t, 'lassen');
  assertExcludes('no läsen garbage', t, 'läsen');
}
{
  const t = extractVocabularyFromText('Der Baum wächst schnell.', 6);
  assertIncludes('wächst→wachsen', t, 'wachsen');
  assertExcludes('no wächen garbage', t, 'wächen');
}
{
  const t = extractVocabularyFromText('Sie trifft Freunde im Park.', 6);
  assertIncludes('trifft→treffen', t, 'treffen');
  assertExcludes('no trifft surface tag', t, 'trifft');
}
{
  const t = extractVocabularyFromText("Oft treffe ich auch andere Freiwillige.", 6);
  assertIncludes('treffe→treffen', t, 'treffen');
  assertExcludes('no treff garbage', t, 'treff');
}
{
  const t = extractVocabularyFromText('Er vermisst die Ruhe.', 6);
  assertIncludes('vermisst→vermissen', t, 'vermissen');
  assertExcludes('no vermisen', t, 'vermisen');
}
{
  const t = extractVocabularyFromText('Das beeinflusst die Entscheidung positiv.', 6);
  assertIncludes('beeinflusst→beeinflussen', t, 'beeinflussen');
  assertExcludes('no beeinflusen', t, 'beeinflusen');
}
{
  const t = extractVocabularyFromText('Die Ausstellung befasst sich mit Geschichte.', 6);
  assertIncludes('befasst→befassen', t, 'befassen');
  assertExcludes('no befasen', t, 'befasen');
}
{
  const t = extractVocabularyFromText('Du brauchst mehr Zeit und kommst später.', 6);
  assertIncludes('brauchst→brauchen', t, 'brauchen');
  assertIncludes('kommst→kommen', t, 'kommen');
}
{
  const t = extractVocabularyFromText('Du wohnst hier und lernst Deutsch.', 6);
  assertIncludes('wohnst→wohnen', t, 'wohnen');
  assertIncludes('lernst→lernen', t, 'lernen');
}
{
  const t = extractVocabularyFromText('Du spielst Fußball und glaubst daran.', 6);
  assertIncludes('spielst→spielen', t, 'spielen');
  assertIncludes('glaubst→glauben', t, 'glauben');
}

// ── v2.3.5: split separable allowlist + anti-prep / clause guard ──────────
console.log('\n── v2.3.5 separable split guards ──');

{
  const t = extractVocabularyFromText(
    'Lena findet die Idee mit mehr Pflanzen gut und sieht den Plan als wichtig.',
    8,
  );
  assertExcludes('prep mit + sehen ≠ mitsehen', t, 'mitsehen');
  assertExcludes('sieht … ein (article) ≠ einsehen', t, 'einsehen');
}

{
  const t = extractVocabularyFromText(
    'Was wird bezüglich der Heizung in nicht genutzten Räumen empfohlen? Sie sollte auf einer niedrigen Stufe bleiben.',
    8,
  );
  assertExcludes('Räumen + auf prep ≠ aufräumen', t, 'aufräumen');
}

{
  const t = extractVocabularyFromText(
    'Bus und Bahn nehmen oder mit dem Rad unterwegs sein.',
    8,
  );
  assertExcludes('nehmen … oder mit dem ≠ mitnehmen', t, 'mitnehmen');
}

{
  const t = extractVocabularyFromText('Bitte machen Sie mit und helfen.', 6);
  assertIncludes('genuine split mitmachen kept', t, 'mitmachen');
}

{
  const t = extractVocabularyFromText(
    'Die Familie nimmt die Abendmahlzeiten getrennt ein.',
    6,
  );
  assertIncludes('genuine split einnehmen kept', t, 'einnehmen');
}

{
  const t = extractVocabularyFromText('Ihre Familie kommt manchmal mit und hilft ihr.', 6);
  assertIncludes('genuine split mitkommen kept', t, 'mitkommen');
}

{
  const t = extractVocabularyFromText(
    'Was tun viele Unternehmen, um auf digitale Umgangsformen aufmerksam zu machen?',
    8,
  );
  assertExcludes('auf + aufmerksam zu machen ≠ aufmachen', t, 'aufmachen');
}

{
  const t = extractVocabularyFromText(
    'Viele Familien mit Kindern kommen zum Verein.',
    6,
  );
  assertExcludes('mit Kindern kommen ≠ mitkommen', t, 'mitkommen');
}

{
  const t = extractVocabularyFromText(
    'Ein typischer Kurs sieht so oder so ähnlich aus.',
    6,
  );
  assertIncludes('sieht … aus kept (oder mid-clause)', t, 'aussehen');
}

// ── v2.3.6: roots derived from SEPARABLE_INFINITIVES ──────────────────────
console.log('\n── v2.3.6 separable roots from allowlist ──');

{
  const roots = separableRootsFromAllowlist();
  assert('derived root schlagen', roots.has('schlagen'));
  assert('derived root finden', roots.has('finden'));
  assert('derived root kündigen', roots.has('kündigen'));
  assert('allowlist has ankündigen', SEPARABLE_INFINITIVES.has('ankündigen'));
}

{
  const t = extractVocabularyFromText(
    'Der Radiotipp schlägt vor, ein Picknick einzupacken und es im Park zu genießen.',
    8,
  );
  assertIncludes('schlägt vor → vorschlagen', t, 'vorschlagen');
  assertExcludes('schlägt vor ≠ bare schlagen', t, 'schlagen');
}

{
  const t = extractVocabularyFromText('Wann findet der Termin statt?', 6);
  assertIncludes('findet statt → stattfinden', t, 'stattfinden');
  assertExcludes('findet statt ≠ bare finden', t, 'finden');
}

{
  const t = extractVocabularyFromText(
    'Die Durchsage kündigt an, dass alle Gartenmöbel reduziert sind.',
    8,
  );
  assertIncludes('kündigt an → ankündigen', t, 'ankündigen');
  assertExcludes('kündigt an ≠ bare kündigen', t, 'kündigen');
}

{
  const t = extractVocabularyFromText(
    'Sie haben vor, in einer europäischen Stadt Urlaub zu machen.',
    8,
  );
  assertExcludes('zu-infinitive ≠ zumachen (still)', t, 'zumachen');
}

{
  const t = extractVocabularyFromText('Bitte machen Sie die Tür zu.', 6);
  assertIncludes('true split zumachen still works', t, 'zumachen');
}

{
  const t = extractVocabularyFromText(
    'Bus und Bahn nehmen oder mit dem Rad unterwegs sein.',
    8,
  );
  assertExcludes('nehmen … mit dem Rad ≠ mitnehmen (still)', t, 'mitnehmen');
}

{
  const t = extractVocabularyFromText(
    'Die Studentin kommt mit den Grundlagen der BWL nicht klar.',
    8,
  );
  assertExcludes('kommt mit den … klar ≠ mitkommen (still)', t, 'mitkommen');
}

// ── v2.3.9: adj/adv guards + hinterlässt ──────────────────────────────────
console.log('\n── v2.3.9 adj/adv/lässt lemma guards ──');

{
  const t = extractVocabularyFromText('Das System ist robust und sicher.', 8);
  assertIncludes('robust stays adj', t, 'robust');
  assertExcludes('no robuen', t, 'robuen');
}
{
  const t = extractVocabularyFromText('Ein Guthaben von mindestens 5 Euro ist erforderlich.', 8);
  assertIncludes('mindestens stays adverb', t, 'mindestens');
  assertExcludes('no mindesten', t, 'mindesten');
}
{
  const t = extractVocabularyFromText('Man muss den Platz sauber hinterlässt.', 8);
  assertIncludes('hinterlässt→hinterlassen', t, 'hinterlassen');
  assertExcludes('no hinterlässen', t, 'hinterlässen');
}
{
  const t = extractVocabularyFromText('Sie lässt das Fenster offen.', 6);
  assertIncludes('lässt→lassen (still)', t, 'lassen');
  assertExcludes('no läsen', t, 'läsen');
}
{
  const t = extractVocabularyFromText('Er vermisst die Ruhe.', 6);
  assertIncludes('vermisst→vermissen still', t, 'vermissen');
}

// ── v2.3.10 R7: explanation excluded from vocab blob ──────────────────────
console.log('\n── v2.3.10 R7 no-explanation vocab blob ──');
{
  const q = {
    question: 'Ben fühlt sich überfordert.',
    explanation:
      'Ben sagt: "Ich bin gestresst." Dies zeigt, dass er sich überfordert fühlt und der Aussage widerspricht; das bedeutet, dass Kaffee entspricht nicht der Lösung.',
    options: [],
    type: 'richtig_falsch',
  };
  const blob = questionSpecificVocabBlob(q, null);
  assert('blob omits explanation meta', !/zeigt|widerspricht|bedeutet|entspricht/i.test(blob));
  assert('blob keeps question content', /überfordert/i.test(blob));
  const tags = extractVocabularyFromText(blob, 8).map((t) => String(t).toLowerCase());
  assertExcludes('no zeigt from explanation', tags, 'zeigen');
  assertExcludes('no zeigt surface', tags, 'zeigt');
  assertExcludes('no widerspricht', tags, 'widersprechen');
  assertExcludes('no widerspricht surface', tags, 'widerspricht');
  assertExcludes('no bedeutet', tags, 'bedeuten');
  assertExcludes('no bedeutet surface', tags, 'bedeutet');
}
{
  const { batch: out } = enrichBatchMetadata(
    {
      questions: [
        {
          type: 'richtig_falsch',
          question: 'Anna will die Momente dokumentieren.',
          explanation:
            "Anna sagt: 'Ich finde es wichtig', was bedeutet, dass sie diese Momente festhalten möchte.",
          correct: 'Richtig',
          options: [],
        },
      ],
    },
    { topic: false, grammar: false, vocab: true, forceVocab: true },
  );
  const tags = (out.questions[0].vocabularyTags || []).map((t) => String(t).toLowerCase());
  assertExcludes('enrich forceVocab: no bedeutet', tags, 'bedeutet');
  assertExcludes('enrich forceVocab: no bedeuten from expl', tags, 'bedeuten');
}

// ── v2.3.11: ge- participle strip before blind -t→-en ─────────────────────
console.log('\n── v2.3.11 ge-participle (gezeigt→zeigen) ──');
{
  const t = extractVocabularyFromText('Die Kinder haben eine Aufführung gezeigt.', 8);
  assertIncludes('gezeigt→zeigen', t, 'zeigen');
  assertExcludes('no gezeigen garbage', t, 'gezeigen');
}
{
  const t = extractVocabularyFromText('Sie haben das Fenster gekippt.', 6);
  assertIncludes('gekippt→kippen', t, 'kippen');
  assertExcludes('no gekippen', t, 'gekippen');
}
{
  const t = extractVocabularyFromText('Die Firma gewährleistet die Qualität.', 6);
  assertIncludes('gewährleistet stays lexical', t, 'gewährleisten');
  assertExcludes('no währleisten', t, 'währleisten');
}
{
  const t = extractVocabularyFromText('Lärm gefährdet die Gesundheit der Bewohner.', 8);
  assertIncludes('gefährdet→gefährden', t, 'gefährden');
  assertExcludes('no fährden', t, 'fährden');
}
{
  const t = extractVocabularyFromText('Sie genießt den Urlaub.', 6);
  assertIncludes('genießt→genießen', t, 'genießen');
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
