/* Manual vocabulary — spell-check against library + POS grouping on save */
const ManualVocab = (() => {
  const indexCache = {};

  function functionWordsLib() {
    if (typeof FunctionWords !== 'undefined') return FunctionWords;
    try {
      return require('./functionWords.js');
    } catch (_) {
      return null;
    }
  }

  function isFunctionWord(word) {
    const fw = functionWordsLib();
    return fw ? fw.isFunctionWord(word) : false;
  }

  /** High-confidence typos seen in learner decks → canonical form */
  const KNOWN_SPELLING_OVERRIDES = {
    unterschid: 'Unterschied',
  };

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const row = new Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return row[n];
  }

  function normToken(s) {
    return String(s || '')
      .trim()
      .normalize('NFC')
      .toLowerCase();
  }

  function maxEditDistance(len) {
    if (len <= 4) return 1;
    if (len <= 9) return 2;
    return 3;
  }

  function displayLemma(lemma, subject) {
    const s = String(lemma || '').trim();
    if (!s) return s;
    if (subject === 'de') return s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  async function loadWordIndex(subject, level) {
    const cacheKey = `${subject}:${level || 'all'}`;
    if (indexCache[cacheKey]) return indexCache[cacheKey];
    const words = new Map();
    Object.entries(KNOWN_SPELLING_OVERRIDES).forEach(([typo, canonical]) => {
      const low = normToken(typo);
      if (low) words.set(low, { word: canonical, meta: { override: true }, level: null });
    });
    if (typeof LibraryLoader !== 'undefined') {
      const levels = LibraryLoader.advertisedLevels?.(subject) || LibraryLoader.supportedLevels(subject) || [];
      for (const lv of levels) {
        try {
          const ok = LibraryLoader.hasLibrary(subject, lv)
            ? true
            : await LibraryLoader.probeLevel(subject, lv);
          if (!ok) continue;
          const bank = await LibraryLoader.load(subject, lv);
          if (!bank?.vocabulary) continue;
          Object.entries(bank.vocabulary).forEach(([w, meta]) => {
            const low = normToken(w);
            if (!low || words.has(low)) return;
            words.set(low, { word: w, meta, level: lv });
          });
        } catch (_) {
          /* skip level */
        }
      }
    }
    if (typeof CefrVocabLoader !== 'undefined') {
      try {
        const upTo = level || 'C2';
        const cefrSet = await CefrVocabLoader.loadCumulativeVocab(subject, upTo);
        cefrSet.forEach((lemma) => {
          const low = normToken(lemma);
          if (!low || words.has(low)) return;
          words.set(low, { word: displayLemma(lemma, subject), meta: { cefr: true }, level: null });
        });
      } catch (_) {
        /* CEFR list optional */
      }
    }
    indexCache[cacheKey] = words;
    return words;
  }

  function lookupExact(word, index) {
    const low = normToken(word);
    return low && index.has(low) ? index.get(low) : null;
  }

  function findSpellingSuggestion(word, index, maxDist) {
    const q = normToken(word);
    if (!q || q.length < 2) return null;
    const hit = index.get(q);
    if (hit) return null;
    let best = null;
    let bestD = Infinity;
    const threshold = maxDist != null ? maxDist : maxEditDistance(q.length);
    for (const [low, data] of index) {
      if (Math.abs(low.length - q.length) > threshold) continue;
      const d = levenshtein(q, low);
      if (d > 0 && d <= threshold && d < bestD) {
        bestD = d;
        best = data;
      }
    }
    return best;
  }

  function parseLeadingArticle(word, subject) {
    const raw = String(word || '').trim();
    if (subject === 'de') {
      const m = raw.match(/^(der|die|das)\s+(.+)$/i);
      if (m) {
        const art = m[1].toLowerCase();
        const gender = art === 'der' ? 'm' : art === 'die' ? 'f' : 'n';
        return { word: m[2].trim(), article: art, gender, pos: 'noun' };
      }
      const glued = raw.match(/^(der|die|das)([A-ZÄÖÜ][\wäöüßÄÖÜ-]+)$/i);
      if (glued) {
        const art = glued[1].toLowerCase();
        const gender = art === 'der' ? 'm' : art === 'die' ? 'f' : 'n';
        return { word: glued[2].trim(), article: art, gender, pos: 'noun' };
      }
    }
    if (subject === 'es') {
      const m = raw.match(/^(el|la|los|las)\s+(.+)$/i);
      if (m) {
        const art = m[1].toLowerCase();
        const gender = art === 'el' || art === 'los' ? 'm' : 'f';
        return { word: m[2].trim(), article: art, gender, pos: 'noun' };
      }
    }
    return { word: raw, article: null, gender: null, pos: null };
  }

  const DE_COMMON_ADVERBS = new Set([
    'danach', 'davor', 'dazu', 'darin', 'dabei', 'darauf', 'darunter', 'darüber', 'darum',
    'deshalb', 'deswegen', 'daher', 'dorthin', 'hierhin', 'bereits', 'trotzdem', 'inzwischen',
    'plötzlich', 'sofort', 'manchmal', 'vielleicht', 'eigentlich', 'besonders', 'natürlich',
    'ziemlich', 'gemeinsam', 'zusammen', 'wieder', 'schon', 'noch', 'auch', 'nur', 'sehr',
    'gern', 'bald', 'fast', 'immer', 'nie', 'oft', 'dann', 'heute', 'gestern', 'morgen',
    'hier', 'dort', 'oben', 'unten', 'innen', 'außen', 'hin', 'her', 'weg', 'zurück',
    'vorher', 'nachher', 'beinahe', 'kaum', 'wohl', 'doch', 'mehr', 'weniger', 'meist',
    'oftmals', 'manchmal', 'überall', 'nirgends', 'irgendwo', 'irgendwann', 'deswegen',
  ]);

  function inferPosFromConjugation(word, subject) {
    if (typeof VerbConjugation === 'undefined' || !VerbConjugation.getPresent) return null;
    const conj = VerbConjugation.getPresent(word, subject);
    return conj?.lemma ? 'verb' : null;
  }

  /** Lexicon gender hit (incl. inflected noun → lemma) ⇒ noun, not verb -en heuristic. */
  function lexiconSuggestsNoun(word, subject) {
    if (subject !== 'de' || typeof ArticleLexicon === 'undefined' || !ArticleLexicon.lookupGender) {
      return false;
    }
    const core = String(word || '').trim();
    if (!core) return false;
    const g = ArticleLexicon.lookupGender(core, 'de');
    return g === 'm' || g === 'f' || g === 'n' || g === 'p';
  }

  function applyInferredPos(data, word, subject) {
    if (!data) return data;
    const sub = subject || data.sourceLang || 'de';
    const probe = {
      word: data.word || word,
      type: data.type,
      pos: data.pos,
      gender: data.gender,
      article: data.article,
      sourceLang: sub,
    };
    const pos = inferPos(probe, sub);
    data.type = pos;
    data.pos = pos;
    return data;
  }

  function inferPos(fc, subject) {
    const sub = subject || fc?.sourceLang || '';
    const parsed = parseLeadingArticle(fc?.word, sub);
    const raw = String(fc?.word || parsed.word || '').trim();
    const low = normToken(parsed.word || raw);
    const stored = typeof normWordType === 'function' ? normWordType(fc?.type || fc?.pos) : '';

    if (sub === 'de' && low && isFunctionWord(low)) return 'other';

    if (sub === 'de' && low) {
      if (/^[A-ZÄÖÜ]/.test(raw)) {
        if (/(liche|licher|liches|lichem|lichen|lich|ig|isch|bar|sam|haft|los|voll|frei|mäßig|artig)$/i.test(low)) {
          return 'adjective';
        }
        if (/ieren$/i.test(low)) return 'verb';
        if (/(ionen|ungen|heiten|keiten|schaften|tionen|eln)$/i.test(low)) return 'noun';
        if (/en$/i.test(low) && low.length > 3 && !/(ung|heit|keit|schaft|tion|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i.test(low)) {
          if (lexiconSuggestsNoun(parsed.word || raw, sub)) return 'noun';
          return 'verb';
        }
        return 'noun';
      }
      if (DE_COMMON_ADVERBS.has(low)) return 'adverb';
      if (/weise$/.test(low)) return 'adverb';
      if (/(liche|licher|liches|lichem|lichen|lich|ig|isch|bar|sam|haft|los|voll|frei|mäßig|artig)$/i.test(low)) {
        return 'adjective';
      }
      if (/^ge[a-zäöüß]{3,}(t|en)$/i.test(low)) return 'verb';
      const conjPos = inferPosFromConjugation(raw, sub);
      if (conjPos) return conjPos;
      if (/(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i.test(low)) {
        return 'noun';
      }
      if (/en$/.test(low) && low.length > 5 && !/(ung|heit|keit|schaft|tion|ismus|ment|ieren|lich|ig|isch)$/i.test(low)) {
        if (lexiconSuggestsNoun(raw, sub)) return 'noun';
        return 'verb';
      }
    }
    if (fc?.gender || fc?.article) return 'noun';
    if (parsed.pos) return parsed.pos;
    if (sub === 'es') {
      if (/mente$/.test(low)) return 'adverb';
      if (/(oso|osa|ivo|iva|ble|al|ado|ada)$/.test(low)) return 'adjective';
      if (/(ar|er|ir)$/.test(low) && low.length > 4) return 'verb';
      const conjPosEs = inferPosFromConjugation(raw, sub);
      if (conjPosEs) return conjPosEs;
    }
    if (sub === 'en') {
      if (/ly$/.test(low)) return 'adverb';
      if (/(ous|ful|less|ive|able|ible|ish|ic|al|ed)$/.test(low)) return 'adjective';
      const conjPosEn = inferPosFromConjugation(raw, sub);
      if (conjPosEn) return conjPosEn;
    }
    if (stored && stored !== 'other') return stored;
    return stored || 'other';
  }

  function inferNounGender(word, subject) {
    const sub = subject || 'de';
    const raw = String(word || '').trim();
    const low = normToken(raw);
    if (!low || low.length < 2) return null;

    if (sub === 'de') {
      const neut = new Set(['feuer', 'wasser', 'messer', 'kreuz', 'herz', 'interieur', 'genie']);
      if (neut.has(low)) return { gender: 'n', article: 'das' };
      const lexNeut =
        typeof ArticleLexicon !== 'undefined' && ArticleLexicon.lookupLemma
          ? ArticleLexicon.lookupLemma(low, 'de')
          : null;
      if (/(chen|lein|tum|ment|nis|ett|on|um)$/i.test(low) && !/(ung|heit|keit)$/i.test(low)) {
        if (lexNeut === 'n') return { gender: 'n', article: 'das' };
        if (low.endsWith('chen') || low.endsWith('lein')) {
          const stem = low.slice(0, -2);
          const stemHit =
            typeof ArticleLexicon !== 'undefined' && ArticleLexicon.lookupLemma
              ? ArticleLexicon.lookupLemma(stem, 'de')
              : null;
          if (stemHit && stemHit !== 'n') return null;
          if (!stemHit && low.length <= 8) return { gender: 'n', article: 'das' };
          return null;
        }
        return { gender: 'n', article: 'das' };
      }
      if (/(ung|heit|keit|schaft|tion|sion|tät|ität|ik|ur|ie|ei|anz|enz)$/i.test(low)) {
        return { gender: 'f', article: 'die' };
      }
      if (low.endsWith('in') && low.length > 3) return { gender: 'f', article: 'die' };
      if (/(ling|ismus|or|ant|ent|ich)$/i.test(low)) return { gender: 'm', article: 'der' };
      if (low.endsWith('er') && low.length >= 4) return { gender: 'm', article: 'der' };
      if (low.endsWith('ig') && /^[A-ZÄÖÜ]/.test(raw)) return { gender: 'm', article: 'der' };
      return null;
    }

    if (sub === 'es') {
      if (/(ción|sión|dad|tad|ed|umbre|ez|ie)$/i.test(low)) return { gender: 'f', article: 'la' };
      if (/(aje|or|an)$/i.test(low)) return { gender: 'm', article: 'el' };
    }
    return null;
  }

  function enrichFlashcard(fc, subject) {
    if (!fc) return fc;
    const sub = subject || fc.sourceLang || '';
    const parsed = parseLeadingArticle(fc.word, sub);
    if (parsed.article) {
      fc.word = parsed.word;
      fc.article = parsed.article;
      fc.gender = parsed.gender;
    }
    const pos = inferPos(fc, sub);
    fc.type = pos;
    fc.pos = pos;
    if (pos === 'noun') {
      if (typeof ArticleLexicon !== 'undefined' && ArticleLexicon.applyToFlashcard) {
        ArticleLexicon.applyToFlashcard(fc, sub);
      }
      if (!fc.gender && !fc.article) {
        const guessed = inferNounGender(fc.word, sub);
        if (guessed) {
          fc.gender = guessed.gender;
          fc.article = guessed.article;
        }
      }
    }
    if (pos === 'verb' && typeof VerbConjugation !== 'undefined' && VerbConjugation.enrichFlashcard) {
      VerbConjugation.enrichFlashcard(fc, sub);
    }
    return fc;
  }

  function enrichFlashcardFromBank(fc, bank) {
    if (!fc || !bank) return fc;
    const wordLow = String(fc.word || '').toLowerCase().trim();
    if (wordLow && bank.vocabulary) {
      const key = Object.keys(bank.vocabulary).find((k) => k.toLowerCase() === wordLow);
      if (key) {
        const meta = bank.vocabulary[key] || {};
        if (!fc.gender && meta.gender) fc.gender = meta.gender;
        if (!fc.article && meta.article) fc.article = meta.article;
        if (!fc.type && (meta.type || meta.pos)) fc.type = meta.type || meta.pos;
      }
    }
    if (!bank?.questions?.length) return fc;
    if (!wordLow) return fc;
    const topicSet = new Set(fc.topicTags || []);
    const grammarSet = new Set(fc.grammarTags || []);
    bank.questions.forEach((q) => {
      const tags = q.vocabularyTags || [];
      if (tags.some((t) => String(t).toLowerCase() === wordLow)) {
        (q.topicTags || []).forEach((t) => topicSet.add(t));
        (q.grammarTags || []).forEach((t) => grammarSet.add(t));
      }
    });
    if (topicSet.size) fc.topicTags = [...topicSet];
    if (grammarSet.size) fc.grammarTags = [...grammarSet];
    return fc;
  }

  function wordKey(word, subject) {
    return normToken(parseLeadingArticle(word, subject).word);
  }

  function buildTranslations(entry, subject, targetLang) {
    const tr = {};
    const meta = entry?.meta || {};
    const isEnDef = subject === 'en' && targetLang === 'en';
    if (isEnDef && meta.en) tr.en = meta.en;
    else if (meta[targetLang]) tr[targetLang] = meta[targetLang];
    else if (meta.en) tr.en = meta.en;
    else if (meta.es) tr.es = meta.es;
    else if (meta.de) tr.de = meta.de;
    return tr;
  }

  function entryToFlashcard(entry, subject, targetLang, manualTrans, level) {
    const canonical = entry.word;
    const meta = entry.meta || {};
    const tr = buildTranslations(entry, subject, targetLang);
    if (!Object.values(tr).some(Boolean) && manualTrans) {
      tr[targetLang] = manualTrans;
    }
    const wtype = typeof normWordType === 'function' ? normWordType(meta.type || meta.pos || '') : '';
    const fc = {
      id: 'fc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
      word: canonical,
      phonetic: meta.phonetic || '',
      pos: meta.type || meta.pos || '',
      type: wtype,
      translations: tr,
      examples: {},
      sourceLang: subject,
      sourceLevel: String(level || (typeof S !== 'undefined' ? S.level : '') || '').toUpperCase() || undefined,
      savedAt: Date.now(),
      interval: 1,
      ef: 2.5,
      nextReview: null,
      manual: true,
      missCount: 0,
    };
    if (meta.gender) fc.gender = meta.gender;
    if (meta.article) fc.article = meta.article;
    enrichFlashcard(fc, subject);
    if (typeof ExamProfile !== 'undefined') ExamProfile.tagItem(fc);
    if (typeof LibraryLoader !== 'undefined' && typeof S !== 'undefined') {
      LibraryLoader.load(fc.sourceLang, S.level || 'B1')
        .then((bank) => enrichFlashcardFromBank(fc, bank))
        .catch(() => {});
    }
    return fc;
  }

  function freeformFlashcard(word, subject, targetLang, manualTrans, level) {
    const tr = {};
    if (manualTrans) tr[targetLang] = manualTrans;
    const fc = {
      id: 'fc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
      word,
      phonetic: '',
      pos: '',
      type: 'other',
      translations: tr,
      examples: {},
      sourceLang: subject,
      sourceLevel: String(level || (typeof S !== 'undefined' ? S.level : '') || '').toUpperCase() || undefined,
      savedAt: Date.now(),
      interval: 1,
      ef: 2.5,
      nextReview: null,
      manual: true,
      missCount: 0,
    };
    enrichFlashcard(fc, subject);
    if (typeof ExamProfile !== 'undefined') ExamProfile.tagItem(fc);
    if (typeof LibraryLoader !== 'undefined' && typeof S !== 'undefined') {
      LibraryLoader.load(fc.sourceLang, S.level || 'B1')
        .then((bank) => enrichFlashcardFromBank(fc, bank))
        .catch(() => {});
    }
    return fc;
  }

  /**
   * @returns {Promise<{ok:boolean, reason?:string, suggestion?:string, entry?:object, freeform?:boolean}>}
   */
  async function validate(word, subject, level, targetLang) {
    const trimmed = String(word || '').trim();
    if (trimmed.length < 2) return { ok: false, reason: 'too_short' };
    const parsed = parseLeadingArticle(trimmed, subject);
    const core = parsed.word;
    if ((subject || 'de') === 'de' && (isFunctionWord(core) || isFunctionWord(trimmed))) {
      return { ok: false, reason: 'function_word' };
    }
    const lookupForms = [...new Set([trimmed, core].filter(Boolean))];

    if (typeof PracticeDictionary !== 'undefined') {
      for (const form of lookupForms) {
        const dict = await PracticeDictionary.lookup(form, subject, level, targetLang || 'en');
        if (dict?.source === 'library') {
          const index = await loadWordIndex(subject);
          const exact = lookupExact(dict.word || form, index);
          if (exact) {
            return { ok: true, entry: exact, canonical: exact.word, parsed };
          }
        }
      }
    }

    const index = await loadWordIndex(subject);
    for (const form of lookupForms) {
      const exact = lookupExact(form, index);
      if (exact) return { ok: true, entry: exact, canonical: exact.word, parsed };
    }

    const suggestion =
      findSpellingSuggestion(core, index) || findSpellingSuggestion(trimmed, index);
    if (suggestion && index.size > 0) {
      return { ok: false, reason: 'spelling', suggestion: suggestion.word, entry: suggestion, parsed };
    }

    if (index.size > 0) {
      const aiHint = await aiSpellingHint(trimmed, subject);
      if (aiHint?.suggestion && !aiHint.correct) {
        return {
          ok: false,
          reason: 'spelling',
          suggestion: aiHint.suggestion,
          aiSuggested: true,
          parsed,
        };
      }
      return { ok: false, reason: 'not_in_library', suggestion: aiHint?.suggestion || null, parsed };
    }

    const aiHint = await aiSpellingHint(trimmed, subject);
    if (aiHint?.suggestion && !aiHint.correct) {
      return {
        ok: false,
        reason: 'spelling',
        suggestion: aiHint.suggestion,
        aiSuggested: true,
        freeform: true,
        canonical: core || trimmed,
        parsed,
      };
    }

    return { ok: true, freeform: true, canonical: core || trimmed, parsed };
  }

  /** Optional Haiku spell hint when library fuzzy match misses (does not block save). */
  async function aiSpellingHint(word, subject) {
    const w = String(word || '').trim();
    if (w.length < 3) return null;
    const fetchFn = typeof lcApiFetch === 'function' ? lcApiFetch : fetch;
    try {
      const res = await fetchFn('/.netlify/functions/claude-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spellCheckWord: true, word: w, lang: subject }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data) return null;
      return {
        correct: data.correct === true,
        suggestion: data.suggestion ? String(data.suggestion).trim() : null,
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Spelling-only safety net before pool/AI generation.
   * Does NOT lemmatize — server canonicalizeVocabQuery (lemmatizer.js) owns lemmas.
   * Fuzzy: max edit distance 1 only (was maxEditDistance(len) → 2 for len 5–9,
   * which caused zumachen→Machen etc.).
   * @returns {Promise<{words:string[], corrections:{from:string,to:string}[]}>}
   */
  async function canonicalizeForGeneration(words, subject, level) {
    const index = await loadWordIndex(subject, level);
    const out = [];
    const corrections = [];
    const excluded = [];
    const seen = new Set();
    const FUZZY_MAX_DIST = 1;
    for (const raw of words || []) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) continue;
      const parsed = parseLeadingArticle(trimmed, subject);
      const core = parsed.word || trimmed;
      let canonical = trimmed;
      const override = KNOWN_SPELLING_OVERRIDES[normToken(core)] || KNOWN_SPELLING_OVERRIDES[normToken(trimmed)];
      if (override) {
        canonical = override;
      }
      const exact =
        !override &&
        (lookupExact(core, index) ||
          lookupExact(trimmed, index) ||
          lookupExact(parsed.word, index));
      if (override) {
        /* already set */
      } else if (exact) {
        canonical = exact.word;
      } else {
        // Evident typos only (1 char). No lemmatization / conjugation rewriting.
        const sug =
          findSpellingSuggestion(core, index, FUZZY_MAX_DIST) ||
          findSpellingSuggestion(trimmed, index, FUZZY_MAX_DIST);
        if (sug) {
          canonical = sug.word;
        } else {
          // Unknown to index: keep surface as written (article stripped if present).
          // No suffix strip / lemma path here.
          canonical = parsed.word || trimmed;
        }
      }
      const key = normToken(canonical);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(canonical);
      if (normToken(canonical) !== normToken(trimmed)) {
        corrections.push({ from: trimmed, to: canonical });
      }
    }
    if (corrections.length && typeof lcDebug !== 'undefined') {
      lcDebug.log('[vocab] canonicalized for generation:', corrections);
    }
    if (excluded.length && typeof lcDebug !== 'undefined') {
      lcDebug.log('[vocab] omitted misspelled/unknown words:', excluded);
    }
    return { words: out, corrections, excluded };
  }

  /** Async spelling hint for deck rows (library + edit distance). */
  async function spellingSuggestionForAsync(word, subject, fc) {
    if (fc?.spellingDismissed) return null;
    const trimmed = String(word || '').trim();
    if (trimmed.length < 2) return null;
    const parsed = parseLeadingArticle(trimmed, subject);
    const core = parsed.word || trimmed;
    const index = await loadWordIndex(subject, null);
    const override = KNOWN_SPELLING_OVERRIDES[normToken(core)] || KNOWN_SPELLING_OVERRIDES[normToken(trimmed)];
    if (override) return override;
    for (const form of [core, trimmed, parsed.word]) {
      if (lookupExact(form, index)) return null;
    }
    if (typeof Lemmatizer !== 'undefined' && Lemmatizer.normalizeLemma) {
      const lemma = Lemmatizer.normalizeLemma(core, subject);
      if (lemma && lemma !== normToken(core) && lookupExact(lemma, index)) return null;
    }
    const sug =
      findSpellingSuggestion(core, index, 1) || findSpellingSuggestion(trimmed, index, 1);
    return sug?.word || null;
  }

  function applySpellingFixToFlashcard(fc, subject, suggestion) {
    if (!fc || !suggestion) return false;
    const parsed = parseLeadingArticle(suggestion, subject || fc.sourceLang);
    const before = fc.word;
    fc.word = parsed.word || suggestion;
    if (parsed.article) {
      fc.article = parsed.article;
      fc.gender = parsed.gender;
    }
    enrichFlashcard(fc, subject || fc.sourceLang);
    return before !== fc.word;
  }

  function isDuplicate(word, subject, level) {
    const key = wordKey(word, subject);
    const goalLevel = String(level || (typeof S !== 'undefined' ? S.level : '') || '').toUpperCase();
    return (S.flashcards || []).some((f) => {
      if (f.sourceLang !== subject || wordKey(f.word, subject) !== key) return false;
      if (!goalLevel) return true;
      const fl =
        typeof fcSourceLevel === 'function'
          ? fcSourceLevel(f)
          : String(f.sourceLevel || f.sourceExam?.level || '').toUpperCase();
      return fl === goalLevel;
    });
  }

  function reclassifyStoredFlashcards() {
    if (typeof S === 'undefined' || !Array.isArray(S.flashcards) || !S.flashcards.length) return false;
    let dirty = false;
    const kept = [];
    S.flashcards.forEach((fc) => {
      const sub = fc?.sourceLang || 'de';
      const low = normToken(fc?.word);
      if (sub === 'de' && isFunctionWord(low)) {
        dirty = true;
        return;
      }
      const before = `${fc.type || fc.pos}|${fc.gender || ''}|${fc.article || ''}|${fc.plural ? 1 : 0}`;
      enrichFlashcard(fc, sub);
      const after = `${fc.type || fc.pos}|${fc.gender || ''}|${fc.article || ''}|${fc.plural ? 1 : 0}`;
      if (before !== after) dirty = true;
      kept.push(fc);
    });
    if (kept.length !== S.flashcards.length) {
      S.flashcards = kept;
      dirty = true;
    }
    return dirty;
  }

  /** Lexicon + heuristics missed — eligible for Gemini gender safety net (singular or plural). */
  function needsAiGenderFallback(fc, subject) {
    const sub = subject || fc?.sourceLang || 'de';
    if (sub !== 'de') return false;
    if (fc?.articleUserLocked || fc?.gender || fc?.article || fc?.plural) return false;
    const pos = typeof normWordType === 'function' ? normWordType(fc?.type || fc?.pos) : (fc?.type || fc?.pos);
    if (pos !== 'noun') return false;
    if (typeof ArticleLexicon !== 'undefined' && ArticleLexicon.lookupGender) {
      if (ArticleLexicon.lookupGender(fc.word, sub)) return false;
    }
    return true;
  }

  /** Sync enrich + optional async AI gender when lexicon misses (tap-to-save + manual). */
  async function enrichGenderAiFallback(fc, subject) {
    if (!fc) return fc;
    const sub = subject || fc.sourceLang || 'de';
    enrichFlashcard(fc, sub);
    if (!needsAiGenderFallback(fc, sub)) return fc;
    if (typeof fetchVocabGender !== 'function') return fc;
    const likelyPlural =
      typeof ArticleLexicon !== 'undefined' && ArticleLexicon.likelyPluralUnknownDe
        ? ArticleLexicon.likelyPluralUnknownDe(fc.word, sub)
        : false;
    try {
      const hit = await fetchVocabGender(fc.word, { likelyPlural });
      if (hit?.found && hit.article && hit.gender) {
        fc.article = hit.article;
        fc.gender = hit.gender;
        fc.genderSource = hit.source || 'gemini';
        if (hit.plural || (likelyPlural && hit.article === 'die')) fc.plural = true;
      }
    } catch (_) {
      /* keep lexicon/heuristic result or none */
    }
    return fc;
  }

  return {
    validate,
    loadWordIndex,
    entryToFlashcard,
    freeformFlashcard,
    isDuplicate,
    buildTranslations,
    inferPos,
    inferNounGender,
    enrichFlashcard,
    enrichGenderAiFallback,
    needsAiGenderFallback,
    enrichFlashcardFromBank,
    parseLeadingArticle,
    reclassifyStoredFlashcards,
    canonicalizeForGeneration,
    aiSpellingHint,
    spellingSuggestionForAsync,
    applySpellingFixToFlashcard,
    isFunctionWord,
    applyInferredPos,
  };
})();

if (typeof window !== 'undefined') window.ManualVocab = ManualVocab;
if (typeof module !== 'undefined') module.exports = ManualVocab;
