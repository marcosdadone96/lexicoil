#!/usr/bin/env node
/** One-off builder for approved 2026-07-25 T3 blueprints — run: node scripts/lib/buildApprovedT3Blueprints.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality } from './lesenBatchQuality.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../t3-blueprints');

function mkBlueprint(slug, options, situations) {
  const questions = situations.map((s, i) => ({
    id: `${slug}-q${i + 1}`,
    module: 'lesen',
    teil: 3,
    type: 'matching',
    question: s.q,
    options: [...options],
    correct: s.correct,
    correctAnswer: s.correct,
    explanation: s.explanation,
    lang: 'de',
    level: 'B1',
  }));
  return { slug, passages: [], questions };
}

const blueprints = [
  {
    slug: 'bp-bildung-sprachcafe',
    options: [
      'A) Volkshochschule Mitte — Deutschkurs B1 abends, Mo und Mi 18–20 Uhr, Anmeldung online oder vor Ort.',
      'B) LingvoApp — Online-Sprachkurse mit Tutor per Video, auch Prüfungsvorbereitung, ab 29 Euro im Monat.',
      'C) Sprachcafé Nord — Kostenlose Konversationsrunden im Gemeindezentrum, Do 17–19 Uhr, Kaffee inklusive.',
      'D) Wortwerk — Übersetzungen Deutsch–Englisch für Zeugnisse und Behördenbriefe, Express in 48 Stunden.',
      'E) Jobcenter Beratung — Kostenlose Termine für Integrationskurs und Berufssprachkurs, Di–Fr 9–16 Uhr.',
      'F) Lernclub Kids — Nachhilfe Mathematik und Deutsch für Klassen 5–10, kleine Gruppen, 20 Euro.',
      'G) Prüfungszentrum Goethe — Vorbereitungskurs B1 Prüfung, Intensivwoche oder Abendkurs.',
      'H) FirmenSprache — Inhouse-Deutschkurse für Teams, Termine nach Absprache, auch online.',
      'I) Stadtbibliothek — Nachhilfe in Rechtschreibung und Schreibwerkstatt für Erwachsene, Mi 15–18 Uhr.',
      'J) Studienberatung Uni — Kostenlose Info zu Studiengängen und Bewerbung, Sprechstunde Di 10–14 Uhr.',
    ],
    situations: [
      {
        q: 'Markus arbeitet tagsüber und sucht einen Abendkurs für Erwachsene in der Innenstadt.',
        correct: 'A',
        explanation: 'An der Volkshochschule kann man B1-Deutsch am Abend besuchen.',
      },
      {
        q: 'Amina ist neu in Deutschland und braucht einen offiziellen Termin für den Spracheinstieg.',
        correct: 'E',
        explanation: 'Das Jobcenter berät zu Integrations- und Berufssprachkursen.',
      },
      {
        q: 'Ein Jugendlicher in der siebten Klasse braucht Hilfe bei Algebra und Geometrie.',
        correct: 'F',
        explanation: 'Der Lernclub bietet Nachhilfe für Schüler der Klassen 5 bis 10.',
      },
      {
        q: 'Thomas muss in acht Wochen eine wichtige Sprachprüfung bestehen und sucht gezielte Vorbereitung.',
        correct: 'G',
        explanation: 'Das Prüfungszentrum bereitet gezielt auf die B1-Prüfung vor.',
      },
      {
        q: 'Eine Firma will ihren internationalen Mitarbeitern Sprachtraining am Arbeitsplatz anbieten.',
        correct: 'H',
        explanation: 'FirmenSprache organisiert Inhouse-Kurse für Teams.',
      },
      {
        q: 'Rita ist Rentnerin und möchte ohne Prüfungsdruck locker im Gespräch üben.',
        correct: 'C',
        explanation: 'Im Sprachcafé kann man locker Deutsch üben, ohne Prüfungsdruck.',
      },
      {
        q: 'Herr Vogel sucht einen Klavierunterricht für sich selbst am Wochenende.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Musikunterricht am Klavier an.',
      },
    ],
  },
  {
    slug: 'bp-verkehr-mobilitaetspass',
    options: [
      'A) Mobilitätszentrum Stadt — Beratung zu Bus, Bahn, Mietwagen und Carsharing, Mo–Fr 10–18 Uhr.',
      'B) Führerscheinstelle — Umschreibung ausländischer Führerscheine, nur mit Termin, Di und Do.',
      'C) ShareNow Station — Carsharing-Autos kurzzeitig mieten, auch fürs Wochenende und Urlaub, App nötig.',
      'D) ScootCity — E-Scooter und Leihfahrzeuge, Reparatur defekter Roller, Monatspässe.',
      'E) Park&Ride West — Auto parken, S-Bahn in die Innenstadt, günstiges Tagesticket ab 6 Euro.',
      'F) Radwerk Süd — Reparatur defekter Fahrräder und E-Bikes, Service oft innerhalb von 24 Stunden.',
      'G) Fundbüro Hauptbahnhof — Verlorenes Reisegepäck und Taschen melden, täglich 8–20 Uhr.',
      'H) ADAC Straßenhilfe — Pannenhilfe, Abschleppen und kleine Reparatur am Auto, Einzelrechnung möglich.',
      'I) TicketApp Support — Online-Fahrkarten und günstige Monats-Abos, Hotline täglich.',
      'J) Sozialamt Verkehr — Antrag auf Schwerbehindertenausweis und Parkausweis, Termin online.',
    ],
    situations: [
      {
        q: 'Lisa plant ein Wochenende außerhalb der Stadt und möchte ein Auto nur für zwei Tage nutzen.',
        correct: 'C',
        explanation: 'Carsharing eignet sich für kurze Mietzeiten am Wochenende.',
      },
      {
        q: 'Omar hat seinen Führerschein aus dem Ausland und muss ihn hier amtlich anerkennen lassen.',
        correct: 'B',
        explanation: 'Die Führerscheinstelle ist für Umschreibungen zuständig.',
      },
      {
        q: 'Kevin pendelt zur Arbeit und sucht kleine Elektrofahrzeuge mit Monatsflatrate.',
        correct: 'D',
        explanation: 'ScootCity vermietet E-Scooter mit Tages- und Monatspässen.',
      },
      {
        q: 'Sabine wohnt am Stadtrand und will mit dem Auto zum Parkplatz fahren und dann die Bahn nehmen.',
        correct: 'E',
        explanation: 'Park&Ride verbindet Parkplatz und S-Bahn-Ticket.',
      },
      {
        q: 'Felix bekommt auf dem Weg zur Arbeit einen Platten und braucht schnelle Hilfe für sein Rad.',
        correct: 'F',
        explanation: 'Radwerk repariert Fahrräder mit Express-Service.',
      },
      {
        q: 'Julia hat im Zug ihre Tasche liegen lassen und möchte sie offiziell melden.',
        correct: 'G',
        explanation: 'Am Hauptbahnhof kann man verlorene Gegenstände melden.',
      },
      {
        q: 'Peter sucht einen Klavierunterricht für seine Tochter am Wochenende.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Musikunterricht an.',
      },
    ],
  },
  {
    slug: 'bp-umwelt-repair-kleidung',
    options: [
      'A) Repair-Café Grün — Defekte Textilien kostenlos instand setzen, Sa 10–14 Uhr, Material mitbringen.',
      'B) Abfallberatung Kreis — Mülltrennung in Mehrfamilienhäusern, Tipps zum Sparen, Hausbesuch möglich.',
      'C) Kompost-Werkstatt — Kurs für organische Reste in der Wohnung, Anmeldung per E-Mail.',
      'D) EnergieSpart — Tipps zum Strom sparen und LED-Umrüstung, Beratung zu Hause oder online.',
      'E) Tauschbörse Mode — Kleidertausch kostenlos, jeden ersten Samstag im Kulturhaus.',
      'F) Unverpackt Laden — Refill für Shampoo und Reiniger, günstige Nachfüllung, Behälter mitbringen.',
      'G) SolarInfo — Informationsabend Photovoltaik auf dem Dach, Di 19 Uhr, Eintritt frei.',
      'H) Caritas Kleiderkammer — Spenden und günstige Second-Hand-Kleidung, Mo–Mi 9–12 Uhr.',
      'I) Gartenfreunde — Gemeinschaftsbeete pflegen ohne Chemie, neue Mitglieder willkommen.',
      'J) Flussufer Aktion — Müllsammeln am Ufer, Pflege der Natur, Termin am 15., Anmeldung per Mail.',
    ],
    situations: [
      {
        q: 'Eva möchte ihre Lieblingsjacke retten, statt sie wegzuwerfen und Müll zu produzieren.',
        correct: 'A',
        explanation: 'Im Repair-Café kann man defekte Textilien instand setzen lassen.',
      },
      {
        q: 'Die Verwaltung eines Gebäudes braucht Hilfe bei Mülltrennung und Recycling für alle Parteien.',
        correct: 'B',
        explanation: 'Die Abfallberatung erklärt Mülltrennung in Mehrfamilienhäusern.',
      },
      {
        q: 'Jonas will Speisereste nachhaltig nutzen und weniger Restmüll erzeugen.',
        correct: 'C',
        explanation: 'Die Kompost-Werkstatt zeigt Umgang mit organischen Resten.',
      },
      {
        q: 'Die Bewohner Schmidt wollen Energie sparen und die Stromrechnung deutlich senken.',
        correct: 'D',
        explanation: 'EnergieSpart berät zum Stromsparen und zu LED.',
      },
      {
        q: 'Mira hat zu viele Kleider und möchte sie gegen andere tauschen, ohne zu kaufen.',
        correct: 'E',
        explanation: 'Die Tauschbörse organisiert Kleidertausch.',
      },
      {
        q: 'Ahmed engagiert sich für Naturschutz im Viertel und sucht Arbeit ohne Chemie.',
        correct: 'I',
        explanation: 'Bei Gartenfreunden erklärt man, wie man Beete ohne Chemie pflegt.',
      },
      {
        q: 'Frau Klein braucht einen Steuerberater für ihre Selbstständigkeit.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Steuerberatung an.',
      },
    ],
  },
  {
    slug: 'bp-arbeit-homeoffice-setup',
    options: [
      'A) Arbeitsagentur Coach — Bewerbungstraining und Jobcoaching, kostenlos mit Termin, Mo–Fr.',
      'B) Steuerhilfe Klein — Beratung zu Minijob und Schriftverkehr mit dem Finanzamt, Erstgespräch 45 Euro.',
      'C) ErgoDesk — Ergonomie am Computer-Arbeitsplatz und im Büro, Homeoffice-Beratung vor Ort oder online.',
      'D) Bewerbungsbild Pro — Professionelle Fotos für Bewerbung und Business-Profile, Studio Innenstadt.',
      'E) ÜbersetzTeam — Beglaubigte Übersetzung von Zeugnissen und Behördenbriefen, Deutsch–Englisch, 3–5 Tage.',
      'F) Cowork Space Mitte — Tagespass mit Schreibtisch, WLAN und ruhigem Büro, 18 Euro pro Tag.',
      'G) ExcelKurs Live — Online-Kurs Tabellen für Büroarbeit, abends, Zertifikat inklusive.',
      'H) Betriebsrat Hotline — Rechtliche Erstinfo für Arbeitnehmerfragen, anonym, Di 18–20 Uhr.',
      'I) WorkWear Outlet — Günstige Berufskleidung und Sicherheitsschuhe, Sa 9–16 Uhr.',
      'J) Bildungsgutschein Check — Kostenlose Prüfung von Weiterbildung und Kurswahl, Termin online.',
    ],
    situations: [
      {
        q: 'Sandra arbeitet von zu Hause und bekommt Rückenschmerzen — sie braucht Beratung zur Arbeitsplatzgestaltung.',
        correct: 'C',
        explanation: 'Bei ErgoDesk kann man Tipps für ein gesundes Homeoffice bekommen.',
      },
      {
        q: 'Luca hat nebenbei einen Minijob und ist unsicher, wie er das steuerlich machen muss.',
        correct: 'B',
        explanation: 'Steuerhilfe Klein berät zu Minijobs und Schriftverkehr.',
      },
      {
        q: 'Nadia bewirbt sich gerade und braucht ein aktuelles Foto für ihre Unterlagen.',
        correct: 'D',
        explanation: 'Bewerbungsbild Pro macht Bewerbungsfotos.',
      },
      {
        q: 'Herr Weber braucht sein deutsches Arbeitszeugnis auf Englisch für eine Stelle im Ausland.',
        correct: 'E',
        explanation: 'ÜbersetzTeam übersetzt Arbeitszeugnisse.',
      },
      {
        q: 'Tim sucht einen ruhigen Platz außerhalb der Wohnung, um konzentriert zu arbeiten.',
        correct: 'F',
        explanation: 'Cowork Space bietet Tagespässe mit Schreibtisch.',
      },
      {
        q: 'Elena wurde gekündigt und sucht Hilfe bei Bewerbungsschreiben und Vorstellungsgesprächen.',
        correct: 'A',
        explanation: 'Die Arbeitsagentur bietet Bewerbungstraining und Jobcoaching.',
      },
      {
        q: 'Karim möchte seinen Hund in den Ferien unterbringen.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Tierbetreuung an.',
      },
    ],
  },
];

let failed = false;
for (const bp of blueprints) {
  const out = mkBlueprint(bp.slug, bp.options, bp.situations);
  const batch = { passages: [], questions: out.questions, level: 'B1' };
  const quality = checkLesenBatchQuality(batch, 3);
  if (!quality.ok) {
    failed = true;
    console.error(`${bp.slug} quality FAIL:`);
    for (const i of quality.issues) console.error(' ', i);
  }
  const file = path.join(DIR, `${bp.slug}.json`);
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log('wrote', path.basename(file), quality.ok ? 'OK' : 'FAIL');
}
if (failed) process.exit(1);
