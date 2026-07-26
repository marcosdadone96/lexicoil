/**
 * Deterministic lemmatizer — inflected forms → lemma (Phase 3).
 * Replaces suffix-stripping in CefrGate; no permissive prefix matching.
 *
 * DE fixes aligned with scripts/lib/enrichBatchMetadata.mjs (2026-07-10/11):
 *  (a) LEXICAL_GE_VERBS — ge- is stem, not participle prefix
 *  (b) -sst/-ßt — strip only final -t (stem-s + 3sg), not full -st
 *  (c) KNOWN_ADJECTIVE_LEMMAS — bewusst / robust never enter verb stripper
 *  (d) KNOWN_ADVERB_LEMMAS — mindestens never enters stripSuffix -s / -st
 *  (e) *lässt → *lassen (ä→a) before -sst heuristic (hinterlässt↛hinterlässen)
 * Lists duplicated here (browser IIFE + CJS); enrichBatchMetadata still owns
 * its copy until a later shared-data pass. Separables/zu-inf are NOT handled
 * here — vocabIndexQuality KEEP_FULL_VERBS / enrich SEPARABLE_INFINITIVES.
 */
const Lemmatizer = (() => {
  /**
   * Adjective bases that must never go through verb -st/-ten stripping.
   * Same set as enrichBatchMetadata KNOWN_ADJECTIVE_LEMMAS.
   */
  const KNOWN_ADJECTIVE_LEMMAS = new Set([
    'bewusst',
    'unbewusst',
    'robust',
  ]);

  /**
   * Adverbs that must never go through stripSuffix (-s) or -st finite heuristics.
   * mindestens→mindesten, meistens→meisten via naive final -s strip.
   */
  const KNOWN_ADVERB_LEMMAS = new Set([
    'mindestens',
    'meistens',
    'wenigstens',
    'höchstens',
    'hoechstens',
    'zumindest',
    'spätestens',
    'spaetestens',
    'frühestens',
    'fruehestens',
    'bestens',
    'weiterhin',
    'anstatt',
    'direkt',
  ]);

  /** Prefer umlaut spelling for known adverbs. */
  const ADVERB_CANON = new Map([
    ['hoechstens', 'höchstens'],
    ['spaetestens', 'spätestens'],
    ['fruehestens', 'frühestens'],
  ]);

  /**
   * Verbs where leading "ge-" is lexical (stem), not a participle prefix.
   * Same set as enrichBatchMetadata LEXICAL_GE_VERBS (duplicated on purpose).
   */
  const LEXICAL_GE_VERBS = new Set([
    'gewährleisten', 'gewaehrleisten',
    'gefährden', 'gefaehrden',
    'genießen', 'geniessen',
    'gehören', 'gehoeren',
    'geschehen',
    'gelingen',
    'gefallen',
    'gehorchen',
    'genehmigen',
    'gebrauchen',
    'gedenken',
    'gestehen',
    'gewinnen',
    'gebären', 'gebaeren',
    'gedeihen',
    'geraten',
    'genügen', 'genuegen',
    'gestalten',
    'gewöhnen', 'gewoehnen',
  ]);

  /** Prefer umlaut spelling when both variants exist in LEXICAL_GE_VERBS. */
  const LEXICAL_GE_CANON = new Map([
    ['gewaehrleisten', 'gewährleisten'],
    ['gefaehrden', 'gefährden'],
    ['geniessen', 'genießen'],
    ['gehoeren', 'gehören'],
    ['gebaeren', 'gebären'],
    ['genuegen', 'genügen'],
    ['gewoehnen', 'gewöhnen'],
  ]);

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
      // Strong verb i-umlaut (vergisst↛vergisen via naive -st strip)
      vergisst: 'vergessen',
      vergessen: 'vergessen',
      // lassen family: -sst heuristic keeps ä (lässt→läsen, hinterlässt→hinterlässen)
      lässt: 'lassen',
      laesst: 'lassen',
      hinterlässt: 'hinterlassen',
      hinterlaesst: 'hinterlassen',
      // Strong 3sg with stem vowel change (schlägt↛schlägen via naive -t + en)
      schlägt: 'schlagen',
      schlaegt: 'schlagen',
      schlägst: 'schlagen',
      schlaegst: 'schlagen',
      nimmt: 'nehmen',
      nimmst: 'nehmen',
      gibt: 'geben',
      gibst: 'geben',
      sieht: 'sehen',
      siehst: 'sehen',
      spricht: 'sprechen',
      sprichst: 'sprechen',
      trinkt: 'trinken',
      getrunken: 'trinken',
      wohnt: 'wohnen',
      gekauft: 'kaufen',
      empfiehlt: 'empfehlen',
      empfohlen: 'empfehlen',
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

  /** ASCII-fold → native spelling; used only at output — never emit ae/oe/ue/ss as final lemma. */
  function buildDeAsciiCanonMap() {
    const map = new Map();
    const note = (canon) => {
      if (!canon || typeof canon !== 'string') return;
      const low = canon.toLowerCase();
      const fold = normalizeUmlaut(low);
      if (fold !== low && !map.has(fold)) map.set(fold, low);
    };
    for (const canon of ADVERB_CANON.values()) note(canon);
    for (const canon of LEXICAL_GE_CANON.values()) note(canon);
    for (const v of LEXICAL_GE_VERBS) note(v);
    for (const v of KNOWN_ADJECTIVE_LEMMAS) note(v);
    for (const v of KNOWN_ADVERB_LEMMAS) note(v);
    for (const [k, v] of Object.entries(IRREGULAR.de || {})) {
      note(k);
      note(v);
    }
    const pairs = [
      ['ausschliesslich', 'ausschließlich'],
      ['befoerderung', 'beförderung'],
      ['beschaeftigt', 'beschäftigt'],
      ['bewaesserung', 'bewässerung'],
      ['darueber', 'darüber'],
      ['gaertnern', 'gärtnern'],
      ['geaendert', 'geändert'],
      ['gemuese', 'gemüse'],
      ['gross', 'groß'],
      ['grossartig', 'großartig'],
      ['gros', 'groß'],
      ['herkoemmlich', 'herkömmlich'],
      ['kueche', 'küche'],
      ['kuendigen', 'kündigen'],
      ['kuenftig', 'künftig'],
      ['oekologisch', 'ökologisch'],
      ['raeume', 'räume'],
      ['regelmaessigen', 'regelmäßigen'],
      ['spaziergaenge', 'spaziergänge'],
      ['staendig', 'ständig'],
      ['ueberzeugt', 'überzeugt'],
      ['uebung', 'übung'],
      ['unterkuenfte', 'unterkünfte'],
      ['unterstuetzt', 'unterstützt'],
      ['unterstuetzung', 'unterstützung'],
      ['veraenderung', 'veränderung'],
      ['wuehlen', 'wühlen'],
      ['zoegerlich', 'zögerlich'],
    ];
    for (const [ascii, canon] of pairs) map.set(ascii, canon);
    return map;
  }

  const DE_ASCII_CANON = buildDeAsciiCanonMap();

  function lookupIrregular(table, w) {
    if (!w) return null;
    const low = String(w).toLowerCase();
    return table[low] ?? table[normalizeUmlaut(low)] ?? null;
  }

  /** Restore umlauts/ß on German lemma output; ascii-fold is lookup-only. */
  function finalizeDeLemma(raw, candidate) {
    if (!candidate) return raw;
    let low = String(candidate).toLowerCase();
    if (DE_ASCII_CANON.has(low)) return DE_ASCII_CANON.get(low);
    if (!/[äöüß]/.test(low) && /ae|oe|ue/.test(low)) {
      low = low.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');
    }
    if (DE_ASCII_CANON.has(low)) return DE_ASCII_CANON.get(low);
    if (/[äöüß]/.test(low)) return low;
    const rawLow = String(raw || '').toLowerCase();
    if (/[äöüß]/.test(rawLow) && normalizeUmlaut(rawLow) === normalizeUmlaut(low)) return rawLow;
    return low;
  }

  function canonLexicalGe(v) {
    return LEXICAL_GE_CANON.get(v) || v;
  }

  /**
   * If conjugated form derives from a LEXICAL_GE_VERBS infinitive, return that infinitive.
   * (a) from enrichBatchMetadata.matchLexicalGeVerb
   */
  function matchLexicalGeVerb(w) {
    const low = String(w || '').toLowerCase();
    if (!low.startsWith('ge') || low.length < 6) return null;
    for (const v of LEXICAL_GE_VERBS) {
      if (low === v) return canonLexicalGe(v);
      const stem = v.endsWith('en') ? v.slice(0, -2) : v.endsWith('n') ? v.slice(0, -1) : v;
      if (stem.length < 5) continue;
      if (!low.startsWith(stem)) continue;
      const rest = low.slice(stem.length);
      if (!rest || /^(?:e?t|st|te|ten|test|tet|e)$/.test(rest)) return canonLexicalGe(v);
    }
    // Also try umlaut-normalized surface against ae/oe/ue entries
    const uml = normalizeUmlaut(low);
    if (uml !== low) {
      for (const v of LEXICAL_GE_VERBS) {
        if (uml === normalizeUmlaut(v)) return canonLexicalGe(v);
        const stem = v.endsWith('en') ? v.slice(0, -2) : v.endsWith('n') ? v.slice(0, -1) : v;
        const stemU = normalizeUmlaut(stem);
        if (stemU.length < 5 || !uml.startsWith(stemU)) continue;
        const rest = uml.slice(stemU.length);
        if (!rest || /^(?:e?t|st|te|ten|test|tet|e)$/.test(rest)) return canonLexicalGe(v);
      }
    }
    return null;
  }

  /**
   * (c) Known adjectives (and *bewusst compounds / light inflections) before verb strip.
   */
  function matchKnownAdjective(raw) {
    const low = String(raw || '').toLowerCase();
    if (!low) return null;
    if (KNOWN_ADJECTIVE_LEMMAS.has(low)) return low;
    // Light adjective endings (same order idea as enrich toAdjectiveBase — never bare -ten)
    for (const suf of ['erem', 'eren', 'erer', 'eres', 'sten', 'ste', 'em', 'en', 'er', 'es', 'e']) {
      if (low.length > suf.length + 3 && low.endsWith(suf)) {
        const stem = low.slice(0, -suf.length);
        if (KNOWN_ADJECTIVE_LEMMAS.has(stem)) return stem;
        for (const adj of KNOWN_ADJECTIVE_LEMMAS) {
          if (stem.endsWith(adj) && stem.length >= adj.length) return stem;
        }
      }
    }
    for (const adj of KNOWN_ADJECTIVE_LEMMAS) {
      if (low.endsWith(adj) && low.length > adj.length) return low;
    }
    return null;
  }

  /**
   * (d) Known adverbs before stripSuffix / -st (mindestens↛mindesten).
   */
  function matchKnownAdverb(raw) {
    const low = String(raw || '').toLowerCase();
    if (!low || !KNOWN_ADVERB_LEMMAS.has(low)) return null;
    return ADVERB_CANON.get(low) || low;
  }

  /**
   * (e) *lässt / *laesst → *lassen (ä→a). Must run before -sst heuristic.
   */
  function matchLaesstInfinitive(raw) {
    const low = String(raw || '').toLowerCase();
    if (low.endsWith('lässt') && low.length >= 5) return `${low.slice(0, -5)}lassen`;
    if (low.endsWith('laesst') && low.length >= 6) return `${low.slice(0, -6)}lassen`;
    return null;
  }

  /** Common nouns ending in -t — must not become fake infinitives (Sport→sporten). */
  const DE_NOUN_ENDING_T = new Set([
    'sport', 'wort', 'ort', 'zeit', 'welt', 'luft', 'nacht', 'kraft', 'pflicht',
    'schicht', 'sicht', 'schrift', 'fahrt', 'markt', 'punkt', 'kontakt', 'projekt',
    'effekt', 'objekt', 'subjekt', 'angst', 'lust', 'kunst', 'brust', 'list',
    'dienst', 'ernst', 'obst', 'toast', 'test', 'text', 'kontext', 'prozent',
    'student', 'patient', 'instrument', 'dokument', 'monument', 'restaurant',
    'internet', 'paket', 'ticket', 'budget', 'resultat', 'format', 'automat',
  ]);

  /**
   * (b2) Finite 1sg -e → infinitive (bleibe→bleiben, denke→denken).
   * Systematic: stem + en. Skip adj/adv endings and short feminine/adj forms (große).
   */
  function tryDeFiniteE(w) {
    const low = String(w || '').toLowerCase();
    // Verbs stay short; long -e tokens are usually noun plurals (Abenteuerurlaube)
    if (low.length < 5 || low.length > 12 || !low.endsWith('e')) return null;
    if (low.endsWith('ie') || low.endsWith('ee') || low.endsWith('ße') || low.endsWith('sse')) return null;
    if (matchKnownAdjective(low) || matchKnownAdverb(low)) return null;
    // Adjective weak / base+e: wichtige, lokale, absolute, moderne
    if (/(?:isch|lich|ig|iv|sam|bar|ös|os|uell|onal|al|är|ent|ant|ell|ut)e$/i.test(low)) return null;
    // Noun lemmas ending in -e (Reise, Anlage, Schule…) — not 1sg verbs
    if (/(?:reise|anlage|stunde|woche|schule|straße|strasse|platte|karte|gruppe|farbe|flasche|lampe|blume|wiese|mauer|ecke|tasche|wolke|stelle|grenze|fläche|flaeche)$/i.test(low)) {
      return null;
    }
    // Umlaut plurals (Abfälle): not 1sg (wähle/zähle stay short ≤6)
    if (low.length > 6 && /[äöü]/.test(low)) return null;
    // alleine / bitte-like short forms
    if (low.endsWith('ne') && low.length <= 7) return null;
    if (low === 'bitte' || low === 'heute' || low === 'leute') return null;
    const cand = `${low.slice(0, -1)}en`;
    if (cand.length >= 5 && /(?:en|eln|ern)$/.test(cand)) return cand;
    return null;
  }

  const DE_NOUN_ENDING_ET = new Set([
    'internet', 'paket', 'ticket', 'budget', 'planet', 'kabinett', 'tablet',
    'filet', 'beet', 'hochbeet', 'blumenbeet', 'gebiet', 'projektgebiet',
    'omelett', 'biskuit', 'konfekt', 'amulett', 'duett', 'quartett', 'quintett',
    'geraet', 'gerät', 'elektrogeraet', 'elektrogerät',
  ]);

  /**
   * (b3) Finite 3sg -et (epenthesis after -t/-d/-n/-m… stems) → infinitive.
   * arbeitet→arbeiten, findet→finden, öffnet→öffnen.
   * tryDeFiniteT skips -et on purpose (slice -t would yield *arbeiteen).
   */
  function tryDeFiniteEt(w) {
    const low = String(w || '').toLowerCase();
    if (low.length < 5 || !low.endsWith('et')) return null;
    if (matchKnownAdjective(low) || matchKnownAdverb(low)) return null;
    if (DE_NOUN_ENDING_ET.has(low)) return null;
    // Compounds: Blumenbeet, Projektgebiet, Freizeitaktivität / …qualität
    if (/(?:beet|gebiet|geraet|gerät)$/.test(low)) return null;
    if (/(?:itaet|ität)$/.test(low)) return null;
    // Past participles ge…et / *ge…et (gearbeitet, geöffnet, angemeldet, ausgeschaltet)
    if (/^ge[a-zäöüß]{3,}et$/.test(low)) return null;
    if (/(?:aus|an|ein|auf|ab|mit|vor|zu|über|ueber|unter|durch|weg)ge[a-zäöüß]+et$/.test(low)) return null;
    if (/^(?:ver|be|emp|ent|er|zer|miss)ge[a-zäöüß]+et$/.test(low)) return null;

    const stem = low.slice(0, -2);
    if (stem.length < 3) return null;
    // Epenthesis stems: end in d/t/n/m/l/r or common clusters (öffn, atm, regn)
    if (!/[dtnmlr]$/i.test(stem) && !/(?:ff|nn|mm|ll|rr|ch|ck|fn|tn|dn|gn)$/i.test(stem)) {
      return null;
    }
    const cand = `${stem}en`;
    if (cand.length >= 5 && /(?:en|eln|ern)$/.test(cand)) return cand;
    return null;
  }

  /**
   * Adjective/adverb on -t — must not become fake infinitives (interessant→interessanen, direkt→direken).
   */
  function looksLikeDeAdjectiveOrAdverbT(low) {
    if (!low || !low.endsWith('t')) return false;
    if (KNOWN_ADVERB_LEMMAS.has(low)) return true;
    if (/(?:ant|ent|isch|lich|ig|bar|sam|los|frei|ell|iv|al|är|aeer|os|ös|uell|onal|ekt|ikt|ativ|itiv|uet|rot|blau|grün|gruen|weiß|weiss|schwarz|gelb|hart|weich|schnell|spät|spaet|früh|frueh|nah|fern|gern|bald|laut|leis|stark|schwach|groß|gross|klein|lang|kurz|neu|alt|gut|schlecht|schlech|klar|voll|leer|fertig|kaputt|direkt|weit|breit|hoch|tief|falsch|richtig)t$/i.test(low)) {
      return true;
    }
    return false;
  }

  /**
   * (b4) Finite 3sg/2pl -t → infinitive (bleibt→bleiben, denkt→denken, ruft→rufen).
   * Runs after -st and -et. Skip -et (handled by tryDeFiniteEt), nouns ending -t.
   */
  function tryDeFiniteT(w) {
    const low = String(w || '').toLowerCase();
    if (low.length < 4 || !low.endsWith('t')) return null;
    if (low.endsWith('st') || low.endsWith('zt') || low.endsWith('ßt') || low.endsWith('et')) return null;
    if (matchKnownAdjective(low) || matchKnownAdverb(low)) return null;
    if (looksLikeDeAdjectiveOrAdverbT(low)) return null;
    if (DE_NOUN_ENDING_T.has(low)) return null;
    // Nouns: check FULL form (Gesundheit — stripping -t yields gesundhei and would miss -heit)
    if (/(?:heit|keit|ung|schaft|tum|nis)$/.test(low)) return null;

    // Past participle ge-…t: strip ge- BEFORE blind -t→-en (gezeigt→zeigen, not gezeigen).
    // Lexical ge- stems (gewährleistet, gefährdet, …) already returned by matchLexicalGeVerb
    // earlier in normalizeLemma; still guard here for direct callers.
    if (/^ge[a-zäöüß]{2,}t$/.test(low)) {
      const lexical = matchLexicalGeVerb(low);
      if (lexical) return lexical;
      let stem = low.slice(2, -1); // gezeigt → zeig; gestartet → starte
      if (stem.endsWith('e') && stem.length >= 4) stem = stem.slice(0, -1); // start
      if (stem.length < 2) return null;
      const cand = `${stem}en`;
      if (cand.length >= 5 && /(?:en|eln|ern)$/.test(cand)) return cand;
      return null;
    }

    const stem = low.slice(0, -1);
    if (stem.length < 3) return null;
    if (/(?:heit|keit|ung|schaft|tum|nis)$/.test(stem)) return null;
    const candErn = `${stem}n`;
    if (/ern$/.test(candErn) && candErn.length >= 6) return candErn;
    let cand = `${stem}en`;
    if (cand.endsWith('elen') && stem.endsWith('el')) {
      const eln = `${stem}n`;
      if (eln.endsWith('eln') || eln.endsWith('ern')) cand = eln;
    }
    if (cand.length >= 5 && /(?:en|eln|ern)$/.test(cand)) return cand;
    return null;
  }

  /**
   * (b) Finite 2sg -st → infinitive, with -sst/-ßt exception (strip only -t).
   * Returns candidate infinitive or null. Does not require B1 set (best-effort).
   * Skips known adjectives/adverbs (robust↛robuen).
   */
  function tryDeFiniteSt(w) {
    const low = String(w || '').toLowerCase();
    if (low.length < 5 || !low.endsWith('st') || low.endsWith('est') || low.endsWith('ist')) {
      return null;
    }
    if (matchKnownAdjective(low) || matchKnownAdverb(low)) return null;
    // …sst / …ßt — final "st" is stem-s + 3sg -t, not 2sg -st
    const isSstOrSzt = low.endsWith('ßt') || (low.length >= 6 && low[low.length - 3] === 's');
    if (isSstOrSzt) {
      return `${low.slice(0, -1)}en`; // vermisst → vermissen; genießt → genießen
    }
    return `${low.slice(0, -2)}en`; // brauchst → brauchen
  }

  function stripSuffix(w, lang) {
    let s = w;
    if (lang === 'de') {
      // Plural of -ung nouns: Ablenkungen → Ablenkung (NOT ablenk via -ungen/-5)
      if (s.length > 6 && s.endsWith('ungen')) s = s.slice(0, -2);
      else if (s.length > 5 && s.endsWith('heit')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('keit')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('chen')) s = s.slice(0, -4);
      else if (s.length > 4 && s.endsWith('lich')) s = s.slice(0, -4);
      else if (s.length > 5 && s.endsWith('ieren')) s = s.slice(0, -5);
      // Keep -ung nouns intact (Ablenkung is the lemma; never strip to ablenk)
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

  /**
   * Hyphenated compounds (Yoga-Kurs, Vier-Tage-Woche, Streaming-Dienst):
   * never run whole-token stripSuffix / -st finite heuristics — they chew stem
   * endings (Kurs→Kur, Woche→Woch) or invent infinitives (Dienst→Dienen).
   * Only strip clear last-segment inflection: genitive -es, plural -e after sibilant.
   */
  function normalizeHyphenatedDe(raw, table) {
    const parts = String(raw || '')
      .toLowerCase()
      .split('-')
      .filter(Boolean);
    if (parts.length < 2) return null;
    let last = parts[parts.length - 1];
    if (table[last]) {
      last = table[last];
    } else if (last.length > 4 && last.endsWith('es')) {
      last = last.slice(0, -2); // Yoga-Kurses → Yoga-Kurs
    } else if (last.length > 4 && /[sßxz]e$/i.test(last)) {
      last = last.slice(0, -1); // Yoga-Kurse / Preise → stem
    } else if (last.length > 5 && /(?:ste|kte|rte|fte|chte|pte)$/i.test(last)) {
      // Streaming-Dienste / Punkte — plural -e after consonant cluster; not Woche/Hilfe
      last = last.slice(0, -1);
    }
    return [...parts.slice(0, -1), last].join('-');
  }

  function normalizeLemma(token, lang) {
    const lg = normLang(lang);
    const raw = String(token || '').toLowerCase().trim();
    if (!raw || raw.length < 2) return raw;

    const table = IRREGULAR[lg] || {};
    const irr = lookupIrregular(table, raw);
    if (irr) return lg === 'de' ? finalizeDeLemma(raw, irr) : irr;

    if (lg === 'de' && raw.includes('-')) {
      const hyphen = normalizeHyphenatedDe(raw, table);
      if (hyphen) return finalizeDeLemma(raw, hyphen);
    }

    if (lg === 'de') {
      // (c) adjectives / (d) adverbs before any verb / suffix logic
      const adj = matchKnownAdjective(raw);
      if (adj) return finalizeDeLemma(raw, adj);
      const adv = matchKnownAdverb(raw);
      if (adv) return finalizeDeLemma(raw, adv);

      // (e) *lässt → *lassen before -sst heuristic
      const laesst = matchLaesstInfinitive(raw);
      if (laesst) return finalizeDeLemma(raw, laesst);

      // (a) lexical ge- stems (genießen, gewährleistet, …)
      const ge = matchLexicalGeVerb(raw);
      if (ge) return finalizeDeLemma(raw, ge);
    }

    const uml = normalizeUmlaut(raw);

    if (lg === 'de') {
      const adjU = matchKnownAdjective(uml);
      if (adjU) return finalizeDeLemma(raw, adjU);
      const advU = matchKnownAdverb(uml);
      if (advU) return finalizeDeLemma(raw, advU);
      const laesstU = matchLaesstInfinitive(uml);
      if (laesstU) return finalizeDeLemma(raw, laesstU);
      const geU = matchLexicalGeVerb(uml);
      if (geU) return finalizeDeLemma(raw, geU);

      // (b) finite → infinitive: -st, 1sg -e, 3sg -et (epenthesis), then bare -t
      const finite =
        tryDeFiniteSt(raw) || tryDeFiniteSt(uml) ||
        tryDeFiniteE(raw) || tryDeFiniteE(uml) ||
        tryDeFiniteEt(raw) || tryDeFiniteEt(uml) ||
        tryDeFiniteT(raw) || tryDeFiniteT(uml);
      if (finite) {
        const irrF = lookupIrregular(table, finite);
        if (irrF) return finalizeDeLemma(raw, irrF);
        const geF = matchLexicalGeVerb(finite);
        if (geF) return finalizeDeLemma(raw, geF);
        if (finite.length >= 5 && /(?:en|eln|ern)$/.test(finite)) return finalizeDeLemma(raw, finite);
      }

      // Already an infinitive (or -en noun kept intact): never chew -en/-chen
      if (raw.endsWith('ungen') && raw.length > 6) return finalizeDeLemma(raw, raw.slice(0, -2));
      if (uml.endsWith('ungen') && uml.length > 6) return finalizeDeLemma(raw, uml.slice(0, -2));
      if (raw.length >= 5 && /(?:en|eln|ern)$/.test(raw)) return finalizeDeLemma(raw, raw);
    }

    const strippedRaw = stripSuffix(raw, lg);
    const strippedUml = stripSuffix(uml, lg);
    const stripped = strippedRaw !== raw ? strippedRaw : strippedUml;
    const irrS = lookupIrregular(table, stripped);
    if (irrS) return lg === 'de' ? finalizeDeLemma(raw, irrS) : irrS;

    if (lg === 'de') {
      const geS = matchLexicalGeVerb(stripped);
      if (geS) return finalizeDeLemma(raw, geS);
      return finalizeDeLemma(raw, stripped || raw);
    }

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
    // exported for tests / future shared use with enrichBatchMetadata
    KNOWN_ADJECTIVE_LEMMAS,
    KNOWN_ADVERB_LEMMAS,
    LEXICAL_GE_VERBS,
  });
})();

if (typeof window !== 'undefined') window.Lemmatizer = Lemmatizer;
if (typeof module !== 'undefined') module.exports = Lemmatizer;
