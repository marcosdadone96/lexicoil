/**
 * Vocabulary module UI strings + unified interface/translation language.
 *
 * CANONICAL UI + TRANSLATION LANG: localStorage `lc_ui_lang` via resolveVocabUiLang() / setVocabUiLang().
 * Mirrors in memory: S.ui, S.fcLang, S.vocabLang (always kept in sync on write).
 * Reads for translations/hover should use translationLang() — never a stale S.vocabLang alone.
 *
 * INTENTIONAL EXCEPTIONS (do NOT sync to lc_ui_lang):
 * - S.subject / S.examData.lang — language being learned (exam content stays German/English/Spanish).
 * - lc_ve_hint_lang — quiz hint mode: "interface" (UI lang) vs "immersion" (source lang).
 * - hintLanguageMode === "immersion" — AI quiz hints in exam subject language, not UI lang.
 * - Library defaultMetaLanguage — fallback when manifest has no user preference (content metadata path).
 * - navigator.language — consent banner only (resolveConsentLang), not vocab translations.
 * - Server ttsVoices map — per spoken language, not UI translation language.
 */
function vocabModuleStrings(lang) {
  const L = {
    en: {
      interfaceLang: 'Interface',
      home: 'Home',
      vocabulary: 'Vocabulary',
      deck: 'deck',
      quizBadge: 'Vocab quiz',
      phrasesBadge: 'Phrases',
      phrasesTitle: 'Phrase practice',
      questionOf: (n, total) => `Question ${n} of ${total}`,
      phraseOf: (n, total) => `Phrase ${n} of ${total}`,
      score: (n) => `Score: ${n}`,
      gapPhase: 'Gap fill',
      orderPhase: 'Word order',
      synonym: 'Synonym',
      antonym: 'Antonym',
      hint: 'Hint',
      hintGerman: 'German',
      hintSpanish: 'Spanish',
      hintEnglish: 'English',
      hintFrench: 'French',
      hintItalian: 'Italian',
      whichWord: 'Which word matches this clue?',
      completePhrase: 'Complete the phrase',
      whichFits: 'Which word fits the blank?',
      putInOrder: 'Put the words in order',
      orderMeta: 'Tap words to build the sentence (German word order)',
      correct: '✓ Correct!',
      notQuite: '✗ Not quite — the answer is:',
      wordWas: '✗ The word was:',
      perfectOrder: '✓ Perfect order!',
      correctOrder: '✗ Correct order:',
      nextQuestion: 'Next question →',
      seeResults: 'See results →',
      orderWords: 'Order the words →',
      nextPhrase: 'Next phrase →',
      backToVocab: '← Back to vocabulary',
      backToDeck: '← Back to deck',
      correctCount: (score, total) => `${score}/${total} correct`,
      stepsCorrect: (score, total) => `${score}/${total} steps correct`,
      generatingQuiz: 'Generating quiz…',
      generatingQuizSub: (credits) => `AI is writing hints from your vocabulary (${credits} credits)`,
      buildingPhrases: 'Building phrases…',
      buildingPhrasesSub: (credits) => `AI is writing everyday sentences (${credits} credit)`,
      preparingListening: 'Preparing listening game…',
      preparingListeningSub: (credits) => `AI is writing a short monologue (${credits} credits)`,
      quizLede: (goal, words, credits) => `${goal} · ${words} words · AI hints · ${credits} credits`,
      phrasesLede: (goal, n, credits) => `${goal} · ${n} phrases · ${credits} credit`,
      questionsTitle: (n) => `${n} questions`,
      again: 'Again',
      hard: 'Hard',
      good: 'Good',
      easy: 'Easy',
      translation: 'Translation',
      cardOf: (n, total) => `Card ${n} of ${total}`,
      tapFlip: 'Tap card for translation',
      pronounce: '🔊 Pronounce',
      prev: '← Prev',
      next: 'Next →',
      flashcardsTitle: 'Flashcards',
      flashcardsLede: (n, dueNote) => `${n} word${n === 1 ? '' : 's'} selected${dueNote} · flip the card, then rate Again/Hard/Good/Easy.`,
      dueFirst: ' · reviewing all selected',
      dueNote: (n) => (n > 0 ? ` · ${n} due first` : ' · reviewing all selected'),
      listeningTitle: 'Listening game',
      listeningIntroMono:
        'Listen to a short monologue (twice). Tick the words from your list you hear — they may appear in a different form.',
      listeningPlay: '▶ Play',
      listeningReplay: '▶ Play again (1 left)',
      listeningPlaying: 'Playing…',
      listeningCheck: 'Check',
      listeningAgain: 'New round',
      listeningPick: 'Which words did you hear?',
      listeningHeard: 'Appeared',
      listeningMissing: 'Were absent (the missing ones)',
      listeningScore: (c, t) => `You got ${c} of ${t}`,
      listeningTooFew: 'You need at least 2 words to play.',
      transcript: 'Transcript',
      clear: 'Clear',
      checkOrder: 'Check order',
      yourDeck: 'Your deck',
    },
    es: {
      interfaceLang: 'Interfaz',
      home: 'Inicio',
      vocabulary: 'Vocabulario',
      deck: 'mazo',
      quizBadge: 'Quiz vocabulario',
      phrasesBadge: 'Frases',
      phrasesTitle: 'Práctica de frases',
      questionOf: (n, total) => `Pregunta ${n} de ${total}`,
      phraseOf: (n, total) => `Frase ${n} de ${total}`,
      score: (n) => `Puntos: ${n}`,
      gapPhase: 'Rellenar hueco',
      orderPhase: 'Orden de palabras',
      synonym: 'Sinónimo',
      antonym: 'Antónimo',
      hint: 'Pista',
      hintGerman: 'alemán',
      hintSpanish: 'español',
      hintEnglish: 'inglés',
      hintFrench: 'francés',
      hintItalian: 'italiano',
      whichWord: '¿Qué palabra encaja con esta pista?',
      completePhrase: 'Completa la frase',
      whichFits: '¿Qué palabra encaja en el hueco?',
      putInOrder: 'Ordena las palabras',
      orderMeta: 'Toca las palabras para formar la frase (orden alemán)',
      correct: '✓ ¡Correcto!',
      notQuite: '✗ Casi — la respuesta es:',
      wordWas: '✗ La palabra era:',
      perfectOrder: '✓ ¡Orden perfecto!',
      correctOrder: '✗ Orden correcto:',
      nextQuestion: 'Siguiente pregunta →',
      seeResults: 'Ver resultados →',
      orderWords: 'Ordenar palabras →',
      nextPhrase: 'Siguiente frase →',
      backToVocab: '← Volver al vocabulario',
      backToDeck: '← Volver al mazo',
      correctCount: (score, total) => `${score}/${total} correctas`,
      stepsCorrect: (score, total) => `${score}/${total} pasos correctos`,
      generatingQuiz: 'Generando quiz…',
      generatingQuizSub: (credits) => `La IA escribe pistas con tu vocabulario (${credits} créditos)`,
      buildingPhrases: 'Creando frases…',
      buildingPhrasesSub: (credits) => `La IA escribe frases cotidianas (${credits} crédito)`,
      preparingListening: 'Preparando juego de escucha…',
      preparingListeningSub: (credits) => `La IA escribe un monólogo corto (${credits} créditos)`,
      quizLede: (goal, words, credits) => `${goal} · ${words} palabras · pistas IA · ${credits} créditos`,
      phrasesLede: (goal, n, credits) => `${goal} · ${n} frases · ${credits} crédito`,
      questionsTitle: (n) => `${n} preguntas`,
      again: 'Otra vez',
      hard: 'Difícil',
      good: 'Bien',
      easy: 'Fácil',
      translation: 'Traducción',
      cardOf: (n, total) => `Tarjeta ${n} de ${total}`,
      tapFlip: 'Toca la tarjeta para la traducción',
      pronounce: '🔊 Pronunciar',
      prev: '← Ant.',
      next: 'Sig. →',
      flashcardsTitle: 'Tarjetas',
      flashcardsLede: (n, dueNote) => `${n} palabra${n === 1 ? '' : 's'} seleccionada${n === 1 ? '' : 's'}${dueNote} · voltea la tarjeta y valora Otra vez/Difícil/Bien/Fácil.`,
      dueFirst: ' · repasando todas las seleccionadas',
      dueNote: (n) => (n > 0 ? ` · ${n} pendientes primero` : ' · repasando todas las seleccionadas'),
      listeningTitle: 'Juego de escucha',
      listeningIntroMono:
        'Escucha un monólogo corto (dos veces). Marca las palabras de tu lista que oigas — pueden aparecer en otra forma.',
      listeningPlay: '▶ Reproducir',
      listeningReplay: '▶ Repetir (1 vez más)',
      listeningPlaying: 'Reproduciendo…',
      listeningCheck: 'Comprobar',
      listeningAgain: 'Otra ronda',
      listeningPick: '¿Qué palabras has oído?',
      listeningHeard: 'Aparecieron',
      listeningMissing: 'No aparecían (las que faltaban)',
      listeningScore: (c, t) => `Acertaste ${c} de ${t}`,
      listeningTooFew: 'Necesitas al menos 2 palabras para jugar.',
      transcript: 'Transcripción',
      clear: 'Borrar',
      checkOrder: 'Comprobar orden',
      yourDeck: 'Tu mazo',
    },
    fr: {
      interfaceLang: 'Interface',
      home: 'Accueil',
      vocabulary: 'Vocabulaire',
      deck: 'paquet',
      quizBadge: 'Quiz vocabulaire',
      phrasesBadge: 'Phrases',
      phrasesTitle: 'Pratique de phrases',
      questionOf: (n, total) => `Question ${n} sur ${total}`,
      phraseOf: (n, total) => `Phrase ${n} sur ${total}`,
      score: (n) => `Score : ${n}`,
      gapPhase: 'Texte à trous',
      orderPhase: 'Ordre des mots',
      synonym: 'Synonyme',
      antonym: 'Antonyme',
      hint: 'Indice',
      hintGerman: 'allemand',
      hintSpanish: 'espagnol',
      hintEnglish: 'anglais',
      hintFrench: 'français',
      hintItalian: 'italien',
      whichWord: 'Quel mot correspond à cet indice ?',
      completePhrase: 'Complétez la phrase',
      whichFits: 'Quel mot convient au trou ?',
      putInOrder: 'Remettez les mots dans l’ordre',
      orderMeta: 'Touchez les mots pour former la phrase (ordre allemand)',
      correct: '✓ Correct !',
      notQuite: '✗ Pas tout à fait — la réponse est :',
      wordWas: '✗ Le mot était :',
      perfectOrder: '✓ Ordre parfait !',
      correctOrder: '✗ Ordre correct :',
      nextQuestion: 'Question suivante →',
      seeResults: 'Voir les résultats →',
      orderWords: 'Ordonner les mots →',
      nextPhrase: 'Phrase suivante →',
      backToVocab: '← Retour au vocabulaire',
      backToDeck: '← Retour au paquet',
      correctCount: (score, total) => `${score}/${total} correctes`,
      stepsCorrect: (score, total) => `${score}/${total} étapes correctes`,
      generatingQuiz: 'Génération du quiz…',
      generatingQuizSub: (credits) => `L’IA rédige des indices à partir de votre vocabulaire (${credits} crédits)`,
      buildingPhrases: 'Création des phrases…',
      buildingPhrasesSub: (credits) => `L’IA écrit des phrases du quotidien (${credits} crédit)`,
      preparingListening: 'Préparation du jeu d’écoute…',
      preparingListeningSub: (credits) => `L’IA écrit un court monologue (${credits} crédits)`,
      quizLede: (goal, words, credits) => `${goal} · ${words} mots · indices IA · ${credits} crédits`,
      phrasesLede: (goal, n, credits) => `${goal} · ${n} phrases · ${credits} crédit`,
      questionsTitle: (n) => `${n} questions`,
      again: 'Encore',
      hard: 'Difficile',
      good: 'Bien',
      easy: 'Facile',
      translation: 'Traduction',
      cardOf: (n, total) => `Carte ${n} sur ${total}`,
      tapFlip: 'Touchez la carte pour la traduction',
      pronounce: '🔊 Prononcer',
      prev: '← Préc.',
      next: 'Suiv. →',
      flashcardsTitle: 'Cartes',
      flashcardsLede: (n, dueNote) => `${n} mot${n === 1 ? '' : 's'} sélectionné${n === 1 ? '' : 's'}${dueNote} · retournez la carte puis notez Encore/Difficile/Bien/Facile.`,
      dueFirst: ' · révision de toute la sélection',
      dueNote: (n) => (n > 0 ? ` · ${n} à réviser en priorité` : ' · révision de toute la sélection'),
      listeningTitle: 'Jeu d’écoute',
      listeningIntroMono:
        'Écoutez un court monologue (deux fois). Cochez les mots de votre liste que vous entendez — ils peuvent apparaître sous une autre forme.',
      listeningPlay: '▶ Lire',
      listeningReplay: '▶ Rejouer (1 restant)',
      listeningPlaying: 'Lecture…',
      listeningCheck: 'Vérifier',
      listeningAgain: 'Nouvelle manche',
      listeningPick: 'Quels mots avez-vous entendus ?',
      listeningHeard: 'Présents',
      listeningMissing: 'Absents (manquants)',
      listeningScore: (c, t) => `${c} sur ${t} corrects`,
      listeningTooFew: 'Il faut au moins 2 mots pour jouer.',
      transcript: 'Transcription',
      clear: 'Effacer',
      checkOrder: 'Vérifier l’ordre',
      yourDeck: 'Votre paquet',
    },
    it: {
      interfaceLang: 'Interfaccia',
      home: 'Home',
      vocabulary: 'Vocabolario',
      deck: 'mazzo',
      quizBadge: 'Quiz vocabolario',
      phrasesBadge: 'Frasi',
      phrasesTitle: 'Pratica frasi',
      questionOf: (n, total) => `Domanda ${n} di ${total}`,
      phraseOf: (n, total) => `Frase ${n} di ${total}`,
      score: (n) => `Punteggio: ${n}`,
      gapPhase: 'Completa la frase',
      orderPhase: 'Ordine parole',
      synonym: 'Sinonimo',
      antonym: 'Antonimo',
      hint: 'Suggerimento',
      hintGerman: 'tedesco',
      hintSpanish: 'spagnolo',
      hintEnglish: 'inglese',
      hintFrench: 'francese',
      hintItalian: 'italiano',
      whichWord: 'Quale parola corrisponde a questo indizio?',
      completePhrase: 'Completa la frase',
      whichFits: 'Quale parola va nel vuoto?',
      putInOrder: 'Metti le parole in ordine',
      orderMeta: 'Tocca le parole per costruire la frase (ordine tedesco)',
      correct: '✓ Corretto!',
      notQuite: '✗ Quasi — la risposta è:',
      wordWas: '✗ La parola era:',
      perfectOrder: '✓ Ordine perfetto!',
      correctOrder: '✗ Ordine corretto:',
      nextQuestion: 'Prossima domanda →',
      seeResults: 'Vedi risultati →',
      orderWords: 'Ordina le parole →',
      nextPhrase: 'Prossima frase →',
      backToVocab: '← Torna al vocabolario',
      backToDeck: '← Torna al mazzo',
      correctCount: (score, total) => `${score}/${total} corrette`,
      stepsCorrect: (score, total) => `${score}/${total} passi corretti`,
      generatingQuiz: 'Generazione quiz…',
      generatingQuizSub: (credits) => `L’IA scrive suggerimenti dal tuo vocabolario (${credits} crediti)`,
      buildingPhrases: 'Creazione frasi…',
      buildingPhrasesSub: (credits) => `L’IA scrive frasi quotidiane (${credits} credito)`,
      preparingListening: 'Preparazione gioco di ascolto…',
      preparingListeningSub: (credits) => `L’IA scrive un breve monologo (${credits} crediti)`,
      quizLede: (goal, words, credits) => `${goal} · ${words} parole · suggerimenti IA · ${credits} crediti`,
      phrasesLede: (goal, n, credits) => `${goal} · ${n} frasi · ${credits} credito`,
      questionsTitle: (n) => `${n} domande`,
      again: 'Di nuovo',
      hard: 'Difficile',
      good: 'Bene',
      easy: 'Facile',
      translation: 'Traduzione',
      cardOf: (n, total) => `Carta ${n} di ${total}`,
      tapFlip: 'Tocca la carta per la traduzione',
      pronounce: '🔊 Pronuncia',
      prev: '← Prec.',
      next: 'Succ. →',
      flashcardsTitle: 'Flashcard',
      flashcardsLede: (n, dueNote) => `${n} parol${n === 1 ? 'a' : 'e'} selezionat${n === 1 ? 'a' : 'e'}${dueNote} · gira la carta e valuta Di nuovo/Difficile/Bene/Facile.`,
      dueFirst: ' · ripasso di tutte le selezionate',
      dueNote: (n) => (n > 0 ? ` · ${n} in scadenza prima` : ' · ripasso di tutte le selezionate'),
      listeningTitle: 'Gioco di ascolto',
      listeningIntroMono:
        'Ascolta un breve monologo (due volte). Segna le parole della tua lista che senti — possono apparire in altra forma.',
      listeningPlay: '▶ Riproduci',
      listeningReplay: '▶ Ripeti (1 rimasto)',
      listeningPlaying: 'Riproduzione…',
      listeningCheck: 'Verifica',
      listeningAgain: 'Nuovo round',
      listeningPick: 'Quali parole hai sentito?',
      listeningHeard: 'Presenti',
      listeningMissing: 'Assenti (mancanti)',
      listeningScore: (c, t) => `${c} su ${t} corrette`,
      listeningTooFew: 'Servono almeno 2 parole per giocare.',
      transcript: 'Trascrizione',
      clear: 'Cancella',
      checkOrder: 'Verifica ordine',
      yourDeck: 'Il tuo mazzo',
    },
  };
  return L[lang] || L.en;
}

