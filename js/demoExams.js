/* Demo exams: one per language x level. UTF-8. Official Goethe / Cambridge style. */
const DemoExams = (() => {
  const GOETHE = {
    A1: 'Start Deutsch 1',
    A2: 'Start Deutsch 2',
    B1: 'Goethe-Zertifikat B1',
    B2: 'Goethe-Zertifikat B2',
    C1: 'Goethe-Zertifikat C1',
    C2: 'Goethe-Zertifikat C2',
  };
  const CAMBRIDGE = {
    A1: 'A2 Key (KET)',
    A2: 'A2 Key for Schools',
    B1: 'B1 Preliminary (PET)',
    B2: 'B2 First (FCE)',
    C1: 'C1 Advanced (CAE)',
    C2: 'C2 Proficiency (CPE)',
  };

  function mc(id, q, a, b, c, correct) {
    return { id, type: 'multiple', question: q, options: [`a) ${a}`, `b) ${b}`, `c) ${c}`], correct };
  }
  function rf(id, q, correct, isDE) {
    return { id, type: isDE ? 'rf' : 'tf', question: q, correct };
  }

  function build(subject, level, topic, blocks) {
    const isDE = subject === 'de';
    const cert = isDE ? GOETHE[level] : CAMBRIDGE[level];
    return {
      demo: true,
      topic,
      level,
      lang: subject,
      official: {
        board: isDE ? 'Goethe-Institut' : 'Cambridge English',
        certificate: cert,
        note: isDE
          ? 'Modellpruefung (Demo). Format orientiert am offiziellen Goethe-Zertifikat.'
          : 'Sample exam (Demo). Format based on official Cambridge papers.',
      },
      lesen: {
        teil: isDE ? 'Teil 1: Leseverstehen' : 'Paper 1: Reading',
        instruction: blocks.lesenInstr || (isDE
          ? `Leseverstehen ${level}\nLies den Text und loese die Aufgaben 1 bis ${blocks.lesen.questions.length}.`
          : `Reading ${level}\nRead the text and answer questions 1 to ${blocks.lesen.questions.length}.`),
        textTitle: blocks.lesen.textTitle,
        text: blocks.lesen.text,
        questions: blocks.lesen.questions,
      },
      horen: {
        teil: isDE ? 'Teil 2: Hoerverstehen' : 'Paper 2: Listening',
        instruction: blocks.horenInstr || (isDE
          ? `Hoerverstehen ${level}\nSie hoeren einen Dialog. Sie hoeren den Text zweimal.`
          : `Listening ${level}\nYou will hear a conversation. You will hear the recording twice.`),
        context: blocks.horen.context,
        transcript: blocks.horen.transcript,
        questions: blocks.horen.questions,
      },
      gapfill: {
        teil: isDE ? 'Teil 3: Sprachbausteine' : 'Part 3: Language in Use',
        instruction: isDE
          ? `Sprachbausteine ${level}\nLies den Text. Waehle fuer jede Luecke die richtige Loesung (a, b oder c).`
          : `Language in use ${level}\nRead the text. Choose the correct word (a, b or c) for each gap.`,
        sentences: blocks.gaps.map(([id, text, answer, options]) => ({
          id,
          text,
          answer,
          options,
        })),
      },
      schreiben: blocks.schreiben,
      sprechen: blocks.sprechen,
    };
  }

  /* --- German exams --- */
  const DE = {
    A1: build('de', 'A1', 'Familie und Freizeit', {
      lesen: {
        textTitle: 'Text 1: Meine Familie',
        text:
          'Hallo! Ich heisse Anna. Ich bin achtzehn Jahre alt. Ich wohne in Berlin mit meiner Familie. Mein Vater heisst Thomas. Er arbeitet in einem Buero. Meine Mutter heisst Sandra. Sie ist Lehrerin. Ich habe einen Bruder. Er heisst Max und er ist fuenfzehn Jahre alt. Am Wochenende spielen wir oft Fussball im Park.',
        questions: [
          mc('l1', 'Aufgabe 1. Wie alt ist Anna?', '15 Jahre', '18 Jahre', '20 Jahre', 'b'),
          mc('l2', 'Aufgabe 2. Was macht Annas Mutter?', 'Sie arbeitet im Buero.', 'Sie ist Lehrerin.', 'Sie spielt Fussball.', 'b'),
          rf('l3', 'Aufgabe 3. Anna wohnt in Muenchen.', 'F', true),
          rf('l4', 'Aufgabe 4. Max ist der Bruder von Anna.', 'R', true),
        ],
      },
      horen: {
        context: 'Hoersituation: Zwei Freunde sprechen ueber das Wochenende.',
        transcript:
          'A: Was machst du am Samstag?\nB: Ich gehe ins Kino mit Lisa.\nA: Toll! Welcher Film?\nB: Ein deutscher Film. Er beginnt um achtzehn Uhr.\nA: Viel Spass!\nB: Danke! Und du?\nA: Ich besuche meine Grossmutter.',
        questions: [
          mc('h1', 'Aufgabe 5. Was macht Person B am Samstag?', 'Sie besucht die Grossmutter.', 'Sie geht ins Kino.', 'Sie arbeitet.', 'b'),
          mc('h2', 'Aufgabe 6. Wann beginnt der Film?', 'Um 16 Uhr', 'Um 18 Uhr', 'Um 20 Uhr', 'b'),
          rf('h3', 'Aufgabe 7. Person A geht auch ins Kino.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Ich [BLANK] aus Spanien.', 'komme', ['komme', 'kommt', 'kommen']],
        ['g2', 'Das ist [BLANK] Buch.', 'mein', ['mein', 'meine', 'meiner']],
        ['g3', 'Wir [BLANK] gern Pizza.', 'essen', ['esse', 'isst', 'essen']],
        ['g4', 'Er [BLANK] jeden Tag Deutsch.', 'lernt', ['lerne', 'lernst', 'lernt']],
      ],
      schreiben: {
        teil: 'Teil 4: Schreiben',
        taskType: 'E-Mail',
        task:
          'Aufgabe 8. Schreiben Sie eine kurze E-Mail an Ihren Freund Tom.\n\nSchreiben Sie zu folgenden Punkten:\n- Begruessung\n- Wo Sie wohnen\n- Ihre Familie\n- Eine Frage an Tom',
        minWords: 40,
        criteria: ['Inhalt (Aufgabenerfuellung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Hallo Tom,\n\nich wohne in Madrid mit meiner Familie. Mein Vater arbeitet und meine Mutter kocht gern. Ich habe eine Schwester. Sie ist zehn Jahre alt.\n\nWo wohnst du? Schreib mir bitte!\n\nViele Gruesse,\nAnna',
        feedback: ['Begruessung und Schlussformel verwenden.', 'Wohnort und Familie erwaehnen.', 'Eine Frage stellen.'],
      },
      sprechen: {
        teil: 'Teil 5: Sprechen',
        situation: 'Aufgabe 9. Sich vorstellen (Goethe A1, Teil Sprechen).',
        roleA: 'Kandidat/in',
        roleB: 'Pruefer/in',
        starterLine: 'Guten Tag! Wie heissen Sie?',
        points: ['Name', 'Alter', 'Land oder Stadt', 'Ein Hobby'],
        minExchanges: 3,
        modelAnswer:
          'Ich: Guten Tag! Ich heisse Anna.\nPruefer: Wie alt sind Sie?\nIch: Ich bin achtzehn Jahre alt.\nPruefer: Was ist Ihr Hobby?\nIch: Ich spiele gern Fussball.',
        feedback: ['Volle Saetze benutzen.', 'Form: Ich heisse ... / Ich bin ... Jahre alt.'],
      },
    }),

    B1: build('de', 'B1', 'Gesundheit und Ernaehrung', {
      lesenInstr: 'Leseverstehen B1, Teil 1\nLesen Sie den Text. Zu jedem der Aufgaben 1-4 entscheiden Sie: Richtig oder Falsch.',
      lesen: {
        textTitle: 'Text: Gesund leben',
        text:
          'Immer mehr Menschen achten heute auf eine ausgewogene Ernaehrung. Experten empfehlen, taeglich Obst und Gemuese zu essen und Zucker zu reduzieren. Regelmaessige Bewegung ist ebenfalls wichtig, denn sie staerkt das Immunsystem und reduziert Stress. Viele Berufstaetige haben jedoch wenig Zeit fuer Sport. Deshalb nutzen einige Menschen ihre Mittagspause fuer einen kurzen Spaziergang. Auch ausreichend Schlaf spielt eine grosse Rolle fuer die Konzentration am Arbeitsplatz.',
        questions: [
          mc('l1', 'Aufgabe 1. Experten empfehlen mehr Obst und Gemuese.', 'Ja', 'Nein', 'Nur am Wochenende', 'a'),
          mc('l2', 'Aufgabe 2. Warum ist Bewegung wichtig?', 'Sie reduziert Stress', 'Sie macht muede', 'Sie kostet viel Geld', 'a'),
          rf('l3', 'Aufgabe 3. Alle Berufstaetigen haben viel Zeit fuer Sport.', 'F', true),
          rf('l4', 'Aufgabe 4. Schlaf beeinflusst die Konzentration.', 'R', true),
        ],
      },
      horenInstr: 'Hoerverstehen B1\nSie hoeren ein Gespraech beim Arzt. Sie hoeren den Text zweimal.',
      horen: {
        context: 'Hoersituation: Patient und Arzt im Sprechzimmer.',
        transcript:
          'A: Guten Tag, was fehlt Ihnen?\nB: Ich habe seit drei Tagen Kopfschmerzen und bin sehr muede.\nA: Haben Sie Fieber?\nB: Nein, aber ich schlafe schlecht.\nA: Trinken Sie genug Wasser und ruhen Sie sich aus. Kommen Sie wieder, wenn es nicht besser wird.',
        questions: [
          mc('h1', 'Aufgabe 5. Seit wann hat Person B Kopfschmerzen?', 'Seit gestern', 'Seit drei Tagen', 'Seit einer Woche', 'b'),
          mc('h2', 'Aufgabe 6. Was empfiehlt der Arzt?', 'Mehr arbeiten', 'Ruhe und Wasser', 'Sofort ins Krankenhaus', 'b'),
          rf('h3', 'Aufgabe 7. Person B hat Fieber.', 'F', true),
        ],
      },
      gaps: [
        ['g1', 'Obwohl er muede war, [BLANK] er weiter.', 'arbeitete', ['arbeitete', 'arbeiten', 'arbeitet']],
        ['g2', 'Ich wuerde gern mehr Sport [BLANK].', 'machen', ['machen', 'macht', 'machte']],
        ['g3', 'Man sollte regelmaessig [BLANK].', 'schlafen', ['schlafen', 'schlaeft', 'schlief']],
        ['g4', 'Er hat gesagt, dass er [BLANK] kommt.', 'spaeter', ['spaeter', 'spaet', 'sptestens']],
      ],
      schreiben: {
        teil: 'Teil 4: Schreiben',
        taskType: 'Meinungsaeusserung',
        task:
          'Aufgabe 8. Schreiben Sie einen Text von ca. 80 Woertern.\n\nThema: Sollte man in der Schule mehr ueber gesunde Ernaehrung lernen?\n\n- Nennen Sie mindestens zwei Argumente.\n- Begruenden Sie Ihre Meinung.',
        minWords: 80,
        criteria: ['Inhalt (Aufgabenerfuellung)', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
        modelAnswer:
          'Meiner Meinung nach sollte man in der Schule mehr ueber gesunde Ernaehrung lernen. Viele Jugendliche essen zu viel Fast Food und wissen nicht, welche Lebensmittel wichtig sind. Wenn Schueler frueh lernen, wie man sich ausgewogen ernaehrt, koennen sie spaeter gesuender leben. Ausserdem koennte die Schule gesunde Mahlzeiten anbieten.',
        feedback: ['Klare Meinung formulieren.', 'Mindestens zwei Begruendungen.', 'Konnektoren: weil, ausserdem.'],
      },
      sprechen: {
        teil: 'Teil 5: Sprechen',
        situation: 'Aufgabe 9. Diskussion: Sportangebote im Unternehmen (Goethe B1).',
        roleA: 'Kandidat/in',
        roleB: 'Pruefer/in',
        starterLine: 'Was halten Sie von Sportangeboten im Unternehmen?',
        points: ['Vorteil fuer Mitarbeiter', 'Kosten fuer die Firma', 'Beispiel', 'Ihre Meinung'],
        minExchanges: 4,
        modelAnswer:
          'Ich: Ich finde das sinnvoll, weil Mitarbeiter gesuender bleiben.\nPruefer: Kostet das nicht viel?\nIch: Ja, aber gesunde Mitarbeiter fehlen seltener.\nPruefer: Haben Sie ein Beispiel?\nIch: Meine Firma bietet Yoga an.',
        feedback: ['Meinung begruenden.', 'Auf Gegenargument reagieren.'],
      },
    }),
  };

  /* Fill remaining DE levels from compact templates */
  ['A2', 'B2', 'C1', 'C2'].forEach((lv) => {
    if (DE[lv]) return;
    const baseB1 = DE.B1;
    DE[lv] = build('de', lv, baseB1.topic, {
      lesen: { ...baseB1.lesen, questions: baseB1.lesen.questions.map((q) => ({ ...q, id: 'l' + q.id.slice(1) })) },
      horen: { ...baseB1.horen, questions: baseB1.horen.questions.map((q) => ({ ...q, id: 'h' + q.id.slice(1) })) },
      gaps: baseB1.gapfill.sentences.map((s, i) => [`g${i + 1}`, s.text, s.answer, s.options]),
      schreiben: { ...baseB1.schreiben, minWords: { A2: 60, B2: 100, C1: 130, C2: 160 }[lv] },
      sprechen: { ...baseB1.sprechen, minExchanges: { A2: 3, B2: 4, C1: 5, C2: 5 }[lv] },
    });
    DE[lv].level = lv;
    DE[lv].official.certificate = GOETHE[lv];
  });

  /* Fix A2 separately with unique content */
  DE.A2 = build('de', 'A2', 'Reisen und Einkaufen', {
    lesen: {
      textTitle: 'Text: Ein Wochenende in Hamburg',
      text:
        'Letztes Wochenende bin ich mit meinem Freund nach Hamburg gefahren. Wir sind mit dem Zug gefahren. In Hamburg haben wir den Hafen besucht. Am Sonntag haben wir eingekauft. Ich habe ein T-Shirt gekauft, aber die Schuhe waren zu teuer. Am Abend sind wir muede aber gluecklich nach Hause gefahren.',
      questions: [
        mc('l1', 'Aufgabe 1. Wie sind sie gereist?', 'Mit dem Auto', 'Mit dem Zug', 'Mit dem Flugzeug', 'b'),
        mc('l2', 'Aufgabe 2. Was haben sie am Sonntag gemacht?', 'Den Hafen besucht', 'Eingekauft', 'Gearbeitet', 'b'),
        rf('l3', 'Aufgabe 3. Die Schuhe waren guenstig.', 'F', true),
        rf('l4', 'Aufgabe 4. Sie sind mit dem Zug gefahren.', 'R', true),
      ],
    },
    horen: {
      context: 'Hoersituation: Kunde in einem Geschaeft.',
      transcript:
        'A: Guten Tag! Kann ich Ihnen helfen?\nB: Ja, ich suche eine Jacke in Groesse M.\nA: Diese Jacke kostet neunundfuenfzig Euro.\nB: Haben Sie sie auch in Blau?\nA: Ja, hier bitte.\nB: Gut, ich nehme sie.',
      questions: [
        mc('h1', 'Aufgabe 5. Was sucht Person B?', 'Eine Hose', 'Eine Jacke', 'Ein Hemd', 'b'),
        mc('h2', 'Aufgabe 6. Wie viel kostet die Jacke?', '49 Euro', '59 Euro', '69 Euro', 'b'),
        rf('h3', 'Aufgabe 7. Person B kauft die Jacke.', 'R', true),
      ],
    },
    gaps: [
      ['g1', 'Gestern [BLANK] ich im Supermarkt.', 'war', ['war', 'bin', 'hat']],
      ['g2', 'Kannst du mir [BLANK]?', 'helfen', ['helfen', 'hilft', 'hilfst']],
      ['g3', 'Wir [BLANK] naechste Woche nach Berlin.', 'fahren', ['fahren', 'fahre', 'faehrt']],
      ['g4', 'Das Wetter [BLANK] gestern schlecht.', 'war', ['war', 'ist', 'wird']],
    ],
    schreiben: {
      teil: 'Teil 4: Schreiben',
      taskType: 'Persoenlicher Brief',
      task:
        'Aufgabe 8. Schreiben Sie an Ihre Freundin Maria ueber Ihren letzten Urlaub.\n\n- Wohin Sie gefahren sind\n- Wie Sie gereist sind\n- Was Sie gemacht haben\n- Einladung an Maria',
      minWords: 60,
      criteria: ['Inhalt', 'Kommunikative Gestaltung', 'Formale Richtigkeit'],
      modelAnswer:
        'Liebe Maria,\n\nletzte Woche bin ich nach Hamburg gefahren. Ich bin mit dem Zug gefahren. Dort habe ich den Hafen besucht. Es war sehr schoen!\n\nKommst du naechstes Mal mit?\n\nLiebe Gruesse,\nTom',
      feedback: ['Perfekt fuer Vergangenheit.', 'Alle vier Punkte ansprechen.'],
    },
    sprechen: {
      teil: 'Teil 5: Sprechen',
      situation: 'Aufgabe 9. Ueber eine Reise sprechen (Goethe A2).',
      roleA: 'Kandidat/in',
      roleB: 'Pruefer/in',
      starterLine: 'Wohin moechten Sie in den Ferien fahren?',
      points: ['Reiseziel', 'Verkehrsmittel', 'Reisepartner', 'Grund'],
      minExchanges: 3,
      modelAnswer:
        'Ich: Ich moechte nach Oesterreich fahren.\nPruefer: Mit wem?\nIch: Mit meiner Freundin.\nPruefer: Warum?\nIch: Weil wir gern wandern.',
      feedback: ['moechte / werde ... fahren', 'Mindestens drei Details nennen.'],
    },
  });

  /* English exams */
  const EN = {
    B1: build('en', 'B1', 'Health and Lifestyle', {
      lesenInstr: 'Reading Part 1\nRead the text below and answer questions 1-4. For questions 3-4, mark T (True) or F (False).',
      lesen: {
        textTitle: 'Text: Healthy Habits',
        text:
          'More people today are trying to live healthier lives. Doctors recommend eating more vegetables and doing regular exercise. However, many office workers sit for long hours and do not have time for the gym. Some companies now encourage walking meetings. Sleep is also important because it helps concentration and reduces stress. Small daily changes can make a big difference over time.',
        questions: [
          mc('l1', 'Question 1. What do doctors recommend?', 'Less sleep', 'More vegetables', 'More sugar', 'b'),
          mc('l2', 'Question 2. Why is sleep important?', 'It helps concentration', 'It costs money', 'It stops exercise', 'a'),
          rf('l3', 'Question 3. All office workers go to the gym.', 'F', false),
          rf('l4', 'Question 4. Small changes can help.', 'T', false),
        ],
      },
      horenInstr: 'Listening Part 1\nYou will hear a conversation at the doctor. You will hear the recording twice.',
      horen: {
        context: 'Situation: A patient talking to a doctor.',
        transcript:
          'A: What seems to be the problem?\nB: I have had headaches for three days and I feel tired.\nA: Do you have a fever?\nB: No, but I sleep badly.\nA: Drink water and rest. Come back if it gets worse.',
        questions: [
          mc('h1', 'Question 5. How long has the patient had headaches?', 'One day', 'Three days', 'A week', 'b'),
          mc('h2', 'Question 6. What does the doctor suggest?', 'Rest and water', 'More work', 'Surgery', 'a'),
          rf('h3', 'Question 7. The patient has a fever.', 'F', false),
        ],
      },
      gaps: [
        ['g1', 'If you exercise regularly, you will feel [BLANK].', 'better', ['good', 'better', 'best']],
        ['g2', 'She has [BLANK] finished her homework.', 'already', ['already', 'yet', 'still']],
        ['g3', 'I am looking forward [BLANK] the weekend.', 'to', ['to', 'for', 'at']],
        ['g4', 'He suggested [BLANK] more water.', 'drinking', ['drink', 'drinking', 'to drink']],
      ],
      schreiben: {
        teil: 'Paper 3: Writing',
        taskType: 'Opinion essay',
        task:
          'Question 8. Write about 80 words on the following topic:\n\nShould schools teach more about healthy eating?\n\nGive at least two reasons for your opinion.',
        minWords: 80,
        criteria: ['Content and Task Achievement', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'In my opinion, schools should teach more about healthy eating because many teenagers eat too much fast food. If students learn early how to cook simple meals, they can make better choices later. Schools could also offer healthier lunches instead of sugary snacks.',
        feedback: ['Clear opinion in the opening.', 'At least two reasons.', 'Use linking words like because.'],
      },
      sprechen: {
        teil: 'Paper 4: Speaking',
        situation: 'Question 9. Discussion: fitness programmes at work (PET-style).',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Do you think companies should pay for employee fitness programmes?',
        points: ['Advantage', 'Disadvantage', 'Example', 'Your opinion'],
        minExchanges: 4,
        modelAnswer:
          'Me: Yes, because healthy staff work better.\nExaminer: Is it not expensive?\nMe: Maybe, but sick days cost more.\nExaminer: Any example?\nMe: My company offers yoga classes.',
        feedback: ['Give reasons, not only yes or no.', 'Respond to the examiner.'],
      },
    }),
  };

  EN.A1 = build('en', 'A1', 'Daily Life', {
    lesen: {
      textTitle: 'Text: My Daily Routine',
      text:
        'Hello! My name is James. I am twenty years old. I live in London with my family. I wake up at seven o clock. I eat breakfast and drink tea. Then I go to work by bus. I work in a small shop. In the evening I watch TV with my sister. We like music and football.',
      questions: [
        mc('l1', 'Question 1. How old is James?', '18', '20', '25', 'b'),
        mc('l2', 'Question 2. How does he go to work?', 'By car', 'By bus', 'By train', 'b'),
        rf('l3', 'Question 3. James lives alone.', 'F', false),
        rf('l4', 'Question 4. He watches TV in the evening.', 'T', false),
      ],
    },
    horen: {
      context: 'Situation: Two friends planning lunch.',
      transcript:
        'A: Are you hungry?\nB: Yes, very hungry.\nA: Let us eat at the cafe.\nB: Good idea. I want a sandwich.\nA: Me too. And some water.\nB: OK, let us go now.',
      questions: [
        mc('h1', 'Question 5. Where do they want to eat?', 'At home', 'At the cafe', 'At school', 'b'),
        mc('h2', 'Question 6. What does Person B want?', 'Pizza', 'A sandwich', 'Soup', 'b'),
        rf('h3', 'Question 7. They want to go later.', 'F', false),
      ],
    },
    gaps: [
      ['g1', 'She [BLANK] from Italy.', 'is', ['is', 'are', 'am']],
      ['g2', 'I [BLANK] English every day.', 'study', ['study', 'studies', 'studying']],
      ['g3', 'They [BLANK] happy today.', 'are', ['is', 'are', 'am']],
      ['g4', 'He [BLANK] a teacher.', 'is', ['is', 'are', 'have']],
    ],
    schreiben: {
      teil: 'Paper 3: Writing',
      taskType: 'Personal email',
      task:
        'Question 8. Write a short email to your friend.\n\nInclude:\n- Greeting\n- Your job or school\n- Your hobby\n- A question',
      minWords: 40,
      criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
      modelAnswer:
        'Hi Tom,\n\nI work in a shop in London. I like football and music. I play football on Saturday.\n\nDo you like football too?\n\nBest wishes,\nJames',
      feedback: ['Simple present tense.', 'Include all four points.'],
    },
    sprechen: {
      teil: 'Paper 4: Speaking',
      situation: 'Question 9. Introduce yourself (Key-style).',
      roleA: 'Candidate',
      roleB: 'Examiner',
      starterLine: 'Hello. What is your name?',
      points: ['Name', 'Age or country', 'Job or study', 'One hobby'],
      minExchanges: 3,
      modelAnswer:
        'Me: My name is James.\nExaminer: Where are you from?\nMe: I am from London.\nExaminer: What is your hobby?\nMe: I like football.',
      feedback: ['Use full short sentences.', 'Answer each question clearly.'],
    },
  });

  ['A2', 'B2', 'C1', 'C2'].forEach((lv) => {
    if (lv === 'A2') {
      EN.A2 = build('en', 'A2', 'Travel and Shopping', {
        lesen: {
          textTitle: 'Text: A Trip to Edinburgh',
          text:
            'Last month I visited Edinburgh with my brother. We travelled by train. The city was beautiful. We visited a castle and bought souvenirs. The weather was cold but sunny. We ate fish and chips for lunch. I want to go back next year.',
          questions: [
            mc('l1', 'Question 1. How did they travel?', 'By plane', 'By train', 'By car', 'b'),
            mc('l2', 'Question 2. What did they buy?', 'Clothes', 'Souvenirs', 'Books', 'b'),
            rf('l3', 'Question 3. The weather was hot.', 'F', false),
            rf('l4', 'Question 4. They visited a castle.', 'T', false),
          ],
        },
        horen: {
          context: 'Situation: Customer in a clothes shop.',
          transcript:
            'A: Can I help you?\nB: Yes, I need a jacket, size medium.\nA: This one is forty-five pounds.\nB: Do you have it in blue?\nA: Yes, here you are.\nB: Perfect, I will take it.',
          questions: [
            mc('h1', 'Question 5. What is the customer looking for?', 'Shoes', 'A jacket', 'A hat', 'b'),
            mc('h2', 'Question 6. How much is the jacket?', '35 pounds', '45 pounds', '55 pounds', 'b'),
            rf('h3', 'Question 7. The customer buys the jacket.', 'T', false),
          ],
        },
        gaps: [
          ['g1', 'I [BLANK] to the cinema yesterday.', 'went', ['go', 'went', 'going']],
          ['g2', 'She is [BLANK] than her sister.', 'taller', ['tall', 'taller', 'tallest']],
          ['g3', 'We [BLANK] watching a film now.', 'are', ['is', 'are', 'am']],
          ['g4', 'He does not [BLANK] coffee.', 'like', ['likes', 'like', 'liked']],
        ],
        schreiben: {
          teil: 'Paper 3: Writing',
          taskType: 'Personal email',
          task:
            'Question 8. Write to your friend about a trip.\n\n- Where you went\n- How you travelled\n- What you did\n- Invite your friend',
          minWords: 60,
          criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
          modelAnswer:
            'Hi Anna,\n\nLast week I went to Edinburgh by train. I visited a castle and bought souvenirs. The food was great!\n\nWould you like to come with me next time?\n\nBest wishes,\nTom',
          feedback: ['Past simple for completed actions.', 'Cover all four points.'],
        },
        sprechen: {
          teil: 'Paper 4: Speaking',
          situation: 'Question 9. Talk about a holiday (Key-style).',
          roleA: 'Candidate',
          roleB: 'Examiner',
          starterLine: 'Where did you go on your last holiday?',
          points: ['Place', 'Transport', 'Activity', 'Feeling'],
          minExchanges: 3,
          modelAnswer:
            'Me: I went to Scotland.\nExaminer: How did you travel?\nMe: By train.\nExaminer: Did you enjoy it?\nMe: Yes, it was fantastic.',
          feedback: ['Past tense consistently.', 'More than one-word answers.'],
        },
      });
      return;
    }
    const b = EN.B1;
    EN[lv] = build('en', lv, b.topic, {
      lesen: { ...b.lesen, questions: b.lesen.questions.map((q) => ({ ...q })) },
      horen: { ...b.horen, questions: b.horen.questions.map((q) => ({ ...q })) },
      gaps: b.gapfill.sentences.map((s, i) => [`g${i + 1}`, s.text, s.answer, s.options]),
      schreiben: { ...b.schreiben, minWords: { B2: 100, C1: 130, C2: 160 }[lv] || 80 },
      sprechen: { ...b.sprechen, minExchanges: { B2: 4, C1: 5, C2: 5 }[lv] || 4 },
    });
    EN[lv].level = lv;
    EN[lv].official.certificate = CAMBRIDGE[lv];
  });

  const BANK = {};
  Object.keys(DE).forEach((lv) => {
    BANK[`de-${lv}`] = DE[lv];
  });
  Object.keys(EN).forEach((lv) => {
    BANK[`en-${lv}`] = EN[lv];
  });

  function get(subject, level) {
    const exam = BANK[`${subject}-${level}`];
    return exam ? JSON.parse(JSON.stringify(exam)) : null;
  }

  function has(subject, level) {
    return Boolean(BANK[`${subject}-${level}`]);
  }

  return { get, has };
})();
