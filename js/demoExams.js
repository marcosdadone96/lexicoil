/* Fixed demo exams ù one per language ù CEFR level. No AI required. */
const DemoExams = (() => {
  function mc(id, q, opts, correct) {
    return { id, type: 'multiple', question: q, options: opts, correct };
  }
  function rf(id, q, correct, isDE) {
    return { id, type: isDE ? 'rf' : 'tf', question: q, correct };
  }
  function gap(id, text, answer, options) {
    return { id, text, answer, options };
  }

  function base(subject, level, topic, blocks) {
    const isDE = subject === 'de';
    const rfT = isDE ? 'R' : 'T';
    return {
      demo: true,
      topic,
      level,
      lang: subject,
      lesen: blocks.lesen,
      horen: blocks.horen,
      gapfill: {
        instruction: isDE
          ? 'Fùlle die Lùcken mit dem passenden Wort aus der Liste aus.'
          : 'Choose the correct word from the list to fill each gap.',
        sentences: blocks.gaps.map((g) => gap(g[0], g[1], g[2], g[3])),
      },
      schreiben: blocks.schreiben,
      sprechen: blocks.sprechen,
    };
  }

  const BANK = {
    'de-A1': base('de', 'A1', 'Familie und Freizeit', {
      lesen: {
        textTitle: 'Meine Familie',
        text: 'Hallo! Ich heiùe Anna. Ich bin achtzehn Jahre alt. Ich wohne in Berlin mit meiner Familie. Mein Vater heiùt Thomas. Er arbeitet in einem Bùro. Meine Mutter heiùt Sandra. Sie ist Lehrerin. Ich habe einen Bruder. Er heiùt Max und er ist fùnfzehn Jahre alt. Am Wochenende spielen wir oft Fuùball im Park. Am Sonntag essen wir zusammen zu Mittag.',
        questions: [
          mc('l1', 'Wie alt ist Anna?', ['A) 15', 'B) 18', 'C) 20'], 'B'),
          mc('l2', 'Was macht Annas Mutter?', ['A) Sie arbeitet im Bùro.', 'B) Sie ist Lehrerin.', 'C) Sie spielt Fuùball.'], 'B'),
          rf('l3', 'Anna wohnt in Mùnchen.', 'F', true),
          rf('l4', 'Max ist der Bruder von Anna.', 'R', true),
        ],
      },
      horen: {
        context: 'You will hear two friends talking about the weekend.',
        transcript: 'A: Was machst du am Samstag?\nB: Ich gehe ins Kino mit Lisa.\nA: Toll! Welcher Film?\nB: Ein deutscher Film. Er beginnt um achtzehn Uhr.\nA: Viel Spaù!\nB: Danke! Und du?\nA: Ich besuche meine Groùmutter.',
        questions: [
          mc('h1', 'Was macht Person B am Samstag?', ['A) Sie besucht die Groùmutter.', 'B) Sie geht ins Kino.', 'C) Sie arbeitet.'], 'B'),
          mc('h2', 'Wann beginnt der Film?', ['A) Um 16 Uhr', 'B) Um 18 Uhr', 'C) Um 20 Uhr'], 'B'),
          rf('h3', 'Person A geht auch ins Kino.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Ich [BLANK] aus Spanien.', 'komme', ['komme', 'kommt', 'kommen', 'kam']],
        ['g2', 'Das ist [BLANK] Buch.', 'mein', ['mein', 'meine', 'meiner', 'meinem']],
        ['g3', 'Wir [BLANK] gern Pizza.', 'essen', ['esse', 'isst', 'essen', 'esst']],
        ['g4', 'Er [BLANK] jeden Tag Deutsch.', 'lernt', ['lerne', 'lernst', 'lernt', 'lernen']],
      ],
      schreiben: {
        taskType: 'E-Mail',
        task: 'Schreibe eine kurze E-Mail an deinen Freund Tom. Schreibe ùber: 1) Begrùùung 2) Wo du wohnst 3) Deine Familie 4) Eine Frage an Tom',
        minWords: 40,
        criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Hallo Tom,\n\nich wohne in Madrid mit meiner Familie. Mein Vater arbeitet und meine Mutter kocht gern. Ich habe eine Schwester. Sie ist zehn Jahre alt.\n\nWo wohnst du? Schreib mir bitte!\n\nViele Grùùe,\nAnna',
        feedback: [
          'Use a greeting and a friendly closing.',
          'Mention where you live and at least one family member.',
          'Include a question to Tom.',
        ],
      },
      sprechen: {
        situation: 'Stelle dich vor. Der Prùfer fragt nach deinem Namen, Alter und Hobby.',
        roleA: 'Kandidat/in',
        roleB: 'Prùfer/in',
        starterLine: 'Guten Tag! Wie heiùen Sie?',
        points: ['Name', 'Alter', 'Land oder Stadt', 'Ein Hobby'],
        minExchanges: 3,
        modelAnswer:
          'Ich: Guten Tag! Ich heiùe Anna.\nPrùfer: Wie alt sind Sie?\nIch: Ich bin achtzehn Jahre alt.\nPrùfer: Was ist Ihr Hobby?\nIch: Ich spiele gern Fuùball.',
        feedback: ['Answer with full sentences.', 'Use ùIch heiùeùù and ùIch bin ù Jahre alt.ù'],
      },
    }),

    'de-A2': base('de', 'A2', 'Reisen und Einkaufen', {
      lesen: {
        textTitle: 'Ein Wochenende in Hamburg',
        text: 'Letztes Wochenende bin ich mit meinem Freund nach Hamburg gefahren. Wir sind mit dem Zug gefahren, weil die Fahrt nur zwei Stunden dauert. In Hamburg haben wir zuerst den Hafen besucht. Danach sind wir in ein Restaurant gegangen und haben Fisch gegessen. Am Sonntag haben wir viel eingekauft. Ich habe ein neues T-Shirt gekauft, aber die Schuhe waren zu teuer. Am Abend sind wir mùde aber glùcklich nach Hause gefahren.',
        questions: [
          mc('l1', 'Wie sind sie nach Hamburg gefahren?', ['A) Mit dem Auto', 'B) Mit dem Zug', 'C) Mit dem Flugzeug'], 'B'),
          mc('l2', 'Was haben sie im Restaurant gegessen?', ['A) Pizza', 'B) Fisch', 'C) Salat'], 'B'),
          rf('l3', 'Sie haben am Samstag eingekauft.', 'F', true),
          rf('l4', 'Die Schuhe waren zu teuer.', 'R', true),
        ],
      },
      horen: {
        context: 'You will hear a customer in a shop.',
        transcript: 'A: Guten Tag! Kann ich Ihnen helfen?\nB: Ja, ich suche eine Jacke in Grùùe M.\nA: Diese Jacke kostet neunundfùnfzig Euro.\nB: Haben Sie sie auch in Blau?\nA: Ja, hier bitte.\nB: Gut, ich nehme sie.',
        questions: [
          mc('h1', 'Was sucht Person B?', ['A) Eine Hose', 'B) Eine Jacke', 'C) Ein Hemd'], 'B'),
          mc('h2', 'Wie viel kostet die Jacke?', ['A) 49 ù', 'B) 59 ù', 'C) 69 ù'], 'B'),
          rf('h3', 'Person B kauft die Jacke.', 'R', true),
        ],
      },
      gaps: [
        ['g1', 'Gestern [BLANK] ich im Supermarkt.', 'war', ['war', 'bin', 'hat', 'waren']],
        ['g2', 'Kannst du mir [BLANK]?', 'helfen', ['helfen', 'hilft', 'hilfst', 'geholfen']],
        ['g3', 'Wir [BLANK] nùchste Woche nach Berlin.', 'fahren', ['fahren', 'fahre', 'fùhrt', 'gefahren']],
        ['g4', 'Das Wetter [BLANK] gestern schlecht.', 'war', ['war', 'ist', 'wird', 'waren']],
      ],
      schreiben: {
        taskType: 'Brief',
        task: 'Schreibe an deine Freundin Maria ùber deinen letzten Urlaub: 1) Wohin du gefahren bist 2) Wie du gereist bist 3) Was du gemacht hast 4) Einladung fùr Maria',
        minWords: 60,
        criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Liebe Maria,\n\nletzte Woche bin ich nach Hamburg gefahren. Ich bin mit dem Zug gefahren. Dort habe ich den Hafen besucht und viel gegessen. Es war sehr schùn!\n\nKommst du nùchstes Mal mit?\n\nLiebe Grùùe,\nTom',
        feedback: ['Use Perfekt for past events.', 'Mention transport and at least one activity.', 'End with a friendly invitation.'],
      },
      sprechen: {
        situation: 'Du planst eine Reise. Erklùre wohin, wann und mit wem.',
        roleA: 'Kandidat/in',
        roleB: 'Prùfer/in',
        starterLine: 'Wohin mùchten Sie in den Ferien fahren?',
        points: ['Reiseziel', 'Verkehrsmittel', 'Reisepartner', 'Grund'],
        minExchanges: 3,
        modelAnswer:
          'Ich: Ich mùchte nach ùsterreich fahren.\nPrùfer: Mit wem?\nIch: Mit meiner Freundin.\nPrùfer: Warum?\nIch: Weil wir gern wandern.',
        feedback: ['Use ùmùchteù or ùwerde ù fahrenù.', 'Give at least three details about the trip.'],
      },
    }),

    'de-B1': base('de', 'B1', 'Gesundheit und Ernùhrung', {
      lesen: {
        textTitle: 'Gesund leben',
        text: 'Immer mehr Menschen achten heute auf eine ausgewogene Ernùhrung. Experten empfehlen, tùglich Obst und Gemùse zu essen und Zucker zu reduzieren. Regelmùùige Bewegung ist ebenfalls wichtig, denn sie stùrkt das Immunsystem und reduziert Stress. Viele Berufstùtige haben jedoch wenig Zeit fùr Sport. Deshalb nutzen einige Menschen ihre Mittagspause fùr einen kurzen Spaziergang. Auch ausreichend Schlaf spielt eine groùe Rolle fùr die Konzentration am Arbeitsplatz.',
        questions: [
          mc('l1', 'Was empfehlen Experten?', ['A) Mehr Zucker', 'B) Obst und Gemùse', 'C) Weniger Schlaf'], 'B'),
          mc('l2', 'Warum ist Bewegung wichtig?', ['A) Sie reduziert Stress', 'B) Sie macht mùde', 'C) Sie kostet viel Geld'], 'A'),
          rf('l3', 'Alle Berufstùtigen haben viel Zeit fùr Sport.', 'F', true),
          rf('l4', 'Schlaf beeinflusst die Konzentration.', 'R', true),
        ],
      },
      horen: {
        context: 'You will hear a conversation at the doctor.',
        transcript: 'A: Guten Tag, was fehlt Ihnen?\nB: Ich habe seit drei Tagen Kopfschmerzen und bin sehr mùde.\nA: Haben Sie Fieber?\nB: Nein, aber ich schlafe schlecht.\nA: Trinken Sie genug Wasser und ruhen Sie sich aus. Kommen Sie wieder, wenn es nicht besser wird.',
        questions: [
          mc('h1', 'Seit wann hat Person B Kopfschmerzen?', ['A) Seit gestern', 'B) Seit drei Tagen', 'C) Seit einer Woche'], 'B'),
          mc('h2', 'Was empfiehlt der Arzt?', ['A) Mehr arbeiten', 'B) Ruhe und Wasser', 'C) Sofort ins Krankenhaus'], 'B'),
          rf('h3', 'Person B hat Fieber.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Obwohl er mùde war, [BLANK] er weiter.', 'arbeitete', ['arbeitete', 'arbeiten', 'arbeitet', 'arbeitest']],
        ['g2', 'Ich wùrde gern mehr Sport [BLANK].', 'machen', ['machen', 'macht', 'machte', 'gemacht']],
        ['g3', 'Man sollte regelmùùig [BLANK].', 'schlafen', ['schlafen', 'schlùft', 'schlief', 'geschlafen']],
        ['g4', 'Er hat gesagt, dass er [BLANK] kommt.', 'spùter', ['spùter', 'spùt', 'spùtestens', 'spùte']],
      ],
      schreiben: {
        taskType: 'Meinung',
        task: 'Schreibe einen kurzen Text (ca. 80 Wùrter): Sollte man in der Schule mehr ùber gesunde Ernùhrung lernen? Begrùnde deine Meinung mit mindestens zwei Argumenten.',
        minWords: 80,
        criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Meiner Meinung nach sollte man in der Schule mehr ùber gesunde Ernùhrung lernen. Viele Jugendliche essen zu viel Fast Food und wissen nicht, welche Lebensmittel wichtig sind. Wenn Schùler frùh lernen, wie man sich ausgewogen ernùhrt, kùnnen sie spùter gesùnder leben. Auùerdem kùnnte die Schule gesunde Mahlzeiten anbieten.',
        feedback: ['State a clear opinion.', 'Give at least two reasons.', 'Use connectors like ùweilù, ùauùerdemù.'],
      },
      sprechen: {
        situation: 'Diskutiere, ob Firmen Sportprogramme anbieten sollten.',
        roleA: 'Kandidat/in',
        roleB: 'Prùfer/in',
        starterLine: 'Was halten Sie von Sportangeboten im Unternehmen?',
        points: ['Vorteil fùr Mitarbeiter', 'Kosten fùr Firma', 'Beispiel', 'Ihre Meinung'],
        minExchanges: 4,
        modelAnswer:
          'Ich: Ich finde das sehr sinnvoll, weil Mitarbeiter gesùnder bleiben.\nPrùfer: Kostet das nicht viel?\nIch: Ja, aber gesunde Mitarbeiter fehlen seltener.\nPrùfer: Haben Sie ein Beispiel?\nIch: Meine Firma bietet Yoga an.',
        feedback: ['Express and justify your opinion.', 'Respond to the examinerùs counter-argument.'],
      },
    }),

    'de-B2': base('de', 'B2', 'Medien und Gesellschaft', {
      lesen: {
        textTitle: 'Soziale Medien im Alltag',
        text: 'Soziale Netzwerke haben die Art verùndert, wie Menschen Informationen konsumieren. Wùhrend frùher Nachrichten vor allem ùber Zeitungen verbreitet wurden, erhalten heute viele Nutzer ihre Informationen ùber Algorithmen, die Inhalte nach persùnlichen Interessen filtern. Kritiker warnen, dass sogenannte Filterblasen die politische Diskussion erschweren kùnnen. Befùrworter argumentieren hingegen, dass digitale Plattformen neue Formen des gesellschaftlichen Engagements ermùglichen. Experten fordern deshalb mehr Medienkompetenz im Unterricht.',
        questions: [
          mc('l1', 'Was haben soziale Netzwerke verùndert?', ['A) Die Wetterberichte', 'B) Informationskonsum', 'C) Die Schulferien'], 'B'),
          mc('l2', 'Was befùrchten Kritiker?', ['A) Filterblasen', 'B) Mehr Zeitungen', 'C) Weniger Internet'], 'A'),
          rf('l3', 'Algorithmen zeigen immer alle Nachrichten gleich.', 'F', true),
          rf('l4', 'Experten wollen Medienkompetenz stùrken.', 'R', true),
        ],
      },
      horen: {
        context: 'You will hear a radio discussion about fake news.',
        transcript: 'A: Fake News verbreiten sich online sehr schnig.\nB: Deshalb sollte man Quellen ùberprùfen.\nA: Stimmt, besonders bei politischen Themen.\nB: Schulen mùssen Schùler besser schulen.\nA: Medienkompetenz ist heute unverzichtbar.',
        questions: [
          mc('h1', 'Warum sind Fake News problematisch?', ['A) Sie sind langsam', 'B) Sie verbreiten sich schnell', 'C) Sie sind immer wahr'], 'B'),
          mc('h2', 'Was schlùgt Person B vor?', ['A) Weniger Internet', 'B) Quellen prùfen', 'C) Keine Nachrichten'], 'B'),
          rf('h3', 'Medienkompetenz ist unwichtig.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Der Bericht wurde gestern [BLANK].', 'verùffentlicht', ['verùffentlicht', 'verùffentlichen', 'verùffentlichte', 'verùffentlichten']],
        ['g2', 'Je mehr man liest, [BLANK] man versteht.', 'desto besser', ['desto besser', 'besser', 'am besten', 'gut']],
        ['g3', 'Es wird behauptet, dass die Daten [BLANK] seien.', 'verfùlscht', ['verfùlscht', 'verfùlschen', 'verfùlschte', 'verfùlschten']],
        ['g4', 'Trotz der Kritik [BLANK] die Plattform wachsen.', 'wird', ['wird', 'werden', 'wurde', 'worden']],
      ],
      schreiben: {
        taskType: 'Aufsatz',
        task: 'Schreibe einen argumentativen Text (ca. 100 Wùrter): Sollten soziale Medien stùrker reguliert werden?',
        minWords: 100,
        criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Einerseits sollten soziale Medien stùrker reguliert werden, weil Hassrede und Desinformation vielen Menschen schaden. Gesetze kùnnten Plattformen verpflichten, illegale Inhalte schneller zu lùschen. Andererseits darf Meinungsfreiheit nicht eingeschrùnkt werden. Deshalb brauchen wir transparente Regeln, die Verantwortung und Freiheit ausgleichen.',
        feedback: ['Present both sides or a clear structured argument.', 'Use advanced connectors (einerseits/andererseits).'],
      },
      sprechen: {
        situation: 'Erùrtere Vor- und Nachteile von Homeoffice.',
        roleA: 'Kandidat/in',
        roleB: 'Prùfer/in',
        starterLine: 'Ist Homeoffice eine gute Lùsung fùr alle Berufe?',
        points: ['Vorteil', 'Nachteil', 'Beispiel aus dem Berufsleben', 'Fazit'],
        minExchanges: 4,
        modelAnswer:
          'Ich: Homeoffice spart Zeit, aber man vermisst Kollegen.\nPrùfer: Fùr welche Jobs passt es?\nIch: Fùr IT-Jobs oft gut, fùr Handwerk schlecht.\nPrùfer: Ihr Fazit?\nIch: Eine Mischung ist am besten.',
        feedback: ['Balance advantages and disadvantages.', 'Support points with a concrete example.'],
      },
    }),

    'de-C1': base('de', 'C1', 'Wissenschaft und Ethik', {
      lesen: {
        textTitle: 'Kùnstliche Intelligenz in der Medizin',
        text: 'Die Integration kùnstlicher Intelligenz in diagnostische Verfahren gilt als vielversprechend, wirft jedoch erhebliche ethische Fragen auf. Algorithmen kùnnen Muster in medizinischen Bildern erkennen, die dem menschlichen Auge entgehen, doch bleibt unklar, wer die Verantwortung trùgt, wenn ein System fehlinterpretiert. Datenschutzrechtliche Bestimmungen mùssen zudem gewùhrleisten, dass sensible Patientendaten nicht missbraucht werden. Forscher betonen, dass KI den Arzt nicht ersetzen, sondern als unterstùtzendes Werkzeug dienen sollte.',
        questions: [
          mc('l1', 'Was kùnnen Algorithmen in der Medizin?', ['A) Muster erkennen', 'B) Krankenhùuser bauen', 'C) Medikamente herstellen'], 'A'),
          mc('l2', 'Was betonen Forscher?', ['A) KI ersetzt ùrzte', 'B) KI unterstùtzt ùrzte', 'C) KI ist ùberflùssig'], 'B'),
          rf('l3', 'Verantwortungsfragen sind geklùrt.', 'F', true),
          rf('l4', 'Datenschutz ist relevant.', 'R', true),
        ],
      },
      horen: {
        context: 'You will hear an expert interview.',
        transcript: 'A: Wird KI die Medizin revolutionieren?\nB: In Teilen ja, vor allem bei der Diagnose.\nA: Welche Risiken sehen Sie?\nB: Fehlentscheidungen und mangelnde Transparenz.\nA: Wie kann man das minimieren?\nB: Durch unabhùngige Prùfungen und klare Regeln.',
        questions: [
          mc('h1', 'Wo sieht der Experte den grùùten Nutzen?', ['A) In der Diagnose', 'B) In der Verwaltung', 'C) In der Architektur'], 'A'),
          mc('h2', 'Was schlùgt er vor?', ['A) Keine Regeln', 'B) Unabhùngige Prùfungen', 'C) Weniger Forschung'], 'B'),
          rf('h3', 'Der Experte sieht keine Risiken.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Die Studie lùsst [BLANK], dass Risiken unterschùtzt wurden.', 'vermuten', ['vermuten', 'vermutet', 'vermutete', 'vermuteten']],
        ['g2', 'Sofern die Daten [BLANK] sind, kann das System trainiert werden.', 'anonymisiert', ['anonymisiert', 'anonymisieren', 'anonymisierte', 'anonymisierend']],
        ['g3', 'Nicht zuletzt [BLANK] ethische Kommissionen eine Rolle.', 'spielen', ['spielen', 'spielt', 'spielte', 'gespielt']],
        ['g4', 'Es handelt sich [BLANK] ein komplexes Problem.', 'um', ['um', 'an', 'ùber', 'fùr']],
      ],
      schreiben: {
        taskType: 'Erùrterung',
        task: 'Erùrtere in ca. 130 Wùrtern, ob KI-Systeme in Krankenhùusern verpflichtend eingefùhrt werden sollten.',
        minWords: 130,
        criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Eine verpflichtende Einfùhrung von KI-Systemen wùre verfrùht, solange rechtliche Rahmenbedingungen unklar bleiben. Zwar kùnnten prùzisere Diagnosen Leben retten, doch wùrde eine Pflicht kleinere Kliniken finanziell ùberfordern. Zudem mùsste nachgewiesen werden, dass Algorithmen nicht diskriminieren. Sinnvoller ist ein schrittweiser Einsatz mit unabhùngiger Evaluation und Fortbildung des Personals.',
        feedback: ['Nuanced thesis with justification.', 'Academic register and complex syntax.'],
      },
      sprechen: {
        situation: 'Diskutiere ethische Grenzen der Gentechnik.',
        roleA: 'Kandidat/in',
        roleB: 'Prùfer/in',
        starterLine: 'Sollte die Gentechnik am Menschen erlaubt sein?',
        points: ['Medizinischer Nutzen', 'Ethische Bedenken', 'Regulierung', 'Persùnliches Fazit'],
        minExchanges: 5,
        modelAnswer:
          'Ich: Therapeutisch ja, aber nicht zur Optimierung.\nPrùfer: Welche Bedenken?\nIch: Ungleichheit und unabsehbare Folgen.\nPrùfer: Wer soll regulieren?\nIch: Internationale Gremien mit Transparenz.',
        feedback: ['Differentiate therapeutic vs enhancement uses.', 'Address regulation explicitly.'],
      },
    }),

    'de-C2': base('de', 'C2', 'Kultur und Identitùt', {
      lesen: {
        textTitle: 'Sprache als Trùger von Identitùt',
        text: 'Sprache ist nicht bloù ein Kommunikationsmittel, sondern verkùrpert kulturelles Gedùchtnis und kollektive Identitùt. Wer eine Sprache verliert, verliert nicht nur Wùrter, sondern auch Zugang zu bestimmten Weltsichten. In multilingualen Gesellschaften entstehen Spannungen, wenn eine Sprache politisch bevorzugt wird, wùhrend andere marginalisiert werden. Literaturwissenschaftler betonen, dass ùbersetzen zwar Brùcken schlùgt, dennoch Nuancen unweigerlich verschiebt. Demokratische Bildungspolitik sollte daher Mehrsprachigkeit nicht als Hindernis, sondern als Bereicherung begreifen.',
        questions: [
          mc('l1', 'Was verliert man laut Text mit der Sprache?', ['A) Nur Wùrter', 'B) Auch Weltsichten', 'C) Das Passport'], 'B'),
          mc('l2', 'Was sagen Literaturwissenschaftler zum ùbersetzen?', ['A) Es verschiebt Nuancen', 'B) Es ist unnùtig', 'C) Es ist perfekt'], 'A'),
          rf('l3', 'Mehrsprachigkeit ist laut Text immer ein Hindernis.', 'F', true),
          rf('l4', 'Sprache trùgt kulturelles Gedùchtnis.', 'R', true),
        ],
      },
      horen: {
        context: 'You will hear a panel on cultural policy.',
        transcript: 'A: Soll der Staat Kultur subventionieren?\nB: Ja, Kultur ist ùffentliches Gut.\nA: Aber wer entscheidet, was gefùrdert wird?\nB: Demokratische Gremien mit Transparenz.\nA: Und digitale Medien?\nB: Auch dort brauchen wir Qualitùtsstandards.',
        questions: [
          mc('h1', 'Wie begrùndet Person B Subventionen?', ['A) Kultur ist ùffentliches Gut', 'B) Kultur ist teuer', 'C) Kultur ist altmodisch'], 'A'),
          mc('h2', 'Wer soll entscheiden?', ['A) Demokratische Gremien', 'B) Nur Kùnstler', 'C) Niemand'], 'A'),
          rf('h3', 'Digitale Medien brauchen keine Standards.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Die Rede vermittelte den [BLANK], dass Sprache Macht ausùbt.', 'Eindruck', ['Eindruck', 'Eindrùcke', 'Eindrùcken', 'Eindrùcklich']],
        ['g2', 'Kaum hatte er begonnen, [BLANK] er bereits Beifall.', 'erntete', ['erntete', 'ernten', 'erntet', 'geerntet']],
        ['g3', 'So [BLANK] es sich, als ob nichts geschehen wùre.', 'stellte', ['stellte', 'stellen', 'gestellt', 'stellten']],
        ['g4', 'Die Argumentation [BLANK] sich als ùberzeugend.', 'erwies', ['erwies', 'erweisen', 'erwiesen', 'erwiesene']],
      ],
      schreiben: {
        taskType: 'Essay',
        task: 'Verfasse einen Essay (ca. 160 Wùrter) ùber die Rolle der Muttersprache in einer globalisierten Welt.',
        minWords: 160,
        criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'In einer globalisierten Welt droht die Muttersprache zur bloùen Privatsphùre zu werden, wùhrend Englisch als lingua franca dominiert. Dennoch bleibt die Erstsprache emotionaler Anker und Trùger unteilbarer Erfahrungen. Wer sie pflegt, bewahrt nicht nur Wortschatz, sondern auch kulturelle Selbstbestimmung. Globalisierung und Sprachpflege schlieùen sich nicht aus, solange Bildungssysteme Mehrsprachigkeit fùrdern und digitale Rùume lokale Literaturen sichtbar machen.',
        feedback: ['Sophisticated thesis with stylistic variation.', 'Near-native complexity and precision.'],
      },
      sprechen: {
        situation: 'Erùrtere, ob Globalisierung lokale Kulturen auslùscht.',
        roleA: 'Kandidat/in',
        roleB: 'Prùfer/in',
        starterLine: 'Ist kulturelle Vielfalt durch Globalisierung bedroht?',
        points: ['These', 'Gegenargument', 'Historisches Beispiel', 'Abgewogenes Fazit'],
        minExchanges: 5,
        modelAnswer:
          'Ich: Vielfalt ist bedroht, aber nicht verloren.\nPrùfer: Beispiel?\nIch: Lokale Musik findet online neue Hùrer.\nPrùfer: Und die Gefahr?\nIch: Homogenisierung durch globale Marken.',
        feedback: ['Abstract reasoning with concrete example.', 'Balanced, nuanced conclusion.'],
      },
    }),

    'en-A1': base('en', 'A1', 'Daily Life', {
      lesen: {
        textTitle: 'My Daily Routine',
        text: 'Hello! My name is James. I am twenty years old. I live in London with my family. I wake up at seven o\'clock. I eat breakfast and drink tea. Then I go to work by bus. I work in a small shop. I finish work at five o\'clock. In the evening I watch TV with my sister. We like music and football.',
        questions: [
          mc('l1', 'How old is James?', ['A) 18', 'B) 20', 'C) 25'], 'B'),
          mc('l2', 'How does he go to work?', ['A) By car', 'B) By bus', 'C) By train'], 'B'),
          rf('l3', 'James lives alone.', 'F', false),
          rf('l4', 'He watches TV in the evening.', 'T', false),
        ],
      },
      horen: {
        context: 'You will hear two friends planning lunch.',
        transcript: 'A: Are you hungry?\nB: Yes, very hungry.\nA: Let\'s eat at the cafù.\nB: Good idea. I want a sandwich.\nA: Me too. And some water.\nB: OK, let\'s go now.',
        questions: [
          mc('h1', 'Where do they want to eat?', ['A) At home', 'B) At the cafù', 'C) At school'], 'B'),
          mc('h2', 'What does Person B want?', ['A) Pizza', 'B) A sandwich', 'C) Soup'], 'B'),
          rf('h3', 'They want to go later.', 'F', false),
        ],
      },
      gaps: [
        ['g1', 'She [BLANK] from Italy.', 'is', ['is', 'are', 'am', 'be']],
        ['g2', 'I [BLANK] English every day.', 'study', ['study', 'studies', 'studying', 'studied']],
        ['g3', 'They [BLANK] happy today.', 'are', ['is', 'are', 'am', 'was']],
        ['g4', 'He [BLANK] a teacher.', 'is', ['is', 'are', 'have', 'has']],
      ],
      schreiben: {
        taskType: 'Email',
        task: 'Write a short email to your friend. Include: 1) Greeting 2) Your job or school 3) Your hobby 4) A question',
        minWords: 40,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'Hi Tom,\n\nI work in a shop in London. I like football and music. I play football on Saturday.\n\nDo you like football too?\n\nBest wishes,\nJames',
        feedback: ['Use simple present tense.', 'Include all four bullet points.', 'Friendly opening and closing.'],
      },
      sprechen: {
        situation: 'Introduce yourself to the examiner.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Hello. What is your name?',
        points: ['Name', 'Age or country', 'Job or study', 'One hobby'],
        minExchanges: 3,
        modelAnswer:
          'Me: My name is James.\nExaminer: Where are you from?\nMe: I am from London.\nExaminer: What is your hobby?\nMe: I like football.',
        feedback: ['Use full short sentences.', 'Answer each question clearly.'],
      },
    }),

    'en-A2': base('en', 'A2', 'Travel and Shopping', {
      lesen: {
        textTitle: 'A Trip to Edinburgh',
        text: 'Last month I visited Edinburgh with my brother. We travelled by train because it was cheaper than flying. The city was beautiful and the people were friendly. We visited a castle and walked in the old town. On the second day we bought souvenirs for our friends. The weather was cold but sunny. We ate fish and chips for lunch. I want to go back next year.',
        questions: [
          mc('l1', 'How did they travel?', ['A) By plane', 'B) By train', 'C) By car'], 'B'),
          mc('l2', 'What did they buy?', ['A) Clothes', 'B) Souvenirs', 'C) Books'], 'B'),
          rf('l3', 'The weather was hot.', 'F', false),
          rf('l4', 'They visited a castle.', 'T', false),
        ],
      },
      horen: {
        context: 'You will hear a customer in a clothes shop.',
        transcript: 'A: Can I help you?\nB: Yes, I need a jacket, size medium.\nA: This one is forty-five pounds.\nB: Do you have it in blue?\nA: Yes, here you are.\nB: Perfect, I\'ll take it.',
        questions: [
          mc('h1', 'What is the customer looking for?', ['A) Shoes', 'B) A jacket', 'C) A hat'], 'B'),
          mc('h2', 'How much is the jacket?', ['A) ù35', 'B) ù45', 'C) ù55'], 'B'),
          rf('h3', 'The customer buys the jacket.', 'T', false),
        ],
      },
      gaps: [
        ['g1', 'I [BLANK] to the cinema yesterday.', 'went', ['go', 'went', 'going', 'gone']],
        ['g2', 'She is [BLANK] than her sister.', 'taller', ['tall', 'taller', 'tallest', 'more tall']],
        ['g3', 'We [BLANK] watching a film now.', 'are', ['is', 'are', 'am', 'be']],
        ['g4', 'He doesn\'t [BLANK] coffee.', 'like', ['likes', 'like', 'liked', 'liking']],
      ],
      schreiben: {
        taskType: 'Email',
        task: 'Write to your friend about a trip you took: where you went, how you travelled, what you did, and invite your friend next time.',
        minWords: 60,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'Hi Anna,\n\nLast week I went to Edinburgh by train. I visited a castle and bought souvenirs. The food was great!\n\nWould you like to come with me next time?\n\nBest wishes,\nTom',
        feedback: ['Use past simple for completed actions.', 'Cover all four points from the task.'],
      },
      sprechen: {
        situation: 'Talk about a holiday you enjoyed.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Where did you go on your last holiday?',
        points: ['Place', 'Transport', 'Activity', 'Feeling'],
        minExchanges: 3,
        modelAnswer:
          'Me: I went to Scotland.\nExaminer: How did you travel?\nMe: By train.\nExaminer: Did you enjoy it?\nMe: Yes, it was fantastic.',
        feedback: ['Use past tense consistently.', 'Give more than one-word answers.'],
      },
    }),

    'en-B1': base('en', 'B1', 'Health and Lifestyle', {
      lesen: {
        textTitle: 'Healthy Habits',
        text: 'More people today are trying to live healthier lives. Doctors recommend eating more vegetables and doing regular exercise. However, many office workers sit for long hours and do not have time for the gym. Some companies now encourage walking meetings or standing desks. Sleep is also important because it helps concentration and reduces stress. Small daily changes can make a big difference over time.',
        questions: [
          mc('l1', 'What do doctors recommend?', ['A) Less sleep', 'B) More vegetables', 'C) More sugar'], 'B'),
          mc('l2', 'Why is sleep important?', ['A) It helps concentration', 'B) It costs money', 'C) It stops exercise'], 'A'),
          rf('l3', 'All office workers go to the gym.', 'F', false),
          rf('l4', 'Small changes can help.', 'T', false),
        ],
      },
      horen: {
        context: 'You will hear a conversation at the doctor.',
        transcript: 'A: What seems to be the problem?\nB: I have had headaches for three days and I feel tired.\nA: Do you have a fever?\nB: No, but I sleep badly.\nA: Drink water and rest. Come back if it gets worse.',
        questions: [
          mc('h1', 'How long has the patient had headaches?', ['A) One day', 'B) Three days', 'C) A week'], 'B'),
          mc('h2', 'What does the doctor suggest?', ['A) Rest and water', 'B) More work', 'C) Surgery'], 'A'),
          rf('h3', 'The patient has a fever.', 'F', false),
        ],
      },
      gaps: [
        ['g1', 'If you exercise regularly, you will feel [BLANK].', 'better', ['good', 'better', 'best', 'well']],
        ['g2', 'She has [BLANK] finished her homework.', 'already', ['already', 'yet', 'still', 'since']],
        ['g3', 'I\'m looking forward [BLANK] the weekend.', 'to', ['to', 'for', 'at', 'on']],
        ['g4', 'He suggested [BLANK] more water.', 'drinking', ['drink', 'drinking', 'to drink', 'drank']],
      ],
      schreiben: {
        taskType: 'Opinion',
        task: 'Write about 80 words: Should schools teach more about healthy eating? Give at least two reasons.',
        minWords: 80,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'In my opinion, schools should teach more about healthy eating because many teenagers eat too much fast food. If students learn early how to cook simple meals, they can make better choices later. Schools could also offer healthier lunches instead of sugary snacks.',
        feedback: ['Clear opinion in the opening.', 'At least two supporting reasons.', 'Use linking words like ùbecauseù.'],
      },
      sprechen: {
        situation: 'Discuss whether companies should offer sports programmes.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Do you think companies should pay for employee fitness programmes?',
        points: ['Advantage', 'Disadvantage', 'Example', 'Your opinion'],
        minExchanges: 4,
        modelAnswer:
          'Me: Yes, because healthy staff work better.\nExaminer: Isn\'t it expensive?\nMe: Maybe, but sick days cost more.\nExaminer: Any example?\nMe: My company offers yoga classes.',
        feedback: ['Give reasons, not only yes/no.', 'Respond to the examiner\'s question.'],
      },
    }),

    'en-B2': base('en', 'B2', 'Media and Society', {
      lesen: {
        textTitle: 'Social Media and News',
        text: 'Social media has transformed how people access news. Instead of relying on newspapers, many users receive personalised content selected by algorithms. Critics argue that filter bubbles reduce exposure to diverse opinions and weaken public debate. Supporters claim that digital platforms enable civic engagement and rapid information sharing. Experts therefore call for stronger media literacy education in schools.',
        questions: [
          mc('l1', 'What has social media changed?', ['A) Weather forecasts', 'B) News access', 'C) School holidays'], 'B'),
          mc('l2', 'What do critics fear?', ['A) Filter bubbles', 'B) More libraries', 'C) Less internet'], 'A'),
          rf('l3', 'Algorithms always show the same content to everyone.', 'F', false),
          rf('l4', 'Experts want better media literacy.', 'T', false),
        ],
      },
      horen: {
        context: 'You will hear a discussion about fake news.',
        transcript: 'A: Fake news spreads quickly online.\nB: People should check sources.\nA: Especially for political stories.\nB: Schools must teach critical thinking.\nA: Media literacy is essential today.',
        questions: [
          mc('h1', 'Why is fake news dangerous?', ['A) It spreads fast', 'B) It is always slow', 'C) It is always true'], 'A'),
          mc('h2', 'What does Person B recommend?', ['A) Ignore news', 'B) Check sources', 'C) Stop using phones'], 'B'),
          rf('h3', 'Media literacy is unnecessary.', 'F', false),
        ],
      },
      gaps: [
        ['g1', 'The report was [BLANK] yesterday.', 'published', ['publish', 'published', 'publishing', 'publishes']],
        ['g2', 'The more you read, the [BLANK] you understand.', 'better', ['good', 'better', 'best', 'well']],
        ['g3', 'It is claimed that the data were [BLANK].', 'altered', ['alter', 'altered', 'altering', 'alters']],
        ['g4', 'Despite criticism, the platform [BLANK] growing.', 'is', ['is', 'are', 'was', 'were']],
      ],
      schreiben: {
        taskType: 'Essay',
        task: 'Write about 100 words: Should social media be more strictly regulated?',
        minWords: 100,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'On one hand, social media should be regulated more strictly because hate speech and misinformation harm society. Platforms could be required to remove illegal content faster. On the other hand, freedom of expression must be protected. Transparent rules are needed to balance responsibility and free speech.',
        feedback: ['Structured argument with clear paragraphs.', 'Use contrast connectors (on one hand/on the other hand).'],
      },
      sprechen: {
        situation: 'Discuss the pros and cons of remote work.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Is remote work suitable for every job?',
        points: ['Advantage', 'Disadvantage', 'Example', 'Conclusion'],
        minExchanges: 4,
        modelAnswer:
          'Me: Remote work saves time but people miss colleagues.\nExaminer: Which jobs suit it?\nMe: IT jobs often, manual jobs less.\nExaminer: Your conclusion?\nMe: A hybrid model works best.',
        feedback: ['Compare both sides.', 'Support with a concrete example.'],
      },
    }),

    'en-C1': base('en', 'C1', 'Science and Ethics', {
      lesen: {
        textTitle: 'AI in Healthcare',
        text: 'Integrating artificial intelligence into medical diagnostics is promising yet raises profound ethical concerns. Algorithms may detect patterns invisible to clinicians, but accountability remains unclear when systems misinterpret data. Privacy laws must ensure sensitive patient information is not misused. Researchers stress that AI should augment rather than replace medical professionals.',
        questions: [
          mc('l1', 'What can algorithms detect?', ['A) Patterns in data', 'B) Hospital buildings', 'C) Medicines'], 'A'),
          mc('l2', 'What do researchers emphasise?', ['A) AI replaces doctors', 'B) AI supports doctors', 'C) AI is useless'], 'B'),
          rf('l3', 'Accountability issues are fully resolved.', 'F', false),
          rf('l4', 'Privacy laws are relevant.', 'T', false),
        ],
      },
      horen: {
        context: 'You will hear an expert interview.',
        transcript: 'A: Will AI revolutionise medicine?\nB: Partly, especially diagnostics.\nA: What risks do you see?\nB: Wrong decisions and lack of transparency.\nA: How can we reduce them?\nB: Independent audits and clear regulation.',
        questions: [
          mc('h1', 'Where is AI most useful?', ['A) Diagnostics', 'B) Architecture', 'C) Farming only'], 'A'),
          mc('h2', 'What does the expert suggest?', ['A) Independent audits', 'B) No rules', 'C) Less research'], 'A'),
          rf('h3', 'The expert sees no risks.', 'F', false),
        ],
      },
      gaps: [
        ['g1', 'The study suggests that risks were [BLANK].', 'underestimated', ['underestimate', 'underestimated', 'underestimating', 'underestimates']],
        ['g2', 'Provided the data are [BLANK], the system can be trained.', 'anonymised', ['anonymise', 'anonymised', 'anonymising', 'anonymises']],
        ['g3', 'Ethics committees also [BLANK] a role.', 'play', ['play', 'plays', 'played', 'playing']],
        ['g4', 'It is [BLANK] complex an issue to ignore.', 'too', ['too', 'so', 'very', 'much']],
      ],
      schreiben: {
        taskType: 'Discursive essay',
        task: 'Write about 130 words: Should AI systems be mandatory in hospitals?',
        minWords: 130,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'Mandatory deployment of AI in hospitals would be premature while legal frameworks remain uncertain. Although more accurate diagnostics could save lives, compulsory adoption might overwhelm smaller clinics financially. Furthermore, algorithms must be shown not to discriminate. A phased introduction with independent evaluation and staff training would be more prudent.',
        feedback: ['Nuanced thesis with supporting clauses.', 'Formal register appropriate for C1.'],
      },
      sprechen: {
        situation: 'Discuss ethical limits of genetic engineering.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Should genetic engineering on humans be allowed?',
        points: ['Medical benefit', 'Ethical concern', 'Regulation', 'Personal conclusion'],
        minExchanges: 5,
        modelAnswer:
          'Me: Therapeutic use yes, enhancement no.\nExaminer: Main concern?\nMe: Inequality and unforeseen consequences.\nExaminer: Who should regulate?\nMe: International bodies with transparency.',
        feedback: ['Distinguish therapeutic vs enhancement uses.', 'Address regulation explicitly.'],
      },
    }),

    'en-C2': base('en', 'C2', 'Culture and Identity', {
      lesen: {
        textTitle: 'Language and Identity',
        text: 'Language is not merely a tool of communication but embodies cultural memory and collective identity. To lose a language is to lose access to particular worldviews, not merely vocabulary. In multilingual societies, tension arises when one language is politically privileged while others are marginalised. Literary scholars note that translation builds bridges yet inevitably shifts nuance. Democratic education policy should treat multilingualism as enrichment rather than obstacle.',
        questions: [
          mc('l1', 'What is lost with a language?', ['A) Only words', 'B) Worldviews too', 'C) Passports'], 'B'),
          mc('l2', 'What do scholars say about translation?', ['A) It shifts nuance', 'B) It is pointless', 'C) It is perfect'], 'A'),
          rf('l3', 'Multilingualism is always an obstacle.', 'F', false),
          rf('l4', 'Language carries cultural memory.', 'T', false),
        ],
      },
      horen: {
        context: 'You will hear a panel on cultural policy.',
        transcript: 'A: Should the state subsidise culture?\nB: Yes, culture is a public good.\nA: But who decides what is funded?\nB: Democratic bodies with transparency.\nA: What about digital media?\nB: Quality standards are needed there too.',
        questions: [
          mc('h1', 'Why subsidise culture?', ['A) It is a public good', 'B) It is expensive only', 'C) It is outdated'], 'A'),
          mc('h2', 'Who should decide funding?', ['A) Democratic bodies', 'B) Only artists', 'C) Nobody'], 'A'),
          rf('h3', 'Digital media need no standards.', 'F', false),
        ],
      },
      gaps: [
        ['g1', 'The speech conveyed the [BLANK] that language wields power.', 'impression', ['impression', 'impressions', 'impressive', 'impressed']],
        ['g2', 'Hardly had he begun [BLANK] he received applause.', 'when', ['when', 'than', 'then', 'while']],
        ['g3', 'The argument [BLANK] itself to be convincing.', 'proved', ['prove', 'proved', 'proven', 'proving']],
        ['g4', 'So [BLANK] was the case that nothing seemed to change.', 'persistent', ['persistent', 'persistently', 'persistence', 'persisted']],
      ],
      schreiben: {
        taskType: 'Essay',
        task: 'Write about 160 words on the role of the mother tongue in a globalised world.',
        minWords: 160,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'In a globalised world, the mother tongue risks becoming a private relic while English dominates as a lingua franca. Yet the first language remains an emotional anchor and bearer of irreducible experience. To cultivate it is to preserve not only lexicon but cultural self-determination. Globalisation and language maintenance need not conflict provided education fosters multilingualism and digital spaces amplify local literatures.',
        feedback: ['Sophisticated thesis with stylistic control.', 'Near-native complexity and precision.'],
      },
      sprechen: {
        situation: 'Discuss whether globalisation erases local cultures.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Is cultural diversity threatened by globalisation?',
        points: ['Thesis', 'Counterpoint', 'Historical example', 'Balanced conclusion'],
        minExchanges: 5,
        modelAnswer:
          'Me: Diversity is threatened yet not doomed.\nExaminer: Example?\nMe: Local music finds new audiences online.\nExaminer: The danger?\nMe: Homogenisation through global brands.',
        feedback: ['Abstract reasoning with concrete support.', 'Balanced, nuanced conclusion.'],
      },
    }),
  };

  function get(subject, level) {
    const key = `${subject}-${level}`;
    const exam = BANK[key];
    if (!exam) return null;
    return JSON.parse(JSON.stringify(exam));
  }

  function has(subject, level) {
    return Boolean(BANK[`${subject}-${level}`]);
  }

  return { get, has };
})();
