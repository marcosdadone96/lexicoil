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
    const trans =
      fc.translation ||
      fc.meaning ||
      (fc.translations && (fc.translations[targetLang] || Object.values(fc.translations)[0]));
    if (!trans) return null;
    return {
      word: fc.word,
      type: fc.type || fc.pos || '',
      translation: trans,
      source: 'deck',
    };
  }

  function fromLibrary(bank, word, subject, targetLang) {
    const entry = LibraryLoader.lookupVocabulary(bank, word);
    if (!entry) return null;
    const isEnDef = subject === 'en' && targetLang === 'en';
    const trans = isEnDef
      ? entry.definition || entry.en || entry[targetLang]
      : entry[targetLang] || entry.en || entry.es || entry.de;
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
    return data;
  }

  async function lookup(word, subject, level, targetLang) {
    const deckHit = fromDeck(word, subject, targetLang);
    if (deckHit) {
      const data = { word: deckHit.word, type: deckHit.type, pos: deckHit.type, source: 'deck' };
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
