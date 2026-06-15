#!/usr/bin/env node
/**
 * Expand de/B1 Lesen bank: T1/T2 passage sets (180–220 words) for disjoint assembly.
 * Run once: node scripts/expand-lesen-bank-de-b1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q_PATH = path.join(ROOT, 'library/de/B1/questions.json');
const P_PATH = path.join(ROOT, 'library/de/B1/passages.json');

function mkRf(id, teil, passageId, question, correct, topicTags, explanation = '') {
  return {
    id,
    module: 'lesen',
    teil,
    type: 'richtig_falsch',
    question,
    correct,
    correctAnswer: correct,
    explanation,
    passageId,
    options: [],
    grammarTags: ['g-de-b1-nebensatz'],
    topicTags,
    vocabularyTags: [],
    difficulty: 4,
    skills: ['reading'],
    language: 'de',
    level: 'B1',
    examType: 'goethe',
  };
}

function mkMcq(id, teil, passageId, question, correct, options, topicTags, explanation = '') {
  return {
    id,
    module: 'lesen',
    teil,
    type: 'multiple',
    question,
    correct,
    correctAnswer: correct,
    explanation,
    passageId,
    options,
    grammarTags: ['g-de-b1-nebensatz'],
    topicTags,
    vocabularyTags: [],
    difficulty: 5,
    skills: ['reading'],
    language: 'de',
    level: 'B1',
    examType: 'goethe',
  };
}

const NEW_PASSAGES = [
  {
    id: 'p-lesen-t1-579cc63bde',
    module: 'lesen',
    title: 'Stadtgärten: Grüne Oasen mitten in der Stadt',
    text: `Immer mehr Menschen in deutschen Städten entscheiden sich für einen eigenen kleinen Garten — nicht auf dem Land, sondern mitten in der Stadt. Sogenannte Stadtgärten oder Urban-Gardening-Projekte boomen seit einigen Jahren. In Berlin, Hamburg und München entstehen auf Brachflächen, Dächern und in Parks gemeinschaftliche Gärten, in denen Stadtbewohner Gemüse, Kräuter und Blumen anbauen.

Der Trend hat mehrere Gründe. Viele Menschen möchten wissen, woher ihr Essen kommt, und schätzen es, frische Produkte selbst anzubauen. Außerdem bieten Stadtgärten die Möglichkeit, Nachbarn kennenzulernen und eine Gemeinschaft aufzubauen. Für Kinder ist es besonders wertvoll: Sie lernen, wie Pflanzen wachsen, und entwickeln ein Bewusstsein für die Natur.

Auch aus ökologischer Sicht sind Stadtgärten positiv: Sie verbessern das Stadtklima, bieten Lebensraum für Insekten und reduzieren den CO₂-Ausstoß, weil weniger Lebensmittel transportiert werden müssen. Kritiker sagen jedoch, dass der Platz in Städten begrenzt ist und für Wohnungsbau gebraucht wird. Trotzdem: Die Wartelisten für Stadtgartenparzellen sind in den meisten deutschen Städten sehr lang.`,
  },
  {
    id: 'de-b1-p-lesen-t1-umwelt-01',
    module: 'lesen',
    title: 'Mehr Windenergie in Norddeutschland',
    text: `In Schleswig-Holstein planen Politiker und Energieunternehmen den Ausbau der Windkraft an der Küste. Befürworter argumentieren, dass erneuerbare Energien unverzichtbar sind, um die Klimaziele zu erreichen. Windräder könnten laut Studien einen großen Teil des Strombedarfs der Region decken und gleichzeitig neue Arbeitsplätze schaffen. Besonders in ländlichen Gebieten hoffen viele Kommunen auf zusätzliche Einnahmen durch die Abgabe von Flächen.

Doch nicht alle Anwohner sind begeistert. Einige klagen über Lärm und den sichtbaren Eingriff in die Landschaft. Naturschützer warnen zudem, dass Vögel und Fledermäuse durch rotierende Rotorblätter gefährdet sein könnten. Deshalb fordern sie strengere Abstandsregeln und bessere Kontrollen vor der Genehmigung neuer Anlagen.

Die Landesregierung betont, dass der Ausbau schrittweise erfolgen soll. Zuerst sollen bestehende Windparks modernisiert werden, bevor neue Standorte genehmigt werden. Experten empfehlen außerdem, die Bevölkerung frühzeitig in Entscheidungen einzubeziehen, damit Konflikte reduziert werden können.`,
  },
  {
    id: 'de-b1-p-lesen-t1-gesundheit-01',
    module: 'lesen',
    title: 'Bewegung im Alltag: Tipps einer Ernährungsberaterin',
    text: `Viele Berufstätige sitzen täglich acht Stunden oder länger am Schreibtisch. Ernährungsberaterin Sabine Keller erklärt in ihrem Blog, warum regelmäßige Bewegung gerade für Büroangestellte wichtig ist. Schon kleine Veränderungen im Alltag können laut Keller einen großen Unterschied machen: Treppen statt Aufzug, kurze Spaziergänge in der Mittagspause oder Fahrradfahren zur Arbeit.

Keller empfiehlt, sich realistische Ziele zu setzen. Wer bisher kaum Sport gemacht hat, sollte nicht sofort mit fünf Trainingseinheiten pro Woche beginnen. Besser seien feste Routinen, die sich langfristig durchhalten lassen. Sie betont außerdem, dass ausreichend Schlaf und eine ausgewogene Ernährung die Fitness unterstützen.

Kritiker sagen, dass solche Ratschläge vor allem Menschen mit flexiblen Arbeitszeiten helfen. Wer Schichtdienst leistet oder mehrere Jobs kombiniert, habe weniger Zeit für Sport. Keller antwortet darauf, dass auch zehn Minuten Bewegung besser seien als gar keine Aktivität. Ihre Leser berichten, dass sie sich nach wenigen Wochen fitter und konzentrierter fühlen.`,
  },
  {
    id: 'de-b1-p-lesen-t1-arbeit-01',
    module: 'lesen',
    title: 'Fachkräftemangel in deutschen Betrieben',
    text: `Laut einer aktuellen Umfrage haben viele mittelständische Unternehmen in Deutschland Schwierigkeiten, qualifizierte Mitarbeiter zu finden. Besonders betroffen sind laut der Studie die Bereiche Handwerk, Pflege und IT. Unternehmer geben an, dass offene Stellen oft monatelang unbesetzt bleiben, weil zu wenige Bewerber die nötigen Qualifikationen mitbringen.

Einige Firmen reagieren mit höheren Gehältern und flexibleren Arbeitsmodellen. Andere investieren in die Ausbildung junger Menschen oder bieten Umschulungen für Quereinsteiger an. Die Bundesagentur für Arbeit empfiehlt zudem, stärker auf internationale Fachkräfte zu setzen und Anerkennungsverfahren zu beschleunigen.

Kritiker warnen jedoch, dass nicht jedes Unternehmen sich teure Weiterbildungsprogramme leisten kann. Gewerkschaften fordern deshalb mehr staatliche Unterstützung und bessere Bedingungen in sozialen Berufen. Experten sind sich einig, dass der Fachkräftemangel nur mit gemeinsamen Anstrengungen von Politik, Wirtschaft und Bildungseinrichtungen gelöst werden kann.`,
  },
  {
    id: 'de-b1-p-lesen-t1-reise-01',
    module: 'lesen',
    title: 'Deutschland-Ticket: Eine Bilanz nach einem Jahr',
    text: `Seit zwölf Monaten können Menschen in Deutschland mit dem sogenannten Deutschland-Ticket bundesweit den öffentlichen Nahverkehr nutzen. Das Angebot kostet derzeit 49 Euro im Monat und gilt für Busse, Straßenbahnen, U-Bahnen und regionale Züge. Laut Verkehrsverbänden haben bereits Millionen Kundinnen und Kunden das Ticket gekauft.

Viele Pendler berichten, dass sie dadurch Geld sparen, besonders wenn sie früher teure Monatskarten für einzelne Regionen besaßen. Umweltorganisationen begrüßen die Entwicklung, weil mehr Menschen vom Auto auf die Bahn umsteigen könnten. Allerdings beschweren sich Nutzer in ländlichen Gebieten über unregelmäßige Verbindungen und überfüllte Züge zur Hauptverkehrszeit.

Die Politik diskutiert derzeit über eine mögliche Preiserhöhung und über zusätzliche Investitionen in die Infrastruktur. Verkehrsexperten betonen, dass günstige Tickets allein nicht reichen, wenn Fahrpläne unzuverlässig bleiben. Dennoch gilt das Projekt insgesamt als Erfolg und soll langfristig fortgeführt werden.`,
  },
  {
    id: 'de-b1-p-lesen-t2-umwelt-a',
    module: 'lesen',
    title: 'Mehr Pfandflaschen im Alltag',
    text: `In Deutschland gibt es seit vielen Jahren ein Pfandsystem für Flaschen und Dosen. Konsumenten zahlen beim Kauf einen kleinen Aufpreis und bekommen ihn zurück, wenn sie die Verpackung in Supermärkten oder an Automaten abgeben. Umweltverbände loben das System, weil es laut Statistiken zu hohen Recyclingquoten führt. Viele Menschen sammeln Pfandflaschen außerdem, um etwas Geld zu sparen oder sozialen Projekten zu helfen.

Dennoch landen jedes Jahr Millionen Einwegflaschen im Müll. Kritiker fordern deshalb strengere Regeln für Hersteller und mehr Rücknahmeautomaten an öffentlichen Orten. Einige Städte testen bereits mobile Pfandstationen in Parks und an Haltestellen. Experten glauben, dass solche Angebote besonders junge Menschen motivieren könnten, Verpackungen nicht einfach wegzuwerfen.`,
  },
  {
    id: 'de-b1-p-lesen-t2-umwelt-b',
    module: 'lesen',
    title: 'Carsharing in mittelgroßen Städten',
    text: `Carsharing-Anbieter verzeichnen in Städten wie Leipzig, Bremen und Freiburg steigende Nutzerzahlen. Statt ein eigenes Auto zu besitzen, reservieren Kundinnen und Kunden Fahrzeuge per App und zahlen nur für die tatsächliche Nutzungszeit. Befürworter sehen darin eine umweltfreundliche Alternative, weil weniger Fahrzeuge insgesamt produziert werden müssen.

Allerdings berichten Nutzer von Problemen an Wochenenden, wenn alle verfügbaren Autos bereits gebucht sind. Zudem fehlen in einigen Stadtteilen feste Parkplätze für die Fahrzeuge. Die Anbieter reagieren mit größeren Flotten und Kooperationen mit Wohnungsbaugesellschaften. Dennoch bleibt offen, ob Carsharing allein den Verkehr in Innenstädten spürbar entlasten kann.`,
  },
  {
    id: 'de-b1-p-lesen-t2-gesundheit-a',
    module: 'lesen',
    title: 'Vegane Ernährung in der Kantine',
    text: `Immer mehr Unternehmen bieten in ihren Kantinen vegane Gerichte an. Laut einer Umfrage unter 500 Betrieben in Bayern wünschen sich besonders jüngere Mitarbeitende mehr pflanzliche Optionen. Ernährungswissenschaftler betonen, dass eine ausgewogene vegane Ernährung gesund sein kann, wenn ausreichend Proteine, Vitamine und Mineralstoffe aufgenommen werden.

Einige Arbeitgeber sehen darin auch ein Mittel, um neue Talente zu gewinnen. Kritiker warnen jedoch, dass nicht jede Kantine über ausgebildetes Personal verfügt, um vegane Speisen hygienisch korrekt zuzubereiten. Außerdem sind manche Gerichte teurer als klassische Menüs. Trotzdem planen viele Betriebe, ihr Angebot in den nächsten Monaten zu erweitern.`,
  },
  {
    id: 'de-b1-p-lesen-t2-gesundheit-b',
    module: 'lesen',
    title: 'Digitale Gesundheitsapps',
    text: `Smartphone-Apps, die Schlaf, Schritte oder Herzfrequenz messen, werden in Deutschland immer populärer. Anbieter werben damit, dass Nutzer ihre Fitnessziele besser verfolgen können. Einige Krankenkassen bieten sogar Prämien, wenn Versicherte regelmäßig Daten teilen.

Datenschützer kritisieren jedoch, dass nicht immer klar ist, wer Zugriff auf die gesammelten Informationen erhält. Außerdem warnen Ärzte davor, Diagnosen allein auf App-Daten zu stützen. Dennoch zeigen Studien, dass viele Menschen durch Erinnerungen in Apps tatsächlich aktiver werden. Experten empfehlen deshalb, Apps bewusst auszuwählen und die Datenschutzeinstellungen zu prüfen.`,
  },
  {
    id: 'de-b1-p-lesen-t2-reise-a',
    module: 'lesen',
    title: 'Nachtzüge kehren zurück',
    text: `Nach Jahren der Einschränkungen planen europäische Bahnunternehmen neue Nachtverbindungen zwischen großen Städten. Reisende können in Schlafwagen oder Liegewagen übernachten und am Morgen am Ziel ankommen — ohne zusätzliche Hotelkosten. Befürworter sehen darin eine klimafreundliche Alternative zum Flugzeug.

Allerdings sind Tickets für beliebte Strecken oft schnell ausverkauft, und manche Züge gelten als laut oder veraltet. Die Betreiber investieren deshalb in modernere Wagen und digitale Buchungssysteme. Kritiker bezweifeln, dass Nachtzüge für Geschäftsreisende attraktiv sind, weil die Fahrzeiten lang sind. Für Urlauber bleibt das Angebot dennoch interessant.`,
  },
  {
    id: 'de-b1-p-lesen-t2-reise-b',
    module: 'lesen',
    title: 'Flugreisen werden teurer',
    text: `Viele Airlines haben ihre Preise in den letzten Monaten erhöht. Gründe sind höhere Kerosinkosten, Personalmangel und neue Umweltabgaben. Reisende berichten, dass selbst früh gebuchte Tickets deutlich teurer sind als vor der Pandemie.

Billigairlines versuchen trotzdem, mit Sonderangeboten Kunden zu gewinnen, verlangen aber häufig extra für Gepäck oder Sitzplatzreservierungen. Verbraucherzentralen raten deshalb, Preise sorgfältig zu vergleichen und versteckte Gebühren zu beachten. Experten gehen davon aus, dass Flugreisen langfristig teurer bleiben werden, weshalb viele Familien wieder verstärkt mit dem Auto oder der Bahn in den Urlaub fahren.`,
  },
];

const T1_SETS = [
  {
    passageId: 'de-b1-p-lesen-t1-umwelt-01',
    topicTags: ['environment'],
    prefix: 'de-b1-l-t1-umwelt-01',
    items: [
      ['Richtig', 'In Schleswig-Holstein ist ein Ausbau der Windkraft geplant.', 'Der Text beginnt mit genau dieser Planung.'],
      ['Falsch', 'Alle Anwohner begrüßen die neuen Windräder ohne Kritik.', 'Es gibt Beschwerden über Lärm und Landschaft.'],
      ['Richtig', 'Naturschützer warnen vor Gefahren für Vögel und Fledermäuse.', 'Das steht ausdrücklich im Text.'],
      ['Falsch', 'Neue Standorte sollen sofort ohne Kontrollen genehmigt werden.', 'Zuerst sollen bestehende Parks modernisiert werden.'],
      ['Richtig', 'Die Landesregierung will schrittweise vorgehen.', 'Das betont der Text im vorletzten Abschnitt.'],
      ['Falsch', 'Experten raten davon ab, die Bevölkerung einzubeziehen.', 'Sie empfehlen frühe Beteiligung.'],
    ],
  },
  {
    passageId: 'de-b1-p-lesen-t1-gesundheit-01',
    topicTags: ['health'],
    prefix: 'de-b1-l-t1-gesundheit-01',
    items: [
      ['Richtig', 'Keller empfiehlt kleine Veränderungen im Alltag.', 'Treppen, Spaziergänge und Fahrradfahren werden genannt.'],
      ['Falsch', 'Anfänger sollten sofort fünf Trainingseinheiten pro Woche machen.', 'Keller rät von zu ambitionierten Zielen ab.'],
      ['Richtig', 'Ausreichend Schlaf unterstützt laut Keller die Fitness.', 'Das wird im Text erwähnt.'],
      ['Falsch', 'Laut Keller haben Schichtarbeiter immer genug Zeit für Sport.', 'Kritiker weisen auf wenig Zeit hin.'],
      ['Richtig', 'Keller meint, dass zehn Minuten Bewegung besser sind als gar keine.', 'Das ist ihre Antwort auf die Kritik.'],
      ['Falsch', 'Ihre Leser berichten nach wenigen Wochen über mehr Müdigkeit.', 'Sie fühlen sich fitter und konzentrierter.'],
    ],
  },
  {
    passageId: 'de-b1-p-lesen-t1-arbeit-01',
    topicTags: ['work'],
    prefix: 'de-b1-l-t1-arbeit-01',
    items: [
      ['Richtig', 'Viele Betriebe haben Probleme, qualifizierte Mitarbeiter zu finden.', 'Das ist das Hauptthema der Umfrage.'],
      ['Falsch', 'Offene Stellen werden in der Regel innerhalb weniger Tage besetzt.', 'Sie bleiben oft monatelang unbesetzt.'],
      ['Richtig', 'Besonders Handwerk, Pflege und IT sind betroffen.', 'Diese Bereiche werden genannt.'],
      ['Falsch', 'Die Bundesagentur rät, weniger auf internationale Fachkräfte zu setzen.', 'Sie empfiehlt das Gegenteil.'],
      ['Richtig', 'Gewerkschaften fordern bessere Bedingungen in sozialen Berufen.', 'Das steht im Text.'],
      ['Falsch', 'Experten glauben, dass nur Unternehmen allein das Problem lösen können.', 'Politik, Wirtschaft und Bildung müssen mitwirken.'],
    ],
  },
  {
    passageId: 'de-b1-p-lesen-t1-reise-01',
    topicTags: ['travel'],
    prefix: 'de-b1-l-t1-reise-01',
    items: [
      ['Richtig', 'Das Deutschland-Ticket kostet derzeit 49 Euro im Monat.', 'Der Preis wird genannt.'],
      ['Falsch', 'Das Ticket gilt nur in einer einzigen Stadt.', 'Es gilt bundesweit im Nahverkehr.'],
      ['Richtig', 'Umweltorganisationen begrüßen die Entwicklung.', 'Sie hoffen auf weniger Autoverkehr.'],
      ['Falsch', 'Nutzer auf dem Land sind durchweg zufrieden mit den Verbindungen.', 'Es gibt Beschwerden über unregelmäßige Fahrten.'],
      ['Richtig', 'Politiker diskutieren über Preiserhöhungen und Investitionen.', 'Das steht im Text.'],
      ['Falsch', 'Experten finden, dass günstige Tickets allein ausreichen.', 'Zuverlässige Fahrpläne seien ebenfalls nötig.'],
    ],
  },
];

const NEW_QUESTIONS = [
  ...T1_SETS.flatMap(({ passageId, topicTags, prefix, items }) =>
    items.map(([cor, q, expl], i) => mkRf(`${prefix}-q${i + 1}`, 1, passageId, q, cor, topicTags, expl)),
  ),
  ...[
    ['umwelt', 'de-b1-p-lesen-t2-umwelt-a', 'de-b1-p-lesen-t2-umwelt-b'],
    ['gesundheit', 'de-b1-p-lesen-t2-gesundheit-a', 'de-b1-p-lesen-t2-gesundheit-b'],
    ['reise', 'de-b1-p-lesen-t2-reise-a', 'de-b1-p-lesen-t2-reise-b'],
  ].flatMap(([topic, pa, pb]) => {
    const tags = [topic === 'umwelt' ? 'environment' : topic === 'gesundheit' ? 'health' : 'travel'];
    const aQs = [
      ['a', 'Was loben Umweltverbände laut Text?', 'a) Das Pfandsystem', ['a) Das Pfandsystem', 'b) Plastiktüten', 'c) Importe']],
      ['b', 'Was fordern Kritiker?', 'b) Mehr Rücknahmeautomaten', ['a) Weniger Supermärkte', 'b) Mehr Rücknahmeautomaten', 'c) Höhere Preise']],
      ['a', 'Wer sammelt laut Text Pfandflaschen?', 'a) Viele Menschen', ['a) Viele Menschen', 'b) Nur Kinder', 'c) Niemand']],
    ];
    const bQs = [
      ['b', 'Warum sehen Befürworter Carsharing positiv?', 'b) Weniger Autos insgesamt', ['a) Mehr Staus', 'b) Weniger Autos insgesamt', 'c) Gratis Parken']],
      ['a', 'Was berichten Nutzer am Wochenende?', 'a) Oft sind alle Autos gebucht', ['a) Oft sind alle Autos gebucht', 'b) Es gibt zu viele Autos', 'c) Die App funktioniert nicht']],
      ['c', 'Was fehlt in manchen Stadtteilen?', 'c) Feste Parkplätze', ['a) Fahrer', 'b) Benzin', 'c) Feste Parkplätze']],
    ];
    if (topic === 'gesundheit') {
      aQs[0] = ['a', 'Was wünschen sich laut Umfrage viele Mitarbeitende?', 'a) Mehr vegane Gerichte', ['a) Mehr vegane Gerichte', 'b) Größere Portionen', 'c) Weniger Kantinen']];
      aQs[1] = ['b', 'Wovor warnen Kritiker?', 'b) Fehlendes geschultes Personal', ['a) Zu viel Fleisch', 'b) Fehlendes geschultes Personal', 'c) Zu günstige Preise']];
      aQs[2] = ['a', 'Was betonen Ernährungswissenschaftler?', 'a) Ausgewogene vegane Ernährung kann gesund sein', ['a) Ausgewogene vegane Ernährung kann gesund sein', 'b) Vegane Ernährung ist immer ungesund', 'c) Kantinen sollten schließen']];
      bQs[0] = ['b', 'Was bieten manche Krankenkassen?', 'b) Prämien für geteilte Daten', ['a) Gratis Smartphones', 'b) Prämien für geteilte Daten', 'c) Weniger Leistungen']];
      bQs[1] = ['a', 'Wovor warnen Datenschützer?', 'a) Unklarer Zugriff auf Daten', ['a) Unklarer Zugriff auf Daten', 'b) Zu wenig Apps', 'c) Zu hohe Preise']];
      bQs[2] = ['a', 'Was empfehlen Experten?', 'a) Apps bewusst auswählen', ['a) Apps bewusst auswählen', 'b) Keine Apps nutzen', 'c) Daten immer veröffentlichen']];
    }
    if (topic === 'reise') {
      aQs[0] = ['a', 'Was planen Bahnunternehmen?', 'a) Neue Nachtverbindungen', ['a) Neue Nachtverbindungen', 'b) Weniger Züge', 'c) Höhere Geschwindigkeit tagsüber']];
      aQs[1] = ['b', 'Was sehen Befürworter darin?', 'b) Klimafreundliche Alternative zum Flug', ['a) Schnellere Geschäftsreisen', 'b) Klimafreundliche Alternative zum Flug', 'c) Günstigere Tickets']];
      aQs[2] = ['a', 'Was passiert oft mit Tickets?', 'a) Sie sind schnell ausverkauft', ['a) Sie sind schnell ausverkauft', 'b) Sie sind immer gratis', 'c) Sie sind unbegrenzt verfügbar']];
      bQs[0] = ['a', 'Warum sind Flüge teurer geworden?', 'a) Höhere Kerosinkosten', ['a) Höhere Kerosinkosten', 'b) Weniger Passagiere', 'c) Mehr Flughäfen']];
      bQs[1] = ['b', 'Wofür verlangen Billigairlines extra?', 'b) Gepäck oder Sitzplätze', ['a) Nichts', 'b) Gepäck oder Sitzplätze', 'c) Nur Getränke']];
      bQs[2] = ['c', 'Womit fahren viele Familien wieder öfter in den Urlaub?', 'c) Auto oder Bahn', ['a) Nur Schiffe', 'b) Nur Flugzeuge', 'c) Auto oder Bahn']];
    }
    return [
      ...aQs.map(([cor, q, expl, opts], i) =>
        mkMcq(`de-b1-l-t2-${topic}-a-q${i + 1}`, 2, pa, q, cor, opts, tags, expl),
      ),
      ...bQs.map(([cor, q, expl, opts], i) =>
        mkMcq(`de-b1-l-t2-${topic}-b-q${i + 1}`, 2, pb, q, cor, opts, tags, expl),
      ),
    ];
  }),
];

function mergePassages(existing, incoming) {
  const map = new Map((existing || []).map((p) => [p.id, p]));
  for (const p of incoming) map.set(p.id, p);
  return [...map.values()];
}

const qBank = JSON.parse(fs.readFileSync(Q_PATH, 'utf8'));
const pBank = JSON.parse(fs.readFileSync(P_PATH, 'utf8'));

const removeIds = new Set(['de-b1-l-p1-q1', 'de-b1-l-p1-q2', 'de-b1-l-p1-q3', 'de-b1-l-p1-q4']);
const existingQIds = new Set(qBank.questions.map((x) => x.id));
const toAddQ = NEW_QUESTIONS.filter((q) => !existingQIds.has(q.id));

qBank.questions = qBank.questions.filter((q) => !removeIds.has(q.id)).concat(toAddQ);
qBank.passages = mergePassages(qBank.passages, NEW_PASSAGES);
qBank.meta.version = (qBank.meta.version || 0) + 1;
qBank.meta.generatedAt = new Date().toISOString().slice(0, 10);

pBank.passages = mergePassages(pBank.passages, NEW_PASSAGES);
pBank.meta = { ...pBank.meta, version: (pBank.meta?.version || 0) + 1, generatedAt: qBank.meta.generatedAt };

fs.writeFileSync(Q_PATH, `${JSON.stringify(qBank, null, 2)}\n`);
fs.writeFileSync(P_PATH, `${JSON.stringify(pBank, null, 2)}\n`);

const wc = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
console.log(`Added ${toAddQ.length} questions, ${NEW_PASSAGES.length} passages (merged)`);
console.log('Removed 4 mis-tagged teil-1 MCQ items');
NEW_PASSAGES.forEach((p) => console.log(`  ${p.id}: ${wc(p.text)} words`));
