#!/usr/bin/env node
/** Approved 2026-07-25 — 8 Lesen T3 topics: Reisen, Medien, Stadtleben, Ernährung, Freizeit, Sport, Kultur, Technik */
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
    slug: 'bp-reisen-urlaubsservice',
    options: [
      'A) Reisebüro Sonne — Pauschalreisen ans Mittelmeer, Flug und Hotel im Paket, günstige Last-Minute-Angebote, Mo–Sa 10–18 Uhr.',
      'B) VisaService — Einreiseformulare und Schreiben für Auslandsreisen, Expressbearbeitung in 72 Stunden.',
      'C) KofferDoc — Reparatur defekter Trolleys und Koffer, Rollen tauschen, Werkstatt zentral, Mo–Fr.',
      'D) HostelCentral — Günstige Übernachtung in Mehrbettzimmern, defektes Gepäckschloss tauschen, Buchung online.',
      'E) FlugCheck — Billigflüge vergleichen, Umbuchung und Sitzplatzwahl, Hotline täglich 8–20 Uhr.',
      'F) SprachReise — Spanischkurs mit Aufenthalt in Barcelona, zwei Wochen, Unterkunft inklusive.',
      'G) ReiseApo — Reiseimpfungen und Beratung für tropische Länder, Termin mit Impfpass mitbringen.',
      'H) ZugTicket Süd — Fernzug-Tickets in Europa, günstige Sparpreise, Express-Lieferung ans Handy.',
      'I) MietTrans — Transporter kurz mieten, defekte Fahrzeuge in Partner-Werkstatt, Campingurlaub, ab 89 Euro.',
      'J) Stadtführung Alt — Geführte Urlaubstouren in der Altstadt, kostenlose Infos für Touristen, täglich 11 und 15 Uhr.',
    ],
    situations: [
      {
        q: 'Claudia vergleicht Anbieter, weil sie im Sommer einen günstigen Hin- und Rückflug in den Süden buchen will.',
        correct: 'E',
        explanation: 'Bei FlugCheck kann man Billigflüge vergleichen und Sitzplätze wählen.',
      },
      {
        q: 'Als Rucksacktourist sucht Marco eine preiswerte Schlafmöglichkeit mit mehreren Betten im Zentrum.',
        correct: 'D',
        explanation: 'HostelCentral bietet günstige Übernachtung in Mehrbettzimmern.',
      },
      {
        q: 'Die Familie Berger will im September alles aus einer Hand: Anreise per Flugzeug und Hotel am Meer.',
        correct: 'A',
        explanation: 'Das Reisebüro verkauft Pauschalreisen mit Flug und Hotel.',
      },
      {
        q: 'Vor der Reise nach Indien fehlen noch offizielle Formulare und ein Termin bei der Behörde.',
        correct: 'B',
        explanation: 'VisaService hilft bei Formularen für Auslandsreisen.',
      },
      {
        q: 'Der Trolley rollt schief; jemand soll das Gepäckstück in einer Werkstatt wieder brauchbar machen.',
        correct: 'C',
        explanation: 'KofferDoc repariert defekte Trolleys und tauscht Rollen.',
      },
      {
        q: 'Vor dem Abflug in die Tropen braucht sie medizinische Beratung und Impfungen laut Plan.',
        correct: 'G',
        explanation: 'In der ReiseApo kann man Impfungen für tropische Länder bekommen.',
      },
      {
        q: 'Herr Alves möchte eine dauerhafte Niederlassungserlaubnis beantragen.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Hilfe bei der Niederlassungserlaubnis an.',
      },
    ],
  },
  {
    slug: 'bp-medien-rundfunk-print',
    options: [
      'A) RadioStadt — Hörerbriefe und Leserpost für den Community-Sender, formelle Antwort per Mail, Mo–Fr 10–16 Uhr.',
      'B) ZeitungsArchiv — Digitaler Zugriff auf alte Zeitungsausgaben der Region, günstiges Monatsabo 9 Euro.',
      'C) FilmClub Mitte — Gemeinsames Kino jeden Donnerstag, Filmdiskussion wie im Kurs, günstiger Eintritt 6 Euro.',
      'D) PodcastStudio — Podcast-Folgen mit Techniker aufnehmen, Digital-Equipment mieten, Termin online.',
      'E) SocialCheck — Beratung zu Datenschutz in sozialen Netzwerken, Di 17–19 Uhr.',
      'F) DruckExpress — Flyer und Plakate am Drucker, kleine Auflagen, Express-Abholung am nächsten Tag.',
      'G) FernsehTip — Digital-Empfang schwach: Antennen und Router am Receiver einstellen, Hausbesuch möglich.',
      'H) Lesekreis Bib — Romane im Lesekreis besprechen, Einsteigerkurs im Monat, Anmeldung nötig.',
      'I) FotoScan — Papierfotos digitalisieren auf USB-Gerät, Computer-Hilfe inklusive, 20 Cent pro Bild.',
      'J) NachrichtenKurs — Online-Nachrichten im Netz verstehen, Deutschkurs abends, B1-Niveau.',
    ],
    situations: [
      {
        q: 'Sie nutzt soziale Netzwerke täglich und will in den Medien verantwortungsvoller mit persönlichen Daten umgehen.',
        correct: 'E',
        explanation: 'SocialCheck erklärt Datenschutz in sozialen Netzwerken.',
      },
      {
        q: 'Für ein Schulprojekt braucht er Artikel aus den 1980er Jahren aus der Region, am PC lesbar.',
        correct: 'B',
        explanation: 'Im ZeitungsArchiv kann man alte Ausgaben digital lesen.',
      },
      {
        q: 'Zwei Freunde wollen eine Folge für ihr Audio-Projekt professionell aufnehmen.',
        correct: 'D',
        explanation: 'Im PodcastStudio kann man mit Techniker Audio-Aufnahmen machen.',
      },
      {
        q: 'Seit dem Umzug flackert das Bild beim Fernsehen; jemand soll die Technik daheim einstellen.',
        correct: 'G',
        explanation: 'FernsehTip stellt Antennen und Receiver am Fernseher ein.',
      },
      {
        q: 'In der Schublade liegen alte Papierbilder, die digital archiviert werden sollen.',
        correct: 'I',
        explanation: 'FotoScan digitalisiert Papierfotos auf einen USB-Stick.',
      },
      {
        q: 'Donnerstags will sie gemeinsam Filme sehen und über Medieninhalte im kleinen Kreis diskutieren.',
        correct: 'C',
        explanation: 'Im FilmClub kann man Filme sehen und danach diskutieren.',
      },
      {
        q: 'Herr Alves möchte eine dauerhafte Niederlassungserlaubnis beantragen.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Hilfe bei der Niederlassungserlaubnis an.',
      },
    ],
  },
  {
    slug: 'bp-stadtleben-mitmachen',
    options: [
      'A) Bürgerbüro Mitte — Termine für Ausweis und Meldebescheinigung, Formulare und Briefe, Di–Fr 8–18 Uhr.',
      'B) Marktamt — Standplatz auf dem Wochenmarkt beantragen, Beratung per Brief, Saisongebühr, Mi 14–17.',
      'C) Nachbarschaftstreff — Beratung bei Konflikten in der Hausgemeinschaft, Do 18 Uhr, kostenlos.',
      'D) Stadtgrün Amt — Bäume im Viertel pflanzen, Bürgerinitiative, kostenlose Termine im Frühjahr.',
      'E) CarSharing Bürger — Auto in der Nachbarschaft teilen, kurz mieten, defekte Fahrzeuge online melden.',
      'F) Jugendrat — Junge Leute mitgestalten, kaputte Spielplätze melden, Sitzung jeden ersten Mo.',
      'G) RepairMobil — Defekte Straßenlaternen und Schlaglöcher melden, ausgefallene Ampeln, Hotline täglich 7–22 Uhr.',
      'H) VereinsRegister — Gründung eines Sport- oder Kulturvereins, Formulierung per Brief und Erstberatung.',
      'I) Wahlhilfe — Information zu Wahlen und Briefwahl im Stadtviertel, Infostand Sa 10–14.',
      'J) SeniorenBegegnung — Treff für ältere Bürger, Reinigungshilfe vermitteln, Di und Do vormittags.',
    ],
    situations: [
      {
        q: 'Sofia will Schäden an der Straße und ausgefallene Beleuchtung an die Verwaltung weitergeben.',
        correct: 'G',
        explanation: 'Bei RepairMobil kann man Schlaglöcher und defekte Laternen melden.',
      },
      {
        q: 'Er verkauft selbstgemachte Seife und braucht offiziell einen Verkaufsplatz beim Wochenmarkt.',
        correct: 'B',
        explanation: 'Das Marktamt berät zum Standplatz auf dem Wochenmarkt.',
      },
      {
        q: 'Vor der Kommunalwahl will sie wissen, wie Briefwahl im Viertel funktioniert.',
        correct: 'I',
        explanation: 'Wahlhilfe erklärt Wahlen und Briefwahl im Stadtviertel.',
      },
      {
        q: 'Im Frühjahr möchte die Initiative mehr Grün in der Nachbarschaft schaffen.',
        correct: 'D',
        explanation: 'Stadtgrün Amt organisiert Bäume pflanzen im Viertel.',
      },
      {
        q: 'Im Mehrparteienhaus eskaliert ein Streit über Lärm; neutrale Hilfe wird gesucht.',
        correct: 'C',
        explanation: 'Im Nachbarschaftstreff kann man bei Konflikten beraten lassen.',
      },
      {
        q: 'Vier Freunde wollen gemeinsam einen Verein gründen und kennen die Abläufe nicht.',
        correct: 'H',
        explanation: 'VereinsRegister hilft bei der Gründung eines Vereins.',
      },
      {
        q: 'Er möchte tauchen lernen und sucht einen Kurs mit Tauchschein.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Tauchkurse an.',
      },
    ],
  },
  {
    slug: 'bp-ernaehrung-kochen-markt',
    options: [
      'A) Kochkurs Vegan — Gemüsegerichte ohne Fleisch, Küche am Sa 11–14 Uhr, max. 8 Teilnehmer.',
      'B) Marktführung — Tour über den Wochenmarkt, Tipps zu saisonalem Gemüse fürs Kochen, So 9 Uhr.',
      'C) Ernährungsberatung — Persönlicher Essensplan bei Diabetes, Termin mit Krankenkassennachweis.',
      'D) BrotBackstube — Sauerteig in der Küche selbst herstellen, Fr 17–20 Uhr, Mehl inklusive.',
      'E) FertigEssen Abholung — Vorbereitete Mahlzeiten abholen, vegetarisch und vegan, Mo–Fr 12–19.',
      'F) AllergieCheck — Unverträglichkeiten testen, Labortermin und Auswertung, Di–Do.',
      'G) FermentKurs — Kimchi und Sauerkraut zuhause herstellen, monatlich, Anmeldung per E-Mail.',
      'H) RestaurantGutschein — Rabattcodes günstig für Restaurants, online bestellen.',
      'I) ObstKiste — Bio-Obst und Gemüse wöchentlich nach Hause liefern, Abo monatlich kündbar.',
      'J) KochbuchCafé — Rezepte aus aller Welt ausprobieren, jeden dritten Mi, 18 Euro inkl. Zutaten.',
    ],
    situations: [
      {
        q: 'Sie möchte ohne Fleisch kochen lernen und sucht eine praktische Gruppe am Wochenende.',
        correct: 'A',
        explanation: 'Im Kochkurs Vegan kann man Gemüsegerichte ohne Fleisch lernen.',
      },
      {
        q: 'Die Familie möchte regelmäßig eine Kiste mit regionalem Essen nach Hause bestellen.',
        correct: 'I',
        explanation: 'ObstKiste liefert Bio-Obst und Gemüse wöchentlich nach Hause.',
      },
      {
        q: 'Er kennt sich nicht aus, welche Produkte im Moment saisonal sind, und sucht jemanden, der ihn begleitet.',
        correct: 'B',
        explanation: 'Die Marktführung erklärt saisonale Produkte auf dem Markt.',
      },
      {
        q: 'Seit langem will sie ihr eigenes Sauerteigbrot backen und braucht Anleitung vor Ort.',
        correct: 'D',
        explanation: 'In der BrotBackstube kann man Sauerteigbrot backen lernen.',
      },
      {
        q: 'Nach der Arbeit holt er lieber fertige Gerichte ab, ohne Fleisch und ohne Fisch.',
        correct: 'E',
        explanation: 'Bei FertigEssen Abholung gibt es vegetarische Mahlzeiten zum Mitnehmen.',
      },
      {
        q: 'Der Arzt empfahl, den Blutzucker im Alltag besser zu steuern — professionelle Hilfe gesucht.',
        correct: 'C',
        explanation: 'Die Ernährungsberatung erstellt einen persönlichen Plan bei Diabetes.',
      },
      {
        q: 'Sie möchte Reiten lernen und sucht einen Reitverein.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Reitunterricht an.',
      },
    ],
  },
  {
    slug: 'bp-freizeit-hobby-abend',
    options: [
      'A) BastelWerk — Bastelkurs mit Papier und Filz, defekte Scheren tauschen, Sa 14–17, Werkzeug leihen im Raum.',
      'B) BrettspielCafé — Spiele ausleihen, Regeln erklärt, Fr ab 18 Uhr, Getränke an der Bar.',
      'C) Wanderverein — Geführte Spaziergänge, auch für Urlauber und Reisegäste, wöchentlich, Treffpunkt Bahnhof.',
      'D) SprachTandem — Partner zum Reden, Vokabelliste per Mail, Di 19 Uhr im Kulturhaus.',
      'E) Fotowalk — Hobby-Fotografieren in der City, Urlaubsfotos und Kameratipps, monatlich am Samstag.',
      'F) KreativSchreib — Geschichten in der Gruppe schreiben, Mi 18–20 Uhr, Anfänger willkommen.',
      'G) YogaFreizeit — Entspannung nach der Arbeit, sanfte Übungen, Do 19:30, Matte mitbringen.',
      'H) ModellbauClub — Schiffe und Flugzeuge bauen, Werkstatt im Vereinsheim, defekte Teile tauschen, Sa 10–16 Uhr.',
      'I) LesenLive — Vorlesen und Bücher besprechen, Lesezettel per Mail, erster Fr im Monat, 19 Uhr.',
      'J) KletterHalle — Einsteigerkurs an der Kletterwand, Helm und Gurte leihen, So 10–12 Uhr.',
    ],
    situations: [
      {
        q: 'Freitagabend will sie mit Freunden etwas spielen, ohne zu Hause Regeln zu lesen.',
        correct: 'B',
        explanation: 'Im BrettspielCafé kann man Spiele ausleihen und Regeln erklären lassen.',
      },
      {
        q: 'Am Sonntag sucht er Bewegung an der frischen Luft mit einer Gruppe nahe der Stadt.',
        correct: 'C',
        explanation: 'Der Wanderverein bietet geführte Spaziergänge am Sonntag.',
      },
      {
        q: 'Sie schreibt gern und möchte Texte mit anderen besprechen, ohne Vorerfahrung.',
        correct: 'F',
        explanation: 'Bei KreativSchreib kann man Geschichten in der Gruppe schreiben.',
      },
      {
        q: 'In seiner Freizeit baut er kleine Flugzeuge aus Bausätzen und sucht Gleichgesinnte.',
        correct: 'H',
        explanation: 'Im ModellbauClub kann man Schiffe und Flugzeuge bauen.',
      },
      {
        q: 'Er will einmal hochklettern, ohne eigene Ausrüstung mitzubringen.',
        correct: 'J',
        explanation: 'In der KletterHalle kann man als Einsteiger klettern und Ausrüstung leihen.',
      },
      {
        q: 'Am Samstagnachmittag fehlt ihr eine manuelle Beschäftigung; Werkzeug soll vor Ort bereitstehen.',
        correct: 'A',
        explanation: 'Im BastelWerk gibt es Material für kreative Projekte am Wochenende.',
      },
      {
        q: 'Er braucht einen Steuerberater für seine Selbstständigkeit.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Steuerberatung an.',
      },
    ],
  },
  {
    slug: 'bp-sport-verein-bewegung',
    options: [
      'A) SchwimmSchule — Unterricht für Erwachsene ohne Vorkenntnisse, schriftliche Anmeldung, Di und Do 19 Uhr.',
      'B) LaufTreff — Gemeinsames Joggen im Park, Laufkurs für Einsteiger, Di und Fr 18:30.',
      'C) VereinFit — Fußballtraining als Hobbykurs ab 16, Mo und Mi auf Kunstrasen.',
      'D) RückenKurs — Übungen gegen Schmerzen im Büroalltag, Unterricht mit Physio, schriftliche Anmeldung, Mi 12 Uhr.',
      'E) TennisPlatz — Plätze mieten und Schläger leihen, Sa–So 8–22 Uhr, online reservieren.',
      'F) RadSport — Geführte Touren mit dem Mountainbike, Helm leihen, So ab 9 Uhr.',
      'G) KampfSport Dojo — Anfängerkurs Selbstverteidigung, Di und Do 20 Uhr, Probetraining kostenlos.',
      'H) SkiVerleih — Ausrüstung für den Winterurlaub leihen, Skistiefel anpassen, Dez–Mrz.',
      'I) TurnierCup — Anmeldung für Amateurliga im Hallenfußball, schriftliche Bestätigung, Frist bis 15. März.',
      'J) YogaSport — Kräftigung und Dehnung, Unterricht in der Sporthalle, Mi 18 Uhr.',
    ],
    situations: [
      {
        q: 'Mit Mitte dreißig kann sie nicht schwimmen und traut sich nur in kleiner Gruppe.',
        correct: 'A',
        explanation: 'In der SchwimmSchule kann man als Erwachsener ohne Vorkenntnisse lernen.',
      },
      {
        q: 'Er spielt gern mit dem Ball und sucht regelmäßiges Training auf Kunstrasen.',
        correct: 'C',
        explanation: 'VereinFit bietet Fußballtraining für Hobbyspieler auf Kunstrasen.',
      },
      {
        q: 'Am Wochenende wollen sie zwei Stunden Tennis spielen und brauchen Platz und Schläger.',
        correct: 'E',
        explanation: 'Beim TennisPlatz kann man Plätze mieten und Schläger leihen.',
      },
      {
        q: 'Nach der Arbeit joggt sie lieber in einer Gruppe, statt allein durch die Straßen zu laufen.',
        correct: 'B',
        explanation: 'Beim LaufTreff kann man gemeinsam im Park joggen.',
      },
      {
        q: 'Ihr Hobbyteam will offiziell an einer Amateur-Runde im Hallenfußball teilnehmen.',
        correct: 'I',
        explanation: 'TurnierCup nimmt Anmeldungen für die Amateurliga im Hallenfußball entgegen.',
      },
      {
        q: 'Sie möchte lernen, sich in brenzligen Situationen zu wehren — Anfängerniveau.',
        correct: 'G',
        explanation: 'Im KampfSport Dojo gibt es einen Anfängerkurs Selbstverteidigung.',
      },
      {
        q: 'Er sucht jemanden, der sein Klavier stimmt.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Klavierstimmung an.',
      },
    ],
  },
  {
    slug: 'bp-kultur-buehne-museum',
    options: [
      'A) TheaterProbe — Mitspielen in einer Amateurkomödie, Probe Di und Fr ab 19 Uhr.',
      'B) MuseumNacht — Sonderführung durch die Dauerausstellung, 20. des Monats, günstig 12 Euro.',
      'C) KonzertKasse — Karten kaufen für klassische Musik im Stadtsaal, Vorverkauf und Abendkasse.',
      'D) GalerieKunst — Eigene Bilder in der Gruppenausstellung zeigen, Verkauf über Verein, Bewerbung bis Ende April.',
      'E) FilmRetro — Stummfilme mit Live-Musik, Probe am Abend, günstige Karten online bestellen, letzter Sa.',
      'F) ChorEinstieg — Gemeinsam singen ohne Notenkenntnisse, Mo 18:30, Probe im Gemeindehaus.',
      'G) LesungAutor — Dichter lesen aus neuen Romanen, Eintritt frei, Do 19 Uhr in der Bibliothek.',
      'H) TanzShow — Moderner Bühnentanz als Zuschauer, Premiere am 8., Kartenkauf online.',
      'I) InstrumentLeih — Violine oder Cello drei Monate leihen, für Schüler und Erwachsene.',
      'J) KulturPass — Ermäßigungen unter 25 Jahren, günstige Kulturangebote, Antrag im Bürgerbüro.',
    ],
    situations: [
      {
        q: 'Am Abend des 20. will sie die Dauerausstellung mit einer Führung erleben.',
        correct: 'B',
        explanation: 'MuseumNacht bietet eine Sonderführung durch die Dauerausstellung.',
      },
      {
        q: 'Für den Besuch im Stadtsaal braucht er noch Eintrittskarten für ein Orchesterkonzert.',
        correct: 'C',
        explanation: 'An der KonzertKasse kann man Karten für klassische Musik kaufen.',
      },
      {
        q: 'Er träumt davon, auf der Bühne in einer Lustspiel-Produktion mitzuwirken.',
        correct: 'A',
        explanation: 'Bei TheaterProbe kann man in einer Amateurkomödie mitspielen.',
      },
      {
        q: 'Sie singt gern, kann aber keine Noten lesen, und sucht eine Gruppe.',
        correct: 'F',
        explanation: 'ChorEinstieg ist für Singen ohne Notenkenntnisse geeignet.',
      },
      {
        q: 'Im Kino interessieren sie alte Filme ohne Ton, aber mit Live-Begleitung.',
        correct: 'E',
        explanation: 'FilmRetro zeigt Stummfilme mit Live-Musik.',
      },
      {
        q: 'Der Maler möchte erstmals Werke öffentlich in einer gemeinsamen Schau präsentieren.',
        correct: 'D',
        explanation: 'GalerieKunst ermöglicht Bilder in einer Gruppenausstellung.',
      },
      {
        q: 'Ihr Auto braucht einen Ölwechsel in der Werkstatt.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Ölwechsel für Autos an.',
      },
    ],
  },
  {
    slug: 'bp-technik-geraete-hilfe',
    options: [
      'A) HandyWerk — Display und Akku am Smartphone tauschen, viele Marken, Express oft in 24 h.',
      'B) PC-Hilfe — Computer langsam oder defekt, Viren entfernen, Hausbesuch oder aus der Ferne, Mo–Sa.',
      'C) WLANSetup — Router einrichten und Internet im ganzen Haus, Festpreis 49 Euro, Termin online.',
      'D) DruckScan — Drucker installieren und Scannen üben, Senioren willkommen, Di 14–17 Uhr.',
      'E) AppLern — Smartphone-Apps für Alltag und Behörden, Kurs für Einsteiger, Mi 10–12 Uhr.',
      'F) DatenRetter — Fotos retten von defekter Festplatte, Diagnose gratis, Erfolg ab 60 Prozent.',
      'G) Fernseher4K — Neuen Fernseher an die Wand hängen und Sender sortieren, Samstag-Service.',
      'H) Kinderschutz — Kindersicherung auf Tablet und Konsole, Beratung, Do 16–18 Uhr.',
      'I) OnlineBank — Online-Banking sicher nutzen, Einzelcoaching, 35 Euro pro Stunde.',
      'J) LaptopLeih — Leihgerät, während das eigene Notebook in Reparatur ist, ab 5 Euro pro Tag.',
    ],
    situations: [
      {
        q: 'Das Mobiltelefon zeigt Risse und reagiert schlecht — eine Reparatur wäre nötig.',
        correct: 'A',
        explanation: 'HandyWerk tauscht Display und Akku am Smartphone.',
      },
      {
        q: 'Zuhause soll das WLAN ohne Kabel in allen Räumen laufen; das neue Modem steht bereit.',
        correct: 'C',
        explanation: 'WLANSetup richtet Router und Internet im ganzen Haus ein.',
      },
      {
        q: 'Der Rechner startet träge und zeigt ständig Warnungen wegen Schadsoftware.',
        correct: 'B',
        explanation: 'PC-Hilfe entfernt Viren und repariert langsame Computer.',
      },
      {
        q: 'Nach dem Absturz der Festplatte sind Urlaubsbilder verloren — Rettung wird gesucht.',
        correct: 'F',
        explanation: 'DatenRetter kann Fotos von defekter Festplatte retten.',
      },
      {
        q: 'Sie hat ein neues Smartphone und versteht die wichtigsten Programme für Formulare nicht.',
        correct: 'E',
        explanation: 'AppLern erklärt Smartphone-Apps für Alltag und Behörden.',
      },
      {
        q: 'Ihr Laptop ist in der Werkstatt — sie braucht ein Ersatzgerät zum Arbeiten.',
        correct: 'J',
        explanation: 'LaptopLeih verleiht ein Gerät während die Reparatur dauert.',
      },
      {
        q: 'Sie sucht eine Schneiderin für die Änderung eines Abendkleides.',
        correct: '0',
        explanation: 'Keine Anzeige bietet Schneiderarbeiten an.',
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