function resolveVocabUiLang() {
  const codes =
    typeof VOCAB_UI_LANG_CODES !== 'undefined'
      ? VOCAB_UI_LANG_CODES
      : ['en', 'es', 'fr', 'it'];
  try {
    const stored = localStorage.getItem('lc_ui_lang');
    const c = String(stored || '').toLowerCase();
    if (c && codes.includes(c)) return c;
    const legacy = localStorage.getItem('lc_pref_xlat');
    const leg = String(legacy || '').toLowerCase();
    if (leg && codes.includes(leg)) return leg;
  } catch (_) {}
  return 'en';
}

/** Single read path for word translations, flashcard backs, exam hover — always lc_ui_lang. */
function translationLang() {
  return resolveVocabUiLang();
}

function syncUiLangMirrors(lang) {
  const code = typeof clampVocabUiLang === 'function' ? clampVocabUiLang(lang, 'en') : lang || 'en';
  if (typeof S !== 'undefined') {
    S.ui = code;
    S.fcLang = code;
    S.vocabLang = code;
  }
  return code;
}

function vocabUIButtonLang(btn) {
  if (!btn) return null;
  const ds = btn.dataset?.lang;
  if (ds) return String(ds).toLowerCase();
  const onclick = btn.getAttribute?.('onclick') || '';
  const m = onclick.match(/setVocabUiLang\s*\(\s*'([a-z]{2})'/i);
  return m ? m[1].toLowerCase() : null;
}

function refreshTranslationLangChrome() {
  const active = resolveVocabUiLang();
  document.querySelectorAll('.ex-lb, .vt-lb-tt, [data-vocab-ui-lang] .vt-lb').forEach((b) => {
    const code = vocabUIButtonLang(b);
    if (code) b.classList.toggle('active', code === active);
  });
  document.querySelectorAll('#fcLangBtns .vt-lb, #vvFcLangBtns .vt-lb, #vvUiLangBtns .vt-lb').forEach((b) => {
    const code = vocabUIButtonLang(b);
    if (code) b.classList.toggle('active', code === active);
  });
  if (typeof refreshOpenVocabTooltip === 'function') refreshOpenVocabTooltip();
}

function vocabT() {
  return vocabModuleStrings(resolveVocabUiLang());
}

function vocabHintLangName(code) {
  const c = String(code || '').toLowerCase();
  const t = vocabModuleStrings(resolveVocabUiLang());
  if (c === 'de') return t.hintGerman;
  if (c === 'es') return t.hintSpanish;
  if (c === 'fr') return t.hintFrench;
  if (c === 'it') return t.hintItalian;
  return t.hintEnglish;
}

function vocabUiLangBarHtml() {
  const active = resolveVocabUiLang();
  const t = vocabT();
  const btns =
    typeof vocabUiLangs === 'function'
      ? vocabUiLangs()
          .map(
            (l) =>
              `<button type="button" class="vt-lb${active === l.code ? ' active' : ''}" data-lang="${l.code}" onclick="setVocabUiLang('${l.code}',this)">${l.l}</button>`,
          )
          .join('')
      : '';
  return `<div class="fc-lang-bar vocab-ui-lang-bar" data-vocab-ui-lang><span class="fc-lang-label">${t.interfaceLang}:</span><div class="fc-lang-btns">${btns}</div></div>`;
}

function mountVocabUiLangBar(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = vocabUiLangBarHtml();
}

function setVocabUiLang(code, btn) {
  const lang = syncUiLangMirrors(code);
  try {
    localStorage.setItem('lc_ui_lang', lang);
    localStorage.setItem('lc_pref_xlat', lang);
  } catch (_) {}
  refreshTranslationLangChrome();
  refreshActiveVocabModuleUi();
  if (typeof Auth !== 'undefined' && typeof Auth.pushSync === 'function') Auth.pushSync();
}

function refreshActiveVocabModuleUi() {
  const ve = document.getElementById('vocabExamScreen');
  if (ve && ve.style.display !== 'none') {
    applyVocabExamChrome();
    if (typeof S !== 'undefined' && S.veQuestions && S.veQuestions.length && typeof renderVEQ === 'function') renderVEQ();
  }
  const vp = document.getElementById('vocabPhrasesScreen');
  if (vp && vp.style.display !== 'none') {
    applyVocabPhrasesChrome();
    if (typeof renderVpPhrase === 'function') renderVpPhrase();
  }
  const hg = document.getElementById('horenGameScreen');
  if (hg && hg.style.display !== 'none') {
    applyHorenGameChrome();
    if (typeof S !== 'undefined' && S._hgLastConfig && typeof HorenGame !== 'undefined') {
      const el = document.getElementById('horenGameMount');
      if (el) {
        S._hgLastConfig.uiLang = resolveVocabUiLang();
        HorenGame.mount(el, S._hgLastConfig, S._hgLastHandlers || {});
      }
    }
  }
  if (typeof _vocabHub !== 'undefined' && _vocabHub.activity === 'flashcards' && typeof refreshVocabHubPanel === 'function') {
    refreshVocabHubPanel();
  }
  if (typeof renderFC === 'function' && document.getElementById('flashcardScreen')?.style.display !== 'none') {
    const t = vocabT();
    const trLbl = document.querySelector('#flashcardScreen .fc-lang-label');
    if (trLbl) trLbl.textContent = t.translation + ':';
    if (typeof renderFcSingleView === 'function' && (S.deckGoalFilter || _vocabHub?.activity === 'flashcards')) renderFcSingleView();
  }
}

function applyVocabExamChrome() {
  const t = vocabT();
  mountVocabUiLangBar('veUiLangMount');
  const back = document.getElementById('veNavBackBtn');
  if (back) back.textContent = '← ' + t.vocabulary;
  const badge = document.querySelector('#vocabExamScreen .exam-badge');
  if (badge) badge.textContent = t.quizBadge;
  const home = document.querySelector('#vocabExamScreen .exam-actions .btn-sm');
  if (home) home.textContent = t.home;
}

function applyVocabPhrasesChrome() {
  const t = vocabT();
  mountVocabUiLangBar('vpUiLangMount');
  const back = document.querySelector('#vocabPhrasesScreen .nav-back-btn');
  if (back) back.textContent = '← ' + t.vocabulary;
  const badge = document.querySelector('#vocabPhrasesScreen .exam-badge');
  if (badge) badge.textContent = t.phrasesBadge;
  const title = document.getElementById('vpTitle');
  if (title) title.textContent = t.phrasesTitle;
  const home = document.querySelector('#vocabPhrasesScreen .exam-actions .btn-sm');
  if (home) home.textContent = t.home;
}

function applyHorenGameChrome() {
  const t = vocabT();
  mountVocabUiLangBar('hgUiLangMount');
  const back = document.querySelector('#horenGameScreen .nav-back-btn');
  if (back) back.textContent = '← ' + t.vocabulary;
}

function listeningGameStrings(lang) {
  const code = typeof clampVocabUiLang === 'function' ? clampVocabUiLang(lang, 'en') : lang || 'en';
  const s = vocabModuleStrings(code);
  return {
    title: s.listeningTitle,
    intro: s.listeningIntroMono,
    play: s.listeningPlay,
    replay: s.listeningReplay,
    playing: s.listeningPlaying,
    check: s.listeningCheck,
    again: s.listeningAgain,
    pickPrompt: s.listeningPick,
    heard: s.listeningHeard,
    missing: s.listeningMissing,
    score: s.listeningScore,
    tooFew: s.listeningTooFew,
    transcript: s.transcript,
  };
}

function initVocabUiLang() {
  const lang = resolveVocabUiLang();
  syncUiLangMirrors(lang);
  try {
    if (!localStorage.getItem('lc_ui_lang')) localStorage.setItem('lc_ui_lang', lang);
    localStorage.setItem('lc_pref_xlat', lang);
  } catch (_) {}
}

if (typeof window !== 'undefined') {
  window.vocabModuleStrings = vocabModuleStrings;
  window.resolveVocabUiLang = resolveVocabUiLang;
  window.translationLang = translationLang;
  window.syncUiLangMirrors = syncUiLangMirrors;
  window.refreshTranslationLangChrome = refreshTranslationLangChrome;
  window.vocabT = vocabT;
  window.vocabHintLangName = vocabHintLangName;
  window.vocabUiLangBarHtml = vocabUiLangBarHtml;
  window.mountVocabUiLangBar = mountVocabUiLangBar;
  window.setVocabUiLang = setVocabUiLang;
  window.refreshActiveVocabModuleUi = refreshActiveVocabModuleUi;
  window.applyVocabExamChrome = applyVocabExamChrome;
  window.applyVocabPhrasesChrome = applyVocabPhrasesChrome;
  window.applyHorenGameChrome = applyHorenGameChrome;
  window.listeningGameStrings = listeningGameStrings;
  window.initVocabUiLang = initVocabUiLang;
}
if (typeof module !== 'undefined') {
  module.exports = {
    vocabModuleStrings,
    resolveVocabUiLang,
    translationLang,
    syncUiLangMirrors,
    refreshTranslationLangChrome,
    setVocabUiLang,
    vocabT,
    listeningGameStrings,
    vocabHintLangName,
  };
}
