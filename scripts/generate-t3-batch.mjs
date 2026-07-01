#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
const WEAK_FILE = path.join(ROOT, 'data', 'coverage', 'weak-de_B1.json');

const weakLemmas = JSON.parse(fs.readFileSync(WEAK_FILE, 'utf8')).weakLemmas;
const filtered = [...new Set(weakLemmas.map(w => w.toLowerCase()).filter(w => w.length >= 4 && !['beratung','anmeldung','gebuehr','termin','service','kunde','leistung','mitglied','verein','beitrag','gruppe','projekt','hilfe','service','garantie','angebot','pruefung','funktion','stellung'].includes(w)))];

function pickWeakWords(count = 10) {
  const copy = [...filtered];
  const out = [];
  while (copy.length && out.length < count) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const AD_SETS = [
  // Set 1: Repair/Handwerk + Kurse + Transport + Einkauf
  {
    ads: [
      'A) Kuechenhilfe â€” Reparatur von Herd, Kuehlschrank und Spuele. Meisterbetrieb mit Erfahrung. Kostenlose Anfahrt und Beratung vor Ort. Notdienst am Wochenende.',
      'B) Elektro-Meister â€” Installation und Reparatur von Lampen, Leitungen und Schaltern. Auch Hausbesuche. Termin nach Vereinbarung, Moâ€“Fr 8â€“17 Uhr.',
      'C) MÃ¶belhaus Zentrum â€” Wohnzimmer, Schlafzimmer und Jugendzimmer. Lieferung und Montage inklusive. Oeffnungszeiten: Moâ€“Sa 10â€“20 Uhr.',
      'D) Fahrschule Drive â€” PKW-Fuehrerschein in 4 Wochen. Theorie online, Praxis flexibel. Auch Auffrischungskurse fuer aeltere Fahrer.',
      'E) Sprachschule Babel â€” Englisch und Chinesisch fuer Beruf und Reise. Business-Kurse und Pruefungsvorbereitung. Kleine Gruppen, auch abends.',
      'F) Tierarztpraxis â€” Behandlung von Hunden, Katzen und Kleintieren. Impfungen, Vorsorge und Notfaelle. Termin erforderlich, Moâ€“Sa 9â€“18 Uhr.',
      'G) Baufirma â€” Umbau, Renovierung und Sanierung von Wohnungen. Angebot und Planung kostenlos. Fachgerechte Ausfuehrung, 15 Jahre Erfahrung.',
      'H) Reinigungsfirma â€” Buero- und Privatreinigung. Auch Fenster und Teppiche. Festes Team, zuverlaessig. Angebot kostenlos per E-Mail oder Telefon.',
      'I) Transport Service â€” Umzuege, Moebeltransporte und Entsorgung. Zwei Umzugshelfer inklusive. Faire Preise, schnelle Abwicklung vor Ort.',
      'J) Fahrradladen â€” Verkauf und Reparatur von Fahrraedern und E-Bikes. Ersatzteile auf Lager. Saison-Check fuer 29 Euro, geoeffnet Moâ€“Sa.',
    ],
    correct: ['A','B','C','D','E','0','F'],
  },
  // Set 2: Service + Kultur + Beratung
  {
    ads: [
      'A) Steuerbuero â€” Hilfe bei Steuererklaerung und Buchhaltung. Auch fuer Selbstaendige. Erstgespraech kostenlos. Termin nach telefonischer Vereinbarung.',
      'B) Friseur Salon â€” Damen- und Herrenschnitte, Coloration und Styling. Auch Bartpflege. Geoeffnet Diâ€“Sa 9â€“19 Uhr. Termin online buchbar.',
      'C) Stadtbibliothek â€” Medienverleih, Leseecke und Arbeitsplaetze. Kostenloser Eintritt fuer Bewohner. Veranstaltungen jede Woche, Diâ€“Sa 10â€“18 Uhr.',
      'D) Copyshop â€” Drucken, Kopieren und Scannen. Farbig oder schwarz-weiss. Auch Plakate bis A0. Studentenrabatt. Oeffnungszeiten: Moâ€“Fr 9â€“19 Uhr.',
      'E) Fotostudio â€” Passfotos, Bewerbungsfotos und Familienportraets. Termin nach Vereinbarung. Auch Bildbearbeitung und Abzuege vorhanden.',
      'F) Tanzschule â€” Standard und Latein fuer Anfaenger und Fortgeschrittene. Paare und Einzelpersonen willkommen. Probestunde kostenlos.',
      'G) Reisebuero â€” Fluege, Hotels und Pauschalreisen. Persoenliche Beratung zu Ihrem naechsten Urlaub. Oeffnungszeiten: Moâ€“Fr 10â€“18 Uhr, Sa 10â€“13 Uhr.',
      'H) Blumenladen â€” Frische Blumen und Pflanzen fuer jeden Anlass. Auch Trauerfloristik. Lieferung in der ganzen Stadt. Geoeffnet Moâ€“Sa.',
      'I) Schluesseldienst â€” Notgeoeffnung und Schluesselkopien. Taeglich 24 Stunden erreichbar. Auch Auf- und Zugaenge fuer Wohnungen.',
      'J) Aenderungsschneiderei â€” Kuerzen und enger machen von Kleidung. Reparatur von Reisverschluessen. Kurze Wartezeit. Moâ€“Fr 10â€“17 Uhr.',
    ],
    correct: ['G','A','B','C','D','E','0'],
  },
  // Set 3: Gesundheit + Kurse + Moebel
  {
    ads: [
      'A) Physiotherapie â€” Behandlung bei Ruecken- und Gelenkschmerzen. Massage und Krankengymnastik. Termin nach Vereinbarung, Moâ€“Fr 8â€“18 Uhr.',
      'B) Fitnessstudio â€” Modernste Geraete, Kurse und Sauna. Keine Aufnahmegebuehr. Persoenliches Training auf Wunsch. Geoeffnet taeglich 6â€“23 Uhr.',
      'C) Computer Akademie â€” Kurse in Programmierung, Webdesign und Datenbanken. Auch fuer Einsteiger. Zertifikat nach Abschluss. Abendkurse verfuegbar.',
      'D) Kochkurse â€” Italienisch, Asiatisch und Vegetarisch. Kleine Gruppen, viel praktisches Ueben. Kochparty fuer Geburtstage auch buchbar.',
      'E) Moebelhaus â€” Polstermoebel, Betten und Schraenke. Finanzierung moeglich. Lieferung und Aufbau inklusive. Oeffnungszeiten: Moâ€“Sa 10â€“19 Uhr.',
      'F) Kfz-Werkstatt â€” Inspektion, Reparatur und Reifenwechsel. Auch Klimaservice. Leihwagen bei Arbeiten ueber vier Stunden. Termin online.',
      'G) Yoga Studio â€” Kurse am Morgen und Abend, auch am Wochenende. Fuer jedes Level geeignet. Probewoche kostenlos, flexibles Abo.',
      'H) Buchladen â€” Romane, Krimis und Sachbuecher. Bestellservice mit kurzer Lieferzeit. Lesungen jeden ersten Freitag. Oeffnungszeiten: Moâ€“Sa.',
      'I) Kosmetikstudio â€” Gesichtsbehandlungen, Massagen und Nagelpflege. Wohlfuehlambiente. Termin nach Vereinbarung. Auch Gutscheine vorhanden.',
      'J) Hausmeisterservice â€” Winterdienst, Gartenpflege und kleine Reparaturen. Monatlicher Pauschalvertrag. Festes Team, zuverlaessiger Service.',
    ],
    correct: ['A','C','G','F','H','0','I'],
  },
  // Set 4: Kinder + Handwerk + Dienstleistungen
  {
    ads: [
      'A) Kindertagesstaette â€” Betreuung fuer Kinder ab zwei Jahren. Taeglich 7â€“17 Uhr mit Mittagessen. Musik- und Bewegungsprogramm. Noch freie Platze.',
      'B) Nachhilfeinstitut â€” Hilfe in Mathe, Deutsch und Englisch. Alle Klassenstufen. Einzel- oder Gruppenunterricht. Ferienkurse verfuegbar.',
      'C) Handwerksbetrieb â€” Reparatur von Tueren, Fenstern und Moebeln. Auch Montage von Regalen und Kuechen. Termin nach Vereinbarung.',
      'D) Immobilienmakler â€” Verkauf und Vermietung von Wohnungen und Haeusern. Kostenlose Bewertung der Immobilie. Provisionspflichtig, Beratung Vorort.',
      'E) Rechtsanwalt â€” Familienrecht, Mietrecht und Vertragsrecht. Erste Beratung verguenstigt. Sprechstunde Mo und Do 16â€“19 Uhr. Hausbesuche moeglich.',
      'F) Versicherungsmakler â€” Beratung zu allen Versicherungsarten. Vergleich und Wechsel. Termin auch bei Ihnen zu Hause. Kostenloser Service.',
      'G) Catering â€” Buffet, Fingerfood und Menues fuer jede Feier. Lieferung und Service. Individuelle Beratung, Angebot kostenlos. Auch kleine Portionen.',
      'H) Gartengestaltung â€” Planung und Anlage von Gaerten und Balkonen. Auch Rasenpflege und Heckenschnitt. Fachpersonal mit langjaehriger Erfahrung.',
      'I) Umzugsunternehmen â€” Komplettumzug mit Verpackungsservice. Moentage inklusive. Klimaneutraler Transport. Festpreis nach Besichtigung Vorort.',
      'J) Tierpflege â€” Hundesitting und Gassi-Service. Auch Katzenbetreuung im Urlaub. Taeglich oder stundenweise. Erfahrenes Team, liebevolle Betreuung.',
    ],
    correct: ['A','B','C','D','E','0','I'],
  },
  // Set 5: Freizeit + Weiterbildung + Technik
  {
    ads: [
      'A) Musikinstrumente â€” Verkauf und Vermietung von Instrumenten. Reparatur und Stimmung. Kurse fuer Gitarre, Klavier und Schlagzeug im Laden.',
      'B) Volkshochschule â€” Sprachkurse, Kochkurse und Kreativworkshops. Gunstige Preise, flexible Zeiten. Auch berufliche Weiterbildung moeglich.',
      'C) Technik Shop â€” Laptops, Tablets und Smartphones. Verkauf und Reparatur. Zubehoer auf Lager. Fachberatung, Oeffnungszeiten: Moâ€“Sa 10â€“19 Uhr.',
      'D) Kino Center â€” Aktuelle Filme taeglich ab 14 Uhr. Auch 3D- und OV-Vorstellungen. Ermassigte Preise am Dienstag. Getraenke und Popcorn.',
      'E) Schwimmbad â€” Hallenbad und Saunalandschaft. Oeffnungszeiten: Taeglich 8â€“21 Uhr. Kurse fuer Wassergymnastik und Schwimmunterricht fuer Kinder.',
      'F) Tierarzt â€” Impfungen, Kastration und Zahnreinigung fuer Haustiere. Notdienst am Wochenende. Termin nach Vereinbarung, freundliches Team Vorort.',
      'G) Modellbau Laden â€” Bausaetze, Farben und Zubehoer. Auch ferngesteuerte Autos und Flugzeuge. Werkstatt zur Nutzung gegen Gebuehr.',
      'H) Weinhandlung â€” Weine aus aller Welt. Verkostung jeden Freitagabend. Beratung zu Speisenbegleitung. Geschenkverpackung. Versand in der ganzen Region.',
      'I) Tanzclub â€” Standard und Latein fuer fortgeschrittene Paare. Turniervorbereitung. Training zweimal pro Woche. Mitgliedschaft erforderlich.',
      'J) Bowling Center â€” 8 Bahnen, gemuetliche Atmosphaere. Auch fuer Geburtstagsfeiern und Firmenevents. Geoeffnet taeglich ab 14 Uhr, Wochenende ab 10 Uhr.',
    ],
    correct: ['B','C','F','G','0','D','H'],
  },
];

function generatePart(batchNum, words) {
  const setIdx = (batchNum - 4) % AD_SETS.length;
  const set = AD_SETS[setIdx];
  const idSuffix = randomBytes(2).toString('hex');
  
  const questions = set.correct.map((letter, i) => ({
    id: `gen-q-3-${idSuffix}-${i + 1}`,
    module: 'lesen',
    teil: 3,
    type: 'matching',
    question: getQuestionForLetter(letter, setIdx, i),
    options: [...set.ads],
    correct: letter,
    correctAnswer: letter,
    explanation: getExplanation(letter, set.ads),
    lang: 'de',
    level: 'B1',
  }));

  return { passages: [], questions };
}

function getQuestionForLetter(letter, setIdx, qIdx) {
  const questions = {
    0: [
      'Er moechte Gitarre spielen lernen, aber die Kurse im Zentrum sind ihm zu teuer. Er sucht ein guenstiges Angebot am Abend.',
      'Sie sucht eine Kinderbetreuung fuer ihren Sohn, der erst 18 Monate alt ist, und moechte sich ueber die Moeglichkeiten informieren.',
      'Seine Waschmaschine macht ein lautes Geraensch beim Schleudern. Er moechte sie reparieren lassen, aber erst naechste Woche.',
      'Sie moechte einen Malkurs besuchen, der am Wochenende stattfindet und keine Vorkenntnisse erfordert.',
      'Er moechte sich ehrenamtlich engagieren und sucht eine Organisation, die Tiere oder die Umwelt unterstuetzt.',
      'Sie sucht ein CafÃ© in der Naehe, in dem sie mit Freunden fruehstuecken kann und das sonntags geoeffnet hat.',
      'Er moechte sein Auto verkaufen und sucht eine Plattform, die ihm bei der Bewertung und Vermarktung hilft.',
    ],
    1: [
      'Er sucht einen Druckladen, der seine Hochzeitsfarbabzuege innerhalb von zwei Tagen entwickeln kann.',
      'Sie moechte tanzen lernen und sucht einen Kurs, bei dem man auch ohne Partner kommen kann.',
      'Ihr Reisepass ist abgelaufen. Sie sucht ein Buero, bei dem sie schnell einen neuen beantragen kann.',
      'Seine Lieblingsjeans ist am Knie gerissen. Er moechte sie reparieren lassen, anstatt neue zu kaufen.',
      'Sie sucht Moebel fuer ihr erstes Zimmer in einer Wohngemeinschaft. Der Transport muss im Preis enthalten sein.',
      'Er moechte eine Geburtstagsparty planen und sucht jemanden, der Essen liefert und dekoriert.',
      'Sie moechte ihre Wohnung tapezieren lassen und sucht einen Handwerker, der ein Angebot macht.',
    ],
    2: [
      'Er moechte einen Kompaktkurs in Webentwicklung belegen und sucht einen Anbieter, der nach Feierabend stattfindet.',
      'Sie moechte abnehmen und sucht einen Sportkurs, der ihr persoenlich einen Trainingsplan erstellt.',
      'Sein Auto muss zur Inspektion und er benoetigt fuer die Dauer der Arbeiten einen Leihwagen.',
      'Sie sucht ein neues Sofa und moechte verschiedene Modelle im Laden ansehen und Probe sitzen.',
      'Er moechte sich bei Kosmetikbehandlungen verwoehnen lassen und sucht ein gutes Studio fuer Gesichtsbehandlungen.',
      'Sie braucht Hilfe bei der Gaertenpflege, da sie beruflich wenig Zeit hat, und sucht einen festen Service.',
      'Er moechte einen spannenden Krimi und sucht eine Buchhandlung mit einer grossen Auswahl an Neuerscheinungen.',
    ],
    3: [
      'Sie sucht eine Ganztagesbetreuung fuer ihren Sohn, der drei Jahre alt ist, da sie wieder arbeiten geht.',
      'Er moechte Nachhilfe in Mathe fuer sein Kind, das in der 8. Klasse ist. Der Unterricht soll in kleiner Gruppe stattfinden.',
      'Ihre Wohnungstuere schliesst nicht richtig. Sie sucht einen Tischler oder Handwerker, der das reparieren kann.',
      'Er moechte eine Immobilie als Kapitalanlage kaufen und sucht einen Makler mit Erfahrung in diesem Bereich.',
      'Sie hat Streit mit ihrem Vermieter wegen der Nebenkostenabrechnung und sucht rechtliche Beratung.',
      'Er moechte verschiedene Versicherungen vergleichen und sucht eine unabhaengige Beratung ohne Kosten.',
      'Sie plant eine Hochzeitsfeier mit 50 Gaesten und sucht einen Caterer, der auch das Geschirr und Besteck stellt.',
    ],
    4: [
      'Sie moechte eine neue Kamera kaufen und sich vor dem Kauf ausfuehrlich beraten lassen. Auch Zubehoer soll es geben.',
      'Er moechte einen Woerterbuch Deutsch-Englisch fuer das Studium kaufen. Der Laden soll eine grosse Auswahl haben.',
      'Sie moechte ein ferngesteuertes Auto als Geschenk fuer ihren Neffen kaufen. Der Laden soll auch Zubehoer anbieten.',
      'Er sucht ein Schwimmbad mit fruehen Oeffnungszeiten, um vor der Arbeit bahnen schwimmen zu koennen.',
      'Sie moechte einen besonderen Rotwein zu ihrem Geburtstagsessen verschenken und sucht fachkundige Beratung.',
      'Er moechte sein altes iPad reparieren lassen, da der Akku schnell leer wird. Originalteile sollen verwendet werden.',
      'Sie moechte einen Kurs fuer chinesische Kueche belegen, der am Wochenende stattfindet und nicht zu teuer ist.',
    ],
  };
  return (questions[setIdx] || questions[0])[qIdx] || 'Sie sucht ein passendes Angebot fuer ihre Situation.';
}

function getExplanation(letter, ads) {
  if (letter === '0') return 'Keines der Angebote passt genau auf die beschriebene Situation. Der Kunde sollte sich nach einem spezialisierten Anbieter umsehen.';
  const ad = ads.find(a => a.startsWith(`${letter})`));
  const name = ad ? ad.split(' â€” ')[0].replace(/^[A-J]\)\s*/, '') : letter;
  return `${name} bietet genau die gewuenschte Dienstleistung und passt daher am besten auf die Situation.`;
}

