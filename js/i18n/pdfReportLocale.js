/** PDF correction report UI strings (interface language, not exam content). */
function resolvePdfUiLang() {
  if (typeof resolveConsentLang === 'function') return resolveConsentLang();
  try {
    const stored = localStorage.getItem('lc_ui_lang');
    if (stored && pdfReportStrings(stored)) return stored;
  } catch (_) {}
  const nav = String(typeof navigator !== 'undefined' ? navigator.language : 'en')
    .slice(0, 2)
    .toLowerCase();
  if (nav === 'de' || nav === 'es' || nav === 'fr' || nav === 'it') return nav;
  return 'en';
}

function pdfReportStrings(lang) {
  const L = {
    en: {
      candidate: 'Candidate',
      passed: 'PASSED',
      notPassed: 'NOT PASSED',
      modules: 'Modules',
      modLesen: 'Reading',
      modHoren: 'Listening',
      modGapfill: 'Gap-Fill',
      modSchreiben: 'Writing',
      modSprechen: 'Speaking',
      mistakesByGrammar: 'Mistakes by grammar topic',
      mistakeOne: 'mistake',
      mistakeMany: 'mistakes',
      grammarCoaching: 'Grammar coaching (AI)',
      writingCorrected: 'Writing — your corrected text',
      task: 'Task',
      moduleDetail: 'Module detail',
      yours: 'Yours',
      correct: 'Correct',
      speaking: 'Speaking',
      yourAnswer: 'Your answer',
      corrected: 'Corrected',
      buildingPdf: 'Building PDF report…',
      pdfDownloaded: 'PDF downloaded.',
      pdfProFeature: 'PDF reports are a Pro feature. Upgrade to download.',
      printHintTitle: 'Before printing',
      printHintBody:
        'In the print dialog, turn off "Headers and footers" — otherwise the browser adds the page URL, date, and page numbers.',
      printHintNote:
        'Chrome/Edge: More settings → Headers and footers. Firefox & Safari: uncheck "Print headers and footers".',
      printHintContinue: 'Continue to print',
      docFooter: 'LexiCoil · lexicoil.com',
    },
    de: {
      candidate: 'Kandidat/in',
      passed: 'BESTANDEN',
      notPassed: 'NICHT BESTANDEN',
      modules: 'Module',
      modLesen: 'Lesen',
      modHoren: 'Hörverstehen',
      modGapfill: 'Gap-Fill',
      modSchreiben: 'Schreiben',
      modSprechen: 'Sprechen',
      mistakesByGrammar: 'Fehler nach Grammatikthema',
      mistakeOne: 'Fehler',
      mistakeMany: 'Fehler',
      grammarCoaching: 'Grammatik-Coaching (KI)',
      writingCorrected: 'Schreiben — korrigierter Text',
      task: 'Aufgabe',
      moduleDetail: 'Moduldetails',
      yours: 'Deine Antwort',
      correct: 'Richtig',
      speaking: 'Sprechen',
      yourAnswer: 'Deine Antwort',
      corrected: 'Korrigiert',
      buildingPdf: 'PDF-Bericht wird erstellt…',
      pdfProFeature: 'PDF-Berichte sind eine Pro-Funktion. Upgrade zum Herunterladen.',
      printHintTitle: 'Vor dem Drucken',
      printHintBody:
        'Im Druckdialog „Kopf- und Fußzeilen“ deaktivieren — sonst zeigt der Browser URL, Datum und Seitenzahlen.',
      printHintNote:
        'Chrome/Edge: Weitere Einstellungen → Kopf- und Fußzeilen. Firefox & Safari: „Kopf- und Fußzeilen drucken“ abwählen.',
      printHintContinue: 'Weiter zum Drucken',
      docFooter: 'LexiCoil · lexicoil.com',
    },
    es: {
      candidate: 'Candidato/a',
      passed: 'APROBADO',
      notPassed: 'NO APROBADO',
      modules: 'Módulos',
      modLesen: 'Lectura',
      modHoren: 'Comprensión auditiva',
      modGapfill: 'Gap-Fill',
      modSchreiben: 'Escritura',
      modSprechen: 'Expresión oral',
      mistakesByGrammar: 'Resumen de fallos por gramática',
      mistakeOne: 'error',
      mistakeMany: 'errores',
      grammarCoaching: 'Explicación gramatical (IA)',
      writingCorrected: 'Escritura — tu texto corregido',
      task: 'Tarea',
      moduleDetail: 'Detalle por módulo',
      yours: 'Tuyo',
      correct: 'Correcto',
      speaking: 'Expresión oral',
      yourAnswer: 'Tu respuesta',
      corrected: 'Corregido',
      buildingPdf: 'Generando informe PDF…',
      pdfProFeature: 'Los informes PDF son una función Pro. Actualiza para descargar.',
      printHintTitle: 'Antes de imprimir',
      printHintBody:
        'En el diálogo de impresión, desactiva «Encabezados y pies de página» — si no, el navegador añade la URL, la fecha y la numeración.',
      printHintNote:
        'Chrome/Edge: Más ajustes → Encabezados y pies de página. Firefox y Safari: desmarca «Imprimir encabezados y pies de página».',
      printHintContinue: 'Continuar a imprimir',
      docFooter: 'LexiCoil · lexicoil.com',
    },
    fr: {
      candidate: 'Candidat(e)',
      passed: 'RÉUSSI',
      notPassed: 'ÉCHOUÉ',
      modules: 'Modules',
      modLesen: 'Lecture',
      modHoren: 'Compréhension orale',
      modGapfill: 'Gap-Fill',
      modSchreiben: 'Écriture',
      modSprechen: 'Expression orale',
      mistakesByGrammar: 'Erreurs par thème grammatical',
      mistakeOne: 'erreur',
      mistakeMany: 'erreurs',
      grammarCoaching: 'Coaching grammatical (IA)',
      writingCorrected: 'Écriture — votre texte corrigé',
      task: 'Tâche',
      moduleDetail: 'Détail par module',
      yours: 'Votre réponse',
      correct: 'Correct',
      speaking: 'Expression orale',
      yourAnswer: 'Votre réponse',
      corrected: 'Corrigé',
      buildingPdf: 'Génération du rapport PDF…',
      pdfProFeature: 'Les rapports PDF sont une fonction Pro. Passez à Pro pour télécharger.',
      printHintTitle: 'Avant d’imprimer',
      printHintBody:
        'Dans la boîte d’impression, désactivez « En-têtes et pieds de page » — sinon le navigateur ajoute l’URL, la date et la pagination.',
      printHintNote:
        'Chrome/Edge : Plus de paramètres → En-têtes et pieds de page. Firefox et Safari : décocher « Imprimer les en-têtes et pieds de page ».',
      printHintContinue: 'Continuer vers l’impression',
      docFooter: 'LexiCoil · lexicoil.com',
    },
    it: {
      candidate: 'Candidato/a',
      passed: 'SUPERATO',
      notPassed: 'NON SUPERATO',
      modules: 'Moduli',
      modLesen: 'Lettura',
      modHoren: 'Comprensione orale',
      modGapfill: 'Gap-Fill',
      modSchreiben: 'Scrittura',
      modSprechen: 'Espressione orale',
      mistakesByGrammar: 'Errori per argomento grammaticale',
      mistakeOne: 'errore',
      mistakeMany: 'errori',
      grammarCoaching: 'Coaching grammaticale (IA)',
      writingCorrected: 'Scrittura — testo corretto',
      task: 'Compito',
      moduleDetail: 'Dettaglio per modulo',
      yours: 'Tuo',
      correct: 'Corretto',
      speaking: 'Espressione orale',
      yourAnswer: 'La tua risposta',
      corrected: 'Corretto',
      buildingPdf: 'Generazione report PDF…',
      pdfProFeature: 'I report PDF sono una funzione Pro. Passa a Pro per scaricare.',
      printHintTitle: 'Prima di stampare',
      printHintBody:
        'Nella finestra di stampa, disattiva «Intestazioni e piè di pagina» — altrimenti il browser aggiunge URL, data e numerazione.',
      printHintNote:
        'Chrome/Edge: Altre impostazioni → Intestazioni e piè di pagina. Firefox e Safari: deseleziona «Stampa intestazioni e piè di pagina».',
      printHintContinue: 'Continua a stampare',
      docFooter: 'LexiCoil · lexicoil.com',
    },
  };
  return L[lang] || L.en;
}

function formatMistakeCount(count, lang) {
  const t = pdfReportStrings(lang);
  const n = Number(count) || 0;
  if (n === 1) return `1 ${t.mistakeOne}`;
  return `${n} ${t.mistakeMany}`;
}

if (typeof window !== 'undefined') {
  window.pdfReportStrings = pdfReportStrings;
  window.resolvePdfUiLang = resolvePdfUiLang;
  window.formatMistakeCount = formatMistakeCount;
}
if (typeof module !== 'undefined') {
  module.exports = { pdfReportStrings, resolvePdfUiLang, formatMistakeCount };
}
