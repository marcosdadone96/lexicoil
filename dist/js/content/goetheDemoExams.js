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
        horen: { title: 'Hören', time: level === 'A1' ? '25 Minuten' : '40 Minuten' },
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
        horen: { title: 'Hören', time: 'ca. 20 Minuten' },
        schreiben: { title: 'Schreiben', time: '20 Minuten' },
        sprechen: { title: 'Sprechen', time: 'ca. 15 Minuten' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '5 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie die Texte –.\nZu jedem Text gibt es eine Aufgabe.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
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
              signText: 'Bitte leise! Das Baby schläft.',
              question: 'Was bedeutet das?',
              options: ['a) Laut sprechen', 'b) Leise sein', 'c) Musik hören'],
              correct: 'b',
            },
            {
              id: 'l3',
              signText: 'SMS von Mama: Abendessen ist um 19 Uhr. Bitte pünktlich!',
              question: 'Was bedeutet das?',
              options: ['a) Das Essen ist um 19 Uhr', 'b) Mama kommt später', 'c) Es gibt kein Abendessen'],
              correct: 'a',
            },
            {
              id: 'l4',
              signText: 'Familienfest am Sonntag — alle willkommen!',
              question: 'Was bedeutet das?',
              options: ['a) Nur für Kinder', 'b) Fest für die Familie', 'c) Das Geschäft ist zu'],
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
            'Hallo liebe Freunde,\n\nich heiße Mehmet und wohne in Köln. Ich lebe mit meiner Frau Ayse und unseren zwei Kindern in einer kleinen Wohnung. Meine Tochter Elif ist sechs Jahre alt. Mein Sohn Can ist neun. Jeden Morgen bringe ich die Kinder um acht Uhr in die Schule. Ayse arbeitet in einem Supermarkt.\n\nAm Dienstag geht meine Mutter zum Arzt — ich fahre sie dorthin. Am Samstag kochen wir zusammen und besuchen oft meinen Bruder in Düsseldorf.\n\nViele Grüße\nMehmet',
          questions: [
            rf('l6', '6  Mehmet wohnt in Köln.', 'R'),
            rf('l7', '7  Mehmet hat drei Kinder.', 'F'),
            rf('l8', '8  Elif ist neun Jahre alt.', 'F'),
            rf('l9', '9  Am Dienstag fährt Mehmet seine Mutter zum Arzt.', 'R'),
            rf('l10', '10  Am Samstag kochen sie oft zusammen.', 'R'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Hören Teil 1\nSie hören fünf kurze Texte.\nSie hören jeden Text zweimal.\nZu jedem Text gibt es eine Aufgabe.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          segments: [
            {
              id: 'h1',
              label: 'Text 1 — Anrufbeantworter',
              transcript:
                'Hallo, hier spricht Frau Weber vom Kindergarten Sonnenschein. Morgen findet unser Familientag statt. Bitte bringen Sie ein kleines Essen mit. Der Tag beginnt um zehn Uhr. Bei Fragen rufen Sie uns an. Auf Wiederhören.',
              question: '1  Worum geht es?',
              options: ['a) Familientag im Kindergarten', 'b) Die Schule ist geschlossen', 'c) Ein Arzttermin'],
              correct: 'a',
            },
            {
              id: 'h2',
              label: 'Text 2 — Durchsage',
              transcript:
                'Achtung, liebe Kunden: Heute haben wir frisches Brot und Kuchen für die ganze Familie. Alles zum Sonderpreis bis sechzehn Uhr. Wir freün uns auf Ihren Besuch in der Bäckerei Schmidt am Marktplatz.',
              question: '2  Was kann man dort kaufen?',
              options: ['a) Brot und Kuchen', 'b) Nur Getränke', 'c) Möbel'],
              correct: 'a',
            },
            {
              id: 'h3',
              label: 'Text 3 — Nachricht',
              transcript:
                'Papa, ich bin in der Bibliothek. Ich lerne für die Prüfung. Ich komme erst um sieben Uhr nach Hause. Kannst du heute das Abendessen machen? Danke, deine Tochter Sarah.',
              question: '3  Was bittet Sarah?',
              options: ['a) Der Vater soll kochen', 'b) Der Vater soll lernen', 'c) Sarah kommt um vier Uhr'],
              correct: 'a',
            },
            {
              id: 'h4',
              label: 'Text 4 — Anrufbeantworter',
              transcript:
                'Willkommen bei Hausarzt Dr. Klein. Unsere Sprechzeiten sind montags bis freitags von acht bis zwölf Uhr. Termine nur telefonisch. Bitte rufen Sie uns an. Vielen Dank.',
              question: '4  Wie bekommt man einen Termin?',
              options: ['a) Telefonisch', 'b) Per E-Mail', 'c) Ohne Termin'],
              correct: 'a',
            },
            {
              id: 'h5',
              label: 'Text 5 — Ankündigung',
              transcript:
                'Guten Morgen! Heute ist in unserer Straße Fest. Es gibt Musik und Essen für groß und Klein. Das Fest ist von vierzehn bis zwanzig Uhr im Park. Kommen Sie mit Ihrer Familie!',
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
            'Hören Teil 2\nSie hören ein Gespräch.\nSie hören das Gespräch zweimal.\nZu dem Gespräch gibt es fünf Aufgaben.\nEntscheiden Sie: Ist jede Aussage richtig oder falsch?',
          context: 'Zwei Freundinnen sprechen über Alltag und Familie.',
          transcript:
            'A: Guten Tag! Wie war dein Wochenende mit der Familie?\nB: Sehr schön! Am Samstag haben wir meine Eltern besucht. Sie wohnen in Stuttgart.\nA: Und am Sonntag?\nB: Am Sonntag waren wir zu Hause. Mein Mann hat gekocht und die Kinder haben ferngesehen.\nA: Hast du Geschwister?\nB: Ja, ich habe eine Schwester. Sie studiert in Berlin. Wir telefonieren jede Woche.\nA: Das ist nett!',
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
            'Aufgabe 1 — Schreiben\nFüllen Sie das Formular aus.\n\nSie möchten eine Familienkarte im Sportverein beantragen.\nLesen Sie zuerst den Text. Dann schreiben Sie die Informationen in das Formular.\n\n---\nMein Name ist Elena Popescu. Ich bin am 3. November 1988 geboren. Ich komme aus Rumänien. Meine E-Mail-Adresse ist elena.popescu@web.de. Meine Telefonnummer ist 0176 4455667.\n---',
          formFields: ['Vorname', 'Nachname', 'Geburtsdatum', 'Nationalität', 'E-Mail', 'Telefon'],
          minWords: 0,
          criteria: ['Vollständigkeit', 'Inhaltliche Korrektheit', 'Lesbarkeit'],
          modelAnswer:
            'Vorname: Elena\nNachname: Popescu\nGeburtsdatum: 03.11.1988\nNationalität: Rumänien\nE-Mail: elena.popescu@web.de\nTelefon: 0176 4455667',
          feedback: ['Alle sechs Felder ausgefüllt', 'Daten aus dem Text korrekt übernommen', 'Leserliche Schrift'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '10 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie eine kurze Nachricht (circa 30 Wörter).\n\nIhre Schwester lädt Sie zum Familienessen ein.\nSchreiben Sie an Ihre Schwester:\n- Bedanken Sie sich für die Einladung\n- Schreiben Sie, was Sie mitbringen möchten\n- Schreiben Sie, wann Sie kommen',
          minWords: 30,
          criteria: ['Inhalt (alle 3 Punkte)', 'Verständlichkeit', 'Einfache Korrektheit'],
          modelAnswer:
            'Liebe Schwester,\n\nvielen Dank für die Einladung! Ich komme gern. Ich bringe einen Salat mit. Ich komme um 18 Uhr.\n\nBis bald,\nTom',
          feedback: ['Alle drei Punkte erwähnt', 'Verständliche Nachricht', 'Anrede und Schluss vorhanden'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Sich vorstellen',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nDer Prüfer / die Prüferin stellt Ihnen Fragen.\nAntworten Sie in ganzen Sätzen.',
          prompts: [
            'Wie heißen Sie?',
            'Woher kommen Sie?',
            'Was machen Sie? (Beruf oder Studium)',
            'Welche Sprachen sprechen Sie?',
            'Was machen Sie gern in der Freizeit?',
          ],
          modelAnswer:
            'Ich heiße Ana Rodriguez. Ich komme aus Spanien. Ich arbeite in einer Bäckerei. Ich spreche Spanisch und ein bisschen Deutsch. In der Freizeit koche ich gern mit meiner Familie.',
          feedback: ['Fünf Fragen beantwortet', 'Ganze Sätze', 'Einfache, verständliche Sprache'],
        },
        {
          teil: 2,
          title: 'Fragen und Antworten',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nSie und Ihr Partner / Ihre Partnerin haben Karten mit Dingen und Preisen.\nFragen Sie nach den Dingen auf der Karte Ihres Partners / Ihrer Partnerin.\nAntworten Sie auf Fragen zu Ihrer Karte.\n\nIhre Karte:\n- Buch: 8 Euro\n- Apfel: 1 Euro\n- T-Shirt: 15 Euro\n\nKarte Ihres Partners / Ihrer Partners:\n- Milch: 2 Euro\n- Kuchen: 4 Euro\n- Stift: 50 Cent',
          cardText: 'Buch (8 Euro), Apfel (1 Euro), T-Shirt (15 Euro) — Partner: Milch (2 Euro), Kuchen (4 Euro), Stift (50 Cent)',
          points: ['Nach Preis fragen', 'Antwort geben', 'Nach einem anderen Ding fragen', 'Höflich antworten'],
          minExchanges: 3,
          modelAnswer:
            'Partner: Was kostet dein Buch?\nIch: Das Buch kostet acht Euro.\nPartner: Und der Apfel?\nIch: Der Apfel kostet ein Euro.\nIch: Was kostet dein Kuchen?\nPartner: Der Kuchen kostet vier Euro.\nIch: Das ist günstig!',
          feedback: ['Mindestens drei Fragen und Antworten', 'Preise genannt', 'Einfache Sätze'],
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
        horen: { title: 'Hören', time: 'ca. 30 Minuten' },
        schreiben: { title: 'Schreiben', time: '30 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie den Text und die Aufgaben 1 bis 5.\nWählen Sie: Richtig oder Falsch.',
          textTitle: 'Lokale Nachrichten: Stadtbummel und Reisen in Hannover',
          text:
            'Seit dem 1. Mai gibt es in der Innenstadt von Hannover mehr Freizeitangebote. Die Stadtverwaltung berichtet, dass letztes Jahr viele Besucher gekommen sind, weil die Geschäfte auch sonntags geöffnet waren. Ab jetzt können Touristen an Wochenenden an einer kostenlosen Stadtführung teilnehmen. Die Führung beginnt um 11 Uhr am Hauptbahnhof.\n\nAußerdem gibt es einen neuen Reisebüro-Stand im Einkaufszentrum. Dort bekommt man günstige Angebote für Städtereisen nach Berlin und Hamburg. Man muss nicht lange warten, weil man online vorbestellen kann. Viele Familien nutzen das Angebot schon, obwohl es erst seit kurzem existiert.',
          questions: [
            rf('l1', '1  Seit Mai gibt es neue Freizeitangebote in Hannover.', 'R'),
            rf('l2', '2  Letztes Jahr waren die Geschäfte nie sonntags geöffnet.', 'F'),
            rf('l3', '3  Die Stadtführung kostet fünfzehn Euro.', 'F'),
            rf('l4', '4  Die Führung startet am Hauptbahnhof.', 'R'),
            rf('l5', '5  Im Reisebüro kann man nur nach München reisen.', 'F'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text und die Aufgaben 6 bis 10.\nWählen Sie: Richtig oder Falsch.',
          textTitle: 'E-Mail von Sabine',
          text:
            'Lieber Thomas,\n\ndanke für deine E-Mail! Ich habe letztes Wochenende mit meiner Schwester in München eingekauft. Wir waren im Olympia-Einkaufszentrum, weil dort viele Geschäfte sind. Ich habe mir eine neue Jacke gekauft. Sie hat 89 Euro gekostet, aber sie war im Sale.\n\nAm Samstagabend sind wir noch ins Kino gegangen. Der Film hat uns sehr gefallen. Am Sonntag bin ich mit dem Zug zurück nach Nürnberg gefahren. Du musst unbedingt mitkommen, wenn ich das nächste Mal fahre!\n\nViele Grüße\nSabine',
          questions: [
            rf('l6', '6  Sabine war mit ihrer Schwester in München.', 'R'),
            rf('l7', '7  Sie hat im Kino eingekauft.', 'F'),
            rf('l8', '8  Die Jacke war im Sale.', 'R'),
            rf('l9', '9  Sabine ist mit dem Auto nach Nürnberg gefahren.', 'F'),
            rf('l10', '10  Sabine möchte, dass Thomas nächstes Mal mitkommt.', 'R'),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 11 bis 14 und die Anzeigen a bis d.\nWelche Anzeige passt zu welcher Situation?\nSie können jede Anzeige nur einmal verwenden.',
          ads: [
            {
              key: 'A',
              title: 'Radverleih CityBike',
              text: 'Fahrräder ab 8 Euro pro Tag. Auch E-Bikes verfügbar. Abholung an der Haltestelle Hauptbahnhof. Ideal für Städtetouren.',
            },
            {
              key: 'B',
              title: 'Sprachcafe Freizeit',
              text: 'Jeden Mittwoch um 18 Uhr. Deutsch sprechen, Kaffee trinken, neue Leute kennenlernen. Teilnahme kostenlos.',
            },
            {
              key: 'C',
              title: 'Outlet Center Nord',
              text: 'Mode, Schuhe und Sportartikel bis 70 Prozent günstiger. Samstag 1–0 Uhr. Bus ab Bahnhof alle 20 Minuten.',
            },
            {
              key: 'D',
              title: 'Jugendreisen aktiv',
              text: 'Gruppenreisen für 16- bis 25-Jährige. Im Sommer ans Meer oder in die Berge. Betreute Programme, ab 299 Euro.',
            },
          ],
          questions: [
            matchAd('l11', '11  Lisa (16) möchte im Sommer günstig mit Freunden ans Meer fahren.', ['A', 'B', 'C', 'D'], 'D'),
            matchAd('l12', '12  Mark möchte am Samstag billige Kleidung kaufen.', ['A', 'B', 'C', 'D'], 'C'),
            matchAd('l13', '13  Anna ist zu Besuch in Hannover und möchte die Stadt per Fahrrad erkunden.', ['A', 'B', 'C', 'D'], 'A'),
            matchAd('l14', '14  Pablo möchte abends Deutsch üben und neue Leute treffen.', ['A', 'B', 'C', 'D'], 'B'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 1,
          instruction:
            'Hören Teil 1\nSie hören vier Gespräche.\nSie hören jeden Text einmal.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          segments: [
            {
              id: 'h1',
              label: 'Gespräch 1 — Reisebüro',
              transcript:
                'Mitarbeiterin: Guten Tag, kann ich Ihnen helfen?\nKunde: Ja, ich suche eine Reise nach Prag für zwei Personen.\nMitarbeiterin: Wir haben ein Angebot für 199 Euro pro Person. Mit Frühstück und Zugfahrt.\nKunde: Das klingt gut. Wann kann ich buchen?\nMitarbeiterin: Sie können heute noch online buchen oder morgen vorbeikommen.',
              question: '1  Was möchte der Kunde?',
              options: ['a) Eine Reise nach Prag buchen', 'b) Ein Flugticket nach London', 'c) Ein Hotel in Berlin'],
              correct: 'a',
            },
            {
              id: 'h2',
              label: 'Gespräch 2 — Einkaufszentrum',
              transcript:
                'Freundin A: Gefällt dir die Tasche?\nFreundin B: Sie ist schön, aber zu teuer. Sie kostet 120 Euro.\nFreundin A: Schau mal, dort gibt es die gleiche Tasche im Angebot für 79 Euro.\nFreundin B: Oh super! Dann kaufe ich sie jetzt, weil sie heute günstiger ist.',
              question: '2  Warum kauft Freundin B die Tasche?',
              options: ['a) Sie ist heute im Angebot', 'b) Sie bekommt sie geschenkt', 'c) Sie mag die Farbe nicht'],
              correct: 'a',
            },
            {
              id: 'h3',
              label: 'Gespräch 3 — Freizeit',
              transcript:
                'Jonas: Was machst du am Samstag?\nLaura: Ich gehe wandern. Willst du mitkommen?\nJonas: Gern! Wo treffen wir uns?\nLaura: Am Busbahnhof um neun Uhr. Wir fahren dann in den Wald.\nJonas: Gut, ich bringe etwas zu trinken mit.',
              question: '3  Was machen Jonas und Laura am Samstag?',
              options: ['a) Sie gehen wandern', 'b) Sie gehen ins Kino', 'c) Sie bleiben zu Hause'],
              correct: 'a',
            },
            {
              id: 'h4',
              label: 'Gespräch 4 — Supermarkt',
              transcript:
                'Verkäufer: Entschuldigung, dieser Apfel ist leider nicht mehr frisch.\nKundin: Kein Problem. Haben Sie noch Bananen?\nVerkäufer: Ja, die Bananen sind heute im Angebot. Ein Kilo kostet nur 1,49 Euro.\nKundin: Dann nehme ich zwei Kilo, bitte.',
              question: '4  Was kauft die Kundin?',
              options: ['a) Bananen', 'b) Äpfel', 'c) Orangen'],
              correct: 'a',
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Hören Teil 2\nSie hören eine Information.\nSie hören den Text zweimal.\nWählen Sie: Richtig oder Falsch.',
          context: 'Information über den Wochenmarkt auf dem Marktplatz.',
          transcript:
            'Guten Tag, meine Damen und Herren. Ich möchte Ihnen heute unseren Wochenmarkt vorstellen. Jeden Freitag und Samstag findet er auf dem Marktplatz statt. Man kann dort frisches Obst, Gemüse und regionale Produkte kaufen. Viele Leute kommen, weil die Preise oft günstiger sind als im Supermarkt.\n\nDer Markt öffnet um sieben Uhr morgens und schließt um vierzehn Uhr. Ich empfehle, früh zu kommen, weil dann das Angebot am grössten ist. Außerdem gibt es jeden Samstag live Musik. Kinder finden oft Spaß an den Händlern, die süsse Fruchtbonbons verkaufen.\n\nWenn Sie mit dem Auto kommen, können Sie auf dem Parkplatz am Rathaus parken. Der Eintritt ist frei. Ich hoffe, Sie besuchen uns bald!',
          questions: [
            rf('h5', '5  Der Markt ist nur samstags geöffnet.', 'F'),
            rf('h6', '6  Die Preise sind manchmal günstiger als im Supermarkt.', 'R'),
            rf('h7', '7  Der Markt schließt um sechzehn Uhr.', 'F'),
            rf('h8', '8  Am Samstag gibt es live Musik.', 'R'),
            rf('h9', '9  Man muss für den Eintritt bezahlen.', 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '30 Minuten',
          fieldId: 'write1',
          task:
            'Schreiben\nSchreiben Sie eine E-Mail an Ihren Freund Lars.\nSchreiben Sie etwas zu den folgenden vier Punkten:\n- Wo Sie im Sommer Urlaub machen möchten\n- Wann Sie fahren wollen\n- Was Sie dort machen möchten\n- Ob Lars mitkommen möchte',
          minWords: 60,
          criteria: ['Inhalt (alle 4 Punkte)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Hallo Lars,\n\nich möchte im Sommer an die Ostsee fahren, weil ich das Meer sehr mag. Ich fahre am 15. Juli mit dem Zug. Dort möchte ich schwimmen, spazieren gehen und viel Eis essen.\n\nKommst du mit? Das wäre bestimmt schön!\n\nViele Grüße\nJulia',
          feedback: ['Alle vier Punkte behandelt', 'Anrede und Schlussformel', 'Circa 6–0 Wörter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Fragen zum Alltag',
          dauer: 'ca. 4 Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nDer Prüfer / die Prüferin stellt Ihnen Fragen zum Alltag.\nAntworten Sie in ganzen Sätzen.',
          prompts: [
            'Was kaufen Sie gern ein und warum?',
            'Wohin sind Sie schon einmal gereist?',
            'Was machen Sie gern in der Freizeit?',
            'Wie reisen Sie am liebsten — mit dem Zug, dem Auto oder dem Flugzeug?',
          ],
          modelAnswer:
            'Ich kaufe gern Bücher ein, weil ich in der Freizeit viel lese. Letztes Jahr bin ich nach Österreich gefahren. Am Wochenende treffe ich oft Freunde oder gehe ins Cafe. Am liebsten reise ich mit dem Zug, weil das entspannter ist als mit dem Auto.',
          feedback: ['Vier Fragen beantwortet', 'Ganze Sätze mit Begründung', 'A2-Wortschatz und Grammatik'],
        },
        {
          teil: 2,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. 4 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nSie und der Prüfer / die Prüferin planen gemeinsam einen Ausflug.\nÜberlegen Sie: Wohin? Wann? Wie kommen Sie hin? Was nehmen Sie mit?',
          points: ['Ziel vorschlagen', 'Zeit und Transport festlegen', 'Auf Vorschläge reagieren', 'Gemeinsam entscheiden'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Wollen wir am Samstag shoppen gehen und danach ins Kino?\nPrüfer: Gute Idee! Wohin sollen wir zum Einkaufen?\nIch: Ins Einkaufszentrum in der Innenstadt. Wir können mit der U-Bahn fahren.\nPrüfer: Wann treffen wir uns?\nIch: Um 14 Uhr am Hauptbahnhof. Ich nehme meine Einkaufsliste mit.\nPrüfer: Prima, dann machen wir das so!',
          feedback: ['Mindestens vier Wechsel', 'Vorschläge und Reaktionen', 'Gemeinsamer Plan am Ende'],
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
        horen: { title: 'Hören', time: '40 Minuten' },
        schreiben: { title: 'Schreiben', time: '60 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 — Lesen\nLesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
          textTitle: 'ZeroWasteLeben.de — Mein erster Monat ohne Plastikmüll',
          text:
            'Montag, 12. März\n\nSeit vier Wochen versuche ich, so wenig Plastikmüll wie möglich zu produzieren. Anfangs war es schwierig, weil fast alles im Supermarkt verpackt ist. Deshalb kaufe ich jetzt oft auf dem Wochenmarkt ein, obwohl das etwas teurer ist.\n\nMein grösster Erfolg diese Woche: Ich habe endlich einen guten Unverpackt-Laden in meiner Nähe gefunden. Außerdem bringe ich meine eigenen Beutel und Gläser mit. Mein Mitbewohner findet das manchmal lästig, trotzdem unterstützt er mich, wenn ich koche.\n\nAm Samstag habe ich an einer Stadtteilaktion teilgenommen, bei der alte Fahrräder repariert wurden. Das fand ich toll, weil man Geräte nutzen kann, statt immer Neüs zu kaufen. Nächsten Monat möchte ich lernen, Kompost richtig anzulegen — meine Balkonpflanzen würden sich bestimmt freün.',
          questions: [
            rf('l1', '1  Die Autorin kauft seit kurzem häufiger auf dem Wochenmarkt ein.', 'R'),
            rf('l2', '2  Im Supermarkt gibt es laut Text fast keine verpackten Produkte.', 'F'),
            rf('l3', '3  Der Mitbewohner lehnt das Projekt grundsätzlich ab.', 'F'),
            rf('l4', '4  Am Samstag wurden Fahrräder repariert.', 'R'),
            rf('l5', '5  Die Autorin möchte bald Kompost auf dem Balkon machen.', 'R'),
            rf('l6', '6  Der Unverpackt-Laden liegt sehr weit von ihrer Wohnung entfernt.', 'F'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Stuttgarter Nachrichten: Weniger Müll in den Schulen',
          text:
            'Ab dem neuen Schuljahr sollen alle städtischen Schulen in Stuttgart weniger Einwegplastik nutzen. Die Stadtverwaltung hat dafür 800.000 Euro bereitgestellt, damit Kantinen Mehrweggeschirr anschaffen können. Allerdings müssen die Schulen die Spülmaschinen selbst warten, obwohl die Anschaffung gefördert wird.\n\nLaut Bildungsdezernent Martin Keller haben bereits zwölf Schulen erfolgreich umgestellt. Die Schülerinnen und Schüler sortieren Müll jetzt getrennt, und der Energieverbrauch in den Küchen ist gesunken. Kritiker bemängeln jedoch, dass private Schulen von der Förderung ausgeschlossen sind.\n\nExperten betonen, dass solche Maßnahmen nur wirken, wenn Eltern und Lehrkräfte mitziehen. Deshalb plant die Stadt Workshops für Familien. Wenn alles gut läuft, könnte das Modell auch in anderen Städten übernommen werden.',
          questions: [
            mc(
              'l7',
              '7  Was ist das Hauptziel der Massnahme?',
              'mehr Bio-Lebensmittel in Kantinen',
              'weniger Einwegplastik an Schulen',
              'günstigere Mittagessen für Schüler',
              'b'
            ),
            mc(
              'l8',
              '8  Was müssen die Schulen laut Text selbst übernehmen?',
              'den Kauf der Mehrweggeschirre',
              'die Wartung der Spülmaschinen',
              'die Organisation der Workshops',
              'b'
            ),
            mc(
              'l9',
              '9  Kritiker kritisieren, dass ...',
              'die Förderung zu hoch ist',
              'private Schulen keine Förderung erhalten',
              'zu wenige öffentliche Schulen teilnehmen',
              'b'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie können jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Repair-Cafe Nord',
              text: 'Jeden ersten Samstag im Monat. Ehrenamtliche helfen, defekte Geräte zu reparieren. Eintritt frei, Materialkosten selbst tragen.',
            },
            {
              key: 'B',
              title: 'Unverpackt & Fair',
              text: 'Lebensmittel ohne Plastikverpackung. Bringen Sie Dosen und Beutel mit. Di—Sa –9 Uhr, Innenstadt.',
            },
            {
              key: 'C',
              title: 'Stadtrad Jahreskarte',
              text: 'Unbegrenzt Fahrrad fahren für 49 Euro pro Jahr. Erste 30 Minuten pro Fahrt gratis. App-Registrierung nötig.',
            },
            {
              key: 'D',
              title: 'Gartenkurs Urban Farming',
              text: 'Gemüse auf Balkon und Dachterrasse anbaün. Wochenendkurs, März—Mai. Material inklusive, max. 12 Teilnehmer.',
            },
            {
              key: 'E',
              title: 'SolarCheck kostenlos',
              text: 'Energieberater prüfen Ihr Dach. Fördermöglichkeiten für Photovoltaik. Termine online buchbar.',
            },
            {
              key: 'F',
              title: 'Mode-Schn—ppchen Woche',
              text: 'Sommerkollektion bis 70 Prozent reduziert. Nur diese Woche im Einkaufszentrum West. Tausende Artikel.',
            },
          ],
          questions: [
            matchAd('l10', '10  Stefan möchte lernen, auf dem Balkon Gemüse anzubaün.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
            matchAd('l11', '11  Mia möchte Lebensmittel ohne Plastikverpackung kaufen.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l12', '12  Jonas möchte sein altes Radio reparieren lassen.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
            matchAd('l13', '13  Die Familie Weber möchte öfter mit dem Fahrrad statt mit dem Auto fahren.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l14', '14  Herr und Frau Lang wollen prüfen lassen, ob sich Solaranlagen für ihr Haus lohnen.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 — Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Überschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Forum: Sollten Einwegplastikbecher sofort verboten werden?',
          text:
            'Meinung 15 — Anna, 34:\nEin sofortiges Verbot wäre überfällig. Unternehmen hatten genug Zeit, um umzustellen. Wenn wir weiter warten, landet noch mehr Müll in der Natur.\n\nMeinung 16 — Ben, 52:\nViele Cafes leben von Take-away-Getränken. Ein hartes Verbot würde kleine Betriebe treffen, obwohl große Ketten Alternativen leicht finanzieren können.\n\nMeinung 17 — Clara, 28:\nIch bin für weniger Plastik, aber erst wenn Mehrwegbecher überall verfügbar sind. Sonst zahlen vor allem Kundinnen und Kunden drauf.\n\nMeinung 18 — David, 41:\nDer Staat sollte nicht jedes Verhalten vorschreiben. Informieren ja, verbieten nein — jede Person muss selbst verantwortlich entscheiden.',
          ads: [
            { key: 'a', title: 'Der Staat regiert zu viel', text: '' },
            { key: 'b', title: 'Ohne Plastik geht es auch', text: '' },
            { key: 'c', title: 'Kleine Firmen dürfen nicht zahlen', text: '' },
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
            'Teil 5 — Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Mülltrennung — Wohnanlage Grüne Gasse',
          text:
            'In der Wohnanlage Grüne Gasse gilt ab 1. April eine erweiterte Mülltrennung. Bioabfälle dürfen nur in den dafür vorgesehenen braunen Behältern entsorgt werden. Verpackungen aus Plastik und Metall gehören in die Gelbe Tonne, sofern sie leer und grob sauber sind.\n\nSperrmüll darf nicht im Hausmüll landen. Anmeldungen sind schriftlich bis spätestens zwei Werktage vor Abholung an die Hausverwaltung zu richten. Bei wiederholten Verstössen können Nebenkosten nachberechnet werden, obwohl zunächst eine mündliche Ermahnung erfolgt.\n\nAltbatterien und Elektrogeräte werden im Gemeinschaftskeller gesammelt. Die Abgabe ist für Bewohner kostenlos.',
          questions: [
            mc(
              'l19',
              '19  Bioabfälle ...',
              'dürfen in jeden Behälter',
              'gehören in braune Behälter',
              'müssen zur Hausverwaltung gebracht werden',
              'b'
            ),
            mc(
              'l20',
              '20  Sperrmüll ...',
              'kann im Hausmüll entsorgt werden',
              'muss mindestens zwei Werktage vorher angemeldet werden',
              'wird jeden Montag automatisch abgeholt',
              'b'
            ),
            mc(
              'l21',
              '21  Bei wiederholten Verstössen ...',
              'wird sofort gekündigt',
              'können zusätzliche Kosten entstehen',
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
            'Hören Teil 1\nSie hören zwei kurze Texte.\nSie hören jeden Text zweimal.\nWählen Sie bei jeder Aufgabe die richtige Lösung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, hier spricht die Stadtverwaltung. Ihre Anmeldung zum Workshop —Nachhaltig einkaufen" am Donnerstag, den 18. April, ist bei uns eingegangen. Bitte bringen Sie am Donnerstag um 17 Uhr Ihre Stoffbeutel mit. Der Workshop findet im Bürgerzentrum Ost statt, nicht wie ursprünglich geplant in der Bibliothek. Bei Fragen rufen Sie uns bitte zurück.',
              questions: [
                rf('h1', '1  Der Workshop findet in der Bibliothek statt.', 'F'),
                mc('h2', '2  Die Teilnehmer sollen ...', 'Stoffbeutel mitbringen', '10 Euro bezahlen', 'eine Anmeldung per Post schicken', 'a'),
              ],
            },
            {
              label: 'Text 2: Durchsage im Radio',
              transcript:
                'Achtung, eine Verkehrsmeldung: Wegen einer Demonstration für Klimaschutz ist die Innenstadt bis 14 Uhr gesperrt. Autofahrer werden gebeten, auf öffentliche Verkehrsmittel umzusteigen. Die Organisatoren weisen darauf hin, dass die Aktion friedlich verlaufen soll. Busse der Linie 12 fahren derzeit umgeleitet über den Westring.',
              questions: [
                rf('h3', '3  Die Innenstadt ist wegen einer Demonstration gesperrt.', 'R'),
                mc('h4', '4  Autofahrer sollen laut Durchsage ...', 'zu Hause bleiben', 'Öffentliche Verkehrsmittel nutzen', 'über die Innenstadt fahren', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hören Teil 2\nSie hören einen Text.\nSie hören den Text einmal.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          context: 'Führung durch ein ökologisches Modellhaus.',
          transcript:
            'Willkommen in unserem Modellhaus. Hier zeigen wir, wie man Energie sparen kann, ohne auf Komfort zu verzichten. Die Dämmung stammt aus recycelten Materialien, und die Fenster halten im Winter die Wärme im Haus. Im Keller steht eine Anlage, die Regenwasser sammelt und für die Toiletten nutzt.\n\nAuf dem Dach befinden sich Solarzellen, die etwa die Hälfte unseres Strombedarfs decken. Allerdings können wir überschüssigen Strom nicht speichern, deshalb speisen wir ihn ins Netz ein. Viele Besucher fragen, ob so ein Umbau teuer ist. Das hängt vom Gebäude ab, aber Förderungen sind oft möglich.',
          questions: [
            mc('h5', '5  Das Regenwasser wird im Modellhaus ...', 'zum Trinken genutzt', 'für Toiletten verwendet', 'gar nicht gesammelt', 'b'),
            mc('h6', '6  Die Solarzellen ...', 'decken den kompletten Strombedarf', 'decken etwa die Hälfte des Strombedarfs', 'sind nur zur Show installiert', 'b'),
            mc('h7', '7  Überschüssiger Strom ...', 'wird im Keller gespeichert', 'wird ins Netz eingespeist', 'wird verschwendet', 'b'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hören Teil 3\nSie hören ein Gespräch.\nSie hören das Gespräch einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Nachbarn sprechen über eine Mülltrennaktion im Haus.',
          transcript:
            'Sabine: Hast du den Zettel gesehen? Ab nächster Woche trennen wir Plastik extra.\nMarkus: Ja, aber ehrlich gesagt finde ich das kompliziert. Ich würde lieber alles in einen Sack werfen.\nSabine: Das geht nicht mehr. Die Hausverwaltung hat neue Tonnen bestellt, obwohl viele Bewohner dagegen waren.\nMarkus: Mein Cousin wohnt in einer anderen Straße — dort trennen sie schon seit zwei Jahren, und es klappt.\nSabine: Genau deshalb machen wir mit. Am Samstag gibt es eine kurze Info im Hof, falls jemand Fragen hat.',
          questions: [
            rf('h8', '8  Ab nächster Woche soll Plastik getrennt werden.', 'R'),
            rf('h9', '9  Markus findet die neue Regelung von Anfang an praktisch.', 'F'),
            rf('h10', '10  Alle Bewohner waren für die neuen Tonnen.', 'F'),
            rf('h11', '11  Am Samstag gibt es eine Information im Hof.', 'R'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hören Teil 4\nSie hören eine Diskussion.\nSie hören die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Radiosendung: Soll Fleischkonsum stärker besteuert werden?',
          speakers: ['Moderator/in', 'Frau Lorenz', 'Herr Klein'],
          transcript:
            'Moderator: Heute debattieren wir über eine Höherbesteuerung von Fleisch. Frau Lorenz, Sie sind dafür?\nFrau Lorenz: Ja. Fleisch ist günstiger als viele pflanzliche Alternativen, obwohl die Umweltbelastung höher ist. Das würde ich ändern.\nHerr Klein: Ich bin skeptisch. Viele ländliche Betriebe leben vom Verkauf von Fleisch. Ohne Übergang würden Jobs verloren gehen.\nFrau Lorenz: Deshalb brauchen wir klare Förderung für umweltfreundliche Landwirtschaft.\nModerator: Herr Klein, sehen Sie gar keine Lösung?\nHerr Klein: Doch, aber über freiwillige Siegel und Aufklärung, nicht über Strafsteuern.\nFrau Lorenz: Freiwilligkeit reicht nicht — die Klimaziele verlangen mehr Tempo.',
          questions: [
            matchSpeaker('h12', '12  Fleisch ist oft günstiger als pflanzliche Alternativen.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h13', '13  Ländliche Betriebe könnten ohne Übergang Jobs verlieren.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h14', '14  Freiwillige Siegel seien die bessere Lösung als Strafsteuern.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h15', '15  Klimaziele erfordern schnelleres Handeln als freiwillige Maßnahmen.', ['M', 'F', 'H'], 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '20 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 — Schreiben\nSchreiben Sie eine E-Mail (circa 80 Wörter).\nSchreiben Sie etwas zu allen drei Punkten.\n\nSie waren letztes Wochenende auf einem Umweltfestival. Ihr Freund / Ihre Freundin Lukas war krank und konnte nicht mitkommen.\n\n- Beschreiben Sie: Was haben Sie auf dem Festival erlebt?\n- Begründen Sie: Was hat Ihnen am besten gefallen und warum?\n- Machen Sie einen Vorschlag für ein gemeinsames Treffen.',
          minWords: 80,
          criteria: ['Inhalt (Aufgabenerfüllung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Hallo Lukas,\n\nschade, dass du krank warst! Auf dem Festival gab es viele Stände zu Nachhaltigkeit. Am besten fand ich den Workshop zum Müllvermeiden, weil ich sofort Tipps für den Alltag mitnehmen konnte.\n\nWürdest du nächsten Samstag mit mir auf den Wochenmarkt gehen? Dann zeige ich dir den Unverpackt-Laden.\n\nViele Grüße\nSara',
          feedback: ['Anrede und Schlussformel', 'Alle drei Inhaltspunkte', 'Circa 80 Wörter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '25 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie Ihre Meinung zum Thema (circa 80 Wörter).\n\nIm Online-Forum steht:\n—Jede Person sollte maximal einmal pro Woche Fleisch essen, wenn wir die Umwelt schützen wollen."\n\nSchreiben Sie, ob Sie dieser Meinung zustimmen oder nicht. Begründen Sie Ihre Meinung mit mindestens zwei Argumenten und machen Sie einen Vorschlag.',
          minWords: 80,
          criteria: ['Klare Meinung', 'Mindestens zwei Argumente', 'Bezug zum Zitat und Vorschlag'],
          modelAnswer:
            'Ich stimme teilweise zu, weil Fleisch viel Wasser und Energie verbraucht. Allerdings könnten viele Menschen das finanziell nicht mittragen, wenn Fleisch teurer wird. Deshalb sollte man günstige pflanzliche Alternativen fördern. In Kantinen könnte es einen —Klima-Teller" geben.',
          feedback: ['Positionierung klar', 'Zwei Argumente', 'Circa 80 Wörter mit Vorschlag'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '15 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 — Schreiben\nSchreiben Sie eine E-Mail (circa 40 Wörter).\n\nSie haben einen Termin bei der Umweltberatung der Stadt. Sie können nicht kommen, weil Sie krank sind.\n\nEntschuldigen Sie sich höflich, nennen Sie den Grund und bitten Sie um einen neuen Termin.',
          minWords: 40,
          criteria: ['Höfliche Entschuldigung', 'Grund und Bitte um neuen Termin', 'Formelle Anrede'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\nleider kann ich meinen Termin am 22. Mai nicht wahrnehmen, weil ich krank bin. Könnten Sie mir bitte einen neuen Termin anbieten?\n\nMit freundlichen Grüßen\nTim Schneider',
          feedback: ['Formeller Ton', 'Entschuldigung mit Grund', 'Circa 40 Wörter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. – Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nIn Ihrem Deutschkurs möchten Sie mit Ihrem Partner / Ihrer Partnerin einen Aktionstag zum Thema Nachhaltigkeit organisieren.\nPlanen Sie gemeinsam: Was? Wann? Wo? Wer bringt was mit?',
          points: ['Art der Aktion vorschlagen', 'Zeit und Ort festlegen', 'Auf Vorschläge reagieren', 'Material und Aufgaben verteilen'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Würdest du mit mir einen Müllsammel-Tag im Park organisieren?\nPartner: Gute Idee! Wann sollen wir das machen?\nIch: Am Samstagvormittag, weil dann viele Leute im Park sind.\nPartner: Ich könnte Handschuhe und Säcke mitbringen.\nIch: Super, dann würde ich Flyer drucken und Getränke mitnehmen.\nPartner: Sollen wir die Gruppe vorher im Kurs ansprechen?\nIch: Ja, das würde ich machen.',
          feedback: ['Vorschläge mit Konjunktiv II', 'Auf Partner reagieren', 'Gemeinsamer Plan'],
        },
        {
          teil: 2,
          title: 'Ein Thema präsentieren',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nPräsentieren Sie das Thema —Umwelt und Nachhaltigkeit in meinem Heimatland".\n\n1. Einleitung\n2. Eigene Erfahrung\n3. Situation in Ihrem Heimatland\n4. Vor- und Nachteile + Ihre Meinung\n5. Schluss',
          points: ['Einleitung', 'Eigene Erfahrung', 'Situation im Heimatland', 'Vor- und Nachteile mit Meinung', 'Schluss'],
          minWords: 80,
          modelAnswer:
            'Heute möchte ich über Umwelt und Nachhaltigkeit in meinem Heimatland sprechen. In meiner Familie trennen wir seit zwei Jahren Müll, obwohl das am Anfang ungewohnt war. In meinem Land gibt es viele Windparks, aber gleichzeitig fahren noch zu viele alte Autos. Das ist gut für die Energie, jedoch schlecht für die Luft in Städten. Meiner Meinung nach sollte der Staat öffentliche Verkehrsmittel günstiger machen. Vielen Dank für Ihre Aufmerksamkeit.',
          feedback: ['Fünf Teile der Präsentation', 'Eigene Meinung', 'Circa 8–00 Wörter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 2 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 — Sprechen\nGeben Sie Ihrem Partner / Ihrer Partnerin Rückmeldung zur Präsentation.\nStellen Sie eine Frage und beantworten Sie auch eine Frage Ihres Partners / Ihrer Partnerin.',
          points: ['Positives Feedback geben', 'Eine Frage stellen', 'Frage des Partners beantworten'],
          minExchanges: 3,
          modelAnswer:
            'Ich: Deine Präsentation war sehr interessant. Besonders gut fand ich den Teil über die Windparks.\nPartner: Danke! Was findest du schwierig bei uns in Deutschland?\nIch: Manchmal ist die Mülltrennung kompliziert, obwohl sie sinnvoll ist.\nPartner: Würdest du öfter mit dem Fahrrad fahren, wenn es mehr Radwege gäbe?\nIch: Ja, das würde ich auf jeden Fall machen.',
          feedback: ['Freundliche Rückmeldung', 'Frage und Antwort', 'Mindestens drei Wechsel'],
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
        horen: { title: 'Hören', time: '40 Minuten' },
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
            'Wer heute online agiert, hinterlässt Spuren, die länger sichtbar bleiben als manche persönliche Erinnerungen. Ich habe neulich versucht, alte Forenbeiträge löschen zu lassen, wurde jedoch an AGB verwiesen, die mir damals niemand erklärt hat. Dass Plattformen Inhalte archivieren, um Werbeeinnahmen zu sichern, wird oft als Preis der kostenlosen Dienste dargestellt.\n\nAllerdings trifft diese Logik nicht nur auf junge Nutzer zu. Auch Berufstätige geraten unter Druck, ständig erreichbar zu sein, obwohl viele Unternehmen flexible Modelle propagieren. Mein Eindruck ist, dass Digitalisierung nicht automatisch Entlastung bedeutet, sondern nur dann, wenn klare Grenzen vereinbart werden.\n\nKritisch sehe ich zudem, dass Algorithmen Verhalten vorhersagen, ohne dass Betroffene nachvollziehen können, welche Daten dafür verwendet werden. Transparenz dürfte laut Experten das Mindeste sein, um Vertrauen wiederherzustellen. Ich plädiere deshalb für stärkere Kontrollrechte, ohne Innovation pauschal abzuwürdigen.',
          questions: [
            rf('l1', '1  Der Autor ist der Meinung, dass kostenlose Dienste grundsätzlich keine Datenspeicherung rechtfertigen.', 'F'),
            rf('l2', '2  Laut Text sind vor allem junge Menschen von Erreichbarkeitsdruck betroffen.', 'F'),
            rf('l3', '3  Der Autor hält Digitalisierung ohne vereinbarte Grenzen für problematisch.', 'R'),
            rf('l4', '4  Betroffene können laut Text leicht nachvollziehen, welche Daten Algorithmen nutzen.', 'F'),
            rf('l5', '5  Der Autor lehnt jede Form technologischer Innovation ab.', 'F'),
            rf('l6', '6  Experten betrachten Transparenz als Voraussetzung für Vertrauen.', 'R'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Zeit Online: EU plant strengere Regeln für KI in Behörden',
          text:
            'Die Europäische Kommission will KI-Systeme in Behörden stärker regulieren, nachdem mehrere Behörden fehlerhafte automatisierte Entscheidungen gemeldet haben. Laut Entwurf sollen Algorithmen, die über Fördermittel oder Wohnsitzstatus entscheiden, vor dem Einsatz unabhängig geprüft werden.\n\nProfessorin Dr. Elena Roth von der TU München erklärte, man dürfe Technologie nicht verteufeln, sie müsse jedoch nachvollziehbar bleiben. Kritiker aus der Wirtschaft befürchten längere Verfahren und höhere Kosten, obwohl die Branche zugleich von öffentlichen Digitalisierungsprogrammen profitiere.\n\nBundesdigitalminister Adrian Keller betonte, Deutschland werde die Vorgaben übernehmen, um Bürgervertraün zu stärken. Allerdings räumte er ein, dass viele Kommunen noch nicht über ausreichend qualifiziertes Personal verfügten, um komplexe Systeme zu implementieren. Beobachter gehen davon aus, dass die Umsetzung mindestens drei Jahre daürn könnte, sofern nicht zusätzlich investiert werde.',
          questions: [
            mc(
              'l7',
              '7  Was lässt sich aus dem Text über den geplanten Umgang mit bestimmten KI-Systemen schließen?',
              'Sie dürfen ohne Prüfung eingesetzt werden.',
              'Sie sollen vor dem Einsatz unabhängig geprüft werden.',
              'Sie werden generell in Behörden verboten.',
              'b'
            ),
            mc(
              'l8',
              '8  Welche Spannung beschreibt der Text im Wirtschaftsbereich?',
              'Unternehmen lehnen Digitalisierung grundsätzlich ab.',
              'Kritiker fürchten Kosten, profitieren aber zugleich von Förderprogrammen.',
              'Alle Unternehmen unterstützen die Regulierung einhellig.',
              'b'
            ),
            mc(
              'l9',
              '9  Was deutet der Text über die Umsetzung in Deutschland an?',
              'Sie könnte sich verzögern, weil Fachpersonal fehlt.',
              'Sie ist bereits in allen Kommunen abgeschlossen.',
              'Sie hängt ausschließlich von der Wirtschaft ab.',
              'a'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie können jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Zertifikat Cybersecurity B2B',
              text: 'Fünfmonatiger Lehrgang für IT-Fachkräfte. Schwerpunkt: Incident Response, Penetration Testing, DSGVO-konforme Protokollierung. Abschluss mit anerkanntem Zertifikat.',
            },
            {
              key: 'B',
              title: 'UX Research Summit 2026',
              text: 'Internationale Konferenz zu nutzerzentriertem Design digitaler Dienste. Keynotes, Workshops, Networking. Hamburg, 14.—16. Oktober. Frühbucher bis 30. Juni.',
            },
            {
              key: 'C',
              title: 'CloudShift Mittelstand',
              text: 'Beratung für KMU bei Migration in die Cloud. Kostenanalyse, Datenschutzkonzept, Change Management. Erstgespräch kostenlos.',
            },
            {
              key: 'D',
              title: 'MA Digital Ethics (online)',
              text: 'Berufsbegleitendes Masterprogramm zu Algorithmen, Plattformökonomie und Medienrecht. Voraussetzung: abgeschlossenes BA-Studium.',
            },
            {
              key: 'E',
              title: 'OpenDev Meetup Berlin',
              text: 'Monatliches Treffen für Entwicklerinnen und Entwickler offener Software. Vorträge, Code-Reviews, Mentorings. Eintritt frei.',
            },
            {
              key: 'F',
              title: 'Seminar klassische Buchführung',
              text: 'Einführung in manülle Kontierung und Papierbelege. Für Einsteiger ohne IT-Vorkenntnisse. Wochenendkurs, max. 15 Teilnehmer.',
            },
          ],
          questions: [
            matchAd('l10', '10  Nadine leitet die IT-Abteilung eines Mittelstandsunternehmens und muss die Server-Infrastruktur modernisieren.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l11', '11  Emre promoviert in Medienwissenschaft und möchte sich wissenschaftlich mit ethischen Fragen algorithmischer Systeme befassen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
            matchAd('l12', '12  Sophie entwirft Benutzeroberflächen und möchte aktülle Forschung zu Usability und Barrierefreiheit kennenlernen.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l13', '13  Leon arbeitet als Backend-Entwickler und möchte sich mit anderen über Open-Source-Projekte austauschen.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
            matchAd('l14', '14  Karim muss nach einem Sicherheitsvorfall das Reaktionsverfahren seines Teams professionalisieren und dokumentieren lernen.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 — Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Überschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Debatte: Sollten soziale Netzwerke algorithmische Feeds abschaffen?',
          text:
            'Meinung 15 — Dr. Ines Hartmann, 44, Medienforscherin:\nChronologische Feeds würden die Verbreitung extremistischer Inhalte nicht automatisch stoppen, könnten aber die Aufmerksamkeitssteuerung transparenter machen. Entscheidend wäre, dass Nutzer nachvollziehen können, warum ihnen etwas angezeigt wird.\n\nMeinung 16 — Malik, 29, Gründer eines Start-ups:\nEin Verbot würde Innovationsdruck von Plattformen nehmen und kleinere Anbieter benachteiligen, weil nur Konzerne teure Alternativen finanzieren könnten. Wettbewerb, nicht Regulierung, hätte bisher Fortschritte gebracht.\n\nMeinung 17 — Ruth, 58, Lehrerin:\nSchüler verlieren ohne Filter zu viel Zeit und geraten leichter in Echokammern. Deshalb sollten Feeds standardmäßig deaktiviert sein, bis Nutzer aktiv zustimmen, obwohl das die Bedienung etwas komplizierter macht.\n\nMeinung 18 — Jonas, 36, Datenschutzbeauftragter:\nAlgorithmische Sortierung ist nicht per se problematisch, solange sie auditierbar ist und personenbezogene Profile gelöscht werden können. Pauschale Abschaffung würde Symptome bekämpfen, nicht Ursachen.',
          ads: [
            { key: 'a', title: 'Regulierung bremst den Markt', text: '' },
            { key: 'b', title: 'Schutz durch bewusste Standard-Einstellungen', text: '' },
            { key: 'c', title: 'Transparenz statt pauschaler Verbote', text: '' },
            { key: 'd', title: 'Chronologie allein löst nichts', text: '' },
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
            'Teil 5 — Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Richtlinie zur Nutzung cloudbasierter Dienste — Universität Konstanz',
          text:
            'Für die Verarbeitung personenbezogener Forschungsdaten dürfen ausschließlich vom Rektorat freigegebene Cloud-Dienste genutzt werden. Eine Übermittlung in Drittstaaten ist unzulässig, sofern kein angemessenes Datenschutzniveau nachgewiesen wird.\n\nProjektleitungen sind verpflichtet, Zugriffsrechte regelmäßig zu prüfen und zu dokumentieren. Bei Verstossen kann die IT-Abteilung den Zugang vorübergehend sperren, bevor ein formelles Verfahren eingeleitet wird.\n\nAusnahmen sind nur mit schriftlicher Genehmigung der Datenschutzbeauftragten zulässig. Beschwerden sind innerhalb von 14 Tagen nach Bekanntwerden des Vorfalls einzureichen; verspätete Meldungen können nur berücksichtigt werden, wenn der Antragsteller nachweist, dass die Verzögerung unverschuldet war.',
          questions: [
            mc(
              'l19',
              '19  Welche Schlussfolgerung lässt sich zu Cloud-Diensten ziehen?',
              'Jeder Dienst darf genutzt werden, wenn er günstig ist.',
              'Nur vom Rektorat freigegebene Dienste sind zulässig.',
              'Drittstaaten-Übermittlung ist grundsätzlich erlaubt.',
              'b'
            ),
            mc(
              'l20',
              '20  Was geschieht laut Text bei Verstössen zunächst?',
              'Es wird sofort gekündigt.',
              'Der Zugang kann vorübergehend gesperrt werden.',
              'Es erfolgt keine Reaktion.',
              'b'
            ),
            mc(
              'l21',
              '21  Wann können verspätete Beschwerden dennoch berücksichtigt werden?',
              'Wenn der Antragsteller unverschuldete Verzögerung nachweist.',
              'Wenn die Beschwerde innerhalb von 14 Tagen schriftlich eingeht.',
              'Grundsätzlich nie.',
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
            'Hören Teil 1\nSie hören zwei kurze Texte.\nSie hören jeden Text zweimal.\nWählen Sie bei jeder Aufgabe die richtige Lösung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, hier spricht die IT-Abteilung der Firma MedTech Solutions. Aufgrund eines Sicherheitsvorfalls müssen alle Mitarbeitenden bis Freitag, 17 Uhr, an der verpflichtenden Schulung zu Phishing und Datenschutz teilnehmen. Wer bereits am Dienstag teilgenommen hat, muss sich nicht erneut anmelden. Bitte melden Sie sich über das interne Portal an. Bei Rückfragen wenden Sie sich an Herrn Brandt. Ich wiederhole: Anmeldung über das interne Portal, nicht per E-Mail.',
              questions: [
                rf('h1', '1  Alle Mitarbeitenden müssen die Schulung unbedingt zweimal absolvieren.', 'F'),
                mc('h2', '2  Wer bereits am Dienstag teilgenommen hat, ...', 'muss sich erneut anmelden', 'ist von der Pflicht befreit', 'soll Herrn Brandt persönlich besuchen', 'b'),
              ],
            },
            {
              label: 'Text 2: Durchsage im Radio',
              transcript:
                'Kurzmeldung: Der Bundestag hat in der nächtlichen Sitzung über die Einführung einer digitalen Ausweisfunktion debattiert. Befürworter argumentieren, Behördengänge könnten dadurch schneller werden. Kritiker warnen vor zentralen Datenspeichern, obwohl die Regierung betont, dass Daten dezentral verwaltet werden sollen. Ob das Gesetz in dieser Form verabschiedet wird, bleibt offen; eine abschliessende Abstimmung ist für nächste Woche geplant.',
              questions: [
                rf('h3', '3  Kritiker befürchten zentrale Datenspeicher.', 'R'),
                mc('h4', '4  Laut Regierung sollen die Daten ...', 'zentral gespeichert werden', 'dezentral verwaltet werden', 'komplett gelöscht werden', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hören Teil 2\nSie hören einen Text.\nSie hören den Text einmal.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          context: 'Vortrag über ein Smart-City-Projekt in Leipzig.',
          transcript:
            'Willkommen zum Projektupdate Smart Leipzig 2030. In den vergangenen zwei Jahren wurden 120 intelligente Sensoren installiert, um Luftqualität und Verkehrsströme in Echtzeit zu messen. Die Daten werden anonymisiert ausgewertet, um Ampelschaltungen dynamisch anzupassen. Laut Projektbericht sank die durchschnittliche Wartezeit an drei Hauptkreuzungen um 14 Prozent, obwohl der Gesamtverkehr leicht zugenommen habe.\n\nAllerdings kritisieren Bürgerverbände, dass die Informationskampagnen zu spät starteten. Viele Anwohner wussten nicht, welche Daten erhoben würden. Deshalb wurde nun ein öffentliches Dashboard eingerichtet, auf dem Messwerte einsehbar sind. Die Finanzierung ist bis Ende 2027 gesichert, sofern keine weiteren Fördermittel gestrichen werden.',
          questions: [
            mc('h5', '5  Was ist laut Vortrag das Hauptziel der Sensoren?', 'Werbung für neue Apps auszuspielen', 'Verkehr und Luftqualität zu messen', 'Private Wohnungen zu überwachen', 'b'),
            mc('h6', '6  Welches Ergebnis wird für drei Kreuzungen genannt?', 'Die Wartezeit sank um 14 Prozent.', 'Der Verkehr wurde um 14 Prozent reduziert.', 'Die Luftqualität verschlechterte sich um 14 Prozent.', 'a'),
            mc('h7', '7  Was lässt sich über die Finanzierung schließen?', 'Sie ist daürhaft unbegrenzt gesichert.', 'Sie ist bis Ende 2027 gesichert, sofern Förderung nicht gestrichen wird.', 'Sie wurde bereits vollständig gestrichen.', 'b'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hören Teil 3\nSie hören ein Gespräch.\nSie hören das Gespräch einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Kolleginnen besprechen digitale Erreichbarkeit und Work-Life-Balance.',
          transcript:
            'Laura: Ich habe gestern Abend wieder Mails beantwortet, obwohl ich eigentlich frei hatte.\nSimone: Das mache ich auch manchmal, aber ich versuche, ab 20 Uhr offline zu gehen.\nLaura: Unser Teamleiter behauptet, wir seien flexibel, trotzdem erwarte er sofortige Antworten in Chatgruppen.\nSimone: Genau deshalb habe ich Benachrichtigungen deaktiviert. Mein Eindruck ist, dass st—ndige Erreichbarkeit die Qualität der Arbeit senkt.\nLaura: Stimmt, und ich würde gern vereinbaren, dass dringende Fälle telefonisch gemeldet werden.\nSimone: Das wäre sinnvoll, allerdings müssen wir das im nächsten Teammeeting offen ansprechen, statt es hintenrum zu lösen.',
          questions: [
            rf('h8', '8  Simone ist der Meinung, dass ständige Erreichbarkeit die Arbeitsqualität senken kann.', 'R'),
            rf('h9', '9  Laura findet das Verhalten des Teamleiters völlig angemessen.', 'F'),
            rf('h10', '10  Simone hat Benachrichtigungen auf ihrem Gerät deaktiviert.', 'R'),
            rf('h11', '11  Beide wollen das Thema im nächsten Teammeeting ansprechen.', 'R'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hören Teil 4\nSie hören eine Diskussion.\nSie hören die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Radio: Soll KI automatisch Nachrichtentexte verfassen dürfen?',
          speakers: ['Moderator/in', 'Frau Weiss', 'Herr Ortmann'],
          transcript:
            'Moderator: KI-generierte Artikel sparen Redaktionen Zeit, gefährden aber Vertrauen. Frau Weiss, sehen Sie darin ein Problem?\nFrau Weiss: Ja, wenn Leser nicht erkennen, ob ein Mensch oder ein System schreibt. Transparenz müsste verpflichtend sein, allerdings dürfte man KI nicht generell verbieten.\nHerr Ortmann: Ich halte ein Verbot für kontraproduktiv. Redaktionen müssen ohnehin künftig schneller arbeiten, um zu überleben.\nFrau Weiss: Schnelligkeit darf nicht wichtiger sein als sorgfältige Recherche. Ich würde vorschlagen, jeden KI-Text mit Quellenangaben zu kennzeichnen.\nModerator: Herr Ortmann, akzeptieren Sie das?\nHerr Ortmann: Kennzeichnung ja, aber die Haftung müsste bei der verantwortlichen Redaktion bleiben, nicht beim Softwareanbieter.\nFrau Weiss: Genau deshalb brauchen wir klare redaktionelle Prozesse, statt blind zu veröffentlichen.',
          questions: [
            matchSpeaker('h12', '12  Leser müssen erkennen können, ob ein Text von KI stammt.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h13', '13  Ein generelles Verbot hält Herr Ortmann für kontraproduktiv.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h14', '14  Schnelligkeit dürfe nicht wichtiger sein als sorgfältige Recherche.', ['M', 'F', 'H'], 'F'),
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
            'Aufgabe 1 — Schreiben\nSchreiben Sie eine E-Mail (circa 150 Wörter).\nSchreiben Sie etwas zu allen drei Punkten.\n\nSie haben an einem Online-Symposium zum Thema —Digitalisierung und Bildung" teilgenommen. Ihre Kollegin Petra konnte nicht dabei sein.\n\n- Berichten Sie, welche Vorträge für Sie besonders relevant waren\n- Erklären Sie, welche Herausforderung im Bildungsbereich Sie am dringendsten finden\n- Machen Sie einen Vorschlag, wie Sie das Gelernte im Team umsetzen könnten',
          minWords: 150,
          criteria: ['Inhalt (Aufgabenerfüllung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Liebe Petra,\n\nschade, dass du beim Symposium nicht dabei sein konntest. Besonders spannend fand ich den Vortrag zur medienkompetenten Unterrichtsgestaltung, weil dort konkrete Beispiele aus der Praxis vorgestellt wurden.\n\nAm dringendsten sehe ich die ungleiche Ausstattung der Schulen, obwohl digitale Bildung längst als Grundkompetenz gilt. Viele Schülerinnen und Schüler können zu Hause nicht verlässlich lernen.\n\nIch würde vorschlagen, dass wir im Team einen Workshop planen, um unsere Materialien zu überarbeiten und offene Ressourcen einzubinden. Wäre das für dich interessant?\n\nViele Grüße\nMarkus',
          feedback: ['Semiformaler Ton', 'Alle drei Inhaltspunkte', 'Circa 150 Wörter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '35 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie einen kommentierenden Text (circa 150 Wörter).\n\nIm Online-Forum steht:\n—Soziale Netzwerke sollten komplett anonymisiert werden, damit Hassrede verschwindet."\n\nNehmen Sie Stellung. Begründen Sie Ihre Meinung mit mindestens zwei Argumenten, ziehen Sie ein mögliches Gegenargument heran und formulieren Sie eine Schlussfolgerung mit Vorschlag.',
          minWords: 150,
          criteria: ['These und Struktur', 'Argument und Gegenargument', 'Schlussfolgerung mit Vorschlag'],
          modelAnswer:
            'Ich halte totale Anonymisierung für kein geeignetes Mittel gegen Hassrede. Einerseits würde sie missbrauchliche Inhalte erschweren, andererseits würden auch vulnerable Gruppen ihre Stimme verlieren, die anonym Schutz suchen.\n\nEin Gegenargument lautet, Anonymität fördere Verantwortungslosigkeit. Dem ist entgegenzuhalten, dass viele Fälle von Hetze auch unter Klarnamen auftreten.\n\nMeiner Meinung nach sollten Plattformen Meldemechanismen stärken und transparent moderieren, statt pauschal Anonymität abzuschaffen.',
          feedback: ['These-Argument-Gegenargument-Schluss', 'Circa 150 Wörter', 'Nuancierte Position'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '20 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 — Schreiben\nSchreiben Sie eine E-Mail (circa 60 Wörter).\n\nSie haben einen Termin bei der Datenschutzbeauftragten Ihrer Hochschule. Sie können nicht teilnehmen, weil Sie an einer Pflichtveranstaltung teilnehmen müssen.\n\nEntschuldigen Sie sich höflich, nennen Sie den Grund und bitten Sie um einen Ersatztermin.',
          minWords: 60,
          criteria: ['Formeller Ton', 'Entschuldigung mit Grund', 'Bitte um Ersatztermin'],
          modelAnswer:
            'Sehr geehrte Frau Dr. Schneider,\n\nbedauerlicherweise kann ich meinen Termin am 12. Juni nicht wahrnehmen, da ich an einer verpflichtenden Prüfungsvorbereitung teilnehmen muss. Könnten Sie mir bitte einen Ersatztermin anbieten?\n\nMit freundlichen Grüßen\nLea Hoffmann',
          feedback: ['Vollständig formell', 'Grund und Ersatztermin', 'Circa 60 Wörter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. – Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nIhr Deutschkurs möchte eine Veranstaltung zum Thema —Digitale Mündigkeit" organisieren.\nPlanen Sie mit Ihrem Partner / Ihrer Partnerin Zielgruppe, Format, Datum und Aufgabenverteilung.',
          points: ['Zielgruppe und Format festlegen', 'Termin und Ort vorschlagen', 'Auf Einwände reagieren', 'Rollen verteilen und entscheiden'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Ich würde vorschlagen, einen Abendworkshop für Erwachsene anzubieten, weil viele Eltern unsicher im Umgang mit Apps sind.\nPartner: Das klingt sinnvoll, allerdings müssten wir einen Raum mit gutem WLAN finden.\nIch: Könnten wir die Stadtbibliothek anfragen? Dort gäbe es auch Beamer.\nPartner: Gute Idee. Wann wäre realistisch?\nIch: Am 20. nächsten Monats, sofern wir rechtzeitig werben.\nPartner: Dann übernehme ich die Flyer, und du könntest Referentinnen ansprechen.\nIch: Einverstanden, so würde ich es machen.',
          feedback: ['Konjunktiv II und Begründungen', 'Gemeinsame Entscheidung', 'Mindestens fünf Wechsel'],
        },
        {
          teil: 2,
          title: 'Ein Thema präsentieren',
          dauer: 'ca. – Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nPräsentieren Sie das Thema —Auswirkungen der Digitalisierung auf den Arbeitsmarkt in meinem Heimatland".\n\n1. Einleitung\n2. Eigene Erfahrung\n3. Situation im Heimatland\n4. Vor- und Nachteile + Meinung\n5. Schluss',
          points: ['Einleitung mit These', 'Eigene Erfahrung', 'Landeskontext', 'Abwägung mit Meinung', 'Schluss'],
          minWords: 100,
          modelAnswer:
            'Heute möchte ich über die Auswirkungen der Digitalisierung auf den Arbeitsmarkt in meinem Heimatland sprechen. In meinem letzten Projekt habe ich erlebt, wie Automatisierung Routineaufgaben übernommen hat, wodurch sich meine Rolle stärker auf Beratung verlagerte. In meinem Land wachsen IT-Jobs deutlich, gleichzeitig werden jedoch viele Verwaltungsstellen reduziert, obwohl Umschulungsprogramme erst langsam ausgebaut werden. Das bietet Chancen für qualifizierte Fachkräfte, birgt jedoch Risiken für ältere Beschäftigte ohne digitale Kompetenzen. Meiner Meinung nach sollten Staat und Unternehmen gemeinsam in Weiterbildung investieren, um soziale Spaltung zu vermeiden. Vielen Dank für Ihre Aufmerksamkeit.',
          feedback: ['Fünf Abschnitte', 'Fachvokabular B2', 'Circa 100 Wörter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 — Sprechen\nGeben Sie Ihrem Partner / Ihrer Partnerin konstruktives Feedback zur Präsentation.\nStellen Sie eine kritische Frage und beantworten Sie eine Gegenfrage.',
          points: ['Konstruktives Feedback', 'Kritische Frage stellen', 'Gegenfrage beantworten', 'Höflich aber bestimmt argumentieren'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Deine Präsentation war sehr strukturiert. Besonders überzeugend fand ich den Vergleich zwischen Chancen und Risiken.\nPartner: Danke! Welcher Aspekt fehlte dir?\nIch: Mir hätte ein konkretes Beispiel zu Umschulungsprogrammen noch gefallen.\nPartner: Hättest du eher staatliche oder private Lösungen?\nIch: Ich würde beides verbinden, weil Unternehmen von qualifizierten Mitarbeitenden profitieren, der Staat jedoch Rahmenbedingungen setzen sollte.',
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
        horen: { title: 'Hören', time: '40 Minuten' },
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
            'Die in den Medien zelebrierte Gen-Schere, so meine These, wird nicht primär an Krankenbetten gemessen, sondern an Börsenwerten. Wer die Debatte nur über individuelle Heilungschancen führt, übersieht die ökonomische Logik hinter klinischen Studien mit rekordverdächtiger Finanzierung.\n\nNicht dass ich Fortschritt grundsätzlich ablehne. Im Gegenteil: Die präzise Editierung pathogener Sequenzen könnte Leid verringern, sofern die Evidenzbasis stimmt und die Langzeitfolgen nicht dem Shareholder Value geopfert werden. Was mich irritiert, ist die rhetorische Gleichsetzung von wissenschaftlicher Neugier mit moralischer Unbedenklichkeit.\n\nIn Ländern mit schwach ausgeprägter Forschungsethik droht zudem, dass vulnerable Gruppen zu Testfeldern werden, während der Nutzen global asymmetrisch verteilt bleibt. Die Autorin des jüngsten Bestsellers mag das als Pessimismus abtun; ich würde es als Realismus bezeichnen, der sich nicht mit Applaus abfinden muss.\n\nAm Ende, so vermute ich, wird die Gesellschaft nicht die Technologie wählen, sondern die Rahmenbedingungen, unter denen sie angewandt wird. Und genau dort fehlt mir der Mut zur Langsamkeit.',
          questions: [
            rf('l1', '1  Der Autor wirft der öffentlichen Debatte vor, wirtschaftliche Interessen zu vernachlässigen.', 'R'),
            rf('l2', '2  Laut Text lehnt der Autor wissenschaftlichen Fortschritt grundsätzlich ab.', 'F'),
            rf('l3', '3  Der Autor sieht die Gleichsetzung von Neugier und Moral als problematisch an.', 'R'),
            rf('l4', '4  Der Autor hält den genannten Bestseller für ausgewogen und realistisch.', 'F'),
            rf('l5', '5  Aus dem Text lässt sich schließen, dass der Autor Tempo in der Regulierung für wichtig hält.', 'F'),
            rf('l6', '6  Der Autor erwartet, dass gesellschaftliche Entscheidungen vor allem die Nutzungsbedingungen betreffen.', 'R'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 — Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Spektrum der Wissenschaft: Placebo-kontrollierte Studien unter Druck',
          text:
            'In der klinischen Forschung gilt die randomisierte, doppelblinde Studie als Goldstandard zur Abschätzung therapeutischer Wirksamkeit. Neuere Analysen der Universität Heidelberg zeigen jedoch, dass in bestimmten Therapiebereichen die Placebo-Response-Raten steigen, wodurch signifikante Effekte schwerer nachweisbar werden.\n\nForschende vermuten, dass komplexere Patientenerwartungen, verstärkte Prä-Test-Kommunikation und die mediale Präsenz neuer Wirkstoffe die Ergebnisvarianz erhöhen. Kritisch zu hinterfragen ist zugleich, ob kommerziell finanzierte Studien hinreichend transparent über Protokolländerungen berichten.\n\nEthikkommissionen bestehen deshalb verstärkt auf prä-registrierte Endpunkte und unabhängige Datenevaluierung. Dennoch warnen Wissenschaftlerinnen und Wissenschaftler davor, methodische Strenge mit bürokratischer Erstarrung gleichzusetzen, zumal verzögerte Zulassungen bei seltenen Erkrankungen humanitäre Kosten haben könnten.',
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
              '8  Was impliziert der Text über kommerziell finanzierte Studien?',
              'Sie sind per se unzuverlässig.',
              'Ihre Transparenz bei Protokolländerungen ist hinterfragbar.',
              'Sie benötigen keine Ethikkommissionen.',
              'b'
            ),
            mc(
              'l9',
              '9  Wie ist die Haltung der im Text genannten Wissenschaftler zu strengeren Verfahren am ehesten zu charakterisieren?',
              'Sie lehnen jede Regulierung ab.',
              'Sie befürworten Strenge, warnen aber vor überzogener Bürokratie.',
              'Sie halten Verzögerungen für grundsätzlich unproblematisch.',
              'b'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 — Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie können jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Abstract — Journal of Reproducibility Studies',
              text: 'Metaanalyse zu nicht replizierbaren Ergebnissen in den Neurowissenschaften. Methodische Empfehlungen für Open-Data-Praktiken. Peer-reviewed, Open Access.',
            },
            {
              key: 'B',
              title: 'Rezension — Ethik der Forschung am Menschen',
              text: 'Sachbuch von Prof. Dr. Albrecht: historische Entwicklung, informierte Einwilligung, Grenzen der Belastbarkeit. Ausführliche Fallstudien.',
            },
            {
              key: 'C',
              title: 'Forschungsintegrität — Universität Bonn',
              text: 'Webseite der Ombudsstelle: Meldewege bei Plagiat, Datenmanipulation oder Interessenkonflikten. Vertrauliche Erstberatung.',
            },
            {
              key: 'D',
              title: 'Call for Papers — Biöthics & Policy',
              text: 'Internationale Tagung zu Governance von Biotechnologie. Einreichung von Abstracts bis 30. September. Reisezuschüsse für Early-Career Researchers.',
            },
            {
              key: 'E',
              title: 'Patentregister EU — Sequenzanalyse',
              text: 'Technische Dokumentation zu Anmeldeverfahren genetischer Verfahren. Fokus auf Schutzrechte und Lizenzmodelle, nicht auf klinische Anwendung.',
            },
            {
              key: 'F',
              title: 'Vortragsreihe Literatur und Ästhetik',
              text: 'Öffentliche Lesungen zeitgenössischer Lyrik. Kein Bezug zu Naturwissenschaften. Eintritt frei, Donnerstags 19 Uhr.',
            },
          ],
          questions: [
            matchAd('l10', '10  Dr. Weiss bereitet eine Vorlesung über die Geschichte informierter Einwilligung vor.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l11', '11  Eine Doktorandin vermutet unbeabsichtigte Verfälschung in ihren Versuchsdaten und sucht vertrauliche Beratung.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l12', '12  Prof. Nguyen möchte auf einer Fachkonferenz ein Paper zur Regulierung von Biotechnologie einreichen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
            matchAd('l13', '13  Ein Team analysiert systematisch, warum viele Studien nicht reproduzierbar sind.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
            matchAd('l14', '14  Ein Biotech-Unternehmen prüft die Schutzfähigkeit eines neuen Verfahrens vor Markteinführung.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 — Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Überschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Forum: Soll künstliche Intelligenz wissenschaftliche Publikationen mitverfassen dürfen?',
          text:
            'Meinung 15 — Prof. Dr. Sandra Voigt, 49, Wissenschaftstheorie:\nDie Autorschaft impliziert Verantwortung für Inhalt und Methodik. Ein Modell, das Texte generiert, ohne die zugrunde liegende Evidenz eigenständig prüfen zu können, erfüllt dieses Kriterium nicht. Transparenzpflichten dürften höchstens als Werkzeugdeklaration gelten.\n\nMeinung 16 — Amir, 34, Computational Biologist:\nWer heute große Datensätze auswertet, nutzt ohnehin algorithmische Pipeline. Die Scheinheiligkeit, am Ende nur menschliche Namen auf dem Titelblatt zu sehen, verdeckt die tatsächliche Arbeitsteilung.\n\nMeinung 17 — Dr. Helena Roth, 41, Herausgeberin:\nIch würde Co-Autorenschaft für Systeme nur akzeptieren, wenn nachvollziehbar dokumentiert wird, welche Hypothesen menschlich gesetzt wurden. Andernfalls droht die Erosion des Peer-Review-Vertrauens.\n\nMeinung 18 — Jonas, 38, Wissenschaftspolitiker:\nDer Kern ist nicht die Technologie, sondern Anreizsysteme, die Quantität über Qualität stellen. Solange Publikationsdruck dominiert, wird jedes neue Werkzeug eher missbraucht als gezielt reguliert.',
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
            'Teil 5 — Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Satzung der Ethikkommission — Medizinische Fakultät Heidelberg',
          text:
            'Forschungsvorhaben mit erhöhtem Belastungspotenzial für Probandinnen und Probanden bedürfen einer vorherigen schriftlichen Genehmigung durch die Ethikkommission. Als erhöht gilt insbesondere jede Intervention, deren Risiken nicht durch den erwarteten Nutzen plausibel gedeckt werden können, es sei denn, es liegen zwingende wissenschaftliche Gründe vor, die in der Antragstellung ausführlich begründet werden.\n\nAnträge sind mindestens sechs Wochen vor Studienbeginn einzureichen; bei multizentrischen Projekten verlängert sich die Frist auf acht Wochen, sofern keine parallele Prüfung anderer Standorte vorliegt. Nachträgliche Protokolländerungen mit ethischer Relevanz sind unverzüglich anzuzeigen; andernfalls kann die Genehmigung widerrufen werden.\n\nAusnahmen von der Vollständigkeitsprüfung werden nur für retrospektive Auswertungen anonymisierter Routinedaten gewährt, sofern kein Rückführbarkeitsrisiko besteht und die Datenschutzkonformität nachweislich gesichert ist.',
          questions: [
            mc(
              'l19',
              '19  Welche Implikation ergibt sich für risikoreiche Interventionen ohne ausreichenden Nutzen?',
              'Sie dürfen grundsätzlich ohne Genehmigung durchgeführt werden.',
              'Sie bedürfen einer Genehmigung, es sei denn, zwingende wissenschaftliche Gründe werden belegt.',
              'Sie sind generell verboten, ohne Ausnahme.',
              'b'
            ),
            mc(
              'l20',
              '20  Was lässt sich zur Frist bei multizentrischen Projekten schließen?',
              'Sie beträgt acht Wochen, wenn keine parallele Prüfung vorliegt.',
              'Sie entfällt bei internationaler Beteiligung.',
              'Sie ist identisch mit der für Einzelzentren.',
              'a'
            ),
            mc(
              'l21',
              '21  Wann können retrospektive Auswertungen von Routinedaten vereinfacht werden?',
              'Immer, wenn die Daten anonymisiert sind.',
              'Nur wenn kein Rückführbarkeitsrisiko besteht und Datenschutz nachgewiesen ist.',
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
            'Hören Teil 1\nSie hören zwei kurze Texte.\nSie hören jeden Text zweimal.\nWählen Sie bei jeder Aufgabe die richtige Lösung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, hier die Geschäftsstelle des Graduiertenkollegs. Ihr Antrag auf Verlängerung der Förderung wurde zur abschließenden Prüfung weitergeleitet. Bitte reichen Sie bis Montag, 12 Uhr, die aktualisierte Forschungsübersicht sowie die Stellungnahme Ihrer Betreuerin ein. Ohne diese Unterlagen kann das Kuratorium nicht entscheiden. Rückfragen richten Sie bitte nicht per privater Mail, sondern über das Portal an die zuständige Sachbearbeitung.',
              questions: [
                rf('h1', '1  Das Kuratorium kann ohne die genannten Unterlagen keine Entscheidung treffen.', 'R'),
                mc('h2', '2  Rückfragen sollen laut Ansage ...', 'über das Portal gestellt werden', 'per privater Mail erfolgen', 'mündlich im Büro geklärt werden', 'a'),
              ],
            },
            {
              label: 'Text 2: Durchsage im Radio',
              transcript:
                'Kurzmeldung aus der Wissenschaftspolitik: Das Bundesministerium kündigte an, die Förderlinie für Grundlagenforschung in den Geistes- und Sozialwissenschaften zu restrukturieren. Vertreterinnen betonten, die Mittel würden nicht gekürzt, sondern stärker an interdisziplinäre Projekte mit gesellschaftlicher Relevanz gebunden. Kritikerinnen warfen der Behörde vor, damit politische Steuerung unter dem Etikett der Relevanz zu betreiben, obwohl die Regierung Transparenz versprochen habe.',
              questions: [
                rf('h3', '3  Kritikerinnen werfen der Behörde politische Steuerung vor.', 'R'),
                mc('h4', '4  Laut Vertreterinnen der Behörde ...', 'werden die Mittel insgesamt gekürzt', 'sollen Mittel stärker interdisziplinär gebunden werden', 'entfällt die Förderung für Sozialwissenschaften', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hören Teil 2\nSie hören einen Text.\nSie hören den Text einmal.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          context: 'Vortrag einer Medizinethikerin über Placebokontrollen.',
          transcript:
            'Meine These lautet: Placebokontrollen bleiben ethisch vertretbar, solange Probandinnen und Probanden nicht schlechter gestellt werden als unter gängiger Therapie. Problematisch wird es dort, wo Studien konstruiert werden, um Effekte nachweisbar zu machen, statt Patientennutzen zu maximieren. In solchen Fällen, so argumentiere ich, verschiebt sich die Forschungslogik von der Heilung zur Signifikanz.\n\nInternational beobachten wir zudem unterschiedliche Standards bei Nachverfolgung sogenannter non-responder. Wer hier Transparenz verweigert, riskiert nicht nur wissenschaftliche, sondern auch reputative Schäden. Dennoch sollten wir uns vor pauschaler Verdammung hüten: Ohne kontrollierte Designs wäre kausale Evidenz in vielen Bereichen kaum erlangbar.',
          questions: [
            mc('h5', '5  Wann sind Placebokontrollen laut Vortrag am ehesten vertretbar?', 'Wenn Probanden schlechter gestellt werden als üblich', 'Wenn niemand schlechter gestellt wird als unter gängiger Therapie', 'Wenn Signifikanz wichtiger ist als Nutzen', 'b'),
            mc('h6', '6  Was kritisiert die Sprecherin an bestimmten Studien?', 'Sie maximieren Patientennutzen zu stark.', 'Sie optimieren eher Signifikanz als Nutzen.', 'Sie verzichten grundsätzlich auf Kontrollgruppen.', 'b'),
            mc('h7', '7  Welche Haltung vertritt die Sprecherin zum Schluss?', 'Kontrollierte Designs sind unverzichtbar, trotz Problemen.', 'Placebokontrollen sollten generell abgeschafft werden.', 'Transparenz bei non-respondern ist irrelevant.', 'a'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hören Teil 3\nSie hören ein Gespräch.\nSie hören das Gespräch einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Forschende über Datenteilung und Publikationsdruck.',
          transcript:
            'A: Ich habe meine Rohdaten veröffentlicht, obwohl das Team dagegen war.\nB: Mutig — aber hast du bedacht, dass andere deine Pipeline zuerst publizieren könnten?\nA: Gerade deshalb finde ich Embargos problematisch; Wissenschaft lebt von Nachprüfbarkeit.\nB: Theoretisch ja, praktisch fördert der Leistungsdruck eher Geheimhaltung bis zur Journal-Anmeldung.\nA: Dann wäre es Aufgabe der Institute, Publikationsmetriken neu zu gewichten.\nB: Idealistisch formuliert, allerdings würde ich mir mehr Unterstützung von Förderern wünschen, statt nur Appelle an Integrität.',
          questions: [
            rf('h8', '8  Person A hat Rohdaten veröffentlicht, obwohl das Team dagegen war.', 'R'),
            rf('h9', '9  Person B lehnt Datenteilung grundsätzlich ab.', 'F'),
            rf('h10', '10  Person A hält Embargos für problematisch.', 'R'),
            rf('h11', '11  Person B sieht Förderer als unbeteiligt an der Integritätsdebatte.', 'F'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hören Teil 4\nSie hören eine Diskussion.\nSie hören die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Podiumsdiskussion: Embryonenforschung unter strikten Auflagen?',
          speakers: ['Moderator/in', 'Prof. Dr. Keller', 'Prof. Dr. Yamamoto'],
          transcript:
            'Moderator: Dürfen Embryonen in frühen Entwicklungsstadien für Forschung genutzt werden, wenn der Nutzen hoch erscheint?\nProf. Dr. Keller: Ein absolutes Verbot würde potenzielle Therapien verzögern, allerdings dürfte es ohne unabhängige Kontrolle und klare Obergrenzen nicht gehen.\nProf. Dr. Yamamoto: Ich halte die moralische Grenze tiefer liegend: Sobald individuelle Entwicklungsfähigkeit plausibel wird, muss Schluss sein, unabhängig vom erwarteten medizinischen Gewinn.\nProf. Dr. Keller: Das klingt konsequent, ignoriert jedoch, dass wir sonst Erkenntnisse exportieren, statt sie ethisch zu regeln.\nModerator: Frau Yamamoto, akzeptieren Sie diese Folge?\nProf. Dr. Yamamoto: Nein, aber ich würde eher internationale Standards erzwingen als national allein Tempo machen.\nProf. Dr. Keller: Dann sind wir uns wenigstens einig, dass Alleingänge problematisch wären.',
          questions: [
            matchSpeaker('h12', '12  Forschung dürfe nur mit unabhängiger Kontrolle und Obergrenzen stattfinden.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h13', '13  Sobald individuelle Entwicklungsfähigkeit plausibel werde, müssen Forschung stoppen.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h14', '14  Internationale Standards seien wichtiger als nationaler Alleingang.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h15', '15  Ein absolutes Verbot würde Therapien verzögern.', ['M', 'F', 'H'], 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '25 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 — Schreiben\nSchreiben Sie eine formelle E-Mail oder einen Brief (circa 170 Wörter).\n\nSie haben Zugang zu einem öffentlich finanzierten Forschungsdatensatz beantragt. Die zuständige Stelle lehnt ab, ohne die Ablehnung zu begründen.\n\n- Führen Sie höflich Ihr Anliegen aus\n- Legen Sie dar, warum der Datensatz für Ihre Arbeit relevant ist\n- Fordern Sie eine schriftliche Begründung und bitten Sie um erneute Prüfung',
          minWords: 170,
          criteria: ['Inhalt (Aufgabenerfüllung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\nmit Schreiben vom 3. Mai beantragte ich Zugang zum Datensatz "Longitudinal Study Cohort 2018-2024" für ein von der Universität gefördertes Projekt zur gesundheitlichen Resilienz. Ihre Ablehnung vom 18. Mai enthält leider keine nachvollziehbare Begründung, obwohl die Daten laut Metadaten für sekundäre Analysen vorgesehen sind.\n\nDer Datensatz ist für meine Dissertation zentral, da ich kausale Zusammenhänge zwischen Prävention und späterer Belastung nur mit dieser Kohorte belastbar untersuchen kann. Eine undifferenzierte Zurückweisung erschwert nicht nur mein Vorhaben, sondern untergräbt auch das Prinzip öffentlicher Forschungsfinanzierung.\n\nIch bitte Sie daher, die Entscheidung schriftlich zu begründen und meinen Antrag erneut zu prüfen. Gerne stelle ich zusätzliche ethische Freigaben bereit.\n\nMit freundlichen Grüßen\nDr. Elena Morales',
          feedback: ['Formeller Ton durchgehend', 'Alle drei Inhaltspunkte', 'Circa 170 Wörter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '35 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 — Schreiben\nSchreiben Sie einen argumentierenden Text (circa 170 Wörter).\n\nIm Forum steht:\n—Reine Wissenschaft muss wertfrei sein und darf sich nicht von gesellschaftlichen Erwartungen leiten lassen."\n\nNehmen Sie Stellung. Begründen Sie Ihre Position, ziehen Sie ein Gegenargument heran und ziehen Sie eine präcise Schlussfolgerung.',
          minWords: 170,
          criteria: ['These und Struktur', 'Argument und Gegenargument', 'Präcise Schlussfolgerung'],
          modelAnswer:
            'Die Forderung nach vollständiger Wertfreiheit erscheint mir als wissenschaftliches Ideal untauglich, weil Forschungsfragen stets aus gesellschaftlichen Kontexten gespeist werden. Wer etwa epidemiologische Studien finanziert, entscheidet implizit, welches Wissen als relevant gilt.\n\nEin Gegenargument lautet, Wertfreiheit schütze vor politischer Instrumentalisierung. Dem ist entgegenzuhalten, dass gerade die Behauptung der Neutralität Machtstrukturen oft unsichtbar lässt.\n\nSchlussfolgernd plädiere ich für transparente Normsetzung: Nicht die Abwesenheit von Werten, sondern deren explizite Reflexion macht Forschung verantwortungsfähig.',
          feedback: ['Akademische Struktur', 'Abstrakte Zitatbezug', 'Circa 170 Wörter'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '20 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 — Schreiben\nSchreiben Sie eine E-Mail (circa 55 Wörter).\n\nSie müssen die Einreichung Ihres Ethikantrags verschieben, weil noch eine Genehmigung der Partnerklinik aussteht.\n\nInformieren Sie die Ethikkommission knapp, nennen Sie den Grund und bitten Sie um Fristverlängerung um zwei Wochen.',
          minWords: 55,
          criteria: ['Formeller Ton', 'Grund und Fristverlängerung', 'Präcision und Knappheit'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\ndie Einreichung meines Antrags Nr. 2026-441 verzögert sich, da die Genehmigung der Partnerklinik noch aussteht. Ich bitte um Fristverlängerung um zwei Wochen und melde mich unverzüglich nach Vorliegen der Unterlagen.\n\nMit freundlichen Grüßen\nTobias Werner',
          feedback: ['Vollständig formell', 'Grund und Bitte klar', 'Circa 55 Wörter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. – Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 — Sprechen\nSie planen mit Ihrem Partner / Ihrer Partnerin eine öffentliche Podiumsdiskussion zum Thema —Gentechnik in der Medizin — Chancen und Grenzen".\nKlären Sie Zielgruppe, Format, Einladung von Expertinnen und ethische Leitlinien.',
          points: ['Zielgruppe und Format festlegen', 'Expertinnen/Einladungen vorschlagen', 'Auf Bedenken reagieren', 'Leitlinien und Ablauf entscheiden'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Ich würde vorschlagen, die Diskussion öffentlich an der Universität anzusiedeln, damit Studierende und die Stadtgesellschaft mitdiskutieren können.\nPartner: Einverstanden, allerdings müssten wir neutral moderieren, um Polarisierung nicht zu verstärken.\nIch: Dann könnten wir eine Medizinethikerin und eine Patientenvertreterin einladen, statt nur Forschende.\nPartner: Sinnvoll. Wie regeln wir Umgang mit provokanten Fragen?\nIch: Wir vereinbaren Leitlinien: sachliche Argumente, keine persönlichen Angriffe, feste Redezeit.\nPartner: Gut, dann übernehme ich die Moderation, wenn du die Einladungen koordinierst.',
          feedback: ['Komplexe Planung', 'Ethische Aspekte berücksichtigt', 'Mindestens fünf Wechsel'],
        },
        {
          teil: 2,
          title: 'Ein Thema präsentieren',
          dauer: 'ca. – Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 — Sprechen\nPräsentieren Sie akademisch strukturiert das Thema —Forschungsintegrität in Zeiten des Publikationsdrucks".\n\n1. Problemstellung\n2. Theoretischer Rahmen\n3. Fallbeispiel\n4. Konsequenzen für Institutionen\n5. Schlussfolgerung',
          points: ['Problemstellung', 'Theoretischer Rahmen', 'Fallbeispiel', 'Institutionelle Konsequenzen', 'Schluss'],
          minWords: 120,
          modelAnswer:
            'Ausgangspunkt meiner Präsentation ist die Spannung zwischen wissenschaftlicher Sorgfalt und quantitativen Leistungsindikatoren. Theoretisch lässt sich dies mit dem Konzept der perversen Anreize beschreiben, das bereits in der Wissenschaftssoziologie diskutiert wurde. Ein aktülles Fallbeispiel ist die nicht reproduzierbare Auswertung hochdimensionaler Datensätze, häufig begleitet von selektiver Berichterstattung signifikanter Ergebnisse. Institutionen sollten deshalb Publikationsmetriken relativieren und Open-Science-Praktiken verbindlich fördern. Abschließend halte ich fest: Integrität entsteht nicht durch Appelle, sondern durch strukturell geänderte Bewertungslogiken.',
          feedback: ['Akademische Fünfteilung', 'Fachvokabular C1', 'Circa 120 Wörter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 — Sprechen\nDiskutieren Sie mit Ihrem Partner / Ihrer Partnerin ein ethisches Dilemma aus der Präsentation.\nGeben Sie Feedback, stellen Sie eine präzise Gegenposition und verteidigen Sie Ihre Haltung.',
          points: ['Differenziertes Feedback', 'Präzise Gegenposition', 'Verteidigung der eigenen Haltung', 'Respektvoller Ton'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Ihre Analyse der Anreizsysteme war überzeugend, wenngleich mir die internationale Dimension zu kurz kam.\nPartner: Welche Dimension meinen Sie?\nIch: Dass Länder mit unterschiedlichen Integritätsstandards im Wettbewerb stehen.\nPartner: Ich würde entgegnen, dass globale Standards ohne souveräne Durchsetzung wirkungslos bleiben.\nIch: Dem stimme ich zu, dennoch wäre ein harmonisiertes Minimum besser als gar keine Koordination.\nPartner: Das lässt sich vertreten, wenn Kontrollmechanismen glaubwürdig sind.',
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
      topic: 'Sprache, Identität und Kultur',
      official: {
        board: 'Goethe-Institut',
        certificate: 'Goethe-Zertifikat C2',
        note: 'Modellsatz (Demo). Struktur nach offiziellem Goethe-Zertifikat C2: großer Deutscher Sprachdiplom (GDS).',
      },
      modules: {
        lesen: { title: 'Lesen', time: '80 Minuten' },
        horen: { title: 'Hören', time: '35 Minuten' },
        schreiben: { title: 'Schreiben', time: '80 Minuten' },
        sprechen: { title: 'Sprechen', time: '15 Minuten (zwei Teilnehmende)' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 1 - Lesen\nLesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
          textTitle: 'Aus: Der verschwiegene Akzent - Essayfragment über Sprache und Zugehörigkeit',
          text:
            'Man sagt, die Muttersprache sei ein Heim. Ich fürchte, sie ist eher ein Haus, in dem man einst wohnte und dessen Türe man verriegelt hat, ohne es zu merken. Die Wörter, die ich als Kind unter der Decke flüsterte, klingen heute fremd - nicht weil sie verloren gingen, sondern weil ich sie aus Höflichkeit nicht mehr ausspreche. Hochdeutsch, so vermute ich, war stets die Sprache der Entschuldigung: der Preis für Zugehörigkeit, den man zuerst freiwillig zahlt und später als Pflicht empfindet.\n\nNicht dass ich das Dialektische romantisiere. Wer nur im Dialekt denkt, schreibt mitunter Prosa, die klangvoll ist und dennoch arm an Abstraktionen - ein Verlust, den ich nicht leugnen mag. Und doch: Was bleibt von einer Landschaft, wenn jede Gemeinde klingt wie jede andere Sendung? Ein akustisches Gedächtnis ohne Echo, würde ich sagen; nur dass die Metapher schon zu sacht ist.\n\nMeine Tante, inzwischen achtzig, verweigert sich dem Altersheim, weil dort das Hochdeutsche dominiert und sie sich beschimpft fühlt, obwohl niemand sie beschimpft. Die Verwaltung nennt das Missverständnis; ich nenne es die unsichtbare Seite der Einheitssprache. Am Ende frage ich mich nicht, ob Identität an Sprache hängt - das tut sie, offenkundig -, sondern wie viel Uniformität wir ertragen, bevor Heimat zur Administration wird.',
          questions: [
            rf('l1', '1  Der Autor behauptet, seine Kindheitswörter seien völlig verschwunden.', 'F'),
            rf('l2', '2  Laut Text empfindet der Autor Hochdeutsch als Preis für gesellschaftliche Zugehörigkeit.', 'R'),
            rf('l3', '3  Der Autor leugnet jede kognitive Einschränkung des dialektgebundenen Denkens.', 'F'),
            rf('l4', '4  Die Verwaltung interpretiert das Verhalten der Tante als persönliches Missverständnis.', 'R'),
            rf('l5', '5  Der Autor bezweifelt grundsätzlich einen Zusammenhang zwischen Sprache und Identität.', 'F'),
            rf('l6', '6  Der Schluss legt nahe, dass zu viel sprachliche Vereinheitlichung Heimat entleert.', 'R'),
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 Minuten',
          instruction:
            'Teil 2 - Lesen\nLesen Sie den Text aus der Presse und die Aufgaben 7 bis 9 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Süddeutsche Zeitung, Feuilleton: Wenn Kultur zum Exportartikel wird',
          text:
            'Die Debatte über den sogenannten Kulturtransfer hat sich in den vergangenen Jahren merklich verschoben: Nicht mehr die Frage, ob deutsche Literatur im Ausland gelesen wird, dominiert, sondern ob sie dort noch als Literatur gelesen wird oder als ethnographisches Fenster. Wer heute im Feuilleton über Identität schreibt, riskiert, für einen Markt produziert zu werden, der Authentizität wie ein Qualitätssiegel handelt.\n\nDass Migrationserfahrungen erzählbar sind, versteht sich von selbst; weniger selbstverständlich ist, dass der Erwartungsdruck, die eigene Biografie als Beweisstück zu liefern, die Form verändert. Einige Autorinnen reagieren mit ironischer Übertreibung, andere ziehen sich ins Allgemeine zurück - beides kann als Flucht gelesen werden, obwohl es unterschiedliche Strategien markiert.\n\nKritisch zu fragen bleibt, inwieweit Förderprogramme, die explizit nach Herkunft kategorisieren, gerade jene Vielfalt einengen, die sie sichtbar machen wollen. Die Kulturpolitik mag das als pragmatischen Kompromiss feiern; die Literatur, so dürfte man vermuten, bezahlt den Preis in einer Sprache, die ständig erklären muss, statt einfach zu sein.\n\nAm Ende geht es nicht um weniger Migration in den Büchern, sondern um mehr Freiheit darin, welche Geschichten als universal gelten dürfen - ohne dass Universalität wieder nur als westeuropäische Norm erscheint.',
          questions: [
            mc(
              'l7',
              '7  Welche Verschiebung der Debatte beschreibt der Text am Anfang?',
              'Es geht zunehmend darum, ob ausländische Leser deutsche Autoren verstehen.',
              'Es geht zunehmend darum, ob Texte als Literatur oder als ethnographisches Fenster gelesen werden.',
              'Es geht zunehmend darum, ob Migrationsliteratur verboten werden soll.',
              'b'
            ),
            mc(
              'l8',
              '8  Wie ist die Haltung des Autors zu Förderprogrammen mit Herkunftskategorien am ehesten zu fassen?',
              'Er lehnt sie grundsätzlich als rassistisch ab.',
              'Er sieht in ihnen ein paradoxes Risiko der Einengung trotz Vielfaltsziel.',
              'Er hält sie für die einzige realistische Lösung des Marktproblems.',
              'b'
            ),
            mc(
              'l9',
              '9  Was impliziert der Schlusssatz über Universalität?',
              'Universalität dürfe nur westeuropäisch definiert werden.',
              'Mehr Freiheit bedeute auch, Universalität nicht erneut als verdeckte Norm zu missbrauchen.',
              'Migration solle aus der Literatur verschwinden, um Universalität zu retten.',
              'b'
            ),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 3 - Lesen\nLesen Sie die Situationen 10 bis 14 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie können jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
          ads: [
            {
              key: 'A',
              title: 'Leibniz-Zentrum für Allgemeine Sprachwissenschaft',
              text: 'Forschungsstelle zur Grammatikalisierung im Sprachwandel. Veröffentlichung einer Monographie zu Kontaktphönomenen im Rheinland. Nur für Fachpublikum.',
            },
            {
              key: 'B',
              title: 'Deutscher Übersetzerfonds - Stipendium',
              text: 'Förderung literarischer Übersetzungen aus dem Arabischen ins Deutsche. Jury legt Wert auf kulturelle Kontextualisierung und pötische Präzision.',
            },
            {
              key: 'C',
              title: 'UNESCO - Verzeichnis immaterielles Kulturerbe',
              text: 'Nominierungsverfahren für lebendige Überlieferungen, darunter mündliche Erzähltraditionen und Rituale. Politische und rechtliche Begleitdokumentation.',
            },
            {
              key: 'D',
              title: 'Institut für Deutsche Sprache - Dialektatlas',
              text: 'Crowdsourcing-Projekt zur Erfassung aussterbender Ortsmundarten. Freiwillige tragen Audioaufnahmen bei; keine literarische Übersetzung.',
            },
            {
              key: 'E',
              title: 'Sommerseminar Philosophie der Sprache',
              text: 'Intensivkurs zu Wittgenstein, Sprechakttheorie und Bedeutungspragmatik. Voraussetzung: abgeschlossenes Philosophiestudium oder gleichwertige Publikationen.',
            },
            {
              key: 'F',
              title: 'Volkschörschule - Integrationskurs B2',
              text: 'Alltagsorientierter Deutschunterricht mit Fokus auf Arbeitsmarkt und Verwaltung. Keine literarisch-philosophische Spezialisierung.',
            },
          ],
          questions: [
            matchAd('l10', '10  Eine Literaturwissenschaftlerin übersetzt zeitgenössische Lyrik aus dem Maghreb und sucht finanzielle Unterstützung.', ['A', 'B', 'C', 'D', 'E', '0'], 'B'),
            matchAd('l11', '11  Eine Ethnologin dokumentiert eine mündliche Erzähltradition für ein internationales Schutzverfahren.', ['A', 'B', 'C', 'D', 'E', '0'], 'C'),
            matchAd('l12', '12  Ein Philosoph verfasst eine Habilitation über performative Äusserungsakte und benötigt vertiefte Fachtexte.', ['A', 'B', 'C', 'D', 'E', '0'], 'E'),
            matchAd('l13', '13  Ein Sprachwissenschaftler analysiert Kontaktphönomene zwischen Mundart und Standardsprache in einer Region.', ['A', 'B', 'C', 'D', 'E', '0'], 'A'),
            matchAd('l14', '14  Ein Verein sammelt Audioaufnahmen bedrohter Ortsdialekte von freiwilligen Sprecherinnen.', ['A', 'B', 'C', 'D', 'E', '0'], 'D'),
          ],
        },
        {
          teil: 4,
          arbeitszeit: '10 Minuten',
          instruction:
            'Teil 4 - Lesen\nLesen Sie die Meinungen 15 bis 18.\nWelche Überschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
          textTitle: 'Forum: Soll Literatur Dialekt bewusst bewahren oder der Standardsprache weichen?',
          text:
            'Meinung 15 - Prof. Dr. Lehmann, 58, Literaturwissenschaft:\nDialekt ist kein Museum, sondern lebendige Prosodie. Wer ihn nur als Folklore buhnt, entwertet ihn; wer ihn literarisch ernst nimmt, öffnet Räume, die Hochdeutsch nicht besitzt. Die Frage ist nicht Ob, sondern Wie.\n\nMeinung 16 - Aylin, 31, Herausgeberin:\nIch verlange keine Verdammung des Dialekts, wohl aber Transparenz: Viele Leserinnen Außerhalb der Region bleiben ausgeschlossen, wenn Autoren sich der Verständlichkeit entziehen, um Authentizität zu simulieren.\n\nMeinung 17 - Thomas, 44, Autor:\nMeine Heimat klingt anders als mein Verlag es erträgt. Ich schreibe deshalb zweispurig - im Entwurf im Dialekt, in der Fassung im Hochdeutschen - und verliere dabei, offen gestanden, mehr, als ich gewinnen kann.\n\nMeinung 18 - Dr. Farah Nouri, 39, Kulturpolitik:\nFörderlogiken, die Dialekt als Identitätsersatz markieren, übersehen, dass Bildungschancen oft an Standardsprache gekoppelt sind. Ästhetik darf nicht zur sozialen Schranke werden.',
          ads: [
            { key: 'a', title: 'Dialekt als lebendige, nicht museale Ressource', text: '' },
            { key: 'b', title: 'Standardsprache als verdeckte soziale Schranke', text: '' },
            { key: 'c', title: 'Zweispuriges Schreiben als existentieller Verlust', text: '' },
            { key: 'd', title: 'Exklusion durch simulierte Authentizität', text: '' },
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
            'Teil 5 - Lesen\nLesen Sie den Text und die Aufgaben 19 bis 21.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          textTitle: 'Hessisches Kulturförderungsgesetz - Auszug zur Sprach- und Kulturvermittlung',
          text:
            'Förderungswürdig im Sinne dieses Gesetzes sind Vorhaben, die die lebendige Verwendung regionaler und Minderheitensprachen nachweislich stärken, sofern sie nicht ausschließlich kommerziellen Zwecken dienen und eine öffentliche Zugänglichkeit gewährleisten. Als öffentlich zugänglich gilt eine Veranstaltung nur dann, wenn sie ohne Mitgliedschaftsbeschränkung besucht werden kann; rein digitale Formate genügen nur, wenn barrierefreie Zugangswege daürhaft dokumentiert sind.\n\nAnträge sind bis zum 15. Januar des laufenden Förderjahres einzureichen; verspätete Anträge werden nur berücksichtigt, wenn der Antragsteller glaubhaft macht, dass die Verzögerung Außerhalb seines Einflussbereichs lag und das Vorhaben ohne vorzeitige Bewilligung nicht mehr durchführbar wäre.\n\nAusnahmen von der Zugänglichkeitsklausel sind für wissenschaftliche Fachveranstaltungen zulässig, deren Erkenntnisgewinn primär der Fachcommunity dient, sofern die Ergebnisse innerhalb von 24 Monaten in einer für Laien verständlichen Form veröffentlicht werden; andernfalls ist die Förderung rückzahlungspflichtig.',
          questions: [
            mc(
              'l19',
              '19  Welches Vorhaben erfüllt die Förderungsvoraussetzungen am ehesten?',
              'Ein rein kommerzielles Dialektfestival ohne öffentlichen Zugang.',
              'Ein öffentlich zugängliches Projekt zur Stärkung einer Minderheitensprache ohne rein kommerziellen Zweck.',
              'Jede digitale Veranstaltung, unabhängig von Barrierefreiheit.',
              'b'
            ),
            mc(
              'l20',
              '20  Was impliziert die Regelung zu verspäteten Anträgen?',
              'Verspätete Anträge werden grundsätzlich abgelehnt, ohne Ausnahme.',
              'Sie können nur unter engen Voraussetzungen noch berücksichtigt werden.',
              'Verspätung ist immer hinnehmbar, wenn das Projekt wissenschaftlich ist.',
              'b'
            ),
            mc(
              'l21',
              '21  Wann ist eine Ausnahme von der Zugänglichkeitsklausel zulässig?',
              'Bei jeder Veranstaltung mit Eintritt.',
              'Bei Fachveranstaltungen, sofern Laienverständliche Veröffentlichung innerhalb von 24 Monaten erfolgt.',
              'Wenn die Förderung bereits ausgezahlt wurde.',
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
            'Hören Teil 1\nSie hören zwei kurze Texte.\nSie hören jeden Text zweimal.\nWählen Sie bei jeder Aufgabe die richtige Lösung.',
          segments: [
            {
              label: 'Text 1: Anrufbeantworter',
              transcript:
                'Guten Tag, Sie erreichen das Sekretariat des Instituts für Kulturanthropologie. Ihre Bewerbung für das Gastprofessorenprogramm wurde dem Kuratorium vorgelegt. Bitte reichen Sie bis Freitag, 16 Uhr, ein zweiseitiges Konzept zur Vermittlung von Kulturbegriffen in mehrsprachigen Kontexten nach. Ohne dieses Konzept kann die Jury nicht tagen. Rückfragen bitte ausschließlich über das Bewerbungsportal - nicht per privater Nachricht an einzelne Kuratorinnen.',
              questions: [
                rf('h1', '1  Die Jury kann ohne das Konzept nicht tagen.', 'R'),
                mc('h2', '2  Rückfragen sollen laut Ansage ...', 'über das Bewerbungsportal gestellt werden', 'per privater Nachricht an Kuratorinnen erfolgen', 'mündlich im Sekretariat geklärt werden', 'a'),
              ],
            },
            {
              label: 'Text 2: Kulturmagazin im Radio',
              transcript:
                'Im Feuilleton wird seit Wochen über sogenannte reine Hochsprache debattiert. Befürworter betonen, sie schütze Bildungsgerechtigkeit; Gegner werfen ihr vor, sie diene als verdecktes Ausschlusskriterium. Was auffällt: Beide Seiten sprechen selten von Literatur, fast immer von Verwaltung. Die Moderatorin merkt an, die Debatte klinge deshalb nach Symptombehandlung - nicht nach der Frage, wer das Recht habe, Sprache zu normieren.',
              questions: [
                rf('h3', '3  Die Moderatorin kritisiert, dass die Debatte das Normierungsrecht selten thematisiert.', 'R'),
                mc('h4', '4  Was lässt sich über den Ton der Moderatorin schließen?', 'Sie hält die Debatte für grundsätzlich unnötig.', 'Sie sieht in der Debatte vor allem oberflächliche Symptomdiskussion.', 'Sie lehnt Hochsprache vollständig ab.', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 1,
          instruction:
            'Hören Teil 2\nSie hören einen Text.\nSie hören den Text einmal.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
          context: 'Vortrag einer Sprachphilosophin über Bedeutung und Gemeinschaft.',
          transcript:
            'Wittgenstein, so lese ich ihn, warnt nicht vor Sprache an sich, sondern vor der Illusion, Bedeutung sei ein private Besitz. Wer Identität ausschließlich im Wortschatz sucht, übersieht die Formen des Lebens, in denen Worte erst ihre Funktion erhalten. Das erklärt, warum Übersetzen mehr ist als Austausch von Lexemen: Es ist der Versuch, eine fremde Lebensform verhandelbar zu machen, ohne sie zu vereinnahmen.\n\nKritisch sehe ich dennoch die Mode, jede kulturelle Differenz als untübersetzbar zu feiern. Untübersetzbarkeit kann zur Bequemlichkeit werden - zur Ausrede, nicht zu hören. Gerade deshalb brauchen wir Übersetzerinnen, die präzise sind, nicht pötisch im Sinne des Vernebelns.',
          questions: [
            mc('h5', '5  Was ist laut Vortrag die zentrale Warnung Wittgensteins?', 'Vor Sprache als solcher.', 'Vor der Illusion privater Bedeutung Außerhalb gelebter Formen.', 'Vor jeder Form von Übersetzung.', 'b'),
            mc('h6', '6  Wie charakterisiert die Sprecherin die Feier der Untübersetzbarkeit?', 'Als notwendigen Schutz kultureller Autonomie.', 'Als mögliche Bequemlichkeit, die Zuhören vermeidet.', 'Als wissenschaftlich bewiesene Tatsache.', 'b'),
            mc('h7', '7  Welche Haltung vertritt die Sprecherin zu Übersetzerinnen?', 'Sie sollen vor allem pötisch vernebeln.', 'Sie sollen präzise sein und nicht vereinnahmen.', 'Sie sollen kulturelle Differenz absolut machen.', 'b'),
          ],
        },
        {
          teil: 3,
          plays: 1,
          instruction:
            'Hören Teil 3\nSie hören ein Gespräch.\nSie hören das Gespräch einmal.\nSind die Aussagen Richtig oder Falsch?',
          context: 'Zwei Literaturkritikerinnen über Ansprache und kulturelle Sensibilität.',
          transcript:
            'A: Ich finde, manche Verlage überkorrigieren Dialektpassagen, um Skandale zu vermeiden.\nB: Verständlich - aber riskieren sie nicht, damit genau die Stimme zu glatten, die sie sichtbar machen wollten?\nA: Sichtbar machen und verständlich machen sind nicht dasselbe; ich würde eher Fußnoten als Glattung wählen.\nB: Fußnoten können aber auch museumhaft wirken, als stünde der Dialekt unter Glas.\nA: Dann bleibt nur ehrliche Edition mit Glossar - teuer, aber redlich.\nB: Redlich, ja; ob der Markt das honorieren wird, wage ich zu bezweifeln.',
          questions: [
            rf('h8', '8  Person A wirft Verlagen vor, Dialekt aus Angst vor Skandalen zu glätten.', 'R'),
            rf('h9', '9  Person B lehnt jede Form der Verständlichmachung grundsätzlich ab.', 'F'),
            rf('h10', '10  Person A schlägt Fußnoten einer vollständigen Glattung vor.', 'R'),
            rf('h11', '11  Person B ist überzeugt, der Markt werde redliche Editionen bevorzugen.', 'F'),
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Hören Teil 4\nSie hören eine Diskussion.\nSie hören die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
          context: 'Podiumsdiskussion: Mehrsprachigkeit in der Schule - Chance oder Belastung?',
          speakers: ['Moderator/in', 'Prof. Dr. Lang', 'Dr. Özdemir'],
          transcript:
            'Moderator: Soll die Schule mehrere Sprachen gleichberechtigt fördern, auch wenn das Curriculum enger wird?\nProf. Dr. Lang: Bildungspolitik darf Mehrsprachigkeit nicht nur als Defizit lesen. Wer früh zwischen Sprachregistern wechseln lernt, gewinnt kognitive Flexibilität - vorausgesetzt, Standardsprache wird nicht vernachlässigt.\nDr. Özdemir: Ich stimme der Flexibilität zu, misstraü jedoch der Romantisierung: Nicht jede Familie kann drei Sprachen stabil pflegen. Ohne strukturelle Unterstützung wird Mehrsprachigkeit zur Privilegfrage.\nProf. Dr. Lang: Dann brauchen wir mehr Förderung, nicht weniger Sprachen.\nDr. Özdemir: Förderung ja, aber bitte ohne kulturelle Zuschreibungen, die Kinder als Repräsentanten ihrer Herkunft instrumentalisieren.\nProf. Dr. Lang: Einverstanden - Kinder sind keine Botschafter, sie sind Lernende.',
          questions: [
            matchSpeaker('h12', '12  Mehrsprachigkeit ohne strukturelle Unterstützung werde zur Privilegfrage.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h13', '13  Standardsprache dürfe bei Mehrsprachigkeitsförderung nicht vernachlässigt werden.', ['M', 'F', 'H'], 'F'),
            matchSpeaker('h14', '14  Kinder sollten nicht als kulturelle Repräsentanten instrumentalisiert werden.', ['M', 'F', 'H'], 'H'),
            matchSpeaker('h15', '15  Es werde mehr Förderung statt weniger Sprachen benötigt.', ['M', 'F', 'H'], 'F'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '25 Minuten',
          fieldId: 'write1',
          task:
            'Aufgabe 1 - Schreiben\nSchreiben Sie einen Brief oder eine E-Mail in informell-gebildetem Register (circa 190 Wörter).\n\nSie haben in einer Literaturzeitschrift einen Essay über "Sprachverlust und Heimatgefühl" gelesen, mit dem Sie teils uneins sind.\n\n- Beziehen Sie sich auf den Essay und nennen Sie ein konkretes Beispiel aus Ihrer Erfahrung\n- Erklären Sie Ihre Kritik oder Zustimmung mit Nuancen\n- Schließen Sie mit einer persönlichen, aber präzisen Einschätzung',
          minWords: 190,
          criteria: ['Informell-gebildeter Ton', 'Nuancierte Stellungnahme', 'Konkretes Beispiel'],
          modelAnswer:
            'Liebe Redaktion,\n\neuer Essay "Sprachverlust und Heimatgefühl" hat mich lange begleitet - nicht weil ich ihm folgen konnte, sondern weil er mir zu elegisch erscheint. Wenn der Autor den Akzent als verlorenes Paradies malt, übersieht er, dass viele von uns ihn absichtlich ablegen, um nicht ständig erklärt zu werden.\n\nIn meiner Familie klingt das Schwäbische nur noch im Streit authentisch; im Büro wechseln wir zur Verwaltungssprache, ohne deshalb heimatlos zu sein. Heimat, finde ich, liegt nicht im Klang allein, sondern in der Wahl, wann man welche Sprache zulässt.\n\nGleichwohl stimme ich zu, dass Uniformität etwas auslöscht. Nur wäre die Konsequenz für mich nicht Nostalgie, sondern bewusste Mehrsprachigkeit: Dialekt pflegen, wo er lebt, und ihn nicht als Folklore exportieren.\n\nHerzlich\nMira K.',
          feedback: ['Informell-gebildet', 'Nuancierte Kritik und Zustimmung', 'Circa 190 Wörter'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '35 Minuten',
          fieldId: 'write2',
          task:
            'Aufgabe 2 - Schreiben\nSchreiben Sie einen argumentierenden Text in akademischem Register (circa 190 Wörter).\n\nIm Seminar wurde zitiert:\n"Die Sprache ist das Haus des Seins." (Martin Heidegger, Der Ursprung des Kunstwerks)\n\nNehmen Sie Stellung: Inwieweit lässt sich Identität sprachlich fassen? Begründen Sie, ziehen Sie ein Gegenargument heran und formulieren Sie eine präzise Schlussfolgerung.',
          minWords: 190,
          criteria: ['Akademische Argumentation', 'Zitatbezug', 'Gegenargument und Schluss'],
          modelAnswer:
            'Heideggers Metapher suggeriert, Identität sei in Sprache wohnhaft, nicht neben ihr. Dem ist insofern zuzustimmen, als soziale Anerkennung oft an kommunikative Kompetenz gekoppelt ist: Wer nicht in der dominanten Sprache argumentieren kann, wird leicht unsichtbar.\n\nGegenargument: Identität ist nicht nur diskursiv, sondern auch praktisch und körperlich verankert - etwa in Ritualen, die sich der sprachlichen Fixierung entziehen. Wer Heidegger wörtlich liest, riskiert einen Linguistic Turn ohne Leib.\n\nSchlussfolgernd halte ich fest: Sprache ist ein zentrales, nicht das einzige Haus des Seins. Kulturpolitik sollte deshalb Mehrsprachigkeit fördern, ohne andere Identitätsformen zu entwerten.',
          feedback: ['Akademisches Register', 'Heidegger-Bezug mit Gegenargument', 'Circa 190 Wörter'],
        },
        {
          aufgabe: 3,
          arbeitszeit: '20 Minuten',
          fieldId: 'write3',
          task:
            'Aufgabe 3 - Schreiben\nSchreiben Sie eine E-Mail in formell-institutionellem Register (circa 65 Wörter).\n\nSie vertreten ein Kulturinstitut und müssen eine bereits angekündigte Lesung verschieben, weil die übersetzerische Genehmigung noch aussteht.\n\nInformieren Sie das Publikum knapp, nennen Sie den Grund und nennen Sie den neuen Termin (15. November, 19 Uhr).',
          minWords: 65,
          criteria: ['Formell-institutionell', 'Grund und neuer Termin', 'Präzision'],
          modelAnswer:
            'Sehr geehrte Damen und Herren,\n\ndie für den 28. Oktober geplante Lesung muss verschoben werden, da die übersetzerische Genehmigung noch aussteht. Der Ersatztermin ist der 15. November, 19 Uhr, im gleichen Saal. Wir bitten um Verständnis.\n\nMit freundlichen Grüßen\nInstitut für Gegenwartsliteratur',
          feedback: ['Institutioneller Ton', 'Grund und Termin klar', 'Circa 65 Wörter'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Gemeinsam etwas planen',
          dauer: 'ca. 3-4 Minuten',
          fieldId: 'speak1',
          situation:
            'Teil 1 - Sprechen\nSie planen mit Ihrem Partner / Ihrer Partnerin eine öffentliche Podiumsdiskussion zum Thema "Sprache als kulturelles Erbe - Bewahren oder Reformieren?".\nKlären Sie Zielgruppe, Format, Einladungen und Umgang mit kontroversen Positionen.',
          points: ['Zielgruppe und Format', 'Einladungen und Perspektiven', 'Kontroversen moderieren', 'Gemeinsamer Ablauf'],
          minExchanges: 5,
          modelAnswer:
            'Ich: Ich würde die Diskussion an einer Universität ansetzen, aber explizit auch Schulen und Vereine einladen, damit es nicht elitär wirkt.\nPartner: Einverstanden, allerdings brauchen wir klare Regeln, wenn es um Dialekt versus Hochsprache emotional wird.\nIch: Dann laden wir eine Sprachwissenschaftlerin, eine Autorin und eine Schülervertreterin ein - möglichst ohne reine Repräsentantenrollen.\nPartner: Wie vermeiden wir, dass Migrantinnen nur als Beispiel dienen?\nIch: Indem wir nach Argumenten fragen, nicht nach Biografien. Moderation mit festen Redezeiten und Nachfragen zur Sache.\nPartner: Gut, ich übernehme die Moderation, wenn du die Einladungen koordinierst.',
          feedback: ['Kulturell-philosophisches Thema', 'Nuancierte Planung', 'Mindestens fünf Wechsel'],
        },
        {
          teil: 2,
          title: 'Ein Thema präsentieren',
          dauer: 'ca. 3-4 Minuten',
          fieldId: 'speak2',
          situation:
            'Teil 2 - Sprechen\nPräsentieren Sie akademisch strukturiert das Thema "Mehrsprachigkeit und demokratische Teilhabe".\n\n1. Problemstellung\n2. Theoretischer Rahmen\n3. Fallbeispiel\n4. Politische Konsequenzen\n5. Schlussfolgerung',
          points: ['Problemstellung', 'Theoretischer Rahmen', 'Fallbeispiel', 'Politische Konsequenzen', 'Schluss'],
          minWords: 130,
          modelAnswer:
            'Ausgangspunkt ist die Spannung zwischen formeller Gleichheit und linguistischer Ungleichheit: Wer nur in einer Minderheitensprache politisch argumentieren kann, partizipiert faktisch weniger. Theoretisch lässt sich dies mit Bourdieus Konzept des kulturellen Kapitals fassen, ergänzt um aktülle Debatten zur Sprachgerechtigkeit. Als Fallbeispiel dient ein Kommunalparlament, in dem Dolmetschen zwar angeboten, aber nicht verbindlich finanziert wird. Politische Konsequenz wäre eine Rechtsverbindlichkeit linguistischer Zugänglichkeit, ohne Minderheitensprachen zu musealisieren. Abschließend: Demokratie braucht nicht Einsprachigkeit, sondern institutionell abgesicherte Mehrsprachigkeit.',
          feedback: ['Akademische Fünfteilung', 'Fachvokabular C2', 'Circa 130 Wörter'],
        },
        {
          teil: 3,
          title: 'Feedback geben',
          dauer: 'ca. 3 Minuten',
          fieldId: 'speak3',
          situation:
            'Teil 3 - Sprechen\nDiskutieren Sie mit Ihrem Partner / Ihrer Partnerin die Frage, ob Literatur moralisch verpflichtet sein kann, Minderheiten "authentisch" darzustellen.\nGeben Sie differenziertes Feedback, formulieren Sie eine präzise Gegenposition und verteidigen Sie Ihre Haltung.',
          points: ['Differenziertes Feedback', 'Präzise Gegenposition', 'Verteidigung der Haltung', 'Respektvoller Ton'],
          minExchanges: 4,
          modelAnswer:
            'Ich: Ihre Analyse der Sprachgerechtigkeit war scharf, wenngleich mir die ästhetische Dimension zu kurz kam.\nPartner: Meinen Sie, Autoren dürften sich jeder Verantwortung entziehen?\nIch: Nicht entziehen, aber Literatur ist keine Ethikkommission. Authentizitätszwang produziert Klischees.\nPartner: Ich würde entgegnen, dass Schweigen strukturelle Ausgrenzung reproduziert.\nIch: Stimmt für den Kanon, doch Zwang zur Repräsentation macht Minderheiten zu Dienstleistern der Mehrheit.\nPartner: Dann brauchen wir mehr Redaktionsvielfalt, nicht weniger Anspruch.\nIch: Genau dort wäre ich bereit, meine Position zu modifizieren.',
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
        'Teil 1\nLesen Sie den Text und die Aufgaben 1 bis 4 dazu.\nWählen Sie: Sind die Aussagen Richtig oder Falsch?',
      textTitle: 'SusannesAlltagsBlog.at - Mein Alltag, meine Gedanken, mein Leben',
      text:
        'Donnerstag, den 23. Juni\n\nWas mir heute passiert ist, das glaubt mir keiner: Als ich zu Mittag in der Küche stand, läutete mein Handy. Eine Fraünstimme erklärte mir, dass meine Brieftasche in der Bankfiliale abgegeben worden war. Mir wurde heiss - mir war noch gar nicht aufgefallen, dass sie fehlte.\n\nIch machte mich auf den Weg zur Bank. Dort teilte mir die Mitarbeiterin mit, dass ein junger Mann die Brieftasche auf dem Parkplatz vor dem Supermarkt gefunden hatte. Zum Glück war alles noch da!\n\nNun weiss ich leider nicht, wie ich dem ehrlichen Finder danken kann. Vielleicht liest er ja diesen Blogeintrag: Vielen, vielen Dank, lieber Finder!\n\nBis bald, eure Susanne',
      questions: [
        rf('l1', '1  Erst durch den Anruf bemerkte Susanne das Fehlen ihrer Brieftasche.', 'R'),
        rf('l2', '2  Susanne glaubte, die Brieftasche beim Bezahlen vergessen zu haben.', 'F'),
        rf('l3', '3  Der Finder brachte die Brieftasche ins Fundbüro.', 'F'),
        rf('l4', '4  In Susannes Brieftasche fehlte nichts.', 'R'),
      ],
    });

    if (cfg.lesenParts < 2) return parts;

    parts.push({
      teil: 2,
      arbeitszeit: '20 Minuten',
      instruction:
        'Teil 2\nLesen Sie den Text aus der Presse und die Aufgaben 5 bis 7 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
      textTitle: 'aus einer deutschen Zeitung: Ein Dorf für grüne Energie',
      text:
        'Das Dorf Feldheim in Brandenburg macht sich unabhängig von Öl und Kohle. Seit Kurzem deckt das Dorf seinen kompletten Strombedarf durch moderne Energien. Die Bio-Gasanlage erzeugt jährlich doppelt so viel Strom wie die Gemeinde verbraucht. Entstanden ist die Idee an der Universität Göttingen. Ziel der Wissenschaftler war es zu zeigen, dass ein Dorf komplett mit erneuerbaren Energien versorgt werden kann. Passt das Konzept auch für andere Dörfer? Im Prinzip schon, meint Eckhard Meier - man benötigt vor allem aktive und begeisterte Einwohner!',
      questions: [
        mc('l5', '5  In diesem Text geht es um ...', 'eine neue Technologie', 'umweltfreundliche Stromproduktion', 'einen Studiengang', 'b'),
        mc('l6', '6  Die Wissenschaftler wollten zeigen, dass ...', 'ein ganzes Dorf von modernen Energien leben kann', 'eine Anlage mehr Strom produziert als nötig', 'man Strom sparen kann', 'a'),
        mc('l7', '7  Damit die Idee in anderen Dörfern funktioniert, ...', 'benötigt man viel Geld', 'braucht man genug Platz', 'muss die Bevölkerung dafür sein', 'c'),
      ],
    });

    if (cfg.lesenParts < 3) return parts;

    parts.push({
      teil: 3,
      arbeitszeit: '10 Minuten',
      instruction:
        'Teil 3\nLesen Sie die Situationen 8 bis 10 und die Anzeigen A bis D.\nWelche Anzeige passt? Wählen Sie a, b, c, d oder 0 (keine passende Anzeige).',
      ads: [
        { key: 'a', title: 'Deutsch im Internet', text: 'Lernen Sie Deutsch online. 10 Kurslektionen, Grammatik, Übungen - gratis auf www.sprachenlernen.de' },
        { key: 'b', title: 'Deutsch erLesen', text: 'Magazin mit Originalartikeln aus der deutschen Presse. Monatlich. Probeexemplar: info@deutsch-erlesen.de' },
        { key: 'c', title: 'Job und Sprache-Net', text: 'Jobs für Deutschlernende in DE, AT, CH. Hotel und Restaurant. Juni bis August. www.jobundsprache-net.com' },
        { key: 'd', title: 'Deutsch in der Schweiz', text: 'Intensivkurse, Schreibkurse, Sommerkurse. Nur Tageskurse! www.deutschinderschweiz.ch' },
      ],
      questions: [
        match('l8', '8  Maria möchte am Computer Deutsch lernen.', ['a', 'b', 'c', 'd', '0'], 'a'),
        match('l9', '9  Leon möchte im Sommer im Tourismus arbeiten.', ['a', 'b', 'c', 'd', '0'], 'c'),
        match('l10', '10  Mirjeta möchte sich regelmäßig über Nachrichten aus Deutschland informieren.', ['a', 'b', 'c', 'd', '0'], 'b'),
      ],
    });

    if (cfg.lesenParts < 4) return parts;

    parts.push({
      teil: 4,
      arbeitszeit: '15 Minuten',
      instruction:
        'Teil 4\nLesen Sie die Meinungen 11 bis 13.\nIst die Person für ein Verbot von Gewaltspielen? Wählen Sie Ja oder Nein.',
      textTitle: 'Leserbriefe: Verbot von Killerspielen?',
      text:
        'Niko, 52: Durch solche Spiele kann viel Unglück entstehen, die müssen weg!\n\nStefan, 19: Warum verbieten, wenn es sowieso alle spielen und ein Verbot das Spiel interessanter macht?\n\nKathleen, 49: Die Einstellung dahinter ist Ausdruck einer unglaublichen Gleichgültigkeit. Das muss man stoppen.',
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
        'Teil 5\nLesen Sie die Aufgaben 14 bis 16 und den Text dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
      textTitle: 'HAUSORDNUNG - Berufsbildungszentrum Dresden',
      text:
        'Parkplätze: Auf dem Schulareal stehen keine Gratis-Autoparkplätze zur Verfügung. Fahrräder müssen in den dafür vorgesehenen Fahrradkeller gebracht und abgeschlossen werden.\n\nOrdnung: In sämtlichen Räumen ist auf Ordnung und Sauberkeit zu achten. Außerhalb der Unterrichtszeiten dürfen sich Lernende nicht in den Klassenräumen aufhalten.\n\nAlkohol: Der Konsum von Alkohol ist auf dem gesamten Schulareal verboten. In Ausnahmefällen kann die Schulleitung den Konsum erlauben.',
      questions: [
        mc('l14', '14  Schüler ...', 'dürfen keine Fahrräder mitbringen', 'müssen Fahrräder in einen speziellen Raum stellen', 'dürfen Fahrräder auf den Hof stellen', 'b'),
        mc('l15', '15  Für die Klassenräume gilt:', 'Schüler dürfen keine Poster aufhängen', 'Schüler müssen dort selber aufräumen', 'Schüler können nach dem Unterricht dort lernen', 'a'),
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
        'Hören Teil 1\nSie hören zwei kurze Texte. Sie hören jeden Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung.',
      segments: [
        {
          label: 'Text 1: Anrufbeantworter',
          transcript:
            'Hallo Frau Stein, hier ist die Praxis Dr. Becker. Es geht um Ihre Grippe-Impfung. Könnten Sie vielleicht am Freitag um 14 Uhr kommen? Geben Sie mir bitte heute noch Bescheid. Ach, und Ihre Chipkarte ist bei uns - Sie haben sie letztes Mal vergessen.',
          questions: [
            rf('h1', '1  Der Termin von Frau Stein wird verschoben.', 'R'),
            mc('h2', '2  Frau Stein soll ...', 'die Chipkarte mitbringen', 'zehn Euro bezahlen', 'zurückrufen', 'a'),
          ],
        },
        {
          label: 'Text 2: Durchsage im Radio',
          transcript:
            'Achtung Autofahrer. Auf der Autobahn A8 Richtung München zwischen Eschenried und Dachau hat sich ein Unfall ereignet. Der rechte Fahrstreifen ist blockiert. Im Stadtgebiet München kommt es wegen starken Berufsverkehrs zu Behinderungen.',
          questions: [
            rf('h3', '3  Auf der Autobahn gibt es Stau wegen eines Unfalls.', 'R'),
            mc('h4', '4  Im Stadtgebiet München gibt es Stau wegen ...', 'einer Baustelle', 'des Berufsverkehrs', 'eines Unfalls', 'b'),
          ],
        },
      ],
    });

    if (cfg.horenParts < 2) return parts;

    parts.push({
      teil: 2,
      plays: 1,
      instruction:
        'Hören Teil 2\nSie hören einen Text. Sie hören den Text einmal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
      context: 'Sie nehmen an einer Führung durch das Münchner Stadtmuseum teil.',
      transcript:
        'Ich freü mich, Sie heute zu dieser Führung begrüßen zu dürfen. Wir haben Glück - wegen des schönen Wetters sind die meisten Leute im Biergarten, und wir haben das Museum fast für uns. Unser Rundgang daürt ungefähr zweieinhalb Stunden. Wir besuchen zuerst die Hauptausstellung. Um 16 Uhr treffen wir uns wieder im Eingangsbereich. Viele verbinden mit München das Oktoberfest, aber München ist noch viel mehr. Im Anschluss empfiehlt sich ein Besuch in einem der schönen Biergärten.',
      questions: [
        mc('h5', '5  Das Museum ist ...', 'sehr voll', 'teilweise geschlossen', 'ziemlich leer', 'c'),
        mc('h6', '6  Was zeigt der Museumsführer zuerst?', 'alle Ausstellungen', 'die Hauptausstellung', 'nur die Sonderausstellung', 'b'),
        mc('h7', '7  Wo ist der Treffpunkt am Nachmittag?', 'am Eingang', 'an der Garderobe', 'im Cafe', 'a'),
      ],
    });

    if (cfg.horenParts < 3) return parts;

    parts.push({
      teil: 3,
      plays: 1,
      instruction:
        'Hören Teil 3\nSie hören ein Gespräch. Sie hören das Gespräch einmal. Sind die Aussagen Richtig oder Falsch?',
      context: 'An einer Bushaltestelle hören Sie ein Gespräch über ein Fest.',
      transcript:
        'Florian: Es war ein Geburtstagsfest. Annas Mann ist Diplomat und die beiden haben ein großes Fest gemacht.\nNadia: Das Haus war wunderschön - eine große Terrasse. Meine Mutter musste mich allen vorstellen, etwas peinlich.\nFlorian: Das Essen war vom Feinsten. Das Beste war die Musik - der Klavierspieler war genial.\nNadia: Er fragte mich, ob ich auch Klavier spiele. Zum Glück kam er aus seiner Pause zurück, bevor ich Jazz spielen musste.',
      questions: [
        rf('h8', '8  Bei dem Fest wurde der Geburtstag von Annas Mann gefeiert.', 'R'),
        rf('h9', '9  Nadia arbeitet beim Fernsehen.', 'F'),
        rf('h10', '10  Nadia hat zusammen mit dem Musiker gespielt.', 'F'),
        rf('h11', '11  Das Fest daürte bis nach Mitternacht.', 'R'),
      ],
    });

    if (cfg.horenParts < 4) return parts;

    parts.push({
      teil: 4,
      plays: 2,
      instruction:
        'Hören Teil 4\nSie hören eine Diskussion. Sie hören die Diskussion zweimal. Ordnen Sie die Aussagen zu: Wer sagt was?',
      context: 'Radiosendung "Diskussion am Abend": Sollen kleine Kinder in die Kinderkrippe gehen?',
      speakers: ['Moderator', 'Frau Schneider', 'Herr Bader'],
      transcript:
        'Moderator: Sollten Kinder in die Kinderkrippe gehen oder nicht?\nFrau Schneider: Die ersten drei Jahre sind für ein Kind von großer Bedeutung. Kinder brauchen eine feste Bezugsperson.\nHerr Bader: Unsere Kinder gehen gern in die Krippe. Meine Frau und ich können nicht drei Jahre aus dem Beruf aussteigen.\nFrau Schneider: In manchen Kindertagesstätten fehlen finanzielle Mittel.\nHerr Bader: Man kann Kinder haben und auch arbeiten.',
      questions: [
        match('h12', '12  Die ersten drei Jahre sind für kleine Kinder sehr wichtig.', ['Moderator', 'Frau Schneider', 'Herr Bader'], 'b'),
        match('h13', '13  Es ist möglich, Kinder zu haben und auch zu arbeiten.', ['Moderator', 'Frau Schneider', 'Herr Bader'], 'c'),
        match('h14', '14  In einigen Krippen fehlt Geld.', ['Moderator', 'Frau Schneider', 'Herr Bader'], 'b'),
      ],
    });

    return parts;
  }

  function buildSchreiben(level, cfg) {
    const parts = [];
    const criteria = ['Inhalt (Aufgabenerfüllung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'];

    parts.push({
      aufgabe: 1,
      arbeitszeit: '20 Minuten',
      fieldId: 'write1',
      task:
        'Aufgabe 1\nSchreiben Sie eine E-Mail (circa ' +
        cfg.w1 +
        ' Wörter).\nSchreiben Sie etwas zu allen drei Punkten.\n\nSie haben vor einer Woche Ihren Geburtstag gefeiert. Ein Freund / Eine Freundin konnte nicht kommen, weil er/sie krank war.\n\n- Beschreiben Sie: Wie war die Feier?\n- Begründen Sie: Welches Geschenk finden Sie besonders toll und warum?\n- Machen Sie einen Vorschlag für ein Treffen.',
      minWords: cfg.w1,
      criteria,
      modelAnswer:
        'Liebe Anna,\n\nwie geht es dir? Bist du wieder gesund? Ohne dich war meine Feier nicht so lustig. Wir feierten zu Hause mit Freunden. Besonders toll fand ich ein Lied, das ein Freund für mich geschrieben hat.\n\nMöchtest du am Wochenende mit mir ins Kino gehen?\n\nViele Grüße\nTom',
      feedback: ['Anrede und Schlussformel', 'Alle drei Inhaltspunkte', 'Circa ' + cfg.w1 + ' Wörter'],
    });

    if (cfg.schreibenTasks < 2) return parts;

    parts.push({
      aufgabe: 2,
      arbeitszeit: '25 Minuten',
      fieldId: 'write2',
      task:
        'Aufgabe 2\nSchreiben Sie Ihre Meinung zum Thema (circa ' +
        cfg.w2 +
        ' Wörter).\n\nThema: Persönliche Kontakte und Internet\n\nIm Online-Gästebuch steht:\n"Persönliche Treffen werden seltener. Das Internet kann persönliche Treffen nicht ersetzen."\n\nSchreiben Sie, ob Sie dieser Meinung zustimmen oder nicht. Begründen Sie Ihre Meinung.',
      minWords: cfg.w2,
      criteria,
      modelAnswer:
        'Ich finde es schade, dass persönliche Treffen seltener werden. Freunde wohnen oft weit weg, und das Internet hilft dann. Aber echte Treffen kann man online nicht ersetzen. Deshalb sollte man sich trotzdem regelmäßig persönlich treffen.',
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
        ' Wörter).\n\nIhre Kursleiterin, Frau Müller, hat Sie zu einem Gespräch eingeladen. Sie können nicht kommen.\n\nEntschuldigen Sie sich höflich und berichten Sie, warum Sie nicht kommen können. Vergessen Sie nicht Anrede und Schluss.',
      minWords: cfg.w3,
      criteria,
      modelAnswer:
        'Liebe Frau Müller,\n\nes tut mir leid, dass ich nicht zum Gespräch kommen kann. Ich muss meine Mutter im Krankenhaus besuchen.\n\nMit freundlichen Grüßen\nJennifer',
      feedback: ['Höfliche Entschuldigung', 'Grund nennen', 'Kurze Form ca. ' + cfg.w3 + ' Wörter'],
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
        'Teil 1\nEin Teilnehmer aus dem Deutschkurs hatte einen Unfall und liegt im Krankenhaus. Sie möchten ihn besuchen und ein Geschenk mitbringen. Überlegen Sie, wie Sie helfen können.',
      points: ['Wann besuchen? (Tag, Uhrzeit?)', 'Wie hinkommen?', 'Was mitnehmen?', 'Wie kann man helfen?'],
      minExchanges: level === 'A1' ? 3 : 4,
      modelAnswer:
        'Ich: Wann sollen wir ins Krankenhaus fahren?\nPartner: Am Samstag um 15 Uhr?\nIch: Gut. Wir nehmen Blumen und eine Karte mit.\nPartner: Und nach der Entlassung können wir einkaufen helfen.',
      feedback: ['Vorschläge machen', 'Auf Vorschläge reagieren', 'Gemeinsam entscheiden'],
    });

    if (cfg.sprechenTasks < 2) return parts;

    parts.push({
      teil: 2,
      title: 'Ein Thema präsentieren',
      dauer: 'circa 3 Minuten',
      fieldId: 'speak2',
      situation:
        'Teil 2\nPräsentieren Sie ein Thema mit fünf Folien (Notizen). Thema: Reisen in Ihrem Heimatland.\n\nFolie 1: Einleitung\nFolie 2: Eigene Erfahrung\nFolie 3: Situation im Heimatland\nFolie 4: Vor- und Nachteile + Meinung\nFolie 5: Schluss',
      points: ['Einleitung und Struktur', 'Eigene Erfahrung', 'Vor- und Nachteile', 'Schluss mit Dank'],
      minExchanges: 0,
      minWords: 80,
      modelAnswer:
        'Heute möchte ich über Reisen in meinem Heimatland sprechen. Letztes Jahr bin ich an die Küste gefahren. In meinem Land reisen viele Menschen mit dem Zug. Das ist günstig, aber manchmal langsam. Ich finde Reisen wichtig, weil man neue Kulturen kennenlernt. Vielen Dank für Ihre Aufmerksamkeit.',
      feedback: ['Fünf Teile der Präsentation', 'Eigene Meinung', 'Klare Einleitung und Schluss'],
    });

    if (cfg.sprechenTasks < 3) return parts;

    parts.push({
      teil: 3,
      title: 'Über ein Thema sprechen',
      dauer: 'circa 2 Minuten',
      fieldId: 'speak3',
      situation:
        'Teil 3\nGeben Sie Ihrem Partner / Ihrer Partnerin Rückmeldung zur Präsentation. Stellen Sie eine Frage und reagieren Sie auf eine Frage.',
      points: ['Rückmeldung geben', 'Eine Frage stellen', 'Frage beantworten'],
      minExchanges: 3,
      modelAnswer:
        'Ich: Deine Präsentation war sehr interessant. Mir hat besonders der Teil über die Zuege gefallen.\nPartner: Danke!\nIch: Wo reist du am liebsten?\nPartner: Am liebsten in die Berge.',
      feedback: ['Freundliche Rückmeldung', 'Mindestens eine Frage', 'Antwort geben'],
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
