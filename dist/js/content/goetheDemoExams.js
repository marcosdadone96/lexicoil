/* Goethe-Zertifikat demo exams - structure based on official Modellsatz (scaled per level). */
const GoetheDemoExams = (() => {
  const CERT = {
    A1: 'Start Deutsch 1',
    A2: 'Start Deutsch 2',
    B1: 'Goethe-Zertifikat B1',
    B2: 'Goethe-Zertifikat B2',
    C1: 'Goethe-Zertifikat C1',
    C2: 'Goethe-Zertifikat C2',
  };

  function mc(id, q, a, b, c, correct) {
    return { id, type: 'multiple', question: q, options: [`a) ${a}`, `b) ${b}`, `c) ${c}`], correct };
  }
  function rf(id, q, correct) {
    return { id, type: 'rf', question: q, correct };
  }
  function yn(id, q, correct) {
    return { id, type: 'yn', question: q, correct };
  }
  function match(id, q, labels, correct) {
    const opts = labels.map((l, i) => `${String.fromCharCode(97 + i)}) ${l}`);
    return { id, type: 'match', question: q, options: opts, correct, matchLabels: labels };
  }

  const LEVEL_CFG = {
    A1: { lesenParts: 2, horenParts: 2, schreibenTasks: 2, sprechenTasks: 2, w1: 0, w2: 30, w3: 0 },
    A2: { lesenParts: 3, horenParts: 2, schreibenTasks: 1, sprechenTasks: 2, w1: 60, w2: 0, w3: 0 },
    B1: { lesenParts: 5, horenParts: 4, schreibenTasks: 3, sprechenTasks: 3, w1: 80, w2: 80, w3: 40 },
    B2: { lesenParts: 5, horenParts: 4, schreibenTasks: 3, sprechenTasks: 3, w1: 150, w2: 200, w3: 60 },
    C1: { lesenParts: 5, horenParts: 4, schreibenTasks: 3, sprechenTasks: 3, w1: 170, w2: 170, w3: 55 },
    C2: { lesenParts: 5, horenParts: 4, schreibenTasks: 3, sprechenTasks: 3, w1: 190, w2: 190, w3: 65 },
  };

  function build(level) {
    if (level === 'A1') return buildA1();
    if (level === 'A2') return buildA2();
    if (level === 'B1') return buildB1();
    if (level === 'B2') return buildB2();
    if (level === 'C1') return buildC1();
    if (level === 'C2') return buildC2();
    const cfg = LEVEL_CFG[level] || LEVEL_CFG.B1;
    const exam = {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level,
      topic: 'Modellsatz Demo',
      official: {
        board: 'Goethe-Institut',
        certificate: CERT[level],
        note:
          'Modellsatz (Demo). Aufgabentypen, Teile und Anweisungen orientieren sich am offiziellen Goethe-Zertifikat ' +
          level +
          '.',
      },
      modules: {
        lesen: { title: 'Lesen', time: level === 'A1' || level === 'A2' ? '45 Minuten' : '65 Minuten' },
        horen: { title: 'Hoeren', time: level === 'A1' ? '25 Minuten' : '40 Minuten' },
        schreiben: { title: 'Schreiben', time: level === 'A1' ? '30 Minuten' : '60 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: buildLesen(level, cfg),
      horenParts: buildHoren(level, cfg),
      schreibenParts: buildSchreiben(level, cfg),
      sprechenParts: buildSprechen(level, cfg),
    };
    return exam;
  }

  function buildA1() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level: 'A1',
      topic: 'Alltag und Familie',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Start Deutsch 1',
        note: 'Modellsatz (Demo). Aufgabentypen basieren auf dem offiziellen Start Deutsch 1.',
      },
      modules: {
        lesen: { title: 'Lesen', time: '25 Minuten' },
        horen: { title: 'Hoeren', time: 'ca. 20 Minuten' },
        schreiben: { title: 'Schreiben', time: '20 Minuten' },
        sprechen: { title: 'Sprechen', time: 'ca. 15 Minuten' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '5 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie die Texte –.\nZu jedem Text gibt es eine Aufgabe.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          items: [
            {
              id: 'l1',
              signText: 'Bitte keine E-Mails! Nur Anrufe zwischen 9 und 17 Uhr.',
              question: 'Was soll man tun?',
              options: ['a) Eine E-Mail schreiben', 'b) Anrufen', 'c) Bis morgen warten'],
              correct: 'b',
            },
            {
              id: 'l2',
              signText: 'Bitte leise! Das Baby schlaeft.',
              question: 'Was bedeutet das?',
              options: ['a) Laut sprechen', 'b) Leise sein', 'c) Musik hoeren'],
              correct: 'b',
            },
            {
              id: 'l3',
              signText: 'SMS von Mama: Abendessen ist um 19 Uhr. Bitte puenktlich!',
              question: 'Was bedeutet das?',
              options: ['a) Das Essen ist um 19 Uhr', 'b) Mama kommt spaeter', 'c) Es gibt kein Abendessen'],
              correct: 'a',
            },
            {
              id: 'l4',
              signText: 'Familienfest am Sonntag — alle willkommen!',
              question: 'Was bedeutet das?',
              options: ['a) Nur fuer Kinder', 'b) Fest fuer die Familie', 'c) Das Geschaeft ist zu'],
              correct: 'b',
            },
            {
              id: 'l5',
              signText: 'Anrufbeantworter: Oma ist krank. Bitte heute anrufen.',
              question: 'Was soll man tun?',
              options: ['a) Oma heute anrufen', 'b) Oma besuchen gehen', 'c) Nichts tun'],
              correct: 'a',
            },
          ],
        },
        {
          teil: 2,
          arbeitszeit: '8 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text und die Aufgaben –0.\nEntscheiden Sie: Ist jede Aussage richtig oder falsch?',
          textTitle: 'E-Mail von Mehmet',
          text:
            'Hallo liebe Freunde,\n\nich heisse Mehmet und wohne in Koeln. Ich lebe mit meiner Frau Ayse und unseren zwei Kindern in einer kleinen Wohnung. Meine Tochter Elif ist sechs Jahre alt. Mein Sohn Can ist neun. Jeden Morgen bringe ich die Kinder um acht Uhr in die Schule. Ayse arbeitet in einem Supermarkt.\n\nAm Dienstag geht meine Mutter zum Arzt — ich fahre sie dorthin. Am Samstag kochen wir zusammen und besuchen oft meinen Bruder in Duesseldorf.\n\nViele Gruesse\nMehmet',
          questions: [
            rf('l6', '6  Mehmet wohnt in Koeln.', 'R'),
            rf('l7', '7  Mehmet hat drei Kinder.', 'F'),
            rf('l8', '8  Elif ist neun Jahre alt.', 'F'),
            rf('l9', '9  Am Dienstag faehrt Mehmet seine Mutter zum Arzt.', 'R'),
            rf('l10', '10  Am Samstag kochen sie oft zusammen.', 'R'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Hoeren Teil 1\nSie hoeren fuenf kurze Texte.\nSie hoeren jeden Text zweimal.\nZu jedem Text gibt es eine Aufgabe.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          segments: [
            {
              id: 'h1',
              label: 'Text 1 — Anrufbeantworter',
              transcript:
                'Hallo, hier spricht Frau Weber vom Kindergarten Sonnenschein. Morgen findet unser Familientag statt. Bitte bringen Sie ein kleines Essen mit. Der Tag beginnt um zehn Uhr. Bei Fragen rufen Sie uns an. Auf Wiederhoeren.',
              question: '1  Worum geht es?',
              options: ['a) Familientag im Kindergarten', 'b) Die Schule ist geschlossen', 'c) Ein Arzttermin'],
              correct: 'a',
            },
            {
              id: 'h2',
              label: 'Text 2 — Durchsage',
              transcript:
                'Achtung, liebe Kunden: Heute haben wir frisches Brot und Kuchen fuer die ganze Familie. Alles zum Sonderpreis bis sechzehn Uhr. Wir freuen uns auf Ihren Besuch in der Baeckerei Schmidt am Marktplatz.',
              question: '2  Was kann man dort kaufen?',
              options: ['a) Brot und Kuchen', 'b) Nur Getraenke', 'c) Moebel'],
              correct: 'a',
            },
            {
              id: 'h3',
              label: 'Text 3 — Nachricht',
              transcript:
                'Papa, ich bin in der Bibliothek. Ich lerne fuer die Pruefung. Ich komme erst um sieben Uhr nach Hause. Kannst du heute das Abendessen machen? Danke, deine Tochter Sarah.',
              question: '3  Was bittet Sarah?',
              options: ['a) Der Vater soll kochen', 'b) Der Vater soll lernen', 'c) Sarah kommt um vier Uhr'],
              correct: 'a',
            },
            {
              id: 'h4',
              label: 'Text 4 — Anrufbeantworter',
              transcript:
                'Willkommen bei Hausarzt Dr. Klein. Unsere Sprechzeiten sind montags bis freitags von acht bis zwoelf Uhr. Termine nur telefonisch. Bitte rufen Sie uns an. Vielen Dank.',
              question: '4  Wie bekommt man einen Termin?',
              options: ['a) Telefonisch', 'b) Per E-Mail', 'c) Ohne Termin'],
              correct: 'a',
            },
            {
              id: 'h5',
              label: 'Text 5 — Ankuendigung',
              transcript:
                'Guten Morgen! Heute ist in unserer Strasse Fest. Es gibt Musik und Essen fuer Gross und Klein. Das Fest ist von vierzehn bis zwanzig Uhr im Park. Kommen Sie mit Ihrer Familie!',
              question: '5  Wo ist das Fest?',
              options: ['a) Im Park', 'b) Im Haus', 'c) In der Schule'],
              correct: 'a',
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Hoeren Teil 2\nSie hoeren ein Gespraech.\nSie hoeren das Gespraech zweimal.\nZu dem Gespraech gibt es fuenf Aufgaben.\nEntscheiden Sie: Ist jede Aussage richtig oder falsch?',
          context: 'Zwei Freundinnen sprechen ueber Alltag und Familie.',
          transcript:
            'A: Guten Tag! Wie war dein Wochenende mit der Familie?\nB: Sehr schoen! Am Samstag haben wir meine Eltern besucht. Sie wohnen in Stuttgart.\nA: Und am Sonntag?\nB: Am Sonntag waren wir zu Hause. Mein Mann hat gekocht und die Kinder haben ferngesehen.\nA: Hast du Geschwister?\nB: Ja, ich habe eine Schwester. Sie studiert in Berlin. Wir telefonieren jede Woche.\nA: Das ist nett!',
          questions: [
            rf('h6', '6  Person B hat am Samstag die Eltern besucht.', 'R'),
            rf('h7', '7  Die Eltern wohnen in Berlin.', 'F'),
            rf('h8', '8  Am Sonntag ist Person B ausgegangen.', 'F'),
            rf('h9', '9  Person B hat keine Geschwister.', 'F'),
            rf('h10', '10  Die Schwester studiert in Berlin.', 'R'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '10 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 — Schreiben\nFuellen Sie das Formular aus.\n\nSie moechten eine Familienkarte im Sportverein beantragen.\nLesen Sie zuerst den Text. Dann schreiben Sie die Informationen in das Formular.\n\n---\nMein Name ist Elena Popescu. Ich bin am 3. November 1988 geboren. Ich komme aus Rumaenien. Meine E-Mail-Adresse ist elena.popescu@web.de. Meine Telefonnummer ist 0176 4455667.\n---',
          formFields: ['Vorname', 'Nachname', 'Geburtsdatum', 'Nationalitaet', 'E-Mail', 'Telefon'],
          minWords: 0,
          criteria: ['Vollstaendigkeit', 'Inhaltliche Korrektheit', 'Lesbarkeit'],
          modelAnswer:
            'Vorname: Elena\nNachname: Popescu\nGeburtsdatum: 03.11.1988\nNationalitaet: Rumaenien\nE-Mail: elena.popescu@web.de\nTelefon: 0176 4455667',
          feedback: ['Alle sechs Felder ausgefuellt', 'Daten aus dem Text korrekt uebernommen', 'Leserliche Schrift'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '10 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie eine kurze Nachricht (circa 30 Woerter).\n\nIhre Schwester laedt Sie zum Familienessen ein.\nSchreiben Sie an Ihre Schwester:\n- Bedanken Sie sich fuer die Einladung\n- Schreiben Sie, was Sie mitbringen moechten\n- Schreiben Sie, wann Sie kommen',
          minWords: 30,
          criteria: ['Inhalt (alle 3 Punkte)', 'Verstaendlichkeit', 'Einfache Korrektheit'],
          modelAnswer:
            'Liebe Schwester,\n\nvielen Dank fuer die Einladung! Ich komme gern. Ich bringe einen Salat mit. Ich komme um 18 Uhr.\n\nBis bald,\nTom',
          feedback: ['Alle drei Punkte erwaehnt', 'Verstaendliche Nachricht', 'Anrede und Schluss vorhanden'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Sich vorstellen',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nDer Pruefer / die Prueferin stellt Ihnen Fragen.\nAntworten Sie in ganzen Saetzen.',
          prompts: [
            'Wie heissen Sie?',
            'Woher kommen Sie?',
            'Was machen Sie? (Beruf oder Studium)',
            'Welche Sprachen sprechen Sie?',
            'Was machen Sie gern in der Freizeit?',
          ],
          modelAnswer:
            'Ich heisse Ana Rodriguez. Ich komme aus Spanien. Ich arbeite in einer Baeckerei. Ich spreche Spanisch und ein bisschen Deutsch. In der Freizeit koche ich gern mit meiner Familie.',
          feedback: ['Fuenf Fragen beantwortet', 'Ganze Saetze', 'Einfache, verstaendliche Sprache'],
        },
        {
          teil: 2,
          title: 'Fragen und Antworten',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nSie und Ihr Partner / Ihre Partnerin haben Karten mit Dingen und Preisen.\nFragen Sie nach den Dingen auf der Karte Ihres Partners / Ihrer Partnerin.\nAntworten Sie auf Fragen zu Ihrer Karte.\n\nIhre Karte:\n- Buch: 8 Euro\n- Apfel: 1 Euro\n- T-Shirt: 15 Euro\n\nKarte Ihres Partners / Ihrer Partners:\n- Milch: 2 Euro\n- Kuchen: 4 Euro\n- Stift: 50 Cent',
          cardText: 'Buch (8 Euro), Apfel (1 Euro), T-Shirt (15 Euro) — Partner: Milch (2 Euro), Kuchen (4 Euro), Stift (50 Cent)',
          points: ['Nach Preis fragen', 'Antwort geben', 'Nach einem anderen Ding fragen', 'Hoeflich antworten'],
          minExchanges: 3,
          modelAnswer:
            'Partner: Was kostet dein Buch?\nIch: Das Buch kostet acht Euro.\nPartner: Und der Apfel?\nIch: Der Apfel kostet ein Euro.\nIch: Was kostet dein Kuchen?\nPartner: Der Kuchen kostet vier Euro.\nIch: Das ist guenstig!',
          feedback: ['Mindestens drei Fragen und Antworten', 'Preise genannt', 'Einfache Saetze'],
        },
      ],
    };
  }

  function buildA2() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level: 'A2',
      topic: 'Einkaufen, Freizeit und Reisen',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Goethe-Zertifikat A2',
        note: 'Modellsatz (Demo). Aufgabentypen basieren auf dem offiziellen Goethe-Zertifikat A2.',
      },
      modules: {
        lesen: { title: 'Lesen', time: '30 Minuten' },
        horen: { title: 'Hoeren', time: 'ca. 30 Minuten' },
        schreiben: { title: 'Schreiben', time: '30 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie den Text und die Aufgaben 1 bis 5.\nWaehlen Sie: Richtig oder Falsch.',
          textTitle: 'Lokale Nachrichten: Stadtbummel und Reisen in Hannover',
          text:
            'Seit dem 1. Mai gibt es in der Innenstadt von Hannover mehr Freizeitangebote. Die Stadtverwaltung berichtet, dass letztes Jahr viele Besucher gekommen sind, weil die Geschaefte auch sonntags geoeffnet waren. Ab jetzt koennen Touristen an Wochenenden an einer kostenlosen Stadtfuehrung teilnehmen. Die Fuehrung beginnt um 11 Uhr am Hauptbahnhof.\n\nAusserdem gibt es einen neuen Reisebuero-Stand im Einkaufszentrum. Dort bekommt man guenstige Angebote fuer Staedtereisen nach Berlin und Hamburg. Man muss nicht lange warten, weil man online vorbestellen kann. Viele Familien nutzen das Angebot schon, obwohl es erst seit kurzem existiert.',
          questions: [
            rf('l1', '1  Seit Mai gibt es neue Freizeitangebote in Hannover.', 'R'),
            rf('l2', '2  Letztes Jahr waren die Geschaefte nie sonntags geoeffnet.', 'F'),
            rf('l3', '3  Die Stadtfuehrung kostet fuenfzehn Euro.', 'F'),
            rf('l4', '4  Die Fuehrung startet am Hauptbahnhof.', 'R'),
            rf('l5', '5  Im Reisebuero kann man nur nach Muenchen reisen.', 'F'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text und die Aufgaben 6 bis 10.\nWaehlen Sie: Richtig oder Falsch.',
          textTitle: 'E-Mail von Sabine',
          text:
            'Lieber Thomas,\n\ndanke fuer deine E-Mail! Ich habe letztes Wochenende mit meiner Schwester in Muenchen eingekauft. Wir waren im Olympia-Einkaufszentrum, weil dort viele Geschaefte sind. Ich habe mir eine neue Jacke gekauft. Sie hat 89 Euro gekostet, aber sie war im Sale.\n\nAm Samstagabend sind wir noch ins Kino gegangen. Der Film hat uns sehr gefallen. Am Sonntag bin ich mit dem Zug zurueck nach Nuernberg gefahren. Du musst unbedingt mitkommen, wenn ich das naechste Mal fahre!\n\nViele Gruesse\nSabine',
          questions: [
            rf('l6', '6  Sabine war mit ihrer Schwester in Muenchen.', 'R'),
            rf('l7', '7  Sie hat im Kino eingekauft.', 'F'),
            rf('l8', '8  Die Jacke war im Sale.', 'R'),
            rf('l9', '9  Sabine ist mit dem Auto nach Nuernberg gefahren.', 'F'),
            rf('l10', '10  Sabine moechte, dass Thomas naechstes Mal mitkommt.', 'R'),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 11 bis 14 und die Anzeigen a bis d.\nWelche Anzeige passt zu welcher Situation?\nSie koennen jede Anzeige nur einmal verwenden.',
          ads: [
            {
              key: 'A',
              title: 'Radverleih CityBike',
              text: 'Fahrraeder ab 8 Euro pro Tag. Auch E-Bikes verfuegbar. Abholung an der Haltestelle Hauptbahnhof. Ideal fuer Staedtetouren.',
            },
            {
              key: 'B',
              title: 'Sprachcafe Freizeit',
              text: 'Jeden Mittwoch um 18 Uhr. Deutsch sprechen, Kaffee trinken, neue Leute kennenlernen. Teilnahme kostenlos.',
            },
            {
              key: 'C',
              title: 'Outlet Center Nord',
              text: 'Mode, Schuhe und Sportartikel bis 70 Prozent guenstiger. Samstag 1–0 Uhr. Bus ab Bahnhof alle 20 Minuten.',
            },
            {
              key: 'D',
              title: 'Jugendreisen aktiv',
              text: 'Gruppenreisen fuer 16- bis 25-Jaehrige. Im Sommer ans Meer oder in die Berge. Betreute Programme, ab 299 Euro.',
            },
          ],
          questions: [
            matchAd('l11', '11  Lisa (16) moechte im Sommer guenstig mit Freunden ans Meer fahren.', ['A', 'B', 'C', 'D'], 'D'),
            matchAd('l12', '12  Mark moechte am Samstag billige Kleidung kaufen.', ['A', 'B', 'C', 'D'], 'C'),
            matchAd('l13', '13  Anna ist zu Besuch in Hannover und moechte die Stadt per Fahrrad erkunden.', ['A', 'B', 'C', 'D'], 'A'),
            matchAd('l14', '14  Pablo moechte abends Deutsch ueben und neue Leute treffen.', ['A', 'B', 'C', 'D'], 'B'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 1,
          instruction:
            'Hoeren Teil 1\nSie hoeren vier Gespraeche.\nSie hoeren jeden Text einmal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          segments: [
            {
              id: 'h1',
              label: 'Gespraech 1 — Reisebuero',
              transcript:
                'Mitarbeiterin: Guten Tag, kann ich Ihnen helfen?\nKunde: Ja, ich suche eine Reise nach Prag fuer zwei Personen.\nMitarbeiterin: Wir haben ein Angebot fuer 199 Euro pro Person. Mit Fruehstueck und Zugfahrt.\nKunde: Das klingt gut. Wann kann ich buchen?\nMitarbeiterin: Sie koennen heute noch online buchen oder morgen vorbeikommen.',
              question: '1  Was moechte der Kunde?',
              options: ['a) Eine Reise nach Prag buchen', 'b) Ein Flugticket nach London', 'c) Ein Hotel in Berlin'],
              correct: 'a',
            },
            {
              id: 'h2',
              label: 'Gespraech 2 — Einkaufszentrum',
              transcript:
                'Freundin A: Gefaellt dir die Tasche?\nFreundin B: Sie ist schoen, aber zu teuer. Sie kostet 120 Euro.\nFreundin A: Schau mal, dort gibt es die gleiche Tasche im Angebot fuer 79 Euro.\nFreundin B: Oh super! Dann kaufe ich sie jetzt, weil sie heute guenstiger ist.',
              question: '2  Warum kauft Freundin B die Tasche?',
              options: ['a) Sie ist heute im Angebot', 'b) Sie bekommt sie geschenkt', 'c) Sie mag die Farbe nicht'],
              correct: 'a',
            },
            {
              id: 'h3',
              label: 'Gespraech 3 — Freizeit',
              transcript:
                'Jonas: Was machst du am Samstag?\nLaura: Ich gehe wandern. Willst du mitkommen?\nJonas: Gern! Wo treffen wir uns?\nLaura: Am Busbahnhof um neun Uhr. Wir fahren dann in den Wald.\nJonas: Gut, ich bringe etwas zu trinken mit.',
              question: '3  Was machen Jonas und Laura am Samstag?',
              options: ['a) Sie gehen wandern', 'b) Sie gehen ins Kino', 'c) Sie bleiben zu Hause'],
              correct: 'a',
            },
            {
              id: 'h4',
              label: 'Gespraech 4 — Supermarkt',
              transcript:
                'Verkaeufer: Entschuldigung, dieser Apfel ist leider nicht mehr frisch.\nKundin: Kein Problem. Haben Sie noch Bananen?\nVerkaeufer: Ja, die Bananen sind heute im Angebot. Ein Kilo kostet nur 1,49 Euro.\nKundin: Dann nehme ich zwei Kilo, bitte.',
              question: '4  Was kauft die Kundin?',
              options: ['a) Bananen', 'b) Aepfel', 'c) Orangen'],
              correct: 'a',
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Hoeren Teil 2\nSie hoeren eine Information.\nSie hoeren den Text zweimal.\nWaehlen Sie: Richtig oder Falsch.',
          context: 'Information ueber den Wochenmarkt auf dem Marktplatz.',
          transcript:
            'Guten Tag, meine Damen und Herren. Ich moechte Ihnen heute unseren Wochenmarkt vorstellen. Jeden Freitag und Samstag findet er auf dem Marktplatz statt. Man kann dort frisches Obst, Gemuese und regionale Produkte kaufen. Viele Leute kommen, weil die Preise oft guenstiger sind als im Supermarkt.\n\nDer Markt oeffnet um sieben Uhr morgens und schliesst um vierzehn Uhr. Ich empfehle, frueh zu kommen, weil dann das Angebot am groessten ist. Ausserdem gibt es jeden Samstag live Musik. Kinder finden oft Spass an den Haendlern, die suesse Fruchtbonbons verkaufen.\n\nWenn Sie mit dem Auto kommen, koennen Sie auf dem Parkplatz am Rathaus parken. Der Eintritt ist frei. Ich hoffe, Sie besuchen uns bald!',
          questions: [
            rf('h5', '5  Der Markt ist nur samstags geoeffnet.', 'F'),
            rf('h6', '6  Die Preise sind manchmal guenstiger als im Supermarkt.', 'R'),
            rf('h7', '7  Der Markt schliesst um sechzehn Uhr.', 'F'),
            rf('h8', '8  Am Samstag gibt es live Musik.', 'R'),
            rf('h9', '9  Man muss fuer den Eintritt bezahlen.', 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '30 Minuten',
          fieldId: 'write1',
          task:
            'Schreiben\nSchreiben Sie eine E-Mail an Ihren Freund Lars.\nSchreiben Sie etwas zu den folgenden vier Punkten:\n- Wo Sie im Sommer Urlaub machen moechten\n- Wann Sie fahren wollen\n- Was Sie dort machen moechten\n- Ob Lars mitkommen moechte',
          minWords: 60,
          criteria: ['Inhalt (alle 4 Punkte)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Hallo Lars,\n\nich moechte im Sommer an die Ostsee fahren, weil ich das Meer sehr mag. Ich fahre am 15. Juli mit dem Zug. Dort moechte ich schwimmen, spazieren gehen und viel Eis essen.\n\nKommst du mit? Das waere bestimmt schoen!\n\nViele Gruesse\nJulia',
          feedback: ['Alle vier Punkte behandelt', 'Anrede und Schlussformel', 'Circa 6–0 Woerter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Fragen zum Alltag',
          dauer: 'ca. 4 Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nDer Pruefer / die Prueferin stellt Ihnen Fragen zum Alltag.\nAntworten Sie in ganzen Saetzen.',
          prompts: [
            'Was kaufen Sie gern ein und warum?',
            'Wohin sind Sie schon einmal gereist?',
            'Was machen Sie gern in der Freizeit?',
            'Wie reisen Sie am liebsten — mit dem Zug, dem Auto oder dem Flugzeug?',
          ],
          modelAnswer:
            'Ich kaufe gern Buecher ein, weil ich in der Freizeit viel lese. Letztes Jahr bin ich nach Oesterreich gefahren. Am Wochenende treffe ich oft Freunde oder gehe ins Cafe. Am liebsten reise ich mit dem Zug, weil das entspannter ist als mit dem Auto.',
          feedback: ['Vier Fragen beantwortet', 'Ganze Saetze mit Begruendung', 'A2-Wortschatz und Grammatik'],
        },
        {
          teil: 2,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. 4 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nSie und der Pruefer / die Prueferin planen gemeinsam einen Ausflug.\nUeberlegen Sie: Wohin? Wann? Wie kommen Sie hin? Was nehmen Sie mit?',
          points: ['Ziel vorschlagen', 'Zeit und Transport festlegen', 'Auf Vorschlaege reagieren', 'Gemeinsam entscheiden'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Wollen wir am Samstag shoppen gehen und danach ins Kino?\nPruefer: Gute Idee! Wohin sollen wir zum Einkaufen?\nIch: Ins Einkaufszentrum in der Innenstadt. Wir koennen mit der U-Bahn fahren.\nPruefer: Wann treffen wir uns?\nIch: Um 14 Uhr am Hauptbahnhof. Ich nehme meine Einkaufsliste mit.\nPruefer: Prima, dann machen wir das so!',
          feedback: ['Mindestens vier Wechsel', 'Vorschlaege und Reaktionen', 'Gemeinsamer Plan am Ende'],
        },
      ],
    };
  }

  function matchAd(id, q, labels, correct) {
    const opts = labels.map((l) => (l === '0' ? '0) Keine passende Anzeige' : `${l}) Anzeige ${l}`));
    return { id, type: 'match', question: q, options: opts, correct, matchLabels: labels };
  }
  function matchSpeaker(id, q, labels, correct) {
    const names = { M: 'Moderator/in', F: 'Frau Schneider', H: 'Herr Bader' };
    const opts = labels.map((l) => `${l}) ${names[l] || l}`);
    return { id, type: 'match', question: q, options: opts, correct, matchLabels: labels };
  }

  function matchHeadline(id, q, labels, correct) {
    const opts = labels.map((l) => `${l}) Ueberschrift ${l}`);
    return { id, type: 'match', question: q, options: opts, correct, matchLabels: labels };
  }

  function buildB1() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level: 'B1',
      topic: 'Umwelt und Nachhaltigkeit',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Goethe-Zertifikat B1',
        note: 'Modellsatz (Demo). Struktur nach offiziellem Goethe-Zertifikat B1.',
      },
      modules: {
        lesen: { title: 'Lesen', time: '65 Minuten' },
        horen: { title: 'Hoeren', time: '40 Minuten' },
        schreiben: { title: 'Schreiben', time: '60 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
          textTitle: 'ZeroWasteLeben.de — Mein erster Monat ohne Plastikmuell',
          text:
            'Montag, 12. Maerz\n\nSeit vier Wochen versuche ich, so wenig Plastikmuell wie moeglich zu produzieren. Anfangs war es schwierig, weil fast alles im Supermarkt verpackt ist. Deshalb kaufe ich jetzt oft auf dem Wochenmarkt ein, obwohl das etwas teurer ist.\n\nMein groesster Erfolg diese Woche: Ich habe endlich einen guten Unverpackt-Laden in meiner Naehe gefunden. Ausserdem bringe ich meine eigenen Beutel und Glaeser mit. Mein Mitbewohner findet das manchmal laestig, trotzdem unterstuetzt er mich, wenn ich koche.\n\nAm Samstag habe ich an einer Stadtteilaktion teilgenommen, bei der alte Fahrraeder repariert wurden. Das fand ich toll, weil man Geraete nutzen kann, statt immer Neues zu kaufen. Naechsten Monat moechte ich lernen, Kompost richtig anzulegen — meine Balkonpflanzen wuerden sich bestimmt freuen.',
          questions: [
            rf('l1', '1  Die Autorin kauft seit kurzem haeufiger auf dem Wochenmarkt ein.', 'R'),
            rf('l2', '2  Im Supermarkt gibt es laut Text fast keine verpackten Produkte.', 'F'),
            rf('l3', '3  Der Mitbewohner lehnt das Projekt grundsaetzlich ab.', 'F'),
            rf('l4', '4  Am Samstag wurden Fahrraeder repariert.', 'R'),
            rf('l5', '5  Die Autorin moechte bald Kompost auf dem Balkon machen.', 'R'),
            rf('l6', '6  Der Unverpackt-Laden liegt sehr weit von ihrer Wohnung entfernt.', 'F'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Stuttgarter Nachrichten: Weniger Muell in den Schulen',
          text:
            'Ab dem neuen Schuljahr sollen alle staedtischen Schulen in Stuttgart weniger Einwegplastik nutzen. Die Stadtverwaltung hat dafuer 800.000 Euro bereitgestellt, damit Kantinen Mehrweggeschirr anschaffen koennen. Allerdings muessen die Schulen die Spuelmaschinen selbst warten, obwohl die Anschaffung gefoerdert wird.\n\nLaut Bildungsdezernent Martin Keller haben bereits zwoelf Schulen erfolgreich umgestellt. Die Schuelerinnen und Schueler sortieren Muell jetzt getrennt, und der Energieverbrauch in den Kuechen ist gesunken. Kritiker bemengeln jedoch, dass private Schulen von der Foerderung ausgeschlossen sind.\n\nExperten betonen, dass solche Massnahmen nur wirken, wenn Eltern und Lehrkraefte mitziehen. Deshalb plant die Stadt Workshops fuer Familien. Wenn alles gut laeuft, koennte das Modell auch in anderen Staedten uebernommen werden.',
          questions: [
            mc(
              'l7',
              '7  Was ist das Hauptziel der Massnahme?',
              'mehr Bio-Lebensmittel in Kantinen',
              'weniger Einwegplastik an Schulen',
              'guenstigere Mittagessen fuer Schueler',
              'b'
            ),
            mc(
              'l8',
              '8  Was muessen die Schulen laut Text selbst uebernehmen?',
              'den Kauf der Mehrweggeschirre',
              'die Wartung der Spuelmaschinen',
              'die Organisation der Workshops',
              'b'
            ),
            mc(
              'l9',
              '9  Kritiker kritisieren, dass ...',
              'die Foerderung zu hoch ist',
              'private Schulen keine Foerderung erhalten',
              'zu wenige oeffentliche Schulen teilnehmen',
              'b'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie koennen jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Repair-Cafe Nord',
              text: 'Jeden ersten Samstag im Monat. Ehrenamtliche helfen, defekte Geraete zu reparieren. Eintritt frei, Materialkosten selbst tragen.',
            },
            {
              key: 'B',
              title: 'Unverpackt & Fair',
              text: 'Lebensmittel ohne Plastikverpackung. Bringen Sie Dosen und Beutel mit. Di—Sa –9 Uhr, Innenstadt.',
            },
            {
              key: 'C',
              title: 'Stadtrad Jahreskarte',
              text: 'Unbegrenzt Fahrrad fahren fuer 49 Euro pro Jahr. Erste 30 Minuten pro Fahrt gratis. App-Registrierung noetig.',
            },
            {
              key: 'D',
              title: 'Gartenkurs Urban Farming',
              text: 'Gemuese auf Balkon und Dachterrasse anbauen. Wochenendkurs, Maerz—Mai. Material inklusive, max. 12 Teilnehmer.',
            },
            {
              key: 'E',
              title: 'SolarCheck kostenlos',
              text: 'Energieberater pruefen Ihr Dach. Foerdermoeglichkeiten fuer Photovoltaik. Termine online buchbar.',
            },
            {
              key: 'F',
              title: 'Mode-Schn—ppchen Woche',
              text: 'Sommerkollektion bis 70 Prozent reduziert. Nur diese Woche im Einkaufszentrum West. Tausende Artikel.',
            },
          ],
          questions: [
            matchAd('l10', '10  Stefan moechte lernen, auf dem Balkon Gemuese anzubauen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
            matchAd('l11', '11  Mia moechte Lebensmittel ohne Plastikverpackung kaufen.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l12', '12  Jonas moechte sein altes Radio reparieren lassen.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
            matchAd('l13', '13  Die Familie Weber moechte oefter mit dem Fahrrad statt mit dem Auto fahren.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l14', '14  Herr und Frau Lang wollen pruefen lassen, ob sich Solaranlagen fuer ihr Haus lohnen.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 — Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Ueberschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Forum: Sollten Einwegplastikbecher sofort verboten werden?',
          text:
            'Meinung 15 — Anna, 34:\nEin sofortiges Verbot waere ueberfaellig. Unternehmen hatten genug Zeit, um umzustellen. Wenn wir weiter warten, landet noch mehr Muell in der Natur.\n\nMeinung 16 — Ben, 52:\nViele Cafes leben von Take-away-Getraenken. Ein hartes Verbot wuerde kleine Betriebe treffen, obwohl grosse Ketten Alternativen leicht finanzieren koennen.\n\nMeinung 17 — Clara, 28:\nIch bin fuer weniger Plastik, aber erst wenn Mehrwegbecher ueberall verfuegbar sind. Sonst zahlen vor allem Kundinnen und Kunden drauf.\n\nMeinung 18 — David, 41:\nDer Staat sollte nicht jedes Verhalten vorschreiben. Informieren ja, verbieten nein — jede Person muss selbst verantwortlich entscheiden.',
          ads: [
            { key: 'a', title: 'Der Staat regiert zu viel', text: '' },
            { key: 'b', title: 'Ohne Plastik geht es auch', text: '' },
            { key: 'c', title: 'Kleine Firmen duerfen nicht zahlen', text: '' },
            { key: 'd', title: 'Erst Alternativen, dann Verbote', text: '' },
          ],
          questions: [
            matchHeadline('l15', '15  Meinung von Anna, 34', ['a', 'b', 'c', 'd'], 'b'),
            matchHeadline('l16', '16  Meinung von Ben, 52', ['a', 'b', 'c', 'd'], 'c'),
            matchHeadline('l17', '17  Meinung von Clara, 28', ['a', 'b', 'c', 'd'], 'd'),
            matchHeadline('l18', '18  Meinung von David, 41', ['a', 'b', 'c', 'd'], 'a'),
          ],
        },
        {
          teil: 5,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 5 — Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Muelltrennung — Wohnanlage Gruene Gasse',
          text:
            'In der Wohnanlage Gruene Gasse gilt ab 1. April eine erweiterte Muelltrennung. Bioabfaelle duerfen nur in den dafuer vorgesehenen braunen Behaeltern entsorgt werden. Verpackungen aus Plastik und Metall gehoeren in die Gelbe Tonne, sofern sie leer und grob sauber sind.\n\nSperrmuell darf nicht im Hausmuell landen. Anmeldungen sind schriftlich bis spaetestens zwei Werktage vor Abholung an die Hausverwaltung zu richten. Bei wiederholten Verstoessen koennen Nebenkosten nachberechnet werden, obwohl zunaechst eine muendliche Ermahnung erfolgt.\n\nAltbatterien und Elektrogeraete werden im Gemeinschaftskeller gesammelt. Die Abgabe ist fuer Bewohner kostenlos.',
          questions: [
            mc(
              'l19',
              '19  Bioabfaelle ...',
              'duerfen in jeden Behaelter',
              'gehoeren in braune Behaelter',
              'muessen zur Hausverwaltung gebracht werden',
              'b'
            ),
            mc(
              'l20',
              '20  Sperrmuell ...',
              'kann im Hausmuell entsorgt werden',
              'muss mindestens zwei Werktage vorher angemeldet werden',
              'wird jeden Montag automatisch abgeholt',
              'b'
            ),
            mc(
              'l21',
              '21  Bei wiederholten Verstoessen ...',
              'wird sofort gekuendigt',
              'koennen zusaetzliche Kosten entstehen',
              'gibt es keine Konsequenzen',
              'b'
            ),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Hoeren Teil 1\nSie hoeren zwei kurze Texte.\nSie hoeren jeden Text zweimal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, hier spricht die Stadtverwaltung. Ihre Anmeldung zum Workshop —Nachhaltig einkaufen" am Donnerstag, den 18. April, ist bei uns eingegangen. Bitte bringen Sie am Donnerstag um 17 Uhr Ihre Stoffbeutel mit. Der Workshop findet im Buergerzentrum Ost statt, nicht wie urspruenglich geplant in der Bibliothek. Bei Fragen rufen Sie uns bitte zurueck.',
              questions: [
                rf('h1', '1  Der Workshop findet in der Bibliothek statt.', 'F'),
                mc('h2', '2  Die Teilnehmer sollen ...', 'Stoffbeutel mitbringen', '10 Euro bezahlen', 'eine Anmeldung per Post schicken', 'a'),
              ],
            },
            {
              label: 'Text 2: Durchsage im Radio',
              transcript:
                'Achtung, eine Verkehrsmeldung: Wegen einer Demonstration fuer Klimaschutz ist die Innenstadt bis 14 Uhr gesperrt. Autofahrer werden gebeten, auf oeffentliche Verkehrsmittel umzusteigen. Die Organisatoren weisen darauf hin, dass die Aktion friedlich verlaufen soll. Busse der Linie 12 fahren derzeit umgeleitet ueber den Westring.',
              questions: [
                rf('h3', '3  Die Innenstadt ist wegen einer Demonstration gesperrt.', 'R'),
                mc('h4', '4  Autofahrer sollen laut Durchsage ...', 'zu Hause bleiben', 'Oeffentliche Verkehrsmittel nutzen', 'ueber die Innenstadt fahren', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hoeren Teil 2\nSie hoeren einen Text.\nSie hoeren den Text einmal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          context: 'Fuehrung durch ein oekologisches Modellhaus.',
          transcript:
            'Willkommen in unserem Modellhaus. Hier zeigen wir, wie man Energie sparen kann, ohne auf Komfort zu verzichten. Die Daemmung stammt aus recycelten Materialien, und die Fenster halten im Winter die Waerme im Haus. Im Keller steht eine Anlage, die Regenwasser sammelt und fuer die Toiletten nutzt.\n\nAuf dem Dach befinden sich Solarzellen, die etwa die Haelfte unseres Strombedarfs decken. Allerdings koennen wir ueberschuessigen Strom nicht speichern, deshalb speisen wir ihn ins Netz ein. Viele Besucher fragen, ob so ein Umbau teuer ist. Das haengt vom Gebaeude ab, aber Foerderungen sind oft moeglich.',
          questions: [
            mc('h5', '5  Das Regenwasser wird im Modellhaus ...', 'zum Trinken genutzt', 'fuer Toiletten verwendet', 'gar nicht gesammelt', 'b'),
            mc('h6', '6  Die Solarzellen ...', 'decken den kompletten Strombedarf', 'decken etwa die Haelfte des Strombedarfs', 'sind nur zur Show installiert', 'b'),
            mc('h7', '7  Ueberschuessiger Strom ...', 'wird im Keller gespeichert', 'wird ins Netz eingespeist', 'wird verschwendet', 'b'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hoeren Teil 3\nSie hoeren ein Gespraech.\nSie hoeren das Gespraech einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Nachbarn sprechen ueber eine Muelltrennaktion im Haus.',
          transcript:
            'Sabine: Hast du den Zettel gesehen? Ab naechster Woche trennen wir Plastik extra.\nMarkus: Ja, aber ehrlich gesagt finde ich das kompliziert. Ich wuerde lieber alles in einen Sack werfen.\nSabine: Das geht nicht mehr. Die Hausverwaltung hat neue Toenen bestellt, obwohl viele Bewohner dagegen waren.\nMarkus: Mein Cousin wohnt in einer anderen Strasse — dort trennen sie schon seit zwei Jahren, und es klappt.\nSabine: Genau deshalb machen wir mit. Am Samstag gibt es eine kurze Info im Hof, falls jemand Fragen hat.',
          questions: [
            rf('h8', '8  Ab naechster Woche soll Plastik getrennt werden.', 'R'),
            rf('h9', '9  Markus findet die neue Regelung von Anfang an praktisch.', 'F'),
            rf('h10', '10  Alle Bewohner waren fuer die neuen Toenen.', 'F'),
            rf('h11', '11  Am Samstag gibt es eine Information im Hof.', 'R'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hoeren Teil 4\nSie hoeren eine Diskussion.\nSie hoeren die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Radiosendung: Soll Fleischkonsum staerker besteuert werden?',
          speakers: ['Moderator/in', 'Frau Lorenz', 'Herr Klein'],
          transcript:
            'Moderator: Heute debattieren wir ueber eine Hoeherbesteuerung von Fleisch. Frau Lorenz, Sie sind dafuer?\nFrau Lorenz: Ja. Fleisch ist guenstiger als viele pflanzliche Alternativen, obwohl die Umweltbelastung hoeher ist. Das wuerde ich aendern.\nHerr Klein: Ich bin skeptisch. Viele laendliche Betriebe leben vom Verkauf von Fleisch. Ohne Uebergang wuerden Jobs verloren gehen.\nFrau Lorenz: Deshalb brauchen wir klare Foerderung fuer umweltfreundliche Landwirtschaft.\nModerator: Herr Klein, sehen Sie gar keine Loesung?\nHerr Klein: Doch, aber ueber freiwillige Siegel und Aufklaerung, nicht ueber Strafsteuern.\nFrau Lorenz: Freiwilligkeit reicht nicht — die Klimaziele verlangen mehr Tempo.',
          questions: [
            matchSpeaker('h12', '12  Fleisch ist oft guenstiger als pflanzliche Alternativen.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h13', '13  Laendliche Betriebe koennten ohne Uebergang Jobs verlieren.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h14', '14  Freiwillige Siegel seien die bessere Loesung als Strafsteuern.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h15', '15  Klimaziele erfordern schnelleres Handeln als freiwillige Massnahmen.', ['M', 'F', 'H'], 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '20 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 — Schreiben\nSchreiben Sie eine E-Mail (circa 80 Woerter).\nSchreiben Sie etwas zu allen drei Punkten.\n\nSie waren letztes Wochenende auf einem Umweltfestival. Ihr Freund / Ihre Freundin Lukas war krank und konnte nicht mitkommen.\n\n- Beschreiben Sie: Was haben Sie auf dem Festival erlebt?\n- Begruenden Sie: Was hat Ihnen am besten gefallen und warum?\n- Machen Sie einen Vorschlag fuer ein gemeinsames Treffen.',
          minWords: 80,
          criteria: ['Inhalt (Aufgabenerfuellung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Hallo Lukas,\n\nschade, dass du krank warst! Auf dem Festival gab es viele Staende zu Nachhaltigkeit. Am besten fand ich den Workshop zum Muellvermeiden, weil ich sofort Tipps fuer den Alltag mitnehmen konnte.\n\nWuerdest du naechsten Samstag mit mir auf den Wochenmarkt gehen? Dann zeige ich dir den Unverpackt-Laden.\n\nViele Gruesse\nSara',
          feedback: ['Anrede und Schlussformel', 'Alle drei Inhaltspunkte', 'Circa 80 Woerter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '25 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie Ihre Meinung zum Thema (circa 80 Woerter).\n\nIm Online-Forum steht:\n—Jede Person sollte maximal einmal pro Woche Fleisch essen, wenn wir die Umwelt schuetzen wollen."\n\nSchreiben Sie, ob Sie dieser Meinung zustimmen oder nicht. Begruenden Sie Ihre Meinung mit mindestens zwei Argumenten und machen Sie einen Vorschlag.',
          minWords: 80,
          criteria: ['Klare Meinung', 'Mindestens zwei Argumente', 'Bezug zum Zitat und Vorschlag'],
          modelAnswer:
            'Ich stimme teilweise zu, weil Fleisch viel Wasser und Energie verbraucht. Allerdings koennten viele Menschen das finanziell nicht mittragen, wenn Fleisch teurer wird. Deshalb sollte man guenstige pflanzliche Alternativen foerdern. In Kantinen koennte es einen —Klima-Teller" geben.',
          feedback: ['Positionierung klar', 'Zwei Argumente', 'Circa 80 Woerter mit Vorschlag'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '15 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 — Schreiben\nSchreiben Sie eine E-Mail (circa 40 Woerter).\n\nSie haben einen Termin bei der Umweltberatung der Stadt. Sie koennen nicht kommen, weil Sie krank sind.\n\nEntschuldigen Sie sich hoeflich, nennen Sie den Grund und bitten Sie um einen neuen Termin.',
          minWords: 40,
          criteria: ['Hoefliche Entschuldigung', 'Grund und Bitte um neuen Termin', 'Formelle Anrede'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\nleider kann ich meinen Termin am 22. Mai nicht wahrnehmen, weil ich krank bin. Koennten Sie mir bitte einen neuen Termin anbieten?\n\nMit freundlichen Gruessen\nTim Schneider',
          feedback: ['Formeller Ton', 'Entschuldigung mit Grund', 'Circa 40 Woerter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. – Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nIn Ihrem Deutschkurs moechten Sie mit Ihrem Partner / Ihrer Partnerin einen Aktionstag zum Thema Nachhaltigkeit organisieren.\nPlanen Sie gemeinsam: Was? Wann? Wo? Wer bringt was mit?',
          points: ['Art der Aktion vorschlagen', 'Zeit und Ort festlegen', 'Auf Vorschlaege reagieren', 'Material und Aufgaben verteilen'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Wuerdest du mit mir einen Muellsammel-Tag im Park organisieren?\nPartner: Gute Idee! Wann sollen wir das machen?\nIch: Am Samstagvormittag, weil dann viele Leute im Park sind.\nPartner: Ich koennte Handschuhe und Saecke mitbringen.\nIch: Super, dann wuerde ich Flyer drucken und Getraenke mitnehmen.\nPartner: Sollen wir die Gruppe vorher im Kurs ansprechen?\nIch: Ja, das wuerde ich machen.',
          feedback: ['Vorschlaege mit Konjunktiv II', 'Auf Partner reagieren', 'Gemeinsamer Plan'],
        },
        {
          teil: 2,
          title: 'Ein Thema praesentieren',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nPraesentieren Sie das Thema —Umwelt und Nachhaltigkeit in meinem Heimatland".\n\n1. Einleitung\n2. Eigene Erfahrung\n3. Situation in Ihrem Heimatland\n4. Vor- und Nachteile + Ihre Meinung\n5. Schluss',
          points: ['Einleitung', 'Eigene Erfahrung', 'Situation im Heimatland', 'Vor- und Nachteile mit Meinung', 'Schluss'],
          minWords: 80,
          modelAnswer:
            'Heute moechte ich ueber Umwelt und Nachhaltigkeit in meinem Heimatland sprechen. In meiner Familie trennen wir seit zwei Jahren Muell, obwohl das am Anfang ungewohnt war. In meinem Land gibt es viele Windparks, aber gleichzeitig fahren noch zu viele alte Autos. Das ist gut fuer die Energie, jedoch schlecht fuer die Luft in Staedten. Meiner Meinung nach sollte der Staat oeffentliche Verkehrsmittel guenstiger machen. Vielen Dank fuer Ihre Aufmerksamkeit.',
          feedback: ['Fuenf Teile der Praesentation', 'Eigene Meinung', 'Circa 8–00 Woerter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 2 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 — Sprechen\nGeben Sie Ihrem Partner / Ihrer Partnerin Rueckmeldung zur Praesentation.\nStellen Sie eine Frage und beantworten Sie auch eine Frage Ihres Partners / Ihrer Partnerin.',
          points: ['Positives Feedback geben', 'Eine Frage stellen', 'Frage des Partners beantworten'],
          minExchanges: 3,
          modelAnswer:
            'Ich: Deine Praesentation war sehr interessant. Besonders gut fand ich den Teil ueber die Windparks.\nPartner: Danke! Was findest du schwierig bei uns in Deutschland?\nIch: Manchmal ist die Muelltrennung kompliziert, obwohl sie sinnvoll ist.\nPartner: Wuerdest du oefter mit dem Fahrrad fahren, wenn es mehr Radwege gaebe?\nIch: Ja, das wuerde ich auf jeden Fall machen.',
          feedback: ['Freundliche Rueckmeldung', 'Frage und Antwort', 'Mindestens drei Wechsel'],
        },
      ],
    };
  }

  function buildB2() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level: 'B2',
      topic: 'Digitalisierung und Gesellschaft',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Goethe-Zertifikat B2',
        note: 'Modellsatz (Demo). Struktur nach offiziellem Goethe-Zertifikat B2.',
      },
      modules: {
        lesen: { title: 'Lesen', time: '80 Minuten' },
        horen: { title: 'Hoeren', time: '40 Minuten' },
        schreiben: { title: 'Schreiben', time: '80 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
          textTitle: 'Netzpolitik.org — Kommentar: Vom digitalen Zeugnis zur digitalen Selbstentwertung',
          text:
            'Wer heute online agiert, hinterlaesst Spuren, die laenger sichtbar bleiben als manche persoenliche Erinnerungen. Ich habe neulich versucht, alte Forenbeitraege loeschen zu lassen, wurde jedoch an AGB verwiesen, die mir damals niemand erklaert hat. Dass Plattformen Inhalte archivieren, um Werbeeinnahmen zu sichern, wird oft als Preis der kostenlosen Dienste dargestellt.\n\nAllerdings trifft diese Logik nicht nur auf junge Nutzer zu. Auch Berufstaetige geraten unter Druck, staendig erreichbar zu sein, obwohl viele Unternehmen flexible Modelle propagieren. Mein Eindruck ist, dass Digitalisierung nicht automatisch Entlastung bedeutet, sondern nur dann, wenn klare Grenzen vereinbart werden.\n\nKritisch sehe ich zudem, dass Algorithmen Verhalten vorhersagen, ohne dass Betroffene nachvollziehen koennen, welche Daten dafuer verwendet werden. Transparenz duerfte laut Experten das Mindeste sein, um Vertrauen wiederherzustellen. Ich plaediere deshalb fuer staerkere Kontrollrechte, ohne Innovation pauschal abzuwuerdigen.',
          questions: [
            rf('l1', '1  Der Autor ist der Meinung, dass kostenlose Dienste grundsaetzlich keine Datenspeicherung rechtfertigen.', 'F'),
            rf('l2', '2  Laut Text sind vor allem junge Menschen von Erreichbarkeitsdruck betroffen.', 'F'),
            rf('l3', '3  Der Autor haelt Digitalisierung ohne vereinbarte Grenzen fuer problematisch.', 'R'),
            rf('l4', '4  Betroffene koennen laut Text leicht nachvollziehen, welche Daten Algorithmen nutzen.', 'F'),
            rf('l5', '5  Der Autor lehnt jede Form technologischer Innovation ab.', 'F'),
            rf('l6', '6  Experten betrachten Transparenz als Voraussetzung fuer Vertrauen.', 'R'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Zeit Online: EU plant strengere Regeln fuer KI in Behoerden',
          text:
            'Die Europaeische Kommission will KI-Systeme in Behoerden staerker regulieren, nachdem mehrere Behoerden fehlerhafte automatisierte Entscheidungen gemeldet haben. Laut Entwurf sollen Algorithmen, die ueber Foerdermittel oder Wohnsitzstatus entscheiden, vor dem Einsatz unabhaengig geprueft werden.\n\nProfessorin Dr. Elena Roth von der TU Muenchen erklaerte, man duerfe Technologie nicht verteufeln, sie muesse jedoch nachvollziehbar bleiben. Kritiker aus der Wirtschaft befuerchten laengere Verfahren und hoehere Kosten, obwohl die Branche zugleich von oeffentlichen Digitalisierungsprogrammen profitiere.\n\nBundesdigitalminister Adrian Keller betonte, Deutschland werde die Vorgaben uebernehmen, um Buergervertrauen zu staerken. Allerdings raeumte er ein, dass viele Kommunen noch nicht ueber ausreichend qualifiziertes Personal verfuegten, um komplexe Systeme zu implementieren. Beobachter gehen davon aus, dass die Umsetzung mindestens drei Jahre dauern koennte, sofern nicht zusaetzlich investiert werde.',
          questions: [
            mc(
              'l7',
              '7  Was laesst sich aus dem Text ueber den geplanten Umgang mit bestimmten KI-Systemen schliessen?',
              'Sie duerfen ohne Pruefung eingesetzt werden.',
              'Sie sollen vor dem Einsatz unabhaengig geprueft werden.',
              'Sie werden generell in Behoerden verboten.',
              'b'
            ),
            mc(
              'l8',
              '8  Welche Spannung beschreibt der Text im Wirtschaftsbereich?',
              'Unternehmen lehnen Digitalisierung grundsaetzlich ab.',
              'Kritiker fuerchten Kosten, profitieren aber zugleich von Foerderprogrammen.',
              'Alle Unternehmen unterstuetzen die Regulierung einhellig.',
              'b'
            ),
            mc(
              'l9',
              '9  Was deutet der Text ueber die Umsetzung in Deutschland an?',
              'Sie koennte sich verzoegern, weil Fachpersonal fehlt.',
              'Sie ist bereits in allen Kommunen abgeschlossen.',
              'Sie haengt ausschliesslich von der Wirtschaft ab.',
              'a'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie koennen jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Zertifikat Cybersecurity B2B',
              text: 'Fuenfmonatiger Lehrgang fuer IT-Fachkraefte. Schwerpunkt: Incident Response, Penetration Testing, DSGVO-konforme Protokollierung. Abschluss mit anerkanntem Zertifikat.',
            },
            {
              key: 'B',
              title: 'UX Research Summit 2026',
              text: 'Internationale Konferenz zu nutzerzentriertem Design digitaler Dienste. Keynotes, Workshops, Networking. Hamburg, 14.—16. Oktober. Fruehbucher bis 30. Juni.',
            },
            {
              key: 'C',
              title: 'CloudShift Mittelstand',
              text: 'Beratung fuer KMU bei Migration in die Cloud. Kostenanalyse, Datenschutzkonzept, Change Management. Erstgespraech kostenlos.',
            },
            {
              key: 'D',
              title: 'MA Digital Ethics (online)',
              text: 'Berufsbegleitendes Masterprogramm zu Algorithmen, Plattformoekonomie und Medienrecht. Voraussetzung: abgeschlossenes BA-Studium.',
            },
            {
              key: 'E',
              title: 'OpenDev Meetup Berlin',
              text: 'Monatliches Treffen fuer Entwicklerinnen und Entwickler offener Software. Vortraege, Code-Reviews, Mentorings. Eintritt frei.',
            },
            {
              key: 'F',
              title: 'Seminar klassische Buchfuehrung',
              text: 'Einfuehrung in manuelle Kontierung und Papierbelege. Fuer Einsteiger ohne IT-Vorkenntnisse. Wochenendkurs, max. 15 Teilnehmer.',
            },
          ],
          questions: [
            matchAd('l10', '10  Nadine leitet die IT-Abteilung eines Mittelstandsunternehmens und muss die Server-Infrastruktur modernisieren.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l11', '11  Emre promoviert in Medienwissenschaft und moechte sich wissenschaftlich mit ethischen Fragen algorithmischer Systeme befassen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
            matchAd('l12', '12  Sophie entwirft Benutzeroberflaechen und moechte aktuelle Forschung zu Usability und Barrierefreiheit kennenlernen.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l13', '13  Leon arbeitet als Backend-Entwickler und moechte sich mit anderen ueber Open-Source-Projekte austauschen.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
            matchAd('l14', '14  Karim muss nach einem Sicherheitsvorfall das Reaktionsverfahren seines Teams professionalisieren und dokumentieren lernen.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 — Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Ueberschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Debatte: Sollten soziale Netzwerke algorithmische Feeds abschaffen?',
          text:
            'Meinung 15 — Dr. Ines Hartmann, 44, Medienforscherin:\nChronologische Feeds wuerden die Verbreitung extremistischer Inhalte nicht automatisch stoppen, koennten aber die Aufmerksamkeitssteuerung transparenter machen. Entscheidend waere, dass Nutzer nachvollziehen koennen, warum ihnen etwas angezeigt wird.\n\nMeinung 16 — Malik, 29, Gruender eines Start-ups:\nEin Verbot wuerde Innovationsdruck von Plattformen nehmen und kleinere Anbieter benachteiligen, weil nur Konzerne teure Alternativen finanzieren koennten. Wettbewerb, nicht Regulierung, haette bisher Fortschritte gebracht.\n\nMeinung 17 — Ruth, 58, Lehrerin:\nSchueler verlieren ohne Filter zu viel Zeit und geraten leichter in Echokammern. Deshalb sollten Feeds standardmaessig deaktiviert sein, bis Nutzer aktiv zustimmen, obwohl das die Bedienung etwas komplizierter macht.\n\nMeinung 18 — Jonas, 36, Datenschutzbeauftragter:\nAlgorithmische Sortierung ist nicht per se problematisch, solange sie auditierbar ist und personenbezogene Profile geloescht werden koennen. Pauschale Abschaffung wuerde Symptome bekaempfen, nicht Ursachen.',
          ads: [
            { key: 'a', title: 'Regulierung bremst den Markt', text: '' },
            { key: 'b', title: 'Schutz durch bewusste Standard-Einstellungen', text: '' },
            { key: 'c', title: 'Transparenz statt pauschaler Verbote', text: '' },
            { key: 'd', title: 'Chronologie allein loest nichts', text: '' },
          ],
          questions: [
            matchHeadline('l15', '15  Meinung von Dr. Ines Hartmann, 44', ['a', 'b', 'c', 'd'], 'd'),
            matchHeadline('l16', '16  Meinung von Malik, 29', ['a', 'b', 'c', 'd'], 'a'),
            matchHeadline('l17', '17  Meinung von Ruth, 58', ['a', 'b', 'c', 'd'], 'b'),
            matchHeadline('l18', '18  Meinung von Jonas, 36', ['a', 'b', 'c', 'd'], 'c'),
          ],
        },
        {
          teil: 5,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 5 — Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Richtlinie zur Nutzung cloudbasierter Dienste — Universitaet Konstanz',
          text:
            'Fuer die Verarbeitung personenbezogener Forschungsdaten duerfen ausschliesslich vom Rektorat freigegebene Cloud-Dienste genutzt werden. Eine Uebermittlung in Drittstaaten ist unzulaessig, sofern kein angemessenes Datenschutzniveau nachgewiesen wird.\n\nProjektleitungen sind verpflichtet, Zugriffsrechte regelmaessig zu pruefen und zu dokumentieren. Bei Verstossen kann die IT-Abteilung den Zugang voruebergehend sperren, bevor ein formelles Verfahren eingeleitet wird.\n\nAusnahmen sind nur mit schriftlicher Genehmigung der Datenschutzbeauftragten zulaessig. Beschwerden sind innerhalb von 14 Tagen nach Bekanntwerden des Vorfalls einzureichen; verspaetete Meldungen koennen nur beruecksichtigt werden, wenn der Antragsteller nachweist, dass die Verzoegerung unverschuldet war.',
          questions: [
            mc(
              'l19',
              '19  Welche Schlussfolgerung laesst sich zu Cloud-Diensten ziehen?',
              'Jeder Dienst darf genutzt werden, wenn er guenstig ist.',
              'Nur vom Rektorat freigegebene Dienste sind zulaessig.',
              'Drittstaaten-Uebermittlung ist grundsaetzlich erlaubt.',
              'b'
            ),
            mc(
              'l20',
              '20  Was geschieht laut Text bei Verstoessen zunaechst?',
              'Es wird sofort gekuendigt.',
              'Der Zugang kann voruebergehend gesperrt werden.',
              'Es erfolgt keine Reaktion.',
              'b'
            ),
            mc(
              'l21',
              '21  Wann koennen verspaetete Beschwerden dennoch beruecksichtigt werden?',
              'Wenn der Antragsteller unverschuldete Verzoegerung nachweist.',
              'Wenn die Beschwerde innerhalb von 14 Tagen schriftlich eingeht.',
              'Grundsaetzlich nie.',
              'a'
            ),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Hoeren Teil 1\nSie hoeren zwei kurze Texte.\nSie hoeren jeden Text zweimal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, hier spricht die IT-Abteilung der Firma MedTech Solutions. Aufgrund eines Sicherheitsvorfalls muessen alle Mitarbeitenden bis Freitag, 17 Uhr, an der verpflichtenden Schulung zu Phishing und Datenschutz teilnehmen. Wer bereits am Dienstag teilgenommen hat, muss sich nicht erneut anmelden. Bitte melden Sie sich ueber das interne Portal an. Bei Rueckfragen wenden Sie sich an Herrn Brandt. Ich wiederhole: Anmeldung ueber das interne Portal, nicht per E-Mail.',
              questions: [
                rf('h1', '1  Alle Mitarbeitenden muessen die Schulung unbedingt zweimal absolvieren.', 'F'),
                mc('h2', '2  Wer bereits am Dienstag teilgenommen hat, ...', 'muss sich erneut anmelden', 'ist von der Pflicht befreit', 'soll Herrn Brandt persoenlich besuchen', 'b'),
              ],
            },
            {
              label: 'Text 2: Durchsage im Radio',
              transcript:
                'Kurzmeldung: Der Bundestag hat in der naechtlichen Sitzung ueber die Einfuehrung einer digitalen Ausweisfunktion debattiert. Befuerworter argumentieren, Behoerdengaenge koennten dadurch schneller werden. Kritiker warnen vor zentralen Datenspeichern, obwohl die Regierung betont, dass Daten dezentral verwaltet werden sollen. Ob das Gesetz in dieser Form verabschiedet wird, bleibt offen; eine abschliessende Abstimmung ist fuer naechste Woche geplant.',
              questions: [
                rf('h3', '3  Kritiker befuerchten zentrale Datenspeicher.', 'R'),
                mc('h4', '4  Laut Regierung sollen die Daten ...', 'zentral gespeichert werden', 'dezentral verwaltet werden', 'komplett geloescht werden', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hoeren Teil 2\nSie hoeren einen Text.\nSie hoeren den Text einmal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          context: 'Vortrag ueber ein Smart-City-Projekt in Leipzig.',
          transcript:
            'Willkommen zum Projektupdate Smart Leipzig 2030. In den vergangenen zwei Jahren wurden 120 intelligente Sensoren installiert, um Luftqualitaet und Verkehrsstroeme in Echtzeit zu messen. Die Daten werden anonymisiert ausgewertet, um Ampelschaltungen dynamisch anzupassen. Laut Projektbericht sank die durchschnittliche Wartezeit an drei Hauptkreuzungen um 14 Prozent, obwohl der Gesamtverkehr leicht zugenommen habe.\n\nAllerdings kritisieren Buergerverbaende, dass die Informationskampagnen zu spaet starteten. Viele Anwohner wussten nicht, welche Daten erhoben wuerden. Deshalb wurde nun ein oeffentliches Dashboard eingerichtet, auf dem Messwerte einsehbar sind. Die Finanzierung ist bis Ende 2027 gesichert, sofern keine weiteren Foerdermittel gestrichen werden.',
          questions: [
            mc('h5', '5  Was ist laut Vortrag das Hauptziel der Sensoren?', 'Werbung fuer neue Apps auszuspielen', 'Verkehr und Luftqualitaet zu messen', 'Private Wohnungen zu ueberwachen', 'b'),
            mc('h6', '6  Welches Ergebnis wird fuer drei Kreuzungen genannt?', 'Die Wartezeit sank um 14 Prozent.', 'Der Verkehr wurde um 14 Prozent reduziert.', 'Die Luftqualitaet verschlechterte sich um 14 Prozent.', 'a'),
            mc('h7', '7  Was laesst sich ueber die Finanzierung schliessen?', 'Sie ist dauerhaft unbegrenzt gesichert.', 'Sie ist bis Ende 2027 gesichert, sofern Foerderung nicht gestrichen wird.', 'Sie wurde bereits vollstaendig gestrichen.', 'b'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hoeren Teil 3\nSie hoeren ein Gespraech.\nSie hoeren das Gespraech einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Kolleginnen besprechen digitale Erreichbarkeit und Work-Life-Balance.',
          transcript:
            'Laura: Ich habe gestern Abend wieder Mails beantwortet, obwohl ich eigentlich frei hatte.\nSimone: Das mache ich auch manchmal, aber ich versuche, ab 20 Uhr offline zu gehen.\nLaura: Unser Teamleiter behauptet, wir seien flexibel, trotzdem erwarte er sofortige Antworten in Chatgruppen.\nSimone: Genau deshalb habe ich Benachrichtigungen deaktiviert. Mein Eindruck ist, dass st—ndige Erreichbarkeit die Qualitaet der Arbeit senkt.\nLaura: Stimmt, und ich wuerde gern vereinbaren, dass dringende Faelle telefonisch gemeldet werden.\nSimone: Das waere sinnvoll, allerdings muessen wir das im naechsten Teammeeting offen ansprechen, statt es hintenrum zu loesen.',
          questions: [
            rf('h8', '8  Simone ist der Meinung, dass staendige Erreichbarkeit die Arbeitsqualitaet senken kann.', 'R'),
            rf('h9', '9  Laura findet das Verhalten des Teamleiters voellig angemessen.', 'F'),
            rf('h10', '10  Simone hat Benachrichtigungen auf ihrem Geraet deaktiviert.', 'R'),
            rf('h11', '11  Beide wollen das Thema im naechsten Teammeeting ansprechen.', 'R'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hoeren Teil 4\nSie hoeren eine Diskussion.\nSie hoeren die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Radio: Soll KI automatisch Nachrichtentexte verfassen duerfen?',
          speakers: ['Moderator/in', 'Frau Weiss', 'Herr Ortmann'],
          transcript:
            'Moderator: KI-generierte Artikel sparen Redaktionen Zeit, gefaehrden aber Vertrauen. Frau Weiss, sehen Sie darin ein Problem?\nFrau Weiss: Ja, wenn Leser nicht erkennen, ob ein Mensch oder ein System schreibt. Transparenz muesste verpflichtend sein, allerdings duerfte man KI nicht generell verbieten.\nHerr Ortmann: Ich halte ein Verbot fuer kontraproduktiv. Redaktionen muessen ohnehin kuenftig schneller arbeiten, um zu ueberleben.\nFrau Weiss: Schnelligkeit darf nicht wichtiger sein als sorgfaeltige Recherche. Ich wuerde vorschlagen, jeden KI-Text mit Quellenangaben zu kennzeichnen.\nModerator: Herr Ortmann, akzeptieren Sie das?\nHerr Ortmann: Kennzeichnung ja, aber die Haftung muesste bei der verantwortlichen Redaktion bleiben, nicht beim Softwareanbieter.\nFrau Weiss: Genau deshalb brauchen wir klare redaktionelle Prozesse, statt blind zu veroeffentlichen.',
          questions: [
            matchSpeaker('h12', '12  Leser muessen erkennen koennen, ob ein Text von KI stammt.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h13', '13  Ein generelles Verbot haelt Herr Ortmann fuer kontraproduktiv.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h14', '14  Schnelligkeit duerfe nicht wichtiger sein als sorgfaeltige Recherche.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h15', '15  Die Haftung solle bei der verantwortlichen Redaktion bleiben.', ['M', 'F', 'H'], 'H'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '25 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 — Schreiben\nSchreiben Sie eine E-Mail (circa 150 Woerter).\nSchreiben Sie etwas zu allen drei Punkten.\n\nSie haben an einem Online-Symposium zum Thema —Digitalisierung und Bildung" teilgenommen. Ihre Kollegin Petra konnte nicht dabei sein.\n\n- Berichten Sie, welche Vortraege fuer Sie besonders relevant waren\n- Erklaeren Sie, welche Herausforderung im Bildungsbereich Sie am dringendsten finden\n- Machen Sie einen Vorschlag, wie Sie das Gelernte im Team umsetzen koennten',
          minWords: 150,
          criteria: ['Inhalt (Aufgabenerfuellung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Liebe Petra,\n\nschade, dass du beim Symposium nicht dabei sein konntest. Besonders spannend fand ich den Vortrag zur medienkompetenten Unterrichtsgestaltung, weil dort konkrete Beispiele aus der Praxis vorgestellt wurden.\n\nAm dringendsten sehe ich die ungleiche Ausstattung der Schulen, obwohl digitale Bildung laengst als Grundkompetenz gilt. Viele Schuelerinnen und Schueler koennen zu Hause nicht verlaesslich lernen.\n\nIch wuerde vorschlagen, dass wir im Team einen Workshop planen, um unsere Materialien zu ueberarbeiten und offene Ressourcen einzubinden. Waere das fuer dich interessant?\n\nViele Gruesse\nMarkus',
          feedback: ['Semiformaler Ton', 'Alle drei Inhaltspunkte', 'Circa 150 Woerter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '35 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie einen kommentierenden Text (circa 150 Woerter).\n\nIm Online-Forum steht:\n—Soziale Netzwerke sollten komplett anonymisiert werden, damit Hassrede verschwindet."\n\nNehmen Sie Stellung. Begruenden Sie Ihre Meinung mit mindestens zwei Argumenten, ziehen Sie ein moegliches Gegenargument heran und formulieren Sie eine Schlussfolgerung mit Vorschlag.',
          minWords: 150,
          criteria: ['These und Struktur', 'Argument und Gegenargument', 'Schlussfolgerung mit Vorschlag'],
          modelAnswer:
            'Ich halte totale Anonymisierung fuer kein geeignetes Mittel gegen Hassrede. Einerseits wuerde sie missbrauchliche Inhalte erschweren, andererseits wuerden auch vulnerable Gruppen ihre Stimme verlieren, die anonym Schutz suchen.\n\nEin Gegenargument lautet, Anonymitaet foerdere Verantwortungslosigkeit. Dem ist entgegenzuhalten, dass viele Faelle von Hetze auch unter Klarnamen auftreten.\n\nMeiner Meinung nach sollten Plattformen Meldemechanismen staerken und transparent moderieren, statt pauschal Anonymitaet abzuschaffen.',
          feedback: ['These-Argument-Gegenargument-Schluss', 'Circa 150 Woerter', 'Nuancierte Position'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '20 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 — Schreiben\nSchreiben Sie eine E-Mail (circa 60 Woerter).\n\nSie haben einen Termin bei der Datenschutzbeauftragten Ihrer Hochschule. Sie koennen nicht teilnehmen, weil Sie an einer Pflichtveranstaltung teilnehmen muessen.\n\nEntschuldigen Sie sich hoeflich, nennen Sie den Grund und bitten Sie um einen Ersatztermin.',
          minWords: 60,
          criteria: ['Formeller Ton', 'Entschuldigung mit Grund', 'Bitte um Ersatztermin'],
          modelAnswer:
            'Sehr geehrte Frau Dr. Schneider,\n\nbedauerlicherweise kann ich meinen Termin am 12. Juni nicht wahrnehmen, da ich an einer verpflichtenden Pruefungsvorbereitung teilnehmen muss. Koennten Sie mir bitte einen Ersatztermin anbieten?\n\nMit freundlichen Gruessen\nLea Hoffmann',
          feedback: ['Vollstaendig formell', 'Grund und Ersatztermin', 'Circa 60 Woerter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. – Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nIhr Deutschkurs moechte eine Veranstaltung zum Thema —Digitale Muendigkeit" organisieren.\nPlanen Sie mit Ihrem Partner / Ihrer Partnerin Zielgruppe, Format, Datum und Aufgabenverteilung.',
          points: ['Zielgruppe und Format festlegen', 'Termin und Ort vorschlagen', 'Auf Einwaende reagieren', 'Rollen verteilen und entscheiden'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Ich wuerde vorschlagen, einen Abendworkshop fuer Erwachsene anzubieten, weil viele Eltern unsicher im Umgang mit Apps sind.\nPartner: Das klingt sinnvoll, allerdings muessten wir einen Raum mit gutem WLAN finden.\nIch: Koennten wir die Stadtbibliothek anfragen? Dort gaebe es auch Beamer.\nPartner: Gute Idee. Wann waere realistisch?\nIch: Am 20. naechsten Monats, sofern wir rechtzeitig werben.\nPartner: Dann uebernehme ich die Flyer, und du koenntest Referentinnen ansprechen.\nIch: Einverstanden, so wuerde ich es machen.',
          feedback: ['Konjunktiv II und Begruendungen', 'Gemeinsame Entscheidung', 'Mindestens fuenf Wechsel'],
        },
        {
          teil: 2,
          title: 'Ein Thema praesentieren',
          dauer: 'ca. – Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nPraesentieren Sie das Thema —Auswirkungen der Digitalisierung auf den Arbeitsmarkt in meinem Heimatland".\n\n1. Einleitung\n2. Eigene Erfahrung\n3. Situation im Heimatland\n4. Vor- und Nachteile + Meinung\n5. Schluss',
          points: ['Einleitung mit These', 'Eigene Erfahrung', 'Landeskontext', 'Abwaegung mit Meinung', 'Schluss'],
          minWords: 100,
          modelAnswer:
            'Heute moechte ich ueber die Auswirkungen der Digitalisierung auf den Arbeitsmarkt in meinem Heimatland sprechen. In meinem letzten Projekt habe ich erlebt, wie Automatisierung Routineaufgaben uebernommen hat, wodurch sich meine Rolle staerker auf Beratung verlagerte. In meinem Land wachsen IT-Jobs deutlich, gleichzeitig werden jedoch viele Verwaltungsstellen reduziert, obwohl Umschulungsprogramme erst langsam ausgebaut werden. Das bietet Chancen fuer qualifizierte Fachkraefte, birgt jedoch Risiken fuer aeltere Beschaeftigte ohne digitale Kompetenzen. Meiner Meinung nach sollten Staat und Unternehmen gemeinsam in Weiterbildung investieren, um soziale Spaltung zu vermeiden. Vielen Dank fuer Ihre Aufmerksamkeit.',
          feedback: ['Fuenf Abschnitte', 'Fachvokabular B2', 'Circa 100 Woerter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 — Sprechen\nGeben Sie Ihrem Partner / Ihrer Partnerin konstruktives Feedback zur Praesentation.\nStellen Sie eine kritische Frage und beantworten Sie eine Gegenfrage.',
          points: ['Konstruktives Feedback', 'Kritische Frage stellen', 'Gegenfrage beantworten', 'Hoeflich aber bestimmt argumentieren'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Deine Praesentation war sehr strukturiert. Besonders ueberzeugend fand ich den Vergleich zwischen Chancen und Risiken.\nPartner: Danke! Welcher Aspekt fehlte dir?\nIch: Mir haette ein konkretes Beispiel zu Umschulungsprogrammen noch gefallen.\nPartner: Haettest du eher staatliche oder private Loesungen?\nIch: Ich wuerde beides verbinden, weil Unternehmen von qualifizierten Mitarbeitenden profitieren, der Staat jedoch Rahmenbedingungen setzen sollte.',
          feedback: ['Differenziertes Feedback', 'Frage und Antwort', 'Argumentation auf B2-Niveau'],
        },
      ],
    };
  }

  function buildC1() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level: 'C1',
      topic: 'Wissenschaft, Ethik und Forschung',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Goethe-Zertifikat C1',
        note: 'Modellsatz (Demo). Struktur nach offiziellem Goethe-Zertifikat C1.',
      },
      modules: {
        lesen: { title: 'Lesen', time: '70 Minuten' },
        horen: { title: 'Hoeren', time: '40 Minuten' },
        schreiben: { title: 'Schreiben', time: '80 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
          textTitle: 'Geo Kompakt — Kommentar: Vom Versprechen der Heilung und dem Preis der Eile',
          text:
            'Die in den Medien zelebrierte Gen-Schere, so meine These, wird nicht primaer an Krankenbetten gemessen, sondern an Boersenwerten. Wer die Debatte nur ueber individuelle Heilungschancen fuehrt, uebersieht die oekonomische Logik hinter klinischen Studien mit rekordverdaechtiger Finanzierung.\n\nNicht dass ich Fortschritt grundsaetzlich ablehne. Im Gegenteil: Die praezise Editierung pathogener Sequenzen koennte Leid verringern, sofern die Evidenzbasis stimmt und die Langzeitfolgen nicht dem Shareholder Value geopfert werden. Was mich irritiert, ist die rhetorische Gleichsetzung von wissenschaftlicher Neugier mit moralischer Unbedenklichkeit.\n\nIn Laendern mit schwach ausgepraegter Forschungsethik droht zudem, dass vulnerable Gruppen zu Testfeldern werden, waehrend der Nutzen global asymmetrisch verteilt bleibt. Die Autorin des juengsten Bestsellers mag das als Pessimismus abtun; ich wuerde es als Realismus bezeichnen, der sich nicht mit Applaus abfinden muss.\n\nAm Ende, so vermute ich, wird die Gesellschaft nicht die Technologie waehlen, sondern die Rahmenbedingungen, unter denen sie angewandt wird. Und genau dort fehlt mir der Mut zur Langsamkeit.',
          questions: [
            rf('l1', '1  Der Autor wirft der oeffentlichen Debatte vor, wirtschaftliche Interessen zu vernachlaessigen.', 'R'),
            rf('l2', '2  Laut Text lehnt der Autor wissenschaftlichen Fortschritt grundsaetzlich ab.', 'F'),
            rf('l3', '3  Der Autor sieht die Gleichsetzung von Neugier und Moral als problematisch an.', 'R'),
            rf('l4', '4  Der Autor haelt den genannten Bestseller fuer ausgewogen und realistisch.', 'F'),
            rf('l5', '5  Aus dem Text laesst sich schliessen, dass der Autor Tempo in der Regulierung fuer wichtig haelt.', 'F'),
            rf('l6', '6  Der Autor erwartet, dass gesellschaftliche Entscheidungen vor allem die Nutzungsbedingungen betreffen.', 'R'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Spektrum der Wissenschaft: Placebo-kontrollierte Studien unter Druck',
          text:
            'In der klinischen Forschung gilt die randomisierte, doppelblinde Studie als Goldstandard zur Abschaetzung therapeutischer Wirksamkeit. Neuere Analysen der Universitaet Heidelberg zeigen jedoch, dass in bestimmten Therapiebereichen die Placebo-Response-Raten steigen, wodurch signifikante Effekte schwerer nachweisbar werden.\n\nForschende vermuten, dass komplexere Patientenerwartungen, verstaerkte Prae-Test-Kommunikation und die mediale Praesenz neuer Wirkstoffe die Ergebnisvarianz erhoehen. Kritisch zu hinterfragen ist zugleich, ob kommerziell finanzierte Studien hinreichend transparent ueber Protokollaenderungen berichten.\n\nEthikkommissionen bestehen deshalb verstaerkt auf prae-registrierte Endpunkte und unabhaengige Datenevaluierung. Dennoch warnen Wissenschaftlerinnen und Wissenschaftler davor, methodische Strenge mit buerokratischer Erstarrung gleichzusetzen, zumal verzoegerte Zulassungen bei seltenen Erkrankungen humanitaere Kosten haben koennten.',
          questions: [
            mc(
              'l7',
              '7  Welche Schlussfolgerung ergibt sich aus dem steigenden Placebo-Response?',
              'Therapeutische Effekte sind in manchen Bereichen schwerer nachzuweisen.',
              'Placebo-kontrollierte Studien werden generell abgeschafft.',
              'Patientenerwartungen spielen in der Forschung keine Rolle.',
              'a'
            ),
            mc(
              'l8',
              '8  Was impliziert der Text ueber kommerziell finanzierte Studien?',
              'Sie sind per se unzuverlaessig.',
              'Ihre Transparenz bei Protokollaenderungen ist hinterfragbar.',
              'Sie benoetigen keine Ethikkommissionen.',
              'b'
            ),
            mc(
              'l9',
              '9  Wie ist die Haltung der im Text genannten Wissenschaftler zu strengeren Verfahren am ehesten zu charakterisieren?',
              'Sie lehnen jede Regulierung ab.',
              'Sie befuerworten Strenge, warnen aber vor ueberzogener Buerokratie.',
              'Sie halten Verzoegerungen fuer grundsaetzlich unproblematisch.',
              'b'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie koennen jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Abstract — Journal of Reproducibility Studies',
              text: 'Metaanalyse zu nicht replizierbaren Ergebnissen in den Neurowissenschaften. Methodische Empfehlungen fuer Open-Data-Praktiken. Peer-reviewed, Open Access.',
            },
            {
              key: 'B',
              title: 'Rezension — Ethik der Forschung am Menschen',
              text: 'Sachbuch von Prof. Dr. Albrecht: historische Entwicklung, informierte Einwilligung, Grenzen der Belastbarkeit. Ausfuehrliche Fallstudien.',
            },
            {
              key: 'C',
              title: 'Forschungsintegritaet — Universitaet Bonn',
              text: 'Webseite der Ombudsstelle: Meldewege bei Plagiat, Datenmanipulation oder Interessenkonflikten. Vertrauliche Erstberatung.',
            },
            {
              key: 'D',
              title: 'Call for Papers — Bioethics & Policy',
              text: 'Internationale Tagung zu Governance von Biotechnologie. Einreichung von Abstracts bis 30. September. Reisezuschuesse fuer Early-Career Researchers.',
            },
            {
              key: 'E',
              title: 'Patentregister EU — Sequenzanalyse',
              text: 'Technische Dokumentation zu Anmeldeverfahren genetischer Verfahren. Fokus auf Schutzrechte und Lizenzmodelle, nicht auf klinische Anwendung.',
            },
            {
              key: 'F',
              title: 'Vortragsreihe Literatur und Aesthetik',
              text: 'Oeffentliche Lesungen zeitgenoessischer Lyrik. Kein Bezug zu Naturwissenschaften. Eintritt frei, Donnerstags 19 Uhr.',
            },
          ],
          questions: [
            matchAd('l10', '10  Dr. Weiss bereitet eine Vorlesung ueber die Geschichte informierter Einwilligung vor.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l11', '11  Eine Doktorandin vermutet unbeabsichtigte Verfaelschung in ihren Versuchsdaten und sucht vertrauliche Beratung.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l12', '12  Prof. Nguyen moechte auf einer Fachkonferenz ein Paper zur Regulierung von Biotechnologie einreichen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
            matchAd('l13', '13  Ein Team analysiert systematisch, warum viele Studien nicht reproduzierbar sind.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
            matchAd('l14', '14  Ein Biotech-Unternehmen prueft die Schutzfaehigkeit eines neuen Verfahrens vor Markteinfuehrung.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 — Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Ueberschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Forum: Soll kuenstliche Intelligenz wissenschaftliche Publikationen mitverfassen duerfen?',
          text:
            'Meinung 15 — Prof. Dr. Sandra Voigt, 49, Wissenschaftstheorie:\nDie Autorschaft impliziert Verantwortung fuer Inhalt und Methodik. Ein Modell, das Texte generiert, ohne die zugrunde liegende Evidenz eigenstaendig pruefen zu koennen, erfuellt dieses Kriterium nicht. Transparenzpflichten duerften hoerstens als Werkzeugdeklaration gelten.\n\nMeinung 16 — Amir, 34, Computational Biologist:\nWer heute grosse Datensaetze auswertet, nutzt ohnehin algorithmische Pipeline. Die Scheinheiligkeit, am Ende nur menschliche Namen auf dem Titelblatt zu sehen, verdeckt die tatsaechliche Arbeitsteilung.\n\nMeinung 17 — Dr. Helena Roth, 41, Herausgeberin:\nIch wuerde Co-Autorenschaft fuer Systeme nur akzeptieren, wenn nachvollziehbar dokumentiert wird, welche Hypothesen menschlich gesetzt wurden. Andernfalls droht die Erosion des Peer-Review-Vertrauens.\n\nMeinung 18 — Jonas, 38, Wissenschaftspolitiker:\nDer Kern ist nicht die Technologie, sondern Anreizsysteme, die Quantitaet ueber Qualitaet stellen. Solange Publikationsdruck dominiert, wird jedes neue Werkzeug eher missbraucht als gezielt reguliert.',
          ads: [
            { key: 'a', title: 'Autorschaft ohne Verantwortung ist untragbar', text: '' },
            { key: 'b', title: 'Anreizsysteme sind das eigentliche Problem', text: '' },
            { key: 'c', title: 'Algorithmische Arbeit sollte sichtbar werden', text: '' },
            { key: 'd', title: 'Co-Autorenschaft nur mit dokumentierter Mensch-Maschine-Rolle', text: '' },
          ],
          questions: [
            matchHeadline('l15', '15  Meinung von Prof. Dr. Sandra Voigt, 49', ['a', 'b', 'c', 'd'], 'a'),
            matchHeadline('l16', '16  Meinung von Amir, 34', ['a', 'b', 'c', 'd'], 'c'),
            matchHeadline('l17', '17  Meinung von Dr. Helena Roth, 41', ['a', 'b', 'c', 'd'], 'd'),
            matchHeadline('l18', '18  Meinung von Jonas, 38', ['a', 'b', 'c', 'd'], 'b'),
          ],
        },
        {
          teil: 5,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 5 — Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Satzung der Ethikkommission — Medizinische Fakultaet Heidelberg',
          text:
            'Forschungsvorhaben mit erhoehtem Belastungspotenzial fuer Probandinnen und Probanden beduerfen einer vorherigen schriftlichen Genehmigung durch die Ethikkommission. Als erhoeht gilt insbesondere jede Intervention, deren Risiken nicht durch den erwarteten Nutzen plausibel gedeckt werden koennen, es sei denn, es liegen zwingende wissenschaftliche Gruende vor, die in der Antragstellung ausfuehrlich begruendet werden.\n\nAntraege sind mindestens sechs Wochen vor Studienbeginn einzureichen; bei multizentrischen Projekten verlaengert sich die Frist auf acht Wochen, sofern keine parallele Pruefung anderer Standorte vorliegt. Nachtraegliche Protokollaenderungen mit ethischer Relevanz sind unverzueglich anzuzeigen; andernfalls kann die Genehmigung widerrufen werden.\n\nAusnahmen von der Vollstaendigkeitspruefung werden nur fuer retrospektive Auswertungen anonymisierter Routinedaten gewaehrt, sofern kein Rueckfuehrbarkeitsrisiko besteht und die Datenschutzkonformitaet nachweislich gesichert ist.',
          questions: [
            mc(
              'l19',
              '19  Welche Implikation ergibt sich fuer risikoreiche Interventionen ohne ausreichenden Nutzen?',
              'Sie duerfen grundsaetzlich ohne Genehmigung durchgefuehrt werden.',
              'Sie beduerfen einer Genehmigung, es sei denn, zwingende wissenschaftliche Gruende werden belegt.',
              'Sie sind generell verboten, ohne Ausnahme.',
              'b'
            ),
            mc(
              'l20',
              '20  Was laesst sich zur Frist bei multizentrischen Projekten schliessen?',
              'Sie betraegt acht Wochen, wenn keine parallele Pruefung vorliegt.',
              'Sie entfaellt bei internationaler Beteiligung.',
              'Sie ist identisch mit der fuer Einzelzentren.',
              'a'
            ),
            mc(
              'l21',
              '21  Wann koennen retrospektive Auswertungen von Routinedaten vereinfacht werden?',
              'Immer, wenn die Daten anonymisiert sind.',
              'Nur wenn kein Rueckfuehrbarkeitsrisiko besteht und Datenschutz nachgewiesen ist.',
              'Nur bei klinischen Studien mit Placebogruppe.',
              'b'
            ),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Hoeren Teil 1\nSie hoeren zwei kurze Texte.\nSie hoeren jeden Text zweimal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, hier die Geschaeftsstelle des Graduiertenkollegs. Ihr Antrag auf Verlaengerung der Foerderung wurde zur abschliessenden Pruefung weitergeleitet. Bitte reichen Sie bis Montag, 12 Uhr, die aktualisierte Forschungsuebersicht sowie die Stellungnahme Ihrer Betreuerin ein. Ohne diese Unterlagen kann das Kuratorium nicht entscheiden. Rueckfragen richten Sie bitte nicht per privater Mail, sondern ueber das Portal an die zustaendige Sachbearbeitung.',
              questions: [
                rf('h1', '1  Das Kuratorium kann ohne die genannten Unterlagen keine Entscheidung treffen.', 'R'),
                mc('h2', '2  Rueckfragen sollen laut Ansage ...', 'ueber das Portal gestellt werden', 'per privater Mail erfolgen', 'muendlich im Buero geklaert werden', 'a'),
              ],
            },
            {
              label: 'Text 2: Durchsage im Radio',
              transcript:
                'Kurzmeldung aus der Wissenschaftspolitik: Das Bundesministerium kuendigte an, die Foerderlinie fuer Grundlagenforschung in den Geistes- und Sozialwissenschaften zu restrukturieren. Vertreterinnen betonten, die Mittel wuerden nicht gekuerzt, sondern staerker an interdisziplinaere Projekte mit gesellschaftlicher Relevanz gebunden. Kritikerinnen warfen der Behoerde vor, damit politische Steuerung unter dem Etikett der Relevanz zu betreiben, obwohl die Regierung Transparenz versprochen habe.',
              questions: [
                rf('h3', '3  Kritikerinnen werfen der Behoerde politische Steuerung vor.', 'R'),
                mc('h4', '4  Laut Vertreterinnen der Behoerde ...', 'werden die Mittel insgesamt gekuerzt', 'sollen Mittel staerker interdisziplinaer gebunden werden', 'entfaellt die Foerderung fuer Sozialwissenschaften', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hoeren Teil 2\nSie hoeren einen Text.\nSie hoeren den Text einmal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          context: 'Vortrag einer Medizinethikerin ueber Placebokontrollen.',
          transcript:
            'Meine These lautet: Placebokontrollen bleiben ethisch vertretbar, solange Probandinnen und Probanden nicht schlechter gestellt werden als unter gaengiger Therapie. Problematisch wird es dort, wo Studien konstruiert werden, um Effekte nachweisbar zu machen, statt Patientennutzen zu maximieren. In solchen Faellen, so argumentiere ich, verschiebt sich die Forschungslogik von der Heilung zur Signifikanz.\n\nInternational beobachten wir zudem unterschiedliche Standards bei Nachverfolgung sogenannter non-responder. Wer hier Transparenz verweigert, riskiert nicht nur wissenschaftliche, sondern auch reputative Schaeden. Dennoch sollten wir uns vor pauschaler Verdammung hueten: Ohne kontrollierte Designs waere kausale Evidenz in vielen Bereichen kaum erlangbar.',
          questions: [
            mc('h5', '5  Wann sind Placebokontrollen laut Vortrag am ehesten vertretbar?', 'Wenn Probanden schlechter gestellt werden als ueblich', 'Wenn niemand schlechter gestellt wird als unter gaengiger Therapie', 'Wenn Signifikanz wichtiger ist als Nutzen', 'b'),
            mc('h6', '6  Was kritisiert die Sprecherin an bestimmten Studien?', 'Sie maximieren Patientennutzen zu stark.', 'Sie optimieren eher Signifikanz als Nutzen.', 'Sie verzichten grundsaetzlich auf Kontrollgruppen.', 'b'),
            mc('h7', '7  Welche Haltung vertritt die Sprecherin zum Schluss?', 'Kontrollierte Designs sind unverzichtbar, trotz Problemen.', 'Placebokontrollen sollten generell abgeschafft werden.', 'Transparenz bei non-respondern ist irrelevant.', 'a'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hoeren Teil 3\nSie hoeren ein Gespraech.\nSie hoeren das Gespraech einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Forschende ueber Datenteilung und Publikationsdruck.',
          transcript:
            'A: Ich habe meine Rohdaten veroeffentlicht, obwohl das Team dagegen war.\nB: Mutig — aber hast du bedacht, dass andere deine Pipeline zuerst publizieren koennten?\nA: Gerade deshalb finde ich Embargos problematisch; Wissenschaft lebt von Nachpruefbarkeit.\nB: Theoretisch ja, praktisch foerdert der Leistungsdruck eher Geheimhaltung bis zur Journal-Anmeldung.\nA: Dann waere es Aufgabe der Institute, Publikationsmetriken neu zu gewichten.\nB: Idealistisch formuliert, allerdings wuerde ich mir mehr Unterstuetzung von Foerderern wuenschen, statt nur Appelle an Integritaet.',
          questions: [
            rf('h8', '8  Person A hat Rohdaten veroeffentlicht, obwohl das Team dagegen war.', 'R'),
            rf('h9', '9  Person B lehnt Datenteilung grundsaetzlich ab.', 'F'),
            rf('h10', '10  Person A haelt Embargos fuer problematisch.', 'R'),
            rf('h11', '11  Person B sieht Foerderer als unbeteiligt an der Integritaetsdebatte.', 'F'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hoeren Teil 4\nSie hoeren eine Diskussion.\nSie hoeren die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Podiumsdiskussion: Embryonenforschung unter strikten Auflagen?',
          speakers: ['Moderator/in', 'Prof. Dr. Keller', 'Prof. Dr. Yamamoto'],
          transcript:
            'Moderator: Duerfen Embryonen in fruehen Entwicklungsstadien fuer Forschung genutzt werden, wenn der Nutzen hoch erscheint?\nProf. Dr. Keller: Ein absolutes Verbot wuerde potenzielle Therapien verzoegern, allerdings duerfte es ohne unabhaengige Kontrolle und klare Obergrenzen nicht gehen.\nProf. Dr. Yamamoto: Ich halte die moralische Grenze tiefer liegend: Sobald individuelle Entwicklungsfaehigkeit plausibel wird, muss Schluss sein, unabhaengig vom erwarteten medizinischen Gewinn.\nProf. Dr. Keller: Das klingt konsequent, ignoriert jedoch, dass wir sonst Erkenntnisse exportieren, statt sie ethisch zu regeln.\nModerator: Frau Yamamoto, akzeptieren Sie diese Folge?\nProf. Dr. Yamamoto: Nein, aber ich wuerde eher internationale Standards erzwingen als national allein Tempo machen.\nProf. Dr. Keller: Dann sind wir uns wenigstens einig, dass Alleingaenge problematisch waeren.',
          questions: [
            matchSpeaker('h12', '12  Forschung duerfe nur mit unabhaengiger Kontrolle und Obergrenzen stattfinden.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h13', '13  Sobald individuelle Entwicklungsfaehigkeit plausibel werde, muessen Forschung stoppen.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h14', '14  Internationale Standards seien wichtiger als nationaler Alleingang.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h15', '15  Ein absolutes Verbot wuerde Therapien verzoegern.', ['M', 'F', 'H'], 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '25 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 — Schreiben\nSchreiben Sie eine formelle E-Mail oder einen Brief (circa 170 Woerter).\n\nSie haben Zugang zu einem oeffentlich finanzierten Forschungsdatensatz beantragt. Die zustaendige Stelle lehnt ab, ohne die Ablehnung zu begruenden.\n\n- Fuehren Sie hoeflich Ihr Anliegen aus\n- Legen Sie dar, warum der Datensatz fuer Ihre Arbeit relevant ist\n- Fordern Sie eine schriftliche Begruendung und bitten Sie um erneute Pruefung',
          minWords: 170,
          criteria: ['Inhalt (Aufgabenerfuellung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\nmit Schreiben vom 3. Mai beantragte ich Zugang zum Datensatz "Longitudinal Study Cohort 2018-2024" fuer ein von der Universitaet gefoerdertes Projekt zur gesundheitlichen Resilienz. Ihre Ablehnung vom 18. Mai enthaelt leider keine nachvollziehbare Begruendung, obwohl die Daten laut Metadaten fuer sekundaere Analysen vorgesehen sind.\n\nDer Datensatz ist fuer meine Dissertation zentral, da ich kausale Zusammenhaenge zwischen Praevention und spaeterer Belastung nur mit dieser Kohorte belastbar untersuchen kann. Eine undifferenzierte Zurueckweisung erschwert nicht nur mein Vorhaben, sondern untergraebt auch das Prinzip oeffentlicher Forschungsfinanzierung.\n\nIch bitte Sie daher, die Entscheidung schriftlich zu begruenden und meinen Antrag erneut zu pruefen. Gerne stelle ich zusaetzliche ethische Freigaben bereit.\n\nMit freundlichen Gruessen\nDr. Elena Morales',
          feedback: ['Formeller Ton durchgehend', 'Alle drei Inhaltspunkte', 'Circa 170 Woerter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '35 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie einen argumentierenden Text (circa 170 Woerter).\n\nIm Forum steht:\n—Reine Wissenschaft muss wertfrei sein und darf sich nicht von gesellschaftlichen Erwartungen leiten lassen."\n\nNehmen Sie Stellung. Begruenden Sie Ihre Position, ziehen Sie ein Gegenargument heran und ziehen Sie eine praecise Schlussfolgerung.',
          minWords: 170,
          criteria: ['These und Struktur', 'Argument und Gegenargument', 'Praecise Schlussfolgerung'],
          modelAnswer:
            'Die Forderung nach vollstaendiger Wertfreiheit erscheint mir als wissenschaftliches Ideal untauglich, weil Forschungsfragen stets aus gesellschaftlichen Kontexten gespeist werden. Wer etwa epidemiologische Studien finanziert, entscheidet implizit, welches Wissen als relevant gilt.\n\nEin Gegenargument lautet, Wertfreiheit schuetze vor politischer Instrumentalisierung. Dem ist entgegenzuhalten, dass gerade die Behauptung der Neutralitaet Machtstrukturen oft unsichtbar laesst.\n\nSchlussfolgernd plaediere ich fuer transparente Normsetzung: Nicht die Abwesenheit von Werten, sondern deren explizite Reflexion macht Forschung verantwortungsfaehig.',
          feedback: ['Akademische Struktur', 'Abstrakte Zitatbezug', 'Circa 170 Woerter'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '20 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 — Schreiben\nSchreiben Sie eine E-Mail (circa 55 Woerter).\n\nSie muessen die Einreichung Ihres Ethikantrags verschieben, weil noch eine Genehmigung der Partnerklinik aussteht.\n\nInformieren Sie die Ethikkommission knapp, nennen Sie den Grund und bitten Sie um Fristverlaengerung um zwei Wochen.',
          minWords: 55,
          criteria: ['Formeller Ton', 'Grund und Fristverlaengerung', 'Praecision und Knappheit'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\ndie Einreichung meines Antrags Nr. 2026-441 verzoegert sich, da die Genehmigung der Partnerklinik noch aussteht. Ich bitte um Fristverlaengerung um zwei Wochen und melde mich unverzueglich nach Vorliegen der Unterlagen.\n\nMit freundlichen Gruessen\nTobias Werner',
          feedback: ['Vollstaendig formell', 'Grund und Bitte klar', 'Circa 55 Woerter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. – Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nSie planen mit Ihrem Partner / Ihrer Partnerin eine oeffentliche Podiumsdiskussion zum Thema —Gentechnik in der Medizin — Chancen und Grenzen".\nKlaeren Sie Zielgruppe, Format, Einladung von Expertinnen und ethische Leitlinien.',
          points: ['Zielgruppe und Format festlegen', 'Expertinnen/Einladungen vorschlagen', 'Auf Bedenken reagieren', 'Leitlinien und Ablauf entscheiden'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Ich wuerde vorschlagen, die Diskussion oeffentlich an der Universitaet anzusiedeln, damit Studierende und die Stadtgesellschaft mitdiskutieren koennen.\nPartner: Einverstanden, allerdings muessten wir neutral moderieren, um Polarisierung nicht zu verstaerken.\nIch: Dann koennten wir eine Medizinethikerin und eine Patientenvertreterin einladen, statt nur Forschende.\nPartner: Sinnvoll. Wie regeln wir Umgang mit provokanten Fragen?\nIch: Wir vereinbaren Leitlinien: sachliche Argumente, keine persoenlichen Angriffe, feste Redezeit.\nPartner: Gut, dann uebernehme ich die Moderation, wenn du die Einladungen koordinierst.',
          feedback: ['Komplexe Planung', 'Ethische Aspekte beruecksichtigt', 'Mindestens fuenf Wechsel'],
        },
        {
          teil: 2,
          title: 'Ein Thema praesentieren',
          dauer: 'ca. – Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nPraesentieren Sie akademisch strukturiert das Thema —Forschungsintegritaet in Zeiten des Publikationsdrucks".\n\n1. Problemstellung\n2. Theoretischer Rahmen\n3. Fallbeispiel\n4. Konsequenzen fuer Institutionen\n5. Schlussfolgerung',
          points: ['Problemstellung', 'Theoretischer Rahmen', 'Fallbeispiel', 'Institutionelle Konsequenzen', 'Schluss'],
          minWords: 120,
          modelAnswer:
            'Ausgangspunkt meiner Praesentation ist die Spannung zwischen wissenschaftlicher Sorgfalt und quantitativen Leistungsindikatoren. Theoretisch laesst sich dies mit dem Konzept der perversen Anreize beschreiben, das bereits in der Wissenschaftssoziologie diskutiert wurde. Ein aktuelles Fallbeispiel ist die nicht reproduzierbare Auswertung hochdimensionaler Datensaetze, haeufig begleitet von selektiver Berichterstattung signifikanter Ergebnisse. Institutionen sollten deshalb Publikationsmetriken relativieren und Open-Science-Praktiken verbindlich foerdern. Abschliessend halte ich fest: Integritaet entsteht nicht durch Appelle, sondern durch strukturell geaenderte Bewertungslogiken.',
          feedback: ['Akademische Fuenfteilung', 'Fachvokabular C1', 'Circa 120 Woerter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 — Sprechen\nDiskutieren Sie mit Ihrem Partner / Ihrer Partnerin ein ethisches Dilemma aus der Praesentation.\nGeben Sie Feedback, stellen Sie eine praezise Gegenposition und verteidigen Sie Ihre Haltung.',
          points: ['Differenziertes Feedback', 'Praezise Gegenposition', 'Verteidigung der eigenen Haltung', 'Respektvoller Ton'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Ihre Analyse der Anreizsysteme war ueberzeugend, wenngleich mir die internationale Dimension zu kurz kam.\nPartner: Welche Dimension meinen Sie?\nIch: Dass Laender mit unterschiedlichen Integritaetsstandards im Wettbewerb stehen.\nPartner: Ich wuerde entgegnen, dass globale Standards ohne souveraene Durchsetzung wirkungslos bleiben.\nIch: Dem stimme ich zu, dennoch waere ein harmonisiertes Minimum besser als gar keine Koordination.\nPartner: Das laesst sich vertreten, wenn Kontrollmechanismen glaubwuerdig sind.',
          feedback: ['Ethisches Dilemma diskutiert', 'Gegenposition und Verteidigung', 'C1-Argumentation'],
        },
      ],
    };
  }

  function buildC2() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'de',
      level: 'C2',
      topic: 'Sprache, Identitaet und Kultur',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Goethe-Zertifikat C2',
        note: 'Modellsatz (Demo). Struktur nach offiziellem Goethe-Zertifikat C2: Grosser Deutscher Sprachdiplom (GDS).',
      },
      modules: {
        lesen: { title: 'Lesen', time: '80 Minuten' },
        horen: { title: 'Hoeren', time: '35 Minuten' },
        schreiben: { title: 'Schreiben', time: '80 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 - Lesen\nLesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
          textTitle: 'Aus: Der verschwiegene Akzent - Essayfragment ueber Sprache und Zugehoerigkeit',
          text:
            'Man sagt, die Muttersprache sei ein Heim. Ich fuerchte, sie ist eher ein Haus, in dem man einst wohnte und dessen Tuere man verriegelt hat, ohne es zu merken. Die Woerter, die ich als Kind unter der Decke fluesterte, klingen heute fremd - nicht weil sie verloren gingen, sondern weil ich sie aus Hoeflichkeit nicht mehr ausspreche. Hochdeutsch, so vermute ich, war stets die Sprache der Entschuldigung: der Preis fuer Zugehoerigkeit, den man zuerst freiwillig zahlt und spaeter als Pflicht empfindet.\n\nNicht dass ich das Dialektische romantisiere. Wer nur im Dialekt denkt, schreibt mitunter Prosa, die klangvoll ist und dennoch arm an Abstraktionen - ein Verlust, den ich nicht leugnen mag. Und doch: Was bleibt von einer Landschaft, wenn jede Gemeinde klingt wie jede andere Sendung? Ein akustisches Gedaechtnis ohne Echo, wuerde ich sagen; nur dass die Metapher schon zu sacht ist.\n\nMeine Tante, inzwischen achtzig, verweigert sich dem Altersheim, weil dort das Hochdeutsche dominiert und sie sich beschimpft fuehlt, obwohl niemand sie beschimpft. Die Verwaltung nennt das Missverstaendnis; ich nenne es die unsichtbare Seite der Einheitssprache. Am Ende frage ich mich nicht, ob Identitaet an Sprache haengt - das tut sie, offenkundig -, sondern wie viel Uniformitaet wir ertragen, bevor Heimat zur Administration wird.',
          questions: [
            rf('l1', '1  Der Autor behauptet, seine Kindheitswoerter seien voellig verschwunden.', 'F'),
            rf('l2', '2  Laut Text empfindet der Autor Hochdeutsch als Preis fuer gesellschaftliche Zugehoerigkeit.', 'R'),
            rf('l3', '3  Der Autor leugnet jede kognitive Einschraenkung des dialektgebundenen Denkens.', 'F'),
            rf('l4', '4  Die Verwaltung interpretiert das Verhalten der Tante als persoenliches Missverstaendnis.', 'R'),
            rf('l5', '5  Der Autor bezweifelt grundsaetzlich einen Zusammenhang zwischen Sprache und Identitaet.', 'F'),
            rf('l6', '6  Der Schluss legt nahe, dass zu viel sprachliche Vereinheitlichung Heimat entleert.', 'R'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 - Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Sueddeutsche Zeitung, Feuilleton: Wenn Kultur zum Exportartikel wird',
          text:
            'Die Debatte ueber den sogenannten Kulturtransfer hat sich in den vergangenen Jahren merklich verschoben: Nicht mehr die Frage, ob deutsche Literatur im Ausland gelesen wird, dominiert, sondern ob sie dort noch als Literatur gelesen wird oder als ethnographisches Fenster. Wer heute im Feuilleton ueber Identitaet schreibt, riskiert, fuer einen Markt produziert zu werden, der Authentizitaet wie ein Qualitaetssiegel handelt.\n\nDass Migrationserfahrungen erzaehlbar sind, versteht sich von selbst; weniger selbstverstaendlich ist, dass der Erwartungsdruck, die eigene Biografie als Beweisstueck zu liefern, die Form veraendert. Einige Autorinnen reagieren mit ironischer Uebertreibung, andere ziehen sich ins Allgemeine zurueck - beides kann als Flucht gelesen werden, obwohl es unterschiedliche Strategien markiert.\n\nKritisch zu fragen bleibt, inwieweit Foerderprogramme, die explizit nach Herkunft kategorisieren, gerade jene Vielfalt einengen, die sie sichtbar machen wollen. Die Kulturpolitik mag das als pragmatischen Kompromiss feiern; die Literatur, so duerfte man vermuten, bezahlt den Preis in einer Sprache, die staendig erklaeren muss, statt einfach zu sein.\n\nAm Ende geht es nicht um weniger Migration in den Buechern, sondern um mehr Freiheit darin, welche Geschichten als universal gelten duerfen - ohne dass Universalitaet wieder nur als westeuropaeische Norm erscheint.',
          questions: [
            mc(
              'l7',
              '7  Welche Verschiebung der Debatte beschreibt der Text am Anfang?',
              'Es geht zunehmend darum, ob auslaendische Leser deutsche Autoren verstehen.',
              'Es geht zunehmend darum, ob Texte als Literatur oder als ethnographisches Fenster gelesen werden.',
              'Es geht zunehmend darum, ob Migrationsliteratur verboten werden soll.',
              'b'
            ),
            mc(
              'l8',
              '8  Wie ist die Haltung des Autors zu Foerderprogrammen mit Herkunftskategorien am ehesten zu fassen?',
              'Er lehnt sie grundsaetzlich als rassistisch ab.',
              'Er sieht in ihnen ein paradoxes Risiko der Einengung trotz Vielfaltsziel.',
              'Er haelt sie fuer die einzige realistische Loesung des Marktproblems.',
              'b'
            ),
            mc(
              'l9',
              '9  Was impliziert der Schlusssatz ueber Universalitaet?',
              'Universalitaet duerfe nur westeuropaeisch definiert werden.',
              'Mehr Freiheit bedeute auch, Universalitaet nicht erneut als verdeckte Norm zu missbrauchen.',
              'Migration solle aus der Literatur verschwinden, um Universalitaet zu retten.',
              'b'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 - Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie koennen jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Leibniz-Zentrum fuer Allgemeine Sprachwissenschaft',
              text: 'Forschungsstelle zur Grammatikalisierung im Sprachwandel. Veroeffentlichung einer Monographie zu Kontaktphoenomenen im Rheinland. Nur fuer Fachpublikum.',
            },
            {
              key: 'B',
              title: 'Deutscher Uebersetzerfonds - Stipendium',
              text: 'Foerderung literarischer Uebersetzungen aus dem Arabischen ins Deutsche. Jury legt Wert auf kulturelle Kontextualisierung und poetische Praezision.',
            },
            {
              key: 'C',
              title: 'UNESCO - Verzeichnis immaterielles Kulturerbe',
              text: 'Nominierungsverfahren fuer lebendige Ueberlieferungen, darunter muendliche Erzaehltraditionen und Rituale. Politische und rechtliche Begleitdokumentation.',
            },
            {
              key: 'D',
              title: 'Institut fuer Deutsche Sprache - Dialektatlas',
              text: 'Crowdsourcing-Projekt zur Erfassung aussterbender Ortsmundarten. Freiwillige tragen Audioaufnahmen bei; keine literarische Uebersetzung.',
            },
            {
              key: 'E',
              title: 'Sommerseminar Philosophie der Sprache',
              text: 'Intensivkurs zu Wittgenstein, Sprechakttheorie und Bedeutungspragmatik. Voraussetzung: abgeschlossenes Philosophiestudium oder gleichwertige Publikationen.',
            },
            {
              key: 'F',
              title: 'Volkschoerschule - Integrationskurs B2',
              text: 'Alltagsorientierter Deutschunterricht mit Fokus auf Arbeitsmarkt und Verwaltung. Keine literarisch-philosophische Spezialisierung.',
            },
          ],
          questions: [
            matchAd('l10', '10  Eine Literaturwissenschaftlerin uebersetzt zeitgenoessische Lyrik aus dem Maghreb und sucht finanzielle Unterstuetzung.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l11', '11  Eine Ethnologin dokumentiert eine muendliche Erzaehltradition fuer ein internationales Schutzverfahren.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l12', '12  Ein Philosoph verfasst eine Habilitation ueber performative Aeusserungsakte und benoetigt vertiefte Fachtexte.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
            matchAd('l13', '13  Ein Sprachwissenschaftler analysiert Kontaktphoenomene zwischen Mundart und Standardsprache in einer Region.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
            matchAd('l14', '14  Ein Verein sammelt Audioaufnahmen bedrohter Ortsdialekte von freiwilligen Sprecherinnen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 - Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Ueberschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Forum: Soll Literatur Dialekt bewusst bewahren oder der Standardsprache weichen?',
          text:
            'Meinung 15 - Prof. Dr. Lehmann, 58, Literaturwissenschaft:\nDialekt ist kein Museum, sondern lebendige Prosodie. Wer ihn nur als Folklore buhnt, entwertet ihn; wer ihn literarisch ernst nimmt, oeffnet Raeume, die Hochdeutsch nicht besitzt. Die Frage ist nicht Ob, sondern Wie.\n\nMeinung 16 - Aylin, 31, Herausgeberin:\nIch verlange keine Verdammung des Dialekts, wohl aber Transparenz: Viele Leserinnen ausserhalb der Region bleiben ausgeschlossen, wenn Autoren sich der Verstaendlichkeit entziehen, um Authentizitaet zu simulieren.\n\nMeinung 17 - Thomas, 44, Autor:\nMeine Heimat klingt anders als mein Verlag es ertraegt. Ich schreibe deshalb zweispurig - im Entwurf im Dialekt, in der Fassung im Hochdeutschen - und verliere dabei, offen gestanden, mehr, als ich gewinnen kann.\n\nMeinung 18 - Dr. Farah Nouri, 39, Kulturpolitik:\nFoerderlogiken, die Dialekt als Identitaetsersatz markieren, uebersehen, dass Bildungschancen oft an Standardsprache gekoppelt sind. Aesthetik darf nicht zur sozialen Schranke werden.',
          ads: [
            { key: 'a', title: 'Dialekt als lebendige, nicht museale Ressource', text: '' },
            { key: 'b', title: 'Standardsprache als verdeckte soziale Schranke', text: '' },
            { key: 'c', title: 'Zweispuriges Schreiben als existentieller Verlust', text: '' },
            { key: 'd', title: 'Exklusion durch simulierte Authentizitaet', text: '' },
          ],
          questions: [
            matchHeadline('l15', '15  Meinung von Prof. Dr. Lehmann, 58', ['a', 'b', 'c', 'd'], 'a'),
            matchHeadline('l16', '16  Meinung von Aylin, 31', ['a', 'b', 'c', 'd'], 'd'),
            matchHeadline('l17', '17  Meinung von Thomas, 44', ['a', 'b', 'c', 'd'], 'c'),
            matchHeadline('l18', '18  Meinung von Dr. Farah Nouri, 39', ['a', 'b', 'c', 'd'], 'b'),
          ],
        },
        {
          teil: 5,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 5 - Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          textTitle: 'Hessisches Kulturfoerderungsgesetz - Auszug zur Sprach- und Kulturvermittlung',
          text:
            'Foerderungswuerdig im Sinne dieses Gesetzes sind Vorhaben, die die lebendige Verwendung regionaler und Minderheitensprachen nachweislich staerken, sofern sie nicht ausschliesslich kommerziellen Zwecken dienen und eine oeffentliche Zugaenglichkeit gewaehrleisten. Als oeffentlich zugaenglich gilt eine Veranstaltung nur dann, wenn sie ohne Mitgliedschaftsbeschraenkung besucht werden kann; rein digitale Formate genuegen nur, wenn barrierefreie Zugangswege dauerhaft dokumentiert sind.\n\nAntraege sind bis zum 15. Januar des laufenden Foerderjahres einzureichen; verspaetete Antraege werden nur beruecksichtigt, wenn der Antragsteller glaubhaft macht, dass die Verzoegerung ausserhalb seines Einflussbereichs lag und das Vorhaben ohne vorzeitige Bewilligung nicht mehr durchfuehrbar waere.\n\nAusnahmen von der Zugaenglichkeitsklausel sind fuer wissenschaftliche Fachveranstaltungen zulaessig, deren Erkenntnisgewinn primaer der Fachcommunity dient, sofern die Ergebnisse innerhalb von 24 Monaten in einer fuer Laien verstaendlichen Form veroeffentlicht werden; andernfalls ist die Foerderung rueckzahlungspflichtig.',
          questions: [
            mc(
              'l19',
              '19  Welches Vorhaben erfuellt die Foerderungsvoraussetzungen am ehesten?',
              'Ein rein kommerzielles Dialektfestival ohne oeffentlichen Zugang.',
              'Ein oeffentlich zugaengliches Projekt zur Staerkung einer Minderheitensprache ohne rein kommerziellen Zweck.',
              'Jede digitale Veranstaltung, unabhaengig von Barrierefreiheit.',
              'b'
            ),
            mc(
              'l20',
              '20  Was impliziert die Regelung zu verspaeteten Antraegen?',
              'Verspaetete Antraege werden grundsaetzlich abgelehnt, ohne Ausnahme.',
              'Sie koennen nur unter engen Voraussetzungen noch beruecksichtigt werden.',
              'Verspaetung ist immer hinnehmbar, wenn das Projekt wissenschaftlich ist.',
              'b'
            ),
            mc(
              'l21',
              '21  Wann ist eine Ausnahme von der Zugaenglichkeitsklausel zulaessig?',
              'Bei jeder Veranstaltung mit Eintritt.',
              'Bei Fachveranstaltungen, sofern Laienverstaendliche Veroeffentlichung innerhalb von 24 Monaten erfolgt.',
              'Wenn die Foerderung bereits ausgezahlt wurde.',
              'b'
            ),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Hoeren Teil 1\nSie hoeren zwei kurze Texte.\nSie hoeren jeden Text zweimal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, Sie erreichen das Sekretariat des Instituts fuer Kulturanthropologie. Ihre Bewerbung fuer das Gastprofessorenprogramm wurde dem Kuratorium vorgelegt. Bitte reichen Sie bis Freitag, 16 Uhr, ein zweiseitiges Konzept zur Vermittlung von Kulturbegriffen in mehrsprachigen Kontexten nach. Ohne dieses Konzept kann die Jury nicht tagen. Rueckfragen bitte ausschliesslich ueber das Bewerbungsportal - nicht per privater Nachricht an einzelne Kuratorinnen.',
              questions: [
                rf('h1', '1  Die Jury kann ohne das Konzept nicht tagen.', 'R'),
                mc('h2', '2  Rueckfragen sollen laut Ansage ...', 'ueber das Bewerbungsportal gestellt werden', 'per privater Nachricht an Kuratorinnen erfolgen', 'muendlich im Sekretariat geklaert werden', 'a'),
              ],
            },
            {
              label: 'Text 2: Kulturmagazin im Radio',
              transcript:
                'Im Feuilleton wird seit Wochen ueber sogenannte reine Hochsprache debattiert. Befuerworter betonen, sie schuetze Bildungsgerechtigkeit; Gegner werfen ihr vor, sie diene als verdecktes Ausschlusskriterium. Was auffaellt: Beide Seiten sprechen selten von Literatur, fast immer von Verwaltung. Die Moderatorin merkt an, die Debatte klinge deshalb nach Symptombehandlung - nicht nach der Frage, wer das Recht habe, Sprache zu normieren.',
              questions: [
                rf('h3', '3  Die Moderatorin kritisiert, dass die Debatte das Normierungsrecht selten thematisiert.', 'R'),
                mc('h4', '4  Was laesst sich ueber den Ton der Moderatorin schliessen?', 'Sie haelt die Debatte fuer grundsaetzlich unnoetig.', 'Sie sieht in der Debatte vor allem oberflaechliche Symptomdiskussion.', 'Sie lehnt Hochsprache vollstaendig ab.', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hoeren Teil 2\nSie hoeren einen Text.\nSie hoeren den Text einmal.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
          context: 'Vortrag einer Sprachphilosophin ueber Bedeutung und Gemeinschaft.',
          transcript:
            'Wittgenstein, so lese ich ihn, warnt nicht vor Sprache an sich, sondern vor der Illusion, Bedeutung sei ein private Besitz. Wer Identitaet ausschliesslich im Wortschatz sucht, uebersieht die Formen des Lebens, in denen Worte erst ihre Funktion erhalten. Das erklaert, warum Uebersetzen mehr ist als Austausch von Lexemen: Es ist der Versuch, eine fremde Lebensform verhandelbar zu machen, ohne sie zu vereinnahmen.\n\nKritisch sehe ich dennoch die Mode, jede kulturelle Differenz als untuebersetzbar zu feiern. Untuebersetzbarkeit kann zur Bequemlichkeit werden - zur Ausrede, nicht zu hoeren. Gerade deshalb brauchen wir Uebersetzerinnen, die praezise sind, nicht poetisch im Sinne des Vernebelns.',
          questions: [
            mc('h5', '5  Was ist laut Vortrag die zentrale Warnung Wittgensteins?', 'Vor Sprache als solcher.', 'Vor der Illusion privater Bedeutung ausserhalb gelebter Formen.', 'Vor jeder Form von Uebersetzung.', 'b'),
            mc('h6', '6  Wie charakterisiert die Sprecherin die Feier der Untuebersetzbarkeit?', 'Als notwendigen Schutz kultureller Autonomie.', 'Als moegliche Bequemlichkeit, die Zuhoeren vermeidet.', 'Als wissenschaftlich bewiesene Tatsache.', 'b'),
            mc('h7', '7  Welche Haltung vertritt die Sprecherin zu Uebersetzerinnen?', 'Sie sollen vor allem poetisch vernebeln.', 'Sie sollen praezise sein und nicht vereinnahmen.', 'Sie sollen kulturelle Differenz absolut machen.', 'b'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hoeren Teil 3\nSie hoeren ein Gespraech.\nSie hoeren das Gespraech einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Literaturkritikerinnen ueber Ansprache und kulturelle Sensibilitaet.',
          transcript:
            'A: Ich finde, manche Verlage ueberkorrigieren Dialektpassagen, um Skandale zu vermeiden.\nB: Verstaendlich - aber riskieren sie nicht, damit genau die Stimme zu glatten, die sie sichtbar machen wollten?\nA: Sichtbar machen und verstaendlich machen sind nicht dasselbe; ich wuerde eher Fussnoten als Glattung waehlen.\nB: Fussnoten koennen aber auch museumhaft wirken, als stuende der Dialekt unter Glas.\nA: Dann bleibt nur ehrliche Edition mit Glossar - teuer, aber redlich.\nB: Redlich, ja; ob der Markt das honorieren wird, wage ich zu bezweifeln.',
          questions: [
            rf('h8', '8  Person A wirft Verlagen vor, Dialekt aus Angst vor Skandalen zu glaetten.', 'R'),
            rf('h9', '9  Person B lehnt jede Form der Verstaendlichmachung grundsaetzlich ab.', 'F'),
            rf('h10', '10  Person A schlaegt Fussnoten einer vollstaendigen Glattung vor.', 'R'),
            rf('h11', '11  Person B ist ueberzeugt, der Markt werde redliche Editionen bevorzugen.', 'F'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hoeren Teil 4\nSie hoeren eine Diskussion.\nSie hoeren die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Podiumsdiskussion: Mehrsprachigkeit in der Schule - Chance oder Belastung?',
          speakers: ['Moderator/in', 'Prof. Dr. Lang', 'Dr. Oezdemir'],
          transcript:
            'Moderator: Soll die Schule mehrere Sprachen gleichberechtigt foerdern, auch wenn das Curriculum enger wird?\nProf. Dr. Lang: Bildungspolitik darf Mehrsprachigkeit nicht nur als Defizit lesen. Wer frueh zwischen Sprachregistern wechseln lernt, gewinnt kognitive Flexibilitaet - vorausgesetzt, Standardsprache wird nicht vernachlaessigt.\nDr. Oezdemir: Ich stimme der Flexibilitaet zu, misstraue jedoch der Romantisierung: Nicht jede Familie kann drei Sprachen stabil pflegen. Ohne strukturelle Unterstuetzung wird Mehrsprachigkeit zur Privilegfrage.\nProf. Dr. Lang: Dann brauchen wir mehr Foerderung, nicht weniger Sprachen.\nDr. Oezdemir: Foerderung ja, aber bitte ohne kulturelle Zuschreibungen, die Kinder als Repraesentanten ihrer Herkunft instrumentalisieren.\nProf. Dr. Lang: Einverstanden - Kinder sind keine Botschafter, sie sind Lernende.',
          questions: [
            matchSpeaker('h12', '12  Mehrsprachigkeit ohne strukturelle Unterstuetzung werde zur Privilegfrage.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h13', '13  Standardsprache duerfe bei Mehrsprachigkeitsfoerderung nicht vernachlaessigt werden.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h14', '14  Kinder sollten nicht als kulturelle Repraesentanten instrumentalisiert werden.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h15', '15  Es werde mehr Foerderung statt weniger Sprachen benoetigt.', ['M', 'F', 'H'], 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '25 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 - Schreiben\nSchreiben Sie einen Brief oder eine E-Mail in informell-gebildetem Register (circa 190 Woerter).\n\nSie haben in einer Literaturzeitschrift einen Essay ueber "Sprachverlust und Heimatgefuehl" gelesen, mit dem Sie teils uneins sind.\n\n- Beziehen Sie sich auf den Essay und nennen Sie ein konkretes Beispiel aus Ihrer Erfahrung\n- Erklaeren Sie Ihre Kritik oder Zustimmung mit Nuancen\n- Schliessen Sie mit einer persoenlichen, aber praezisen Einschaetzung',
          minWords: 190,
          criteria: ['Informell-gebildeter Ton', 'Nuancierte Stellungnahme', 'Konkretes Beispiel'],
          modelAnswer:
            'Liebe Redaktion,\n\neuer Essay "Sprachverlust und Heimatgefuehl" hat mich lange begleitet - nicht weil ich ihm folgen konnte, sondern weil er mir zu elegisch erscheint. Wenn der Autor den Akzent als verlorenes Paradies malt, uebersieht er, dass viele von uns ihn absichtlich ablegen, um nicht staendig erklaert zu werden.\n\nIn meiner Familie klingt das Schwaebische nur noch im Streit authentisch; im Buero wechseln wir zur Verwaltungssprache, ohne deshalb heimatlos zu sein. Heimat, finde ich, liegt nicht im Klang allein, sondern in der Wahl, wann man welche Sprache zulaesst.\n\nGleichwohl stimme ich zu, dass Uniformitaet etwas ausloescht. Nur waere die Konsequenz fuer mich nicht Nostalgie, sondern bewusste Mehrsprachigkeit: Dialekt pflegen, wo er lebt, und ihn nicht als Folklore exportieren.\n\nHerzlich\nMira K.',
          feedback: ['Informell-gebildet', 'Nuancierte Kritik und Zustimmung', 'Circa 190 Woerter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '35 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 - Schreiben\nSchreiben Sie einen argumentierenden Text in akademischem Register (circa 190 Woerter).\n\nIm Seminar wurde zitiert:\n"Die Sprache ist das Haus des Seins." (Martin Heidegger, Der Ursprung des Kunstwerks)\n\nNehmen Sie Stellung: Inwieweit laesst sich Identitaet sprachlich fassen? Begruenden Sie, ziehen Sie ein Gegenargument heran und formulieren Sie eine praezise Schlussfolgerung.',
          minWords: 190,
          criteria: ['Akademische Argumentation', 'Zitatbezug', 'Gegenargument und Schluss'],
          modelAnswer:
            'Heideggers Metapher suggeriert, Identitaet sei in Sprache wohnhaft, nicht neben ihr. Dem ist insofern zuzustimmen, als soziale Anerkennung oft an kommunikative Kompetenz gekoppelt ist: Wer nicht in der dominanten Sprache argumentieren kann, wird leicht unsichtbar.\n\nGegenargument: Identitaet ist nicht nur diskursiv, sondern auch praktisch und koerperlich verankert - etwa in Ritualen, die sich der sprachlichen Fixierung entziehen. Wer Heidegger woertlich liest, riskiert einen Linguistic Turn ohne Leib.\n\nSchlussfolgernd halte ich fest: Sprache ist ein zentrales, nicht das einzige Haus des Seins. Kulturpolitik sollte deshalb Mehrsprachigkeit foerdern, ohne andere Identitaetsformen zu entwerten.',
          feedback: ['Akademisches Register', 'Heidegger-Bezug mit Gegenargument', 'Circa 190 Woerter'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '20 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 - Schreiben\nSchreiben Sie eine E-Mail in formell-institutionellem Register (circa 65 Woerter).\n\nSie vertreten ein Kulturinstitut und muessen eine bereits angekuendigte Lesung verschieben, weil die uebersetzerische Genehmigung noch aussteht.\n\nInformieren Sie das Publikum knapp, nennen Sie den Grund und nennen Sie den neuen Termin (15. November, 19 Uhr).',
          minWords: 65,
          criteria: ['Formell-institutionell', 'Grund und neuer Termin', 'Praezision'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\ndie fuer den 28. Oktober geplante Lesung muss verschoben werden, da die uebersetzerische Genehmigung noch aussteht. Der Ersatztermin ist der 15. November, 19 Uhr, im gleichen Saal. Wir bitten um Verstaendnis.\n\nMit freundlichen Gruessen\nInstitut fuer Gegenwartsliteratur',
          feedback: ['Institutioneller Ton', 'Grund und Termin klar', 'Circa 65 Woerter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. 3-4 Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 - Sprechen\nSie planen mit Ihrem Partner / Ihrer Partnerin eine oeffentliche Podiumsdiskussion zum Thema "Sprache als kulturelles Erbe - Bewahren oder Reformieren?".\nKlaeren Sie Zielgruppe, Format, Einladungen und Umgang mit kontroversen Positionen.',
          points: ['Zielgruppe und Format', 'Einladungen und Perspektiven', 'Kontroversen moderieren', 'Gemeinsamer Ablauf'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Ich wuerde die Diskussion an einer Universitaet ansetzen, aber explizit auch Schulen und Vereine einladen, damit es nicht elitaer wirkt.\nPartner: Einverstanden, allerdings brauchen wir klare Regeln, wenn es um Dialekt versus Hochsprache emotional wird.\nIch: Dann laden wir eine Sprachwissenschaftlerin, eine Autorin und eine Schuelervertreterin ein - moeglichst ohne reine Repraesentantenrollen.\nPartner: Wie vermeiden wir, dass Migrantinnen nur als Beispiel dienen?\nIch: Indem wir nach Argumenten fragen, nicht nach Biografien. Moderation mit festen Redezeiten und Nachfragen zur Sache.\nPartner: Gut, ich uebernehme die Moderation, wenn du die Einladungen koordinierst.',
          feedback: ['Kulturell-philosophisches Thema', 'Nuancierte Planung', 'Mindestens fuenf Wechsel'],
        },
        {
          teil: 2,
          title: 'Ein Thema praesentieren',
          dauer: 'ca. 3-4 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 - Sprechen\nPraesentieren Sie akademisch strukturiert das Thema "Mehrsprachigkeit und demokratische Teilhabe".\n\n1. Problemstellung\n2. Theoretischer Rahmen\n3. Fallbeispiel\n4. Politische Konsequenzen\n5. Schlussfolgerung',
          points: ['Problemstellung', 'Theoretischer Rahmen', 'Fallbeispiel', 'Politische Konsequenzen', 'Schluss'],
          minWords: 130,
          modelAnswer:
            'Ausgangspunkt ist die Spannung zwischen formeller Gleichheit und linguistischer Ungleichheit: Wer nur in einer Minderheitensprache politisch argumentieren kann, partizipiert faktisch weniger. Theoretisch laesst sich dies mit Bourdieus Konzept des kulturellen Kapitals fassen, ergaenzt um aktuelle Debatten zur Sprachgerechtigkeit. Als Fallbeispiel dient ein Kommunalparlament, in dem Dolmetschen zwar angeboten, aber nicht verbindlich finanziert wird. Politische Konsequenz waere eine Rechtsverbindlichkeit linguistischer Zugaenglichkeit, ohne Minderheitensprachen zu musealisieren. Abschliessend: Demokratie braucht nicht Einsprachigkeit, sondern institutionell abgesicherte Mehrsprachigkeit.',
          feedback: ['Akademische Fuenfteilung', 'Fachvokabular C2', 'Circa 130 Woerter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 - Sprechen\nDiskutieren Sie mit Ihrem Partner / Ihrer Partnerin die Frage, ob Literatur moralisch verpflichtet sein kann, Minderheiten "authentisch" darzustellen.\nGeben Sie differenziertes Feedback, formulieren Sie eine praezise Gegenposition und verteidigen Sie Ihre Haltung.',
          points: ['Differenziertes Feedback', 'Praezise Gegenposition', 'Verteidigung der Haltung', 'Respektvoller Ton'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Ihre Analyse der Sprachgerechtigkeit war scharf, wenngleich mir die aesthetische Dimension zu kurz kam.\nPartner: Meinen Sie, Autoren duerften sich jeder Verantwortung entziehen?\nIch: Nicht entziehen, aber Literatur ist keine Ethikkommission. Authentizitaetszwang produziert Klischees.\nPartner: Ich wuerde entgegnen, dass Schweigen strukturelle Ausgrenzung reproduziert.\nIch: Stimmt fuer den Kanon, doch Zwang zur Repraesentation macht Minderheiten zu Dienstleistern der Mehrheit.\nPartner: Dann brauchen wir mehr Redaktionsvielfalt, nicht weniger Anspruch.\nIch: Genau dort waere ich bereit, meine Position zu modifizieren.',
          feedback: ['Philosophisch-kulturelle Debatte', 'Gegenposition und Modifikation', 'C2-Argumentation'],
        },
      ],
    };
  }

  function buildLesen(level, cfg) {
    const parts = [];

    parts.push({
      teil: 1,
      arbeitszeit: '10 Minuten',
      instruction:
        'Teil 1\nLesen Sie den Text und die Aufgaben 1 bis 4 dazu.\nWaehlen Sie: Sind die Aussagen Richtig oder Falsch?',
      textTitle: 'SusannesAlltagsBlog.at - Mein Alltag, meine Gedanken, mein Leben',
      text:
        'Donnerstag, den 23. Juni\n\nWas mir heute passiert ist, das glaubt mir keiner: Als ich zu Mittag in der Kueche stand, laeutete mein Handy. Eine Frauenstimme erklaerte mir, dass meine Brieftasche in der Bankfiliale abgegeben worden war. Mir wurde heiss - mir war noch gar nicht aufgefallen, dass sie fehlte.\n\nIch machte mich auf den Weg zur Bank. Dort teilte mir die Mitarbeiterin mit, dass ein junger Mann die Brieftasche auf dem Parkplatz vor dem Supermarkt gefunden hatte. Zum Glueck war alles noch da!\n\nNun weiss ich leider nicht, wie ich dem ehrlichen Finder danken kann. Vielleicht liest er ja diesen Blogeintrag: Vielen, vielen Dank, lieber Finder!\n\nBis bald, eure Susanne',
      questions: [
        rf('l1', '1  Erst durch den Anruf bemerkte Susanne das Fehlen ihrer Brieftasche.', 'R'),
        rf('l2', '2  Susanne glaubte, die Brieftasche beim Bezahlen vergessen zu haben.', 'F'),
        rf('l3', '3  Der Finder brachte die Brieftasche ins Fundbuero.', 'F'),
        rf('l4', '4  In Susannes Brieftasche fehlte nichts.', 'R'),
      ],
    });

    if (cfg.lesenParts < 2) return parts;

    parts.push({
      teil: 2,
      arbeitszeit: '20 Minuten',
      instruction:
        'Teil 2\nLesen Sie den Text aus der Presse und die Aufgaben 5 bis 7 dazu.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
      textTitle: 'aus einer deutschen Zeitung: Ein Dorf fuer gruene Energie',
      text:
        'Das Dorf Feldheim in Brandenburg macht sich unabhaengig von Oel und Kohle. Seit Kurzem deckt das Dorf seinen kompletten Strombedarf durch moderne Energien. Die Bio-Gasanlage erzeugt jaehrlich doppelt so viel Strom wie die Gemeinde verbraucht. Entstanden ist die Idee an der Universitaet Goettingen. Ziel der Wissenschaftler war es zu zeigen, dass ein Dorf komplett mit erneuerbaren Energien versorgt werden kann. Passt das Konzept auch fuer andere Doerfer? Im Prinzip schon, meint Eckhard Meier - man benoetigt vor allem aktive und begeisterte Einwohner!',
      questions: [
        mc('l5', '5  In diesem Text geht es um ...', 'eine neue Technologie', 'umweltfreundliche Stromproduktion', 'einen Studiengang', 'b'),
        mc('l6', '6  Die Wissenschaftler wollten zeigen, dass ...', 'ein ganzes Dorf von modernen Energien leben kann', 'eine Anlage mehr Strom produziert als noetig', 'man Strom sparen kann', 'a'),
        mc('l7', '7  Damit die Idee in anderen Doerfern funktioniert, ...', 'benoetigt man viel Geld', 'braucht man genug Platz', 'muss die Bevoelkerung dafuer sein', 'c'),
      ],
    });

    if (cfg.lesenParts < 3) return parts;

    parts.push({
      teil: 3,
      arbeitszeit: '10 Minuten',
      instruction:
        'Teil 3\nLesen Sie die Situationen 8 bis 10 und die Anzeigen A bis D.\nWelche Anzeige passt? Waehlen Sie a, b, c, d oder 0 (keine passende Anzeige).',
      ads: [
        { key: 'a', title: 'Deutsch im Internet', text: 'Lernen Sie Deutsch online. 10 Kurslektionen, Grammatik, Uebungen - gratis auf www.sprachenlernen.de' },
        { key: 'b', title: 'Deutsch erLesen', text: 'Magazin mit Originalartikeln aus der deutschen Presse. Monatlich. Probeexemplar: info@deutsch-erlesen.de' },
        { key: 'c', title: 'Job und Sprache-Net', text: 'Jobs fuer Deutschlernende in DE, AT, CH. Hotel und Restaurant. Juni bis August. www.jobundsprache-net.com' },
        { key: 'd', title: 'Deutsch in der Schweiz', text: 'Intensivkurse, Schreibkurse, Sommerkurse. Nur Tageskurse! www.deutschinderschweiz.ch' },
      ],
      questions: [
        match('l8', '8  Maria moechte am Computer Deutsch lernen.', ['a', 'b', 'c', 'd', '0'], 'a'),
        match('l9', '9  Leon moechte im Sommer im Tourismus arbeiten.', ['a', 'b', 'c', 'd', '0'], 'c'),
        match('l10', '10  Mirjeta moechte sich regelmaessig ueber Nachrichten aus Deutschland informieren.', ['a', 'b', 'c', 'd', '0'], 'b'),
      ],
    });

    if (cfg.lesenParts < 4) return parts;

    parts.push({
      teil: 4,
      arbeitszeit: '15 Minuten',
      instruction:
        'Teil 4\nLesen Sie die Meinungen 11 bis 13.\nIst die Person fuer ein Verbot von Gewaltspielen? Waehlen Sie Ja oder Nein.',
      textTitle: 'Leserbriefe: Verbot von Killerspielen?',
      text:
        'Niko, 52: Durch solche Spiele kann viel Unglueck entstehen, die muessen weg!\n\nStefan, 19: Warum verbieten, wenn es sowieso alle spielen und ein Verbot das Spiel interessanter macht?\n\nKathleen, 49: Die Einstellung dahinter ist Ausdruck einer unglaublichen Gleichgueltigkeit. Das muss man stoppen.',
      questions: [
        yn('l11', '11  Stefan', 'N'),
        yn('l12', '12  Niko', 'J'),
        yn('l13', '13  Kathleen', 'J'),
      ],
    });

    if (cfg.lesenParts < 5) return parts;

    parts.push({
      teil: 5,
      arbeitszeit: '10 Minuten',
      instruction:
        'Teil 5\nLesen Sie die Aufgaben 14 bis 16 und den Text dazu.\nWaehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
      textTitle: 'HAUSORDNUNG - Berufsbildungszentrum Dresden',
      text:
        'Parkplaetze: Auf dem Schulareal stehen keine Gratis-Autoparkplaetze zur Verfuegung. Fahrraeder muessen in den dafuer vorgesehenen Fahrradkeller gebracht und abgeschlossen werden.\n\nOrdnung: In saemtlichen Raeumen ist auf Ordnung und Sauberkeit zu achten. Ausserhalb der Unterrichtszeiten duerfen sich Lernende nicht in den Klassenraeumen aufhalten.\n\nAlkohol: Der Konsum von Alkohol ist auf dem gesamten Schulareal verboten. In Ausnahmefaellen kann die Schulleitung den Konsum erlauben.',
      questions: [
        mc('l14', '14  Schueler ...', 'duerfen keine Fahrraeder mitbringen', 'muessen Fahrraeder in einen speziellen Raum stellen', 'duerfen Fahrraeder auf den Hof stellen', 'b'),
        mc('l15', '15  Fuer die Klassenraeume gilt:', 'Schueler duerfen keine Poster aufhaengen', 'Schueler muessen dort selber aufraeumen', 'Schueler koennen nach dem Unterricht dort lernen', 'a'),
        mc('l16', '16  Das Trinken von Alkohol ...', 'kann von der Schulleitung genehmigt werden', 'muss der Lehrperson gemeldet werden', 'ist ohne Ausnahme verboten', 'a'),
      ],
    });

    return parts;
  }

  function buildHoren(level, cfg) {
    const parts = [];

    parts.push({
      teil: 1,
      instruction:
        'Hoeren Teil 1\nSie hoeren zwei kurze Texte. Sie hoeren jeden Text zweimal. Waehlen Sie bei jeder Aufgabe die richtige Loesung.',
      segments: [
        {
          label: 'Text 1: Anrufbeantworter',
          transcript:
            'Hallo Frau Stein, hier ist die Praxis Dr. Becker. Es geht um Ihre Grippe-Impfung. Koennten Sie vielleicht am Freitag um 14 Uhr kommen? Geben Sie mir bitte heute noch Bescheid. Ach, und Ihre Chipkarte ist bei uns - Sie haben sie letztes Mal vergessen.',
          questions: [
            rf('h1', '1  Der Termin von Frau Stein wird verschoben.', 'R'),
            mc('h2', '2  Frau Stein soll ...', 'die Chipkarte mitbringen', 'zehn Euro bezahlen', 'zurueckrufen', 'a'),
          ],
        },
        {
          label: 'Text 2: Durchsage im Radio',
          transcript:
            'Achtung Autofahrer. Auf der Autobahn A8 Richtung Muenchen zwischen Eschenried und Dachau hat sich ein Unfall ereignet. Der rechte Fahrstreifen ist blockiert. Im Stadtgebiet Muenchen kommt es wegen starken Berufsverkehrs zu Behinderungen.',
          questions: [
            rf('h3', '3  Auf der Autobahn gibt es Stau wegen eines Unfalls.', 'R'),
            mc('h4', '4  Im Stadtgebiet Muenchen gibt es Stau wegen ...', 'einer Baustelle', 'des Berufsverkehrs', 'eines Unfalls', 'b'),
          ],
        },
      ],
    });

    if (cfg.horenParts < 2) return parts;

    parts.push({
      teil: 2,
      plays: 1,
      instruction:
        'Hoeren Teil 2\nSie hoeren einen Text. Sie hoeren den Text einmal. Waehlen Sie bei jeder Aufgabe die richtige Loesung a, b oder c.',
      context: 'Sie nehmen an einer Fuehrung durch das Muenchner Stadtmuseum teil.',
      transcript:
        'Ich freue mich, Sie heute zu dieser Fuehrung begruessen zu duerfen. Wir haben Glueck - wegen des schoenen Wetters sind die meisten Leute im Biergarten, und wir haben das Museum fast fuer uns. Unser Rundgang dauert ungefaehr zweieinhalb Stunden. Wir besuchen zuerst die Hauptausstellung. Um 16 Uhr treffen wir uns wieder im Eingangsbereich. Viele verbinden mit Muenchen das Oktoberfest, aber Muenchen ist noch viel mehr. Im Anschluss empfiehlt sich ein Besuch in einem der schoenen Biergaerten.',
      questions: [
        mc('h5', '5  Das Museum ist ...', 'sehr voll', 'teilweise geschlossen', 'ziemlich leer', 'c'),
        mc('h6', '6  Was zeigt der Museumsfuehrer zuerst?', 'alle Ausstellungen', 'die Hauptausstellung', 'nur die Sonderausstellung', 'b'),
        mc('h7', '7  Wo ist der Treffpunkt am Nachmittag?', 'am Eingang', 'an der Garderobe', 'im Cafe', 'a'),
      ],
    });

    if (cfg.horenParts < 3) return parts;

    parts.push({
      teil: 3,
      plays: 1,
      instruction:
        'Hoeren Teil 3\nSie hoeren ein Gespraech. Sie hoeren das Gespraech einmal. Sind die Aussagen Richtig oder Falsch?',
      context: 'An einer Bushaltestelle hoeren Sie ein Gespraech ueber ein Fest.',
      transcript:
        'Florian: Es war ein Geburtstagsfest. Annas Mann ist Diplomat und die beiden haben ein grosses Fest gemacht.\nNadia: Das Haus war wunderschoen - eine grosse Terrasse. Meine Mutter musste mich allen vorstellen, etwas peinlich.\nFlorian: Das Essen war vom Feinsten. Das Beste war die Musik - der Klavierspieler war genial.\nNadia: Er fragte mich, ob ich auch Klavier spiele. Zum Glueck kam er aus seiner Pause zurueck, bevor ich Jazz spielen musste.',
      questions: [
        rf('h8', '8  Bei dem Fest wurde der Geburtstag von Annas Mann gefeiert.', 'R'),
        rf('h9', '9  Nadia arbeitet beim Fernsehen.', 'F'),
        rf('h10', '10  Nadia hat zusammen mit dem Musiker gespielt.', 'F'),
        rf('h11', '11  Das Fest dauerte bis nach Mitternacht.', 'R'),
      ],
    });

    if (cfg.horenParts < 4) return parts;

    parts.push({
      teil: 4,
      plays: 2,
      instruction:
        'Hoeren Teil 4\nSie hoeren eine Diskussion. Sie hoeren die Diskussion zweimal. Ordnen Sie die Aussagen zu: Wer sagt was?',
      context: 'Radiosendung "Diskussion am Abend": Sollen kleine Kinder in die Kinderkrippe gehen?',
      speakers: ['Moderator', 'Frau Schneider', 'Herr Bader'],
      transcript:
        'Moderator: Sollten Kinder in die Kinderkrippe gehen oder nicht?\nFrau Schneider: Die ersten drei Jahre sind fuer ein Kind von grosser Bedeutung. Kinder brauchen eine feste Bezugsperson.\nHerr Bader: Unsere Kinder gehen gern in die Krippe. Meine Frau und ich koennen nicht drei Jahre aus dem Beruf aussteigen.\nFrau Schneider: In manchen Kindertagesstaetten fehlen finanzielle Mittel.\nHerr Bader: Man kann Kinder haben und auch arbeiten.',
      questions: [
        match('h12', '12  Die ersten drei Jahre sind fuer kleine Kinder sehr wichtig.', ['Moderator', 'Frau Schneider', 'Herr Bader'], 'b'),
        match('h13', '13  Es ist moeglich, Kinder zu haben und auch zu arbeiten.', ['Moderator', 'Frau Schneider', 'Herr Bader'], 'c'),
        match('h14', '14  In einigen Krippen fehlt Geld.', ['Moderator', 'Frau Schneider', 'Herr Bader'], 'b'),
      ],
    });

    return parts;
  }

  function buildSchreiben(level, cfg) {
    const parts = [];
    const criteria = ['Inhalt (Aufgabenerfuellung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'];

    parts.push({
      aufgabe: 1,
      arbeitszeit: '20 Minuten',
      fieldId: 'write1',
      task:
        'Aufgabe 1\nSchreiben Sie eine E-Mail (circa ' +
        cfg.w1 +
        ' Woerter).\nSchreiben Sie etwas zu allen drei Punkten.\n\nSie haben vor einer Woche Ihren Geburtstag gefeiert. Ein Freund / Eine Freundin konnte nicht kommen, weil er/sie krank war.\n\n- Beschreiben Sie: Wie war die Feier?\n- Begruenden Sie: Welches Geschenk finden Sie besonders toll und warum?\n- Machen Sie einen Vorschlag fuer ein Treffen.',
      minWords: cfg.w1,
      criteria,
      modelAnswer:
        'Liebe Anna,\n\nwie geht es dir? Bist du wieder gesund? Ohne dich war meine Feier nicht so lustig. Wir feierten zu Hause mit Freunden. Besonders toll fand ich ein Lied, das ein Freund fuer mich geschrieben hat.\n\nMoechtest du am Wochenende mit mir ins Kino gehen?\n\nViele Gruesse\nTom',
      feedback: ['Anrede und Schlussformel', 'Alle drei Inhaltspunkte', 'Circa ' + cfg.w1 + ' Woerter'],
    });

    if (cfg.schreibenTasks < 2) return parts;

    parts.push({
      aufgabe: 2,
      arbeitszeit: '25 Minuten',
      fieldId: 'write2',
      task:
        'Aufgabe 2\nSchreiben Sie Ihre Meinung zum Thema (circa ' +
        cfg.w2 +
        ' Woerter).\n\nThema: Persoenliche Kontakte und Internet\n\nIm Online-Gaestebuch steht:\n"Persoenliche Treffen werden seltener. Das Internet kann persoenliche Treffen nicht ersetzen."\n\nSchreiben Sie, ob Sie dieser Meinung zustimmen oder nicht. Begruenden Sie Ihre Meinung.',
      minWords: cfg.w2,
      criteria,
      modelAnswer:
        'Ich finde es schade, dass persoenliche Treffen seltener werden. Freunde wohnen oft weit weg, und das Internet hilft dann. Aber echte Treffen kann man online nicht ersetzen. Deshalb sollte man sich trotzdem regelmaessig persoenlich treffen.',
      feedback: ['Klare Meinung', 'Mindestens zwei Argumente', 'Bezug zum Zitat'],
    });

    if (cfg.schreibenTasks < 3) return parts;

    parts.push({
      aufgabe: 3,
      arbeitszeit: '15 Minuten',
      fieldId: 'write3',
      task:
        'Aufgabe 3\nSchreiben Sie eine E-Mail (circa ' +
        cfg.w3 +
        ' Woerter).\n\nIhre Kursleiterin, Frau Mueller, hat Sie zu einem Gespraech eingeladen. Sie koennen nicht kommen.\n\nEntschuldigen Sie sich hoeflich und berichten Sie, warum Sie nicht kommen koennen. Vergessen Sie nicht Anrede und Schluss.',
      minWords: cfg.w3,
      criteria,
      modelAnswer:
        'Liebe Frau Mueller,\n\nes tut mir leid, dass ich nicht zum Gespraech kommen kann. Ich muss meine Mutter im Krankenhaus besuchen.\n\nMit freundlichen Gruessen\nJennifer',
      feedback: ['Hoefliche Entschuldigung', 'Grund nennen', 'Kurze Form ca. ' + cfg.w3 + ' Woerter'],
    });

    return parts;
  }

  function buildSprechen(level, cfg) {
    const parts = [];

    parts.push({
      teil: 1,
      title: 'Gemeinsam etwas planen',
      dauer: 'circa 3 Minuten',
      fieldId: 'speak1',
      situation:
        'Teil 1\nEin Teilnehmer aus dem Deutschkurs hatte einen Unfall und liegt im Krankenhaus. Sie moechten ihn besuchen und ein Geschenk mitbringen. Ueberlegen Sie, wie Sie helfen koennen.',
      points: ['Wann besuchen? (Tag, Uhrzeit?)', 'Wie hinkommen?', 'Was mitnehmen?', 'Wie kann man helfen?'],
      minExchanges: level === 'A1' ? 3 : 4,
      modelAnswer:
        'Ich: Wann sollen wir ins Krankenhaus fahren?\nPartner: Am Samstag um 15 Uhr?\nIch: Gut. Wir nehmen Blumen und eine Karte mit.\nPartner: Und nach der Entlassung koennen wir einkaufen helfen.',
      feedback: ['Vorschlaege machen', 'Auf Vorschlaege reagieren', 'Gemeinsam entscheiden'],
    });

    if (cfg.sprechenTasks < 2) return parts;

    parts.push({
      teil: 2,
      title: 'Ein Thema praesentieren',
      dauer: 'circa 3 Minuten',
      fieldId: 'speak2',
      situation:
        'Teil 2\nPraesentieren Sie ein Thema mit fuenf Folien (Notizen). Thema: Reisen in Ihrem Heimatland.\n\nFolie 1: Einleitung\nFolie 2: Eigene Erfahrung\nFolie 3: Situation im Heimatland\nFolie 4: Vor- und Nachteile + Meinung\nFolie 5: Schluss',
      points: ['Einleitung und Struktur', 'Eigene Erfahrung', 'Vor- und Nachteile', 'Schluss mit Dank'],
      minExchanges: 0,
      minWords: 80,
      modelAnswer:
        'Heute moechte ich ueber Reisen in meinem Heimatland sprechen. Letztes Jahr bin ich an die Kueste gefahren. In meinem Land reisen viele Menschen mit dem Zug. Das ist guenstig, aber manchmal langsam. Ich finde Reisen wichtig, weil man neue Kulturen kennenlernt. Vielen Dank fuer Ihre Aufmerksamkeit.',
      feedback: ['Fuenf Teile der Praesentation', 'Eigene Meinung', 'Klare Einleitung und Schluss'],
    });

    if (cfg.sprechenTasks < 3) return parts;

    parts.push({
      teil: 3,
      title: 'Ueber ein Thema sprechen',
      dauer: 'circa 2 Minuten',
      fieldId: 'speak3',
      situation:
        'Teil 3\nGeben Sie Ihrem Partner / Ihrer Partnerin Rueckmeldung zur Praesentation. Stellen Sie eine Frage und reagieren Sie auf eine Frage.',
      points: ['Rueckmeldung geben', 'Eine Frage stellen', 'Frage beantworten'],
      minExchanges: 3,
      modelAnswer:
        'Ich: Deine Praesentation war sehr interessant. Mir hat besonders der Teil ueber die Zuege gefallen.\nPartner: Danke!\nIch: Wo reist du am liebsten?\nPartner: Am liebsten in die Berge.',
      feedback: ['Freundliche Rueckmeldung', 'Mindestens eine Frage', 'Antwort geben'],
    });

    return parts;
  }

  function get(level) {
    if (!CERT[level]) return null;
    return JSON.parse(JSON.stringify(build(level)));
  }

  function has(level) {
    return Boolean(CERT[level]);
  }

  return { get, has };
})();
