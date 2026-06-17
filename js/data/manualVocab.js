/* Manual vocabulary — spell-check against library + POS grouping on save */
const ManualVocab = (() => {
  const indexCache = {};

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

  async function loadWordIndex(subject) {
    if (indexCache[subject]) return indexCache[subject];
    const words = new Map();
    if (typeof LibraryLoader !== 'undefined') {
      const levels = LibraryLoader.supportedLevels(subject) || [];
      for (const level of levels) {
        try {
          const ok = LibraryLoader.hasLibrary(subject, level)
            ? await LibraryLoader.probeLevel(subject, level)
            : false;
          if (!ok) continue;
          const bank = await LibraryLoader.load(subject, level);
          if (!bank?.vocabulary) continue;
          Object.entries(bank.vocabulary).forEach(([w, meta]) => {
            const low = normToken(w);
            if (!low || words.has(low)) return;
            words.set(low, { word: w, meta, level });
          });
        } catch (_) {
          /* skip level */
        }
      }
    }
    indexCache[subject] = words;
    return words;
  }

  function lookupExact(word, index) {
    const low = normToken(word);
    return low && index.has(low) ? index.get(low) : null;
  }

  function findSpellingSuggestion(word, index) {
    const q = normToken(word);
    if (!q || q.length < 2) return null;
    const hit = index.get(q);
    if (hit) return null;
    let best = null;
    let bestD = Infinity;
    const threshold = maxEditDistance(q.length);
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

  function inferPos(fc, subject) {
    const sub = subject || fc?.sourceLang || '';
    const parsed = parseLeadingArticle(fc?.word, sub);
    const raw = String(fc?.word || parsed.word || '').trim();
    const low = normToken(parsed.word || raw);
    const stored = typeof normWordType === 'function' ? normWordType(fc?.type || fc?.pos) : '';

    if (sub === 'de' && low) {
      if (/^[A-ZÄÖÜ]/.test(raw)) {
        if (/(liche|licher|liches|lichem|lichen|lich|ig|isch|bar|sam|haft|los|voll|frei|mäßig|artig)$/i.test(low)) {
          return 'adjective';
        }
        return 'noun';
      }
      if (/weise$/.test(low)) return 'adverb';
      if (/(liche|licher|liches|lichem|lichen|lich|ig|isch|bar|sam|haft|los|voll|frei|mäßig|artig)$/i.test(low)) {
        return 'adjective';
      }
      if (/(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i.test(low)) {
        return 'noun';
      }
      if (/en$/.test(low) && low.length > 5 && !/(ung|heit|keit|schaft|tion|ismus|ment|ieren|lich|ig|isch)$/i.test(low)) {
        return 'verb';
      }
    }
    if (fc?.gender || fc?.article) return 'noun';
    if (parsed.pos) return parsed.pos;
    if (sub === 'en') {
      if (/ly$/.test(low)) return 'adverb';
      if (/(ous|ful|less|ive|able|ible|ish|ic|al|ed)$/.test(low)) return 'adjective';
    }
    if (sub === 'es') {
      if (/mente$/.test(low)) return 'adverb';
      if (/(oso|osa|ivo|iva|ble|al|ado|ada)$/.test(low)) return 'adjective';
      if (/(ar|er|ir)$/.test(low) && low.length > 4) return 'verb';
    }
    if (stored && stored !== 'other') return stored;
    return stored || 'other';
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
    return fc;
  }

  function enrichFlashcardFromBank(fc, bank) {
    if (!fc || !bank?.questions?.length) return fc;
    const wordLow = String(fc.word || '').toLowerCase().trim();
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

  function entryToFlashcard(entry, subject, targetLang, manualTrans) {
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

  function freeformFlashcard(word, subject, targetLang, manualTrans) {
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

    const suggestion = findSpellingSuggestion(core, index) || findSpellingSuggestion(trimmed, index);
    if (suggestion && index.size > 0) {
      return { ok: false, reason: 'spelling', suggestion: suggestion.word, entry: suggestion, parsed };
    }

    if (index.size > 0) {
      return { ok: false, reason: 'not_in_library', suggestion: null, parsed };
    }

    return { ok: true, freeform: true, canonical: core || trimmed, parsed };
  }

  function isDuplicate(word, subject) {
    const key = wordKey(word, subject);
    return (S.flashcards || []).some(
      (f) => f.sourceLang === subject && wordKey(f.word, subject) === key,
    );
  }

  function reclassifyStoredFlashcards() {
    if (typeof S === 'undefined' || !Array.isArray(S.flashcards) || !S.flashcards.length) return false;
    let dirty = false;
    S.flashcards.forEach((fc) => {
      const before = fc.type || fc.pos;
      enrichFlashcard(fc, fc.sourceLang);
      if ((fc.type || fc.pos) !== before) dirty = true;
    });
    return dirty;
  }

  return {
    validate,
    loadWordIndex,
    entryToFlashcard,
    freeformFlashcard,
    isDuplicate,
    buildTranslations,
    inferPos,
    enrichFlashcard,
    enrichFlashcardFromBank,
    parseLeadingArticle,
    reclassifyStoredFlashcards,
  };
})();

if (typeof window !== 'undefined') window.ManualVocab = ManualVocab;
if (typeof module !== 'undefined') module.exports = ManualVocab;
