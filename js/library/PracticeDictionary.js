/* Non-AI vocabulary lookup — library + saved flashcards */
const PracticeDictionary = (() => {
  const bankCache = {};

  async function loadBank(lang, level) {
    const key = `${lang}_${level}`;
    if (bankCache[key]) return bankCache[key];
    if (typeof LibraryLoader === 'undefined' || !LibraryLoader.hasLibrary(lang, level)) return null;
    bankCache[key] = await LibraryLoader.load(lang, level);
    return bankCache[key];
  }

  function fromDeck(word, subject, targetLang) {
    if (typeof S === 'undefined' || !S.flashcards) return null;
    const w = String(word).toLowerCase();
    const fc = S.flashcards.find(
      (f) =>
        String(f.word).toLowerCase() === w &&
        (f.sourceLang === subject || !f.sourceLang) &&
        (f.translation || f.meaning || f.translations),
    );
    if (!fc) return null;
    let trans = fc.translations && fc.translations[targetLang];
    if (!trans || !String(trans).trim()) {
      if (targetLang === 'en') {
        trans = fc.translation || fc.meaning || fc.translations?.en;
      }
    }
    if (!trans) return null;
    // Never reuse MyMemory spam / URL "translations" saved earlier
    const t = String(trans).trim();
    if (/^https?:\/\//i.test(t) || /\bhttps?:\/\//i.test(t)) return null;
    return {
      word: fc.word,
      type: fc.type || fc.pos || '',
      gender: fc.gender,
      article: fc.article,
      translation: trans,
      source: 'deck',
    };
  }

  function fromLibrary(bank, word, subject, targetLang) {
    const entry = LibraryLoader.lookupVocabulary(bank, word);
    if (!entry) return null;
    const isEnDef = subject === 'en' && targetLang === 'en';
    let trans = isEnDef
      ? entry.definition || entry.en
      : entry[targetLang];
    if (!trans && targetLang === 'en') trans = entry.en || entry.definition;
    if (!trans) return null;
    const data = {
      word: entry.word,
      type: entry.type || '',
      pos: entry.type || '',
      source: 'library',
    };
    if (isEnDef) data.definition_en = trans;
    else data[`translation_${targetLang}`] = trans;
    if (entry.en && targetLang !== 'en') data.translation_en = entry.en;
    if (entry.es && targetLang !== 'es') data.translation_es = entry.es;
    if (entry.gender) data.gender = entry.gender;
    if (entry.article) data.article = entry.article;
    return data;
  }

  async function lookup(word, subject, level, targetLang) {
    const deckHit = fromDeck(word, subject, targetLang);
    if (deckHit) {
      const data = { word: deckHit.word, type: deckHit.type, pos: deckHit.type, source: 'deck' };
      if (deckHit.gender) data.gender = deckHit.gender;
      if (deckHit.article) data.article = deckHit.article;
      if (subject === 'en' && targetLang === 'en') data.definition_en = deckHit.translation;
      else data[`translation_${targetLang}`] = deckHit.translation;
      return data;
    }
    const bank = await loadBank(subject, level);
    if (bank) return fromLibrary(bank, word, subject, targetLang);
    return null;
  }

  return { lookup, fromDeck, fromLibrary };
})();

if (typeof window !== 'undefined') window.PracticeDictionary = PracticeDictionary;
