/** Exam UI strings by content language (de / en / es). */
function resolveExamLang(d, fallbackSubject) {
  const raw = d?.lang || fallbackSubject || 'en';
  if (raw === 'de' || raw === 'german') return 'de';
  if (raw === 'es' || raw === 'spanish') return 'es';
  return 'en';
}

function examUiStrings(lang) {
  if (lang === 'de') {
    return {
      lang: 'de',
      reading: 'Lesen',
      listening: 'Hörverstehen',
      writing: 'Schreiben',
      speaking: 'Sprechen',
      teil: 'Teil',
      modWord: 'Modul',
      trueL: 'Richtig',
      falseL: 'Falsch',
      trueK: 'R',
      speechLang: 'de-DE',
      writePh: 'Schreiben Sie hier...',
      words: 'Wörter',
      fields: 'Felder',
      transcript: 'Transkript',
      play: 'Audio abspielen',
      noPlays: 'Keine Wiedergaben',
      audioOnly: 'Nur Audio — kein Transkript im Prüfungsmodus.',
      hearOnce: 'einmal',
      hearTwice: 'zweimal',
      hearIntro: (n) => `Sie hören den Text <b>${n === 1 ? 'einmal' : 'zweimal'}</b>.`,
      option: 'Anzeige',
      card: 'Karte:',
      me: 'Ich:',
      examiner: 'Prüfer:',
      speakFmt: 'Ihre Antwort (Format <b>Ich:</b> / <b>Prüfer:</b>)',
      modHint:
        'Das Modul besteht aus mehreren Teilen. Für jede Aufgabe gibt es nur eine richtige Lösung.',
      partial: '⚠ Dieser Teil konnte nicht vollständig generiert werden.',
      partialListen:
        '⚠ Dieser Teil konnte nicht vollständig generiert werden. Bitte den Untertest überspringen.',
      recording: 'Hörtext',
      pass: 'Bestanden ✓',
      close: 'Knapp',
      fail: 'Nicht bestanden',
      translatePassage: 'Passage übersetzen',
      translatingPassage: 'Übersetze…',
      translateFail: 'Passage konnte nicht übersetzt werden.',
    };
  }
  if (lang === 'es') {
    return {
      lang: 'es',
      reading: 'Comprensión de lectura',
      listening: 'Comprensión auditiva',
      writing: 'Expresión escrita',
      speaking: 'Expresión oral',
      teil: 'Parte',
      modWord: 'Prueba',
      trueL: 'Verdadero',
      falseL: 'Falso',
      trueK: 'V',
      speechLang: 'es-ES',
      writePh: 'Escriba aquí...',
      words: 'palabras',
      fields: 'campos',
      transcript: 'Transcripción',
      play: 'Reproducir audio',
      noPlays: 'Sin reproducciones',
      audioOnly: 'Solo audio — sin transcripción en modo examen.',
      hearOnce: 'una vez',
      hearTwice: 'dos veces',
      hearIntro: (n) => `Escuchará la grabación <b>${n === 1 ? 'una vez' : 'dos veces'}</b>.`,
      option: 'Opción',
      card: 'Tarjeta:',
      me: 'Yo:',
      examiner: 'Examinador:',
      speakFmt: 'Su respuesta (formato <b>Yo:</b> / <b>Examinador:</b>)',
      modHint: 'Esta prueba tiene varias partes. Solo hay una respuesta correcta por tarea.',
      partial: '⚠ Esta parte no se pudo generar por completo.',
      partialListen: '⚠ Esta parte no se pudo generar por completo. Puede omitir esta sección.',
      recording: 'Grabación',
      pass: 'Apto ✓',
      close: 'Ajustado',
      fail: 'No apto',
      translatePassage: 'Traducir pasaje',
      translatingPassage: 'Traduciendo…',
      translateFail: 'No se pudo traducir el pasaje.',
    };
  }
  return {
    lang: 'en',
    reading: 'Reading',
    listening: 'Listening',
    writing: 'Writing',
    speaking: 'Speaking',
    teil: 'Part',
    modWord: 'Paper',
    trueL: 'True',
    falseL: 'False',
    trueK: 'T',
    speechLang: 'en-GB',
    writePh: 'Write your text here...',
    words: 'words',
    fields: 'fields',
    transcript: 'Transcript',
    play: 'Play audio',
    noPlays: 'No plays left',
    audioOnly: 'Audio only — no transcript in exam mode.',
    hearOnce: 'once',
    hearTwice: 'twice',
    hearIntro: (n) => `You will hear this recording <b>${n === 1 ? 'once' : 'twice'}</b>.`,
    option: 'Option',
    card: 'Card:',
    me: 'Me:',
    examiner: 'Examiner:',
    speakFmt: 'Your response (format <b>Me:</b> / <b>Examiner:</b>)',
    modHint: 'This paper has several parts. There is only one correct answer for each task.',
    partial: '⚠ This section could not be fully generated.',
    partialListen: '⚠ This section could not be fully generated. Please skip this sub-test.',
    recording: 'Recording',
    pass: 'Pass ✓',
    close: 'Close',
    fail: 'Fail',
    translatePassage: 'Translate passage',
    translatingPassage: 'Translating…',
    translateFail: 'Could not translate this passage.',
  };
}

if (typeof window !== 'undefined') {
  window.resolveExamLang = resolveExamLang;
  window.examUiStrings = examUiStrings;
}
if (typeof module !== 'undefined') module.exports = { resolveExamLang, examUiStrings };
