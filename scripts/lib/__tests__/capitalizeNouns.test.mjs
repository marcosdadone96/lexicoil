/**
 * capitalizeNouns.test.mjs — conservative German caps normalizer.
 * Run: node scripts/lib/__tests__/capitalizeNouns.test.mjs
 */
import {
  capitalizeNounsInText,
  decapitalizeMidSentence,
  normalizeGermanCapsInText,
  fixZuInfinitiveCapitals,
} from '../capitalizeNouns.mjs';

let passed = 0;
let failed = 0;

function assertEq(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function fullNorm(text) {
  return normalizeGermanCapsInText(text).result;
}

function assertChanges(desc, text, expectSubstring) {
  const { result } = decapitalizeMidSentence(text);
  if (result.includes(expectSubstring)) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected substring ${JSON.stringify(expectSubstring)} in ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log('\n── v3.0-stable: Iter3 corpus (decap no debe romper) ──');

assertEq(
  'iter3: zum Alter intact',
  decapitalizeMidSentence('dass die Inhalte zum Alter der Kinder passen.').result,
  'dass die Inhalte zum Alter der Kinder passen.',
);

assertEq(
  'iter3: es gibt Sorgen intact',
  decapitalizeMidSentence('Trotz der Vorteile gibt es auch Sorgen, zum Beispiel wegen der Kosten.').result,
  'Trotz der Vorteile gibt es auch Sorgen, zum Beispiel wegen der Kosten.',
);

assertEq(
  'iter3: Man kann Kosten für intact',
  decapitalizeMidSentence('Man kann Kosten für Miete oder Instandhaltung teilen.').result,
  'Man kann Kosten für Miete oder Instandhaltung teilen.',
);

assertChanges(
  'iter3: Ganzen Tag still decaps',
  'Man kann dort den Ganzen Tag kostenlos arbeiten.',
  'den ganzen Tag',
);

console.log('\n── Fase 0: frases correctas (deben quedar intactas) ──');

assertEq(
  'zahlen/Gebühr intact',
  fullNorm('Kinder und Jugendliche bis 18 Jahre zahlen keine Gebühr.'),
  'Kinder und Jugendliche bis 18 Jahre zahlen keine Gebühr.',
);

assertEq(
  'ganzen Tag / arbeiten intact',
  fullNorm('Man kann dort den ganzen Tag kostenlos arbeiten.'),
  'Man kann dort den ganzen Tag kostenlos arbeiten.',
);

assertEq(
  'Kosten/verursachen intact',
  fullNorm('Vorsätzliche Beschädigung kann Kosten für die Familie verursachen.'),
  'Vorsätzliche Beschädigung kann Kosten für die Familie verursachen.',
);

assertEq(
  'bessere Fahrradwege intact',
  fullNorm('Die Stadt sollte in bessere Fahrradwege investieren.'),
  'Die Stadt sollte in bessere Fahrradwege investieren.',
);

assertEq(
  'control Zahlen/Kosten intact',
  fullNorm('Die Zahlen sind gut und die Kosten sind niedrig.'),
  'Die Zahlen sind gut und die Kosten sind niedrig.',
);

assertEq(
  'control Wissen/Kochen intact',
  fullNorm('Das Wissen ist wichtig und gesundes Kochen macht Spaß.'),
  'Das Wissen ist wichtig und gesundes Kochen macht Spaß.',
);

console.log('\n── Fase 0: errores Gemini (solo reglas seguras) ──');

assertEq(
  'kann + Oft (adverbio homógrafo)',
  fullNorm('Sie kann Oft nicht kommen.'),
  'Sie kann oft nicht kommen.',
);

assertEq(
  'Jahre Zahlen → zahlen (V2 REAL, verb_census PROSE)',
  fullNorm('Jugendliche bis 18 Jahre Zahlen keine Gebühr.'),
  'Jugendliche bis 18 Jahre zahlen keine Gebühr.',
);

assertEq(
  'Ganzen Tag decap (v3 stable); Arbeiten → gate POS',
  fullNorm('Man kann dort den Ganzen Tag kostenlos Arbeiten.'),
  'Man kann dort den ganzen Tag kostenlos Arbeiten.',
);

console.log('\n── Phase 1: decap + cap no revierte Art+Adj+N ──');

assertEq(
  'pipe: ein wichtiger Schritt',
  fullNorm('Es ist ein Wichtiger Schritt für die Stadt.'),
  'Es ist ein wichtiger Schritt für die Stadt.',
);

assertEq(
  'pipe: eine wichtige Rolle',
  fullNorm('Gemeinsame Mahlzeiten spielen eine Wichtige Rolle.'),
  'Gemeinsame Mahlzeiten spielen eine wichtige Rolle.',
);

assertEq(
  'pipe: ein wichtiger Bestandteil',
  fullNorm('Das ist ein Wichtiger Bestandteil der Planung.'),
  'Das ist ein wichtiger Bestandteil der Planung.',
);

assertEq(
  'pipe: das nächste Fest',
  fullNorm('Die Organisatoren planen das Nächste Fest im Herbst.'),
  'Die Organisatoren planen das nächste Fest im Herbst.',
);

assertEq(
  'pipe: in den letzten Jahren',
  fullNorm('Ein Bericht zeigt, dass in den Letzten fünf Jahren die Zahl gestiegen ist.'),
  'Ein Bericht zeigt, dass in den letzten fünf Jahren die Zahl gestiegen ist.',
);

assertEq(
  'pipe: die kleine Emma',
  fullNorm('Die Kleine Emma soll ein Tasteninstrument erlernen.'),
  'Die kleine Emma soll ein Tasteninstrument erlernen.',
);

console.log('\n── Phase 1: sustantivaciones reales (no regresión cap) ──');

assertEq(
  'cap only: etwas Wichtiges unchanged',
  capitalizeNounsInText('Manchmal kaufe ich etwas Wichtiges.').result,
  'Manchmal kaufe ich etwas Wichtiges.',
);

assertEq(
  'Phase1 indef: etwas gutes → Gutes',
  capitalizeNounsInText('Jeder kann etwas gutes tun.').result,
  'Jeder kann etwas Gutes tun.',
);
assertEq(
  'Phase1 indef: etwas neues → Neues',
  capitalizeNounsInText('Ich lerne jeden Tag etwas neues.').result,
  'Ich lerne jeden Tag etwas Neues.',
);
assertEq(
  'Phase1 indef: alles mögliche → Mögliche',
  capitalizeNounsInText('Wir sprechen über alles mögliche.').result,
  'Wir sprechen über alles Mögliche.',
);
assertEq(
  'Phase1 indef: nichts sagen unchanged (verb)',
  capitalizeNounsInText('Ich will nichts sagen.').result,
  'Ich will nichts sagen.',
);
assertEq(
  'Phase1 indef: etwas anderes unchanged',
  capitalizeNounsInText('Konzentriere dich auf etwas anderes.').result,
  'Konzentriere dich auf etwas anderes.',
);
assertEq(
  'Phase1 indef: etwas unsicher unchanged (degree adverb)',
  capitalizeNounsInText('Am Anfang war ich etwas unsicher.').result,
  'Am Anfang war ich etwas unsicher.',
);
assertEq(
  'Phase1 indef: viel besser unchanged (Phase 2 out of scope)',
  capitalizeNounsInText('Ich fühle mich viel besser.').result,
  'Ich fühle mich viel besser.',
);

assertEq(
  'cap only: die Kleinen unchanged',
  capitalizeNounsInText('Wir müssen die Kleinen schützen.').result,
  'Wir müssen die Kleinen schützen.',
);

assertEq(
  'cap only: das Letzte unchanged',
  capitalizeNounsInText('Er erinnert sich an das Letzte Gespräch.').result,
  'Er erinnert sich an das Letzte Gespräch.',
);

assertEq(
  'cap only: zum Alter unchanged',
  capitalizeNounsInText('Die Inhalte passen zum Alter der Kinder.').result,
  'Die Inhalte passen zum Alter der Kinder.',
);

console.log('\n── UP seguro: artículo + sustantivo en minúscula ──');

{
  const { result } = capitalizeNounsInText('ich gehe in den garten mit meiner freundin');
  assertEq('garten → Garten', result.includes('Garten'), true);
  assertEq('freundin → Freundin', result.includes('Freundin'), true);
}

{
  const { result } = capitalizeNounsInText('der große hund läuft durch den garten');
  assertEq('große stays lowercase', result.includes('große'), true);
  assertEq('garten → Garten', result.includes('Garten'), true);
}

console.log('\n── DOWN seguro: zu + infinitivo ──');

{
  const { result } = decapitalizeMidSentence('Ich plane, einen Kurs zu Besuchen, und bleibe zu Hause.');
  assertEq('zu Besuchen → zu besuchen', /zu besuchen/i.test(result), true);
  assertEq('zu Hause unchanged', result.includes('zu Hause'), true);
}

{
  const { result } = fixZuInfinitiveCapitals('Museen zu Besuchen und neue Küchen zu probieren.');
  assertEq('069: zu Besuchen', /zu besuchen/i.test(result), true);
}

console.log('\n── Audit 2026-07-09: im/am freien (idiom) ──');

assertEq(
  'im freien spielen → im Freien spielen',
  fullNorm('Kinder dürfen im freien spielen.'),
  'Kinder dürfen im Freien spielen.',
);

assertEq(
  'im freien zu übernachten → im Freien zu übernachten',
  fullNorm('Man darf im freien zu übernachten.'),
  'Man darf im Freien zu übernachten.',
);

assertEq(
  'im Freien zu verbringen (already capped) intact',
  fullNorm('Sie möchte mehr Zeit im Freien zu verbringen.'),
  'Sie möchte mehr Zeit im Freien zu verbringen.',
);

assertEq(
  'Aktivitäten im freien (phrase end)',
  fullNorm('Aktivitäten im freien.'),
  'Aktivitäten im Freien.',
);

assertEq(
  'in freien Momenten (adj + noun) untouched',
  fullNorm('In freien Momenten ruht die Stadt.'),
  'In freien Momenten ruht die Stadt.',
);

assertEq(
  'der freie Tag (adj) untouched',
  fullNorm('Es ist der freie Tag für alle.'),
  'Es ist der freie Tag für alle.',
);

console.log('\n── Audit 2026-07-09: ein paar (quantifier) ──');

assertEq(
  'ein Paar Monate → ein paar Monate',
  fullNorm('Nach ein Paar Monaten kehrt er zurück.'),
  'Nach ein paar Monaten kehrt er zurück.',
);

assertEq(
  'ein Paar Wochen → ein paar Wochen',
  fullNorm('In ein Paar Wochen beginnt der Kurs.'),
  'In ein paar Wochen beginnt der Kurs.',
);

assertEq(
  'ein Paar Schuhe (genuine pair) unchanged',
  fullNorm('Sie kauft ein Paar Schuhe im Laden.'),
  'Sie kauft ein Paar Schuhe im Laden.',
);

assertEq(
  'Ein Paar möchte (couple subject) unchanged',
  fullNorm('Ein Paar möchte zu lateinamerikanischer Musik tanzen lernen.'),
  'Ein Paar möchte zu lateinamerikanischer Musik tanzen lernen.',
);

console.log('\n── Wave 2 guards 2026-07-09: ganz / beruflich / Reisen ──');

assertEq(
  't1-181: das Ganz anders → das ganz anders',
  fullNorm('Heute ist das Ganz anders.'),
  'Heute ist das ganz anders.',
);

assertEq(
  't1-182: zukünftige reisen (question) → zukünftige Reisen',
  fullNorm('Für zukünftige reisen möchte sie nur noch zur reinen Erholung unterwegs sein.'),
  'Für zukünftige Reisen möchte sie nur noch zur reinen Erholung unterwegs sein.',
);

assertEq(
  't2-097: ihre Beruflichen Aufgaben → beruflichen',
  fullNorm('Viele Eltern möchten mehr Zeit mit ihren Kindern verbringen und gleichzeitig ihre Beruflichen Aufgaben erfüllen.'),
  'Viele Eltern möchten mehr Zeit mit ihren Kindern verbringen und gleichzeitig ihre beruflichen Aufgaben erfüllen.',
);

assertEq(
  'wir reisen (verb) unchanged',
  fullNorm('Im Sommer reisen wir oft nach Italien.'),
  'Im Sommer reisen wir oft nach Italien.',
);

console.log('\n── Wave 2a homograph whitelist (audit 2026-07-09) ──');

assertEq(
  'kosten nominal after adj+modal',
  fullNorm('Für zukünftige kosten möchte sie sparen.'),
  'Für zukünftige Kosten möchte sie sparen.',
);

assertEq(
  'fragen nominal after adj+modal',
  fullNorm('Für persönliche fragen möchte sie Antworten.'),
  'Für persönliche Fragen möchte sie Antworten.',
);

assertEq(
  'treffen nominal after adj+modal',
  fullNorm('Für wichtige treffen möchte sie vorbereiten.'),
  'Für wichtige Treffen möchte sie vorbereiten.',
);

assertEq(
  'berichten verb after adj+modal — no false cap',
  fullNorm('Für wichtige berichten möchte sie mehr Zeit haben.'),
  'Für wichtige berichten möchte sie mehr Zeit haben.',
);

assertEq(
  'raten verb after adj+modal — no false cap',
  fullNorm('Für gute raten möchte sie mehr Zeit haben.'),
  'Für gute raten möchte sie mehr Zeit haben.',
);

assertEq(
  'verursachen verb after adj+modal — no false cap',
  fullNorm('Für neue verursachen möchte sie mehr Zeit haben.'),
  'Für neue verursachen möchte sie mehr Zeit haben.',
);

assertEq(
  'fahren infinitive after adj+modal — no cap (not in whitelist / lexicon)',
  fullNorm('Für lange fahren möchte sie üben.'),
  'Für lange fahren möchte sie üben.',
);

console.log('\n── G2 mini-ronda wave 2a (2026-07-09) ──');

assertEq(
  't1-180: Manchmal besuchen wir (verb intact)',
  fullNorm('Solche Erlebnisse stärken unsere Gemeinschaft. Manchmal besuchen wir auch meine Eltern.'),
  'Solche Erlebnisse stärken unsere Gemeinschaft. Manchmal besuchen wir auch meine Eltern.',
);

assertEq(
  't1-180: erroneous Besuchen → besuchen',
  fullNorm('Manchmal Besuchen wir auch meine Eltern.'),
  'Manchmal besuchen wir auch meine Eltern.',
);

assertEq(
  't2-094: Familien object noun intact',
  fullNorm('Was empfehlen Experten Familien bezüglich der Nutzung sozialer Medien?'),
  'Was empfehlen Experten Familien bezüglich der Nutzung sozialer Medien?',
);

assertEq(
  't2-094: sofort löschen (infinitive intact)',
  fullNorm('c) Sie sollten alle Fotos von Kindern sofort löschen.'),
  'c) Sie sollten alle Fotos von Kindern sofort löschen.',
);

assertEq(
  't2-094: öffentlich machen (infinitive intact)',
  fullNorm('c) Man sollte keine persönlichen Informationen öffentlich machen sollte.'),
  'c) Man sollte keine persönlichen Informationen öffentlich machen sollte.',
);

assertEq(
  't2-095: nehmen teil (particle intact)',
  fullNorm('Schon über 80 Personen nehmen regelmäßig teil. Die Stadt plant'),
  'Schon über 80 Personen nehmen regelmäßig teil. Die Stadt plant',
);

assertEq(
  't2-095: die Verantwortlichen für (substantivized adj)',
  fullNorm('Was planen die verantwortlichen für die Zukunft des Programms?'),
  'Was planen die Verantwortlichen für die Zukunft des Programms?',
);

assertEq(
  't2-097: Radfahren nominalized infinitive intact',
  fullNorm('c) Unternehmungen draußen, wie zum Beispiel Radfahren oder Parkbesuche.'),
  'c) Unternehmungen draußen, wie zum Beispiel Radfahren oder Parkbesuche.',
);

assertEq(
  't4-039: einen zusätzlichen Gratis-Sonntag',
  fullNorm(', und hält einen Zusätzlichen Gratis-Sonntag für unnötig.'),
  ', und hält einen zusätzlichen Gratis-Sonntag für unnötig.',
);

assertEq(
  't4-042: mitmachen (infinitive intact)',
  fullNorm('wenn alle mitmachen.'),
  'wenn alle mitmachen.',
);

assertEq(
  't5-068: Fünfundvierzig Euro (currency noun intact)',
  fullNorm('c) Fünfundvierzig Euro.'),
  'c) Fünfundvierzig Euro.',
);

assertEq(
  't5-069: online gebucht (adverb intact)',
  fullNorm('Viele Kurse, wie Yoga oder Aqua-Fitness, können online gebucht werden. Eine Anmeldung'),
  'Viele Kurse, wie Yoga oder Aqua-Fitness, können online gebucht werden. Eine Anmeldung',
);

assertEq(
  't5-069: erroneous Online → online',
  fullNorm('können Online gebucht werden. Eine'),
  'können online gebucht werden. Eine',
);

console.log('\n── verb_census PROSE V2 guard (2026-07-09) ──');

const REAL_CASES = [
  ['Wir Essen oft zusammen', 'Wir essen oft zusammen'],
  ['Nur die Kinder Essen allein.', 'Nur die Kinder essen allein.'],
  ['Zusammen Essen und sich austauschen.', 'Zusammen essen und sich austauschen.'],
  ['Viele Familien Wissen, dass gesunde', 'Viele Familien wissen, dass gesunde'],
  ['Obst und Gemüse Essen und lieber', 'Obst und Gemüse essen und lieber'],
  ['wenn sie frisch Kochen. Die', 'wenn sie frisch kochen. Die'],
  ['was sie Essen. Ein Bericht', 'was sie essen. Ein Bericht'],
  ['junge Leute Gärtnern als Hobby', 'junge Leute gärtnern als Hobby'],
  ['a) Sie Besuchen zusätzliche Online-Kurse.', 'a) Sie besuchen zusätzliche Online-Kurse.'],
  ['Viele Menschen Wissen nicht genau', 'Viele Menschen wissen nicht genau'],
  ['Parks Besuchen. Sie nutzen', 'Parks besuchen. Sie nutzen'],
  ['Lokale Zeitungen Spielen weiterhin', 'Lokale Zeitungen spielen weiterhin'],
  ['Sie Berichten über Ereignisse', 'Sie berichten über Ereignisse'],
  ['Die Redaktionen Arbeiten daran', 'Die Redaktionen arbeiten daran'],
  ['Sie Folgen dort ihren', 'Sie folgen dort ihren'],
  ['Einige Experten Glauben, dass', 'Einige Experten glauben, dass'],
  ['b) Sie Stellen die gedruckten', 'b) Sie stellen die gedruckten'],
  ['Was Raten einige Spezialisten', 'Was raten einige Spezialisten'],
  ['Am Wochenende Unternehmen wir oft', 'Am Wochenende unternehmen wir oft'],
  ['Bitte Waschen Sie Ihre Hände', 'Bitte waschen Sie Ihre Hände'],
  ['bis 18 Jahre Zahlen keine Gebühr', 'bis 18 Jahre zahlen keine Gebühr'],
];

for (const [input, expected] of REAL_CASES) {
  assertEq(`REAL: ${input.slice(0, 40)}…`, fullNorm(input), expected);
}

const FP_CONTROLS = [
  'alten Dächern pflanzen Nachbarn Gemüse und Obst.',
  'dass besonders junge Menschen Interesse an Smart-Home-Lösungen haben.',
  'ist, dass man Kosten für Miete oder Instandhaltung teilen.',
  'a) Ausschließlich Kurse für das Kochen.',
  'c) Nur Kurse für Sport und Fitness',
  'Viele Menschen suchen Familien und Freunde Erholung draußen.',
  'dass nicht alle Lernenden Zugang zu Internet oder passenden',
  'Aktion, indem sie Sammelboxen in öffentlichen Gebäuden aufstellen',
  'b) Nur Musikkonzerte für ein ausgewähltes Publikum',
  'Arbeitsplatz, zum Beispiel Bewerbungsgespräche, in Rollenspielen geübt',
  'das Gefühl der Gemeinschaft Stärken. Die Zeitungen',
  'Jugendliche und junge Erwachsene Nachrichten oft über Instagram,',
  'Was empfehlen Experten Familien bezüglich der Nutzung sozialer',
  'c) Unternehmungen draußen, wie zum Beispiel Radfahren oder Parkbesuche.',
  'Plan, weil sie Teamarbeit und die Organisation im',
  'Schlüssel: 15 Euro Gebühr.',
  'Jugendliche bis 18 Jahre zahlen keine Gebühr.',
  'Kinder dabei nicht nur Wissen sammeln, sondern auch',
  ', dass Anwohner selbst Pflanzen anbauen können.',
  'und Wassersparen:\n    Schalten Sie das Licht aus',
];

for (const text of FP_CONTROLS) {
  assertEq(`FP intact: ${text.slice(0, 36)}…`, fullNorm(text), text);
}

console.log('\n── Wave Hören-T2 2026-07-10: adj/participle guards ──');

const HOREN_T2_DECAP = [
  ['eine Größere Vielfalt', 'eine größere Vielfalt'],
  ['unser Täglichen Leben', 'unser täglichen Leben'],
  ['oft darüber Gesprochen wird', 'oft darüber gesprochen wird'],
  ['die Angebotenen Lehrgänge', 'die angebotenen Lehrgänge'],
  ['eine Breite Palette', 'eine breite Palette'],
  ['das Kontinuierliche Lernen', 'das kontinuierliche Lernen'],
  ['das Zentrale Thema', 'das zentrale Thema'],
  ["das Sogenannte 'Tiny House'-Konzept", "das sogenannte 'Tiny House'-Konzept"],
  ['Ich Glaube fest, ein gesunder Lebensstil', 'Ich glaube fest, ein gesunder Lebensstil'],
  [
    'oft von „Fake News“ Gesprochen wird',
    'oft von „Fake News“ gesprochen wird',
  ],
  ['Sie an der Zentrale abgeben', 'Sie an der Zentrale abgeben'],
  ['das Zentrale Thema', 'das zentrale Thema'],
  ['die Rechtlichen Aspekte', 'die rechtlichen Aspekte'],
  ['Was ist das Hauptthema des heutigen Abends?', 'Was ist das Hauptthema des heutigen Abends?'],
  ['auf die Kleinen aufpassen', 'auf die Kleinen aufpassen'],
  ['nicht mehr das Richtige für mich', 'nicht mehr das Richtige für mich'],
  ['eine Autofreie Innenstadt', 'eine autofreie Innenstadt'],
  ['Dem Stimme ich zu.', 'Dem stimme ich zu.'],
  ['die Stimme der Vernunft', 'die Stimme der Vernunft'],
];

for (const [input, expected] of HOREN_T2_DECAP) {
  assertEq(`horen-t2: ${input.slice(0, 36)}…`, decapitalizeMidSentence(input).result, expected);
}

assertEq(
  'pipe: Dem stimme ich (no re-cap as noun)',
  fullNorm('Dem Stimme ich zu. Die Stimme der Vernunft zählt.'),
  'Dem stimme ich zu. Die Stimme der Vernunft zählt.',
);

console.log('\n── CARDINALS_NEEDS_ARTICLE_GUARD (2026-07-10) ──');

assertEq(
  'cardinal after ordinal: die ersten Drei Monate',
  decapitalizeMidSentence('Werden Sie jetzt Mitglied und trainieren Sie die ersten Drei Monate gratis!').result,
  'Werden Sie jetzt Mitglied und trainieren Sie die ersten drei Monate gratis!',
);

assertEq(
  'cardinal after adverb: voraussichtlich Vier Wochen',
  decapitalizeMidSentence('Die Arbeiten beginnen am 20. Juli und dauern voraussichtlich Vier Wochen.').result,
  'Die Arbeiten beginnen am 20. Juli und dauern voraussichtlich vier Wochen.',
);

assertEq(
  'cardinal after article + noun: die Drei Monate',
  decapitalizeMidSentence('Sie trainieren die Drei Monate gratis.').result,
  'Sie trainieren die drei Monate gratis.',
);

assertEq(
  'cardinal sentence-initial intact',
  decapitalizeMidSentence('Drei Monate gratis für Neukunden.').result,
  'Drei Monate gratis für Neukunden.',
);

console.log('\n── Wave review e2/e3/e4 2026-07-10: Jungen / sportlich / ähnlich / Angeboten / Verkehrsbehinderungen ──');

const REVIEW_E234 = [
  ['einen jungen und ein Mädchen', 'einen Jungen und ein Mädchen'],
  ['einen jungen Mann', 'einen jungen Mann'],
  ['Neben den Sportlichen Aktivitäten', 'Neben den sportlichen Aktivitäten'],
  ['oder Ähnlichen Fortbewegungsmitteln', 'oder ähnlichen Fortbewegungsmitteln'],
  ['Bedarf an solchen angeboten gibt', 'Bedarf an solchen Angeboten gibt'],
  ['Bedarf an solchen Angeboten gibt', 'Bedarf an solchen Angeboten gibt'],
  ['die Angebotenen Lehrgänge', 'die angebotenen Lehrgänge'],
  ['wird es zu verkehrsbehinderungen kommen', 'wird es zu Verkehrsbehinderungen kommen'],
  ['die reifen Erdbeeren zu ernten.', 'die reifen Erdbeeren zu ernten.'],
  ['gemeinsam zu feiern und', 'gemeinsam zu feiern und'],
  ['den Ärztlichen Bereitschaftsdienst', 'den ärztlichen Bereitschaftsdienst'],
];

for (const [input, expected] of REVIEW_E234) {
  assertEq(`e234: ${input.slice(0, 42)}…`, fullNorm(input), expected);
}

console.log('\n── Deep-read 2026-07-10: örtlich / erfolgreich / frisch / Mitmachen / Sammelstellen ──');

const DEEP_READ_CAPS = [
  ['in einem der Örtlichen Parks', 'in einem der örtlichen Parks'],
  ['wenn es langfristig Erfolgreich ist', 'wenn es langfristig erfolgreich ist'],
  ['Alle sollen Mitmachen können.', 'Alle sollen mitmachen können.'],
  ['dürfen Mitmachen.', 'dürfen mitmachen.'],
  ['in der Frischen Luft arbeite', 'in der frischen Luft arbeite'],
  ['zu sammelstellen der Stadt', 'zu Sammelstellen der Stadt'],
  // nominalized infinitive after article must stay
  ['Das Mitmachen ist wichtig.', 'Das Mitmachen ist wichtig.'],
];

for (const [input, expected] of DEEP_READ_CAPS) {
  assertEq(`deep: ${input.slice(0, 42)}…`, fullNorm(input), expected);
}

console.log('\n── v3.7 attr-adj-before-noun 2026-07-11 ──');

const ATTR_ADJ_NOUN = [
  ['Moderator: Ein Interessanter Gedanke.', 'Ein interessanter Gedanke'],
  ['Geschäftsführer eines Mittelständischen Unternehmens.', 'eines mittelständischen Unternehmens'],
  ['in einem Solchen Modell sicherstellen?', 'in einem solchen Modell'],
  ['finde ich die Unterschiedlichen Geschichten der', 'die unterschiedlichen Geschichten'],
  ['Planung unserer Monatlichen Treffen gehört', 'unserer monatlichen Treffen'],
  // possessive + adj (same SUBSTANTIVISING_ARTICLES path as articles)
  ['zu unserem Jährlichen Familienfest im Stadtpark', 'unserem jährlichen Familienfest'],
  ['ist ein Wunderbarer Beitrag zum', 'ein wunderbarer Beitrag'],
  ['keine Chemischen Schädlingsbekämpfungsmittel.', 'keine chemischen Schädlings'],
  ['zu den Städtischen Recyclinghöfen.', 'zu den städtischen Recyclinghöfen'],
  ['findet im Städtischen Hallenbad statt.', 'im städtischen Hallenbad'],
  ['in die Blaue Papiertonne.', 'die blaue Papiertonne'],
  ['eines Zahlenden Erwachsenen kostenlos.', 'eines zahlenden Erwachsenen'],
  // proper-name exclusion
  ['um unser Grünes Viertel umweltfreundlich', 'unser Grünes Viertel'],
  ['Wohnen im Grünen Viertel', 'im Grünen Viertel'],
  // proper names / titles must not break
  ['Das sagte Frau Schmidt gestern.', 'Frau Schmidt'],
  ['Herr Weber, Journalist und Kritiker.', 'Herr Weber'],
  ['Ihr Nachbar, Herr Weber, spielt', 'Ihr Nachbar, Herr Weber'],
  // bare -isch nouns must not look like adjectives (v3.7 guard, same idea as Nachbar)
  ['Auf dem Tisch Standen viele Bücher.', 'Auf dem Tisch Standen'],
  ['Neben dem Fisch Schwamm eine Ente.', 'Neben dem Fisch Schwamm'],
  ['Der Fisch Schwamm im Teich.', 'Der Fisch Schwamm'],
];

for (const [input, expectSub] of ATTR_ADJ_NOUN) {
  assertChanges(`v37: ${expectSub}`, input, expectSub);
}

console.log('\n── v3.13 viel/wenig/einig inflections ──');
assertEq(
  'Die Vielen Marketing-Kampagnen → vielen (attr adj)',
  decapitalizeMidSentence(
    'übernehmen. Die Vielen Marketing-Kampagnen verführen uns nur zu unnötigen Käufen.',
  ).result,
  'übernehmen. Die vielen Marketing-Kampagnen verführen uns nur zu unnötigen Käufen.',
);
assertEq(
  'die Wenigen Chancen → wenigen',
  decapitalizeMidSentence('Trotz der Wenigen Chancen blieb er optimistisch.').result,
  'Trotz der wenigen Chancen blieb er optimistisch.',
);
assertEq(
  'substantivized die Vielen. keeps capital (no noun head)',
  capitalizeNounsInText('Aktivitäten für die vielen. Auch die Essensstände').result,
  'Aktivitäten für die Vielen. Auch die Essensstände',
);

console.log('\n── substantivized adj no noun head (die kleinen) ──');
assertEq(
  'cap: die kleinen. → die Kleinen.',
  capitalizeNounsInText('bietet viele Aktivitäten für die kleinen. Auch die Essensstände').result,
  'bietet viele Aktivitäten für die Kleinen. Auch die Essensstände',
);
assertEq(
  'cap: die kleinen schützen → die Kleinen',
  capitalizeNounsInText('Wir müssen die kleinen schützen.').result,
  'Wir müssen die Kleinen schützen.',
);
assertEq(
  'attr: einen kleinen See stays lowercase',
  capitalizeNounsInText('Dort gibt es auch einen kleinen See.').result,
  'Dort gibt es auch einen kleinen See.',
);
assertEq(
  'fullNorm: Jährlichen decap + die kleinen cap',
  fullNorm('unserem Jährlichen Familienfest und Aktivitäten für die kleinen.'),
  'unserem jährlichen Familienfest und Aktivitäten für die Kleinen.',
);
assertEq(
  'fullNorm: das nächste Fest stays attributive',
  fullNorm('Die Organisatoren planen das nächste Fest im Herbst.'),
  'Die Organisatoren planen das nächste Fest im Herbst.',
);
assertEq(
  'attr stack: der neue deutsche Film stays lowercase neue',
  capitalizeNounsInText("Dort läuft der neue deutsche Film 'Sommerliebe'.").result,
  "Dort läuft der neue deutsche Film 'Sommerliebe'.",
);
assertEq(
  'attr stack: do not re-cap Neue before deutsche',
  fullNorm("Dort läuft der Neue deutsche Film 'Sommerliebe'."),
  "Dort läuft der neue deutsche Film 'Sommerliebe'.",
);

console.log('\n── attr adj + unternehmen (v3.9) ──');
assertEq(
  'cap: kleine unternehmen → Unternehmen',
  capitalizeNounsInText('für kleine unternehmen und große Firmen.').result,
  'für kleine Unternehmen und große Firmen.',
);
assertEq(
  'V2 verb: unternehmen wir stays lowercase',
  fullNorm('Am Wochenende Unternehmen wir oft Ausflüge.'),
  'Am Wochenende unternehmen wir oft Ausflüge.',
);

console.log('\n── zu + noun vs zu-infinitive (v3.11) ──');
assertEq(
  'zu kunden → zu Kunden',
  capitalizeNounsInText('Der Kontakt zu kunden muss nur gut bleiben.').result,
  'Der Kontakt zu Kunden muss nur gut bleiben.',
);
assertEq(
  'zu medien → zu Medien',
  capitalizeNounsInText('Zugang zu medien ist wichtig.').result,
  'Zugang zu Medien ist wichtig.',
);
assertEq(
  'zu machen stays infinitive',
  capitalizeNounsInText('Ich versuche, das zu machen.').result,
  'Ich versuche, das zu machen.',
);
assertEq(
  'zu unternehmen stays verb infinitive',
  capitalizeNounsInText('Es gibt viel zu unternehmen.').result,
  'Es gibt viel zu unternehmen.',
);

console.log('\n── zu + attributive adj + noun (v3.12) ──');
assertEq(
  'zu Unterschiedlichen Zeiten → unterschiedlichen',
  fullNorm('wenn alle zu Unterschiedlichen Zeiten arbeiten.'),
  'wenn alle zu unterschiedlichen Zeiten arbeiten.',
);
assertEq(
  'fullNorm does not re-cap attr adj after zu',
  fullNorm('Termine finden, wenn alle zu Unterschiedlichen Zeiten arbeiten.'),
  'Termine finden, wenn alle zu unterschiedlichen Zeiten arbeiten.',
);
assertEq(
  'mit Großen Kindern → großen',
  fullNorm('Sie wohnen mit Großen Kindern in der Stadt.'),
  'Sie wohnen mit großen Kindern in der Stadt.',
);
assertEq(
  'zu Kunden (noun) still capitalizes',
  fullNorm('Der Kontakt zu kunden ist wichtig.'),
  'Der Kontakt zu Kunden ist wichtig.',
);
assertEq(
  'zu Teilen infinitive stays lower (fullNorm)',
  fullNorm('Erfahrungen zu Teilen und zu helfen.'),
  'Erfahrungen zu teilen und zu helfen.',
);
assertEq(
  'zu Buchen infinitive stays lower',
  fullNorm('Ich versuche, Tickets online zu Buchen.'),
  'Ich versuche, Tickets online zu buchen.',
);
assertEq(
  'zu Ermöglichen infinitive stays lower',
  fullNorm('Erlebnisse außerhalb des Unterrichts zu Ermöglichen.'),
  'Erlebnisse außerhalb des Unterrichts zu ermöglichen.',
);

console.log('\n── zu + degree adjective (v3.14) ──');
assertEq(
  'zu Teuer → zu teuer (fullNorm)',
  fullNorm('die nicht zu Teuer sind.'),
  'die nicht zu teuer sind.',
);
assertEq(
  'zu teuer not re-capped',
  fullNorm('die nicht zu teuer sind.'),
  'die nicht zu teuer sind.',
);
assertEq(
  'zu Klein → zu klein (fullNorm)',
  fullNorm('Das Haus ist zu Klein für so viele Besucher.'),
  'Das Haus ist zu klein für so viele Besucher.',
);
assertEq(
  'zu Unterrichten → zu unterrichten',
  fullNorm('Die Kinder nur im Klassenzimmer zu Unterrichten.'),
  'Die Kinder nur im Klassenzimmer zu unterrichten.',
);
assertEq(
  'zu Kunden still noun',
  fullNorm('Der Kontakt zu kunden muss bleiben.'),
  'Der Kontakt zu Kunden muss bleiben.',
);

console.log('\n── und + finite verb (v3.10) ──');
assertEq(
  'und Brauchen einen → brauchen',
  fullNorm('Sie bezahlen mehr und Brauchen einen Gästeausweis.'),
  'Sie bezahlen mehr und brauchen einen Gästeausweis.',
);
assertEq(
  'und Zahlen pro → zahlen',
  fullNorm('Gäste anmelden und Zahlen pro Mahlzeit 2 Euro mehr.'),
  'Gäste anmelden und zahlen pro Mahlzeit 2 Euro mehr.',
);
assertEq(
  'enumeration und Unternehmen stays noun',
  fullNorm('Hilfe für Firmen und Unternehmen in der Stadt.'),
  'Hilfe für Firmen und Unternehmen in der Stadt.',
);
assertEq(
  'enumeration und Kuchen stays noun',
  capitalizeNounsInText('Es gibt Kaffee und Kuchen.').result,
  'Es gibt Kaffee und Kuchen.',
);

console.log('\n── v3.15 was-clause substantivized adj ──');
assertEq(
  'schreiben-005: was…Schönes stays capital after decap',
  decapitalizeMidSentence(
    'Erzählen Sie, was Sie am Wochenende Schönes unternommen haben.',
  ).result,
  'Erzählen Sie, was Sie am Wochenende Schönes unternommen haben.',
);
assertEq(
  'schreiben-005: was…schönes → Schönes on cap pass',
  capitalizeNounsInText(
    'Erzählen Sie, was Sie am Wochenende schönes unternommen haben.',
  ).result,
  'Erzählen Sie, was Sie am Wochenende Schönes unternommen haben.',
);
assertEq(
  'attributive ein schönes Wochenende stays lower',
  fullNorm('Sie haben vor Kurzem ein schönes Wochenende erlebt.'),
  'Sie haben vor Kurzem ein schönes Wochenende erlebt.',
);
assertEq(
  'etwas Schönes stays (indef + allowlist)',
  decapitalizeMidSentence('Jeder kann etwas Schönes tun.').result,
  'Jeder kann etwas Schönes tun.',
);
assertEq(
  'etwas Gutes stays (existing Phase1)',
  decapitalizeMidSentence('Jeder kann etwas Gutes tun.').result,
  'Jeder kann etwas Gutes tun.',
);
assertEq(
  'was + CapAdj + noun head still decaps (not verb)',
  decapitalizeMidSentence('Was für ein Schönes Auto hast du?').result,
  'Was für ein schönes Auto hast du?',
);
assertEq(
  'immediate was Schönes + verb stays',
  decapitalizeMidSentence('Sag mir, was Schönes passiert ist.').result,
  'Sag mir, was Schönes passiert ist.',
);

console.log('\n── honorific surname guard (Herr Lang) ──');
assertEq(
  'Herr Lang preserved',
  decapitalizeMidSentence('Ihr Nachbar, Herr Lang, hat geholfen.').result,
  'Ihr Nachbar, Herr Lang, hat geholfen.',
);
assertEq(
  'Herrn Lang preserved',
  decapitalizeMidSentence('Schreiben Sie an Herrn Lang.').result,
  'Schreiben Sie an Herrn Lang.',
);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