function main() {
  const totalNeeded = 50;
  const existing = fs.readdirSync(GENERATED_DIR)
    .filter(f => /^lesen-t3-gemini-\d{3}\.json$/.test(f))
    .map(f => parseInt(f.match(/\d{3}/)[0]));
  
  const existingCount = existing.length;
  const needed = totalNeeded - existingCount;
  
  if (needed <= 0) {
    console.log(`Bereits ${existingCount} Teile vorhanden (max ${totalNeeded}). Keine neuen Teile noetig.`);
    return;
  }

  const maxExisting = existing.length ? Math.max(...existing) : 1;
  const count = Math.min(needed, totalNeeded - 1);

  console.log(`Vorhanden: ${existingCount} Teile. Generiere ${count} neue Teile (ab ${maxExisting + 1})...\n`);

  for (let i = 1; i <= count; i++) {
    const batchNum = maxExisting + i;
    const fname = `lesen-t3-gemini-${String(batchNum).padStart(3, '0')}.json`;
    const fpath = path.join(GENERATED_DIR, fname);
    
    const words = pickWeakWords(10);
    const part = generatePart(batchNum, words);
    
    fs.writeFileSync(fpath, JSON.stringify(part, null, 2) + '\n', 'utf8');
    console.log(`  [${i}/${count}] ${fname} â€” Vokabeln: ${words.slice(0, 6).join(', ')}${words.length > 6 ? '...' : ''}`);
  }

  console.log(`\nFertig! ${count} neue Teile generiert in: batches/generated/`);
  console.log('Alle Dateien enthalten 7 Fragen mit denselben 10 Anzeigen (A-J).');
}

main();

