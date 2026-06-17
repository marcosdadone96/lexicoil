/**
 * Deterministic lemmatizer — inflected forms → lemma (Phase 3).
 * Replaces suffix-stripping in CefrGate; no permissive prefix matching.
 */
const Lemmatizer = (() => {
  /** @type {Record<string, Record<string, string>>} */
  const IRREGULAR = {
    de: {
      bin: 'sein',
      bist: 'sein',
      ist: 'sein',
      sind: 'sein',
      seid: 'sein',
      war: 'sein',
      waren: 'sein',
      gewesen: 'sein',
      habe: 'haben',
      hast: 'haben',
      hat: 'haben',
      haben: 'haben',
      hatte: 'haben',
      gehabt: 'haben',
      gehe: 'gehen',
      gehst: 'gehen',
      geht: 'gehen',
      gegangen: 'gehen',
      kam: 'kommen',
      kommt: 'kommen',
      gekommen: 'kommen',
      macht: 'machen',
      gemacht: 'machen',
      essen: 'essen',
      isst: 'essen',
      gegessen: 'essen',
      trinkt: 'trinken',
      getrunken: 'trinken',
      wohnt: 'wohnen',
      gekauft: 'kaufen',
      können: 'können',
      kann: 'können',
      konnten: 'können',
      müssen: 'müssen',
      muss: 'müssen',
      wollen: 'wollen',
      will: 'wollen',
      dürfen: 'dürfen',
      darf: 'dürfen',
      sollen: 'sollen',
      soll: 'sollen',
      mögen: 'mögen',
      mag: 'mögen',
      menschen: 'mensch',
      städten: 'stadt',
      städte: 'stadt',
      stadtgärten: 'stadtgarten',
      gärten: 'garten',
      garten: 'garten',
      deutschen: 'deutsch',
      produkten: 'produkt',
      produkte: 'produkt',
      programmen: 'programm',
      erfahrungen: 'erfahrung',
      kinder: 'kind',
      kindern: 'kind',
      büros: 'büro',
      büro: 'büro',
      besser: 'gut',
      besten: 'gut',
      mehr: 'viel',
      weniger: 'wenig',
    },
    en: {
      am: 'be',
      is: 'be',
      are: 'be',
      was: 'be',
      were: 'be',
      been: 'be',
      has: 'have',
      had: 'have',
      having: 'have',
      goes: 'go',
      went: 'go',
      gone: 'go',
      does: 'do',
      did: 'do',
      done: 'do',
      better: 'good',
      best: 'good',
      worse: 'bad',
      children: 'child',
      people: 'person',
      cities: 'city',
      studies: 'study',
      studied: 'study',
      measuring: 'measure',
      measured: 'measure',
      publishing: 'publish',
      published: 'publish',
      reducing: 'reduce',
      reduced: 'reduce',
      improving: 'improve',
      improved: 'improve',
      explaining: 'explain',
      explained: 'explain',
      describing: 'describe',
      described: 'describe',
      recommend: 'recommend',
      recommends: 'recommend',
      recommended: 'recommend',
    },
    es: {
      soy: 'ser',
      eres: 'ser',
      es: 'ser',
      somos: 'ser',
      son: 'ser',
      era: 'ser',
      fue: 'ser',
      sido: 'ser',
      he: 'haber',
      has: 'haber',
      ha: 'haber',
      hemos: 'haber',
      han: 'haber',
      había: 'haber',
      hay: 'haber',
      va: 'ir',
      van: 'ir',
      fui: 'ir',
      ido: 'ir',
      hace: 'hacer',
      hacen: 'hecho',
      hecho: 'hacer',
      pueden: 'poder',
      puede: 'poder',
      deben: 'deber',
      debe: 'deber',
      niños: 'niño',
      ciudades: 'ciudad',
      días: 'día',
      años: 'año',
      mejor: 'bueno',
      peor: 'malo',
      más: 'mucho',
      menos: 'poco',
    },
  };

  function normLang(lang) {
    const l = String(lang || 'en').toLowerCase();
    if (l === 'de' || l.startsWith('de')) return 'de';
    if (l === 'es' || l.startsWith('es')) return 'es';
    return 'en';
  }

  function normalizeUmlaut(w) {
    return String(w || '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss');
  }

  function stripSuffix(w, lang) {
    let s = w;
    if (lang === 'de') {
      if (s.length > 6 && s.endsWith('ungen')) s = s.slice(0, -5);
      else if (s.length > 5 && s.endsWith('heit')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('keit')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('chen')) s = s.slice(0, -4);
      else if (s.length > 4 && s.endsWith('lich')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('ieren')) s = s.slice(0, -5);
      else if (s.length > 4 && s.endsWith('ung')) s = s.slice(0, -3);
      else if (s.length > 4 && s.endsWith('ten')) s = s.slice(0, -3);
      else if (s.length > 4 && s.endsWith('ern')) s = s.slice(0, -3);
      else if (s.length > 3 && s.endsWith('en')) s = s.slice(0, -2);
      else if (s.length > 3 && s.endsWith('er')) s = s.slice(0, -2);
      else if (s.length > 3 && s.endsWith('es')) s = s.slice(0, -2);
      else if (s.length > 2 && s.endsWith('e')) s = s.slice(0, -1);
      else if (s.length > 2 && s.endsWith('n')) s = s.slice(0, -1);
      else if (s.length > 2 && s.endsWith('s')) s = s.slice(0, -1);
    } else if (lang === 'es') {
      if (s.length > 5 && s.endsWith('mente')) s = s.slice(0, -5);
      else if (s.length > 5 && s.endsWith('ando')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('iendo')) s = s.slice(0, -5);
      else if (s.length > 4 && s.endsWith('ado')) s = s.slice(0, -3);
      else if (s.length > 4 && s.endsWith('ada')) s = s.slice(0, -3);
      else if (s.length > 4 && s.endsWith('idos')) s = s.slice(0, -4);
      else if (s.length > 4 && s.endsWith('idas')) s = s.slice(0, -4);
      else if (s.length > 3 && s.endsWith('ar')) s = s.slice(0, -2);
      else if (s.length > 3 && s.endsWith('er')) s = s.slice(0, -2);
      else if (s.length > 3 && s.endsWith('ir')) s = s.slice(0, -2);
      else if (s.length > 2 && s.endsWith('es')) s = s.slice(0, -2);
      else if (s.length > 2 && s.endsWith('os')) s = s.slice(0, -2);
      else if (s.length > 2 && s.endsWith('as')) s = s.slice(0, -2);
    } else {
      if (s.length > 5 && s.endsWith('ingly')) s = s.slice(0, -5);
      else if (s.length > 5 && s.endsWith('edly')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('ness')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('ment')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('tion')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('sion')) s = s.slice(0, -4);
      else if (s.length > 4 && s.endsWith('ing')) s = s.slice(0, -3);
      else if (s.length > 4 && s.endsWith('ied')) s = `${s.slice(0, -3)}y`;
      else if (s.length > 3 && s.endsWith('ed')) s = s.slice(0, -2);
      else if (s.length > 3 && s.endsWith('es')) s = s.slice(0, -2);
      else if (s.length > 2 && s.endsWith('s')) s = s.slice(0, -1);
    }
    return s || w;
  }

  function normalizeLemma(token, lang) {
    const lg = normLang(lang);
    const raw = String(token || '').toLowerCase().trim();
    if (!raw || raw.length < 2) return raw;

    const table = IRREGULAR[lg] || {};
    if (table[raw]) return table[raw];

    const uml = normalizeUmlaut(raw);
    if (table[uml]) return table[uml];

    const stripped = stripSuffix(uml, lg);
    if (table[stripped]) return table[stripped];

    return stripped || raw;
  }

  function lemmaForms(token, lang) {
    const lemma = normalizeLemma(token, lang);
    const raw = String(token || '').toLowerCase();
    const forms = new Set([raw, lemma, normalizeUmlaut(raw), normalizeUmlaut(lemma)]);
    return [...forms].filter(Boolean);
  }

  return Object.freeze({
    normalizeLemma,
    lemmaForms,
    normLang,
    IRREGULAR,
  });
})();

if (typeof window !== 'undefined') window.Lemmatizer = Lemmatizer;
if (typeof module !== 'undefined') module.exports = Lemmatizer;
