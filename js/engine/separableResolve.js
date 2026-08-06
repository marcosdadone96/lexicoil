/**
 * Separable-verb reunification for practice save / hover (browser).
 * Given a clicked surface + sentence context, return full lemma when particle+root
 * are visible in the same clause (same rules spirit as enrichBatchMetadata findSplitSeparables).
 *
 * Pair highlighting (data-vocab-pair-id) and reunified save both depend on findSplitPairs.
 * Keep SEPARABLE_INFINITIVES in sync with scripts/lib/enrichBatchMetadata.mjs.
 */
const SeparableResolve = (() => {
  const SEPARABLE_PREFIXES = [
    'mit', 'auf', 'an', 'aus', 'ein', 'zu', 'vor', 'nach', 'bei', 'los', 'weg',
    'zurück', 'weiter', 'fest', 'teil', 'statt', 'heran', 'herum', 'hin', 'her',
    'herunter', 'fort',
    'ab', 'durch', 'über', 'um', 'unter', 'zusammen',
  ];

  /**
   * Known separable infinitives (B1 core + exam bank).
   * Only these reunify when split — avoids false pairs like «mit dem Bus».
   * Keep in sync with scripts/lib/enrichBatchMetadata.mjs.
   */
    const SEPARABLE_INFINITIVES = new Set([
    // mit-
    'mitbringen', 'mithelfen', 'mitkommen', 'mitmachen', 'mitnehmen', 'mitschreiben',
    'mitspielen', 'mitteilen',
    // auf-
    'aufatmen', 'aufbauen', 'aufbewahren', 'aufbrechen', 'aufdecken', 'aufdrehen',
    'auffallen', 'auffangen', 'auffordern', 'aufgeben', 'aufhalten', 'aufhängen',
    'aufheben', 'aufhören', 'aufklären', 'aufladen', 'auflaufen', 'auflegen',
    'auflesen', 'auflösen', 'aufmachen', 'aufnehmen', 'aufpassen', 'aufräumen',
    'aufregen', 'aufreizen', 'aufrufen', 'aufschreiben', 'aufstehen', 'aufsteigen',
    'auftauchen', 'aufteilen', 'auftreten', 'aufwachen', 'aufwachsen', 'aufzählen',
    'aufzeigen', 'aufziehen',
    // an-
    'anbauen', 'anbeißen', 'anbieten', 'anbinden', 'anbrechen', 'anbrennen',
    'anfangen', 'anfassen', 'anfragen', 'anfühlen', 'angeben', 'angreifen',
    'anhaben', 'anhalten', 'anklicken', 'ankommen', 'ankreuzen', 'ankündigen',
    'anlaufen', 'anlegen', 'anleuchten', 'anmachen', 'anmelden', 'annehmen',
    'anpassen', 'anprobieren', 'anrufen', 'anschauen', 'anschließen', 'ansehen',
    'ansprechen', 'anstehen', 'anstellen', 'anstrengen', 'antreffen', 'anwenden',
    'anziehen',
    // aus-
    'ausarbeiten', 'ausatmen', 'ausbauen', 'ausbilden', 'ausbleiben', 'ausbrechen',
    'ausbreiten', 'ausdehnen', 'ausdenken', 'ausdrucken', 'ausdrücken', 'ausfahren',
    'ausfallen', 'ausfüllen', 'ausgeben', 'ausgehen', 'ausgleichen', 'aushalten',
    'aushelfen', 'auskennen', 'ausladen', 'auslaufen', 'auslegen', 'ausleihen',
    'auslösen', 'ausmachen', 'ausnutzen', 'auspacken', 'ausprobieren', 'ausreden',
    'ausreichen', 'ausruhen', 'ausschalten', 'ausschließen', 'ausschneiden', 'aussehen',
    'aussprechen', 'aussteigen', 'aussuchen', 'austauschen', 'austragen', 'austreten', 'ausüben',
    'auswählen', 'auswandern', 'ausweichen', 'ausziehen',
    // ein-
    'einatmen', 'einbauen', 'einbilden', 'einbrechen', 'einbringen', 'einchecken',
    'eindringen', 'einfallen', 'einfangen', 'einfärben', 'einfordern', 'einfrieren',
    'eingeben', 'eingehen', 'eingießen', 'eingreifen', 'einhalten', 'einhängen',
    'einholen', 'einkaufen', 'einladen', 'einlassen', 'einlaufen', 'einlegen',
    'einleiten', 'einlesen', 'einlösen', 'einnehmen', 'einpacken', 'einpassen',
    'einprägen', 'einräumen', 'einreichen', 'einrichten', 'einsammeln', 'einschalten',
    'einschlafen', 'einschließen', 'einschreiben', 'einsetzen', 'einsparen', 'einsteigen',
    'einstellen', 'einstimmen', 'eintauchen', 'einteilen', 'eintippen', 'eintragen',
    'eintreten', 'einüben', 'einzahlen', 'einziehen',
    // zu-
    'zubereiten', 'zugeben', 'zuhören', 'zumachen', 'zunehmen', 'zustimmen',
    // vor-
    'vorbereiten', 'vorhaben', 'vorkommen', 'vorlesen', 'vorschlagen', 'vorstellen',
    // nach-
    'nachdenken', 'nachfragen', 'nachschauen', 'nachweisen',
    // bei-
    'beibringen', 'beitragen',
    // los-
    'losfahren', 'losgehen',
    // fort-
    'fortsetzen',
    // weg-
    'wegfahren', 'weggehen',
    // zurück-
    'zurückfahren', 'zurückgeben', 'zurückgehen', 'zurückkommen', 'zurücklaufen', 'zurückrufen',
    // weiter-
    'weitergeben', 'weitergehen', 'weitermachen',
    // fest-
    'festhalten', 'festlegen', 'feststellen',
    // teil-
    'teilnehmen',
    // statt-
    'stattfinden',
    // ab-
    'abbiegen', 'abbrechen', 'abbringen', 'abdanken', 'abfahren', 'abfallen',
    'abfertigen', 'abfliegen', 'abgeben', 'abgleichen', 'abgreifen', 'abhalten',
    'abhängen', 'abheben', 'abholen', 'abkühlen', 'ablegen', 'ablehnen',
    'abmelden', 'abnehmen', 'abraten', 'abreisen', 'abrufen', 'absagen',
    'abschließen', 'abschneiden', 'absehen', 'absteigen', 'abstellen', 'abstimmen',
    'abwarten', 'abwickeln', 'abwenden', 'abziehen',
    // her-
    'herkommen', 'herunterladen', 'herstellen',
    // um-
    'umsetzen', 'umsteigen', 'umziehen',
    // durch-
    'durchführen',
    // über-
    'übernehmen', 'überweisen',
    // unter-
    'untergehen', 'unterschreiben',
    // zusammen-
    'zusammenarbeiten', 'zusammenfassen',
    // aner-
    'anerkennen',
    // other-
    'hingehen', 'kennenlernen',
  ]);

  const FINITE_TO_INF = {
    macht: 'machen', machst: 'machen', mache: 'machen', gemacht: 'machen',
    nimmt: 'nehmen', nimmst: 'nehmen', nehme: 'nehmen', genommen: 'nehmen',
    kommt: 'kommen', kommst: 'kommen', komme: 'kommen', gekommen: 'kommen',
    geht: 'gehen', gehst: 'gehen', gehe: 'gehen', gegangen: 'gehen',
    gibt: 'geben', gibst: 'geben', gebe: 'geben', gegeben: 'geben',
    sieht: 'sehen', siehst: 'sehen', sehe: 'sehen', gesehen: 'sehen',
    bringt: 'bringen', bringst: 'bringen', bringe: 'bringen', gebracht: 'bringen',
    bleibt: 'bleiben', bleibst: 'bleiben', bleibe: 'bleiben', geblieben: 'bleiben',
    ruft: 'rufen', rufst: 'rufen', rufe: 'rufen', gerufen: 'rufen',
    stellt: 'stellen', stellst: 'stellen', stelle: 'stellen', gestellt: 'stellen',
    schlägt: 'schlagen', schlaegt: 'schlagen', schlägst: 'schlagen', schlaegst: 'schlagen',
    fängt: 'fangen', faengt: 'fangen', fängst: 'fangen', faengst: 'fangen',
    fährt: 'fahren', faehrt: 'fahren', fährst: 'fahren', faehrst: 'fahren',
    denkt: 'denken', denkst: 'denken', denke: 'denken',
    braucht: 'brauchen', brauchst: 'brauchen', brauche: 'brauchen',
    beginnt: 'beginnen', beginne: 'beginnen',
    arbeitet: 'arbeiten', arbeite: 'arbeiten',
    findet: 'finden', finde: 'finden', findest: 'finden',
    hilft: 'helfen', helfe: 'helfen', hilfst: 'helfen',
    kennt: 'kennen', kenne: 'kennen', kennst: 'kennen',
    lernt: 'lernen', lerne: 'lernen', lernst: 'lernen',
    wohnt: 'wohnen', wohne: 'wohnen', wohnst: 'wohnen',
    kauft: 'kaufen', kaufe: 'kaufen', kaufst: 'kaufen',
    spielt: 'spielen', spiele: 'spielen', spielst: 'spielen',
    sucht: 'suchen', suche: 'suchen', suchst: 'suchen',
    schreibt: 'schreiben', schreibe: 'schreiben', schreibst: 'schreiben',
    liest: 'lesen', lese: 'lesen',
    spricht: 'sprechen', spreche: 'sprechen', sprichst: 'sprechen',
    kündigt: 'kündigen', kuendigt: 'kündigen', kündige: 'kündigen',
    // bieten (anbieten, …)
    bietet: 'bieten', bietest: 'bieten', biete: 'bieten', geboten: 'bieten',
    hört: 'hören', hörst: 'hören', höre: 'hören', hoer: 'hören', hör: 'hören',
    nimm: 'nehmen',
    passt: 'passen', passe: 'passen',
    fällt: 'fallen', faellt: 'fallen', fällst: 'fallen',
    wählt: 'wählen', waehlt: 'wählen', wähle: 'wählen',
    füllt: 'füllen', fuellt: 'füllen', fülle: 'füllen',
    baut: 'bauen', baue: 'bauen', baust: 'bauen',
    holt: 'holen', hole: 'holen', holst: 'holen',
    sagt: 'sagen', sage: 'sagen', sagst: 'sagen',
    schließt: 'schließen', schliesst: 'schließen', schließe: 'schließen',
    steigt: 'steigen', steige: 'steigen', steigst: 'steigen',
    trägt: 'tragen', traegt: 'tragen', trägst: 'tragen',
    wacht: 'wachen', wache: 'wachen',
    packt: 'packen', packe: 'packen', packst: 'packen',
    schläft: 'schlafen', schlaeft: 'schlafen', schläfst: 'schlafen',
    teilt: 'teilen', teile: 'teilen', teilst: 'teilen',
    liest: 'lesen',
    // Part 1 expansion roots (ablehnen, austauschen, festlegen, …)
    tauscht: 'tauschen', tausche: 'tauschen', tauschst: 'tauschen',
    lehnt: 'lehnen', lehne: 'lehnen', lehnst: 'lehnen',
    stimmt: 'stimmen', stimme: 'stimmen', stimmst: 'stimmen',
    legt: 'legen', lege: 'legen', legst: 'legen',
    fasst: 'fassen', fasse: 'fassen',
    fragt: 'fragen', frage: 'fragen', fragst: 'fragen',
    wendet: 'wenden', wende: 'wenden',
    führt: 'führen', führe: 'führen', führst: 'führen',
    setzt: 'setzen', setze: 'setzen',
    zieht: 'ziehen', ziehe: 'ziehen', ziehst: 'ziehen',
    weist: 'weisen', weise: 'weisen',
    klickt: 'klicken', klicke: 'klicken',
    kreuzt: 'kreuzen', kreuze: 'kreuzen',
    schneidet: 'schneiden', schneide: 'schneiden',
    räumt: 'räumen', raeumt: 'räumen', räume: 'räumen',
    // DWDS expansion roots
    erkennt: 'erkennen', erkenne: 'erkennen', erkennst: 'erkennen',
    hängt: 'hängen', haengt: 'hängen', hänge: 'hängen',
    hebt: 'heben', hebe: 'heben', hebst: 'heben',
    biegt: 'biegen', biege: 'biegen',
    bricht: 'brechen', breche: 'brechen', brichst: 'brechen',
    brennt: 'brennen', brenne: 'brennen',
    greift: 'greifen', greife: 'greifen',
    hält: 'halten', haelt: 'halten', halte: 'halten', hältst: 'halten',
    läuft: 'laufen', laeuft: 'laufen', laufe: 'laufen',
    steigt: 'steigen', steige: 'steigen', stehst: 'stehen', steht: 'stehen', stehe: 'stehen',
    zieht: 'ziehen', ziehe: 'ziehen', ziehst: 'ziehen',
    fällt: 'fallen', faellt: 'fallen',
    fährt: 'fahren', faehrt: 'fahren',
    spricht: 'sprechen', spreche: 'sprechen',
    tritt: 'treten', trete: 'treten',
    wächst: 'wachsen', waechst: 'wachsen',
    löst: 'lösen', loest: 'lösen',
    wickelt: 'wickeln', wickelst: 'wickeln', wickle: 'wickeln',
    wartet: 'warten', wartest: 'warten', warte: 'warten',
    lädt: 'laden', laedt: 'laden',
    leiht: 'leihen',
    nutzt: 'nutzen',
    passt: 'passen',
    setzt: 'setzen',
    stellt: 'stellen',
    trifft: 'treffen',
    wendet: 'wenden',
    zählt: 'zählen', zaehlt: 'zählen',
    zeigt: 'zeigen',
    atmet: 'atmen',
    checkt: 'checken',
    tippt: 'tippen',
    zahlt: 'zahlen',
  };

  const ARTICLE_AFTER = new Set([
    'der', 'die', 'das', 'den', 'dem', 'des',
    'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  ]);

  // __cb__ = comma/semicolon (clause-internal): «schlägt vor, ein Picknick…» is still separable
  const AFTER_PARTICLE_OK = new Set([
    '__sb__', '__cb__',
    'und', 'oder', 'aber', 'denn', 'sondern', 'doch',
    'bitte', 'mal', 'einfach', 'gleich', 'noch', 'auch', 'nicht', 'nur',
    'schon', 'immer', 'oft', 'sofort', 'heute', 'morgen', 'später', 'früher',
    'dass', 'daß', 'weil', 'wenn', 'ob', 'als', 'indem', 'während', 'obwohl',
  ]);

  /**
   * Keeps `.!?…` as `__sb__` and `,;:` as `__cb__` so «schlägt vor, ein…» is not
   * mistaken for preposition+article («mit dem Bus»).
   */
  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[.!?…]+/g, ' __sb__ ')
      .replace(/[,;:]+/g, ' __cb__ ')
      .replace(/[^a-zäöüß\-_]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function isBreakToken(t) {
    return t === '__sb__' || t === '__cb__';
  }

  /**
   * True when tokens[j] is a clause-final separable particle, not a preposition.
   * Rejects «an gute Gewohnheiten» / «mit dem Bus»; allows «bietet … an,» / «schlägt vor früher».
   */
  function particleLooksFinal(tokens, j) {
    const next = j + 1 < tokens.length ? tokens[j + 1] : '';
    if (!next || next === '__sb__' || next === '__cb__') return true;
    // Preposition-like: particle + article → "mit dem Bus", not separable "mit"
    if (ARTICLE_AFTER.has(next)) return false;
    if (AFTER_PARTICLE_OK.has(next)) return true;
    // «an gute Gewohnheiten» — preposition + adj/noun NP, not particle
    return false;
  }

  /** Lazy Lemmatizer — browser global or Node require (finite steht→stehen, etc.). */
  let _lemmaMod = null;
  function lemmatizer() {
    if (typeof Lemmatizer !== 'undefined' && Lemmatizer.normalizeLemma) return Lemmatizer;
    if (_lemmaMod) return _lemmaMod;
    if (typeof require !== 'undefined') {
      try {
        _lemmaMod = require('./validation/lemmatizer.js');
      } catch (_) {
        _lemmaMod = null;
      }
    }
    return _lemmaMod;
  }

  function rootOfToken(t) {
    const low = String(t || '').toLowerCase();
    if (FINITE_TO_INF[low]) return FINITE_TO_INF[low];
    if (/(?:en|eln|ern)$/.test(low) && low.length >= 4) return low;
    const L = lemmatizer();
    if (L?.normalizeLemma) {
      const lem = String(L.normalizeLemma(low, 'de') || '').toLowerCase();
      if (lem && /(?:en|eln|ern)$/.test(lem) && lem.length >= 4) return lem;
    }
    return null;
  }

  /**
   * Glued finite separable: abnimmt → abnehmen (not abnimmen via naive -t→-en).
   * Only returns allowlisted separable infinitives.
   */
  function resolveSeparableFiniteToInfinitive(token) {
    const low = String(token || '').toLowerCase().trim();
    if (!low || low.length < 6) return null;
    if (SEPARABLE_INFINITIVES.has(low)) return low;
    const sorted = [...SEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);
    for (const p of sorted) {
      if (!low.startsWith(p) || low.length <= p.length + 3) continue;
      const rootInf = rootOfToken(low.slice(p.length));
      if (!rootInf) continue;
      const cand = `${p}${rootInf}`;
      if (SEPARABLE_INFINITIVES.has(cand)) return cand;
    }
    return null;
  }

  /**
   * Find split separable pairs (allowlist only, particle after verb).
   * Nearest valid particle wins per root — avoids linking «bieten» to a later prep «an».
   * @returns {Array<{lemma:string, rootTokenIndex:number, particleTokenIndex:number, rootToken:string, particleToken:string}>}
   */
  function findSplitPairs(tokens) {
    const pairs = [];
    const seenRoot = new Set();
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (isBreakToken(t)) continue;
      if (seenRoot.has(i)) continue;
      const root = rootOfToken(t);
      if (!root) continue;
      for (let j = i + 1; j < Math.min(tokens.length, i + 14); j++) {
        const p = tokens[j];
        if (isBreakToken(p)) continue;
        if (!SEPARABLE_PREFIXES.includes(p)) continue;
        const next = j + 1 < tokens.length ? tokens[j + 1] : '';
        // Immediate article = preposition use; article after comma (__cb__) is OK
        if (next && ARTICLE_AFTER.has(next)) continue;
        if (!particleLooksFinal(tokens, j)) continue;
        let broken = false;
        for (let k = i + 1; k < j; k++) {
          if (tokens[k] === '__sb__') {
            broken = true;
            break;
          }
        }
        if (broken) continue;
        if (p === 'zu') {
          const prev = j > 0 ? tokens[j - 1] : '';
          if (prev === 'um') continue;
          if (next && /(?:en|eln|ern)$/.test(next) && next.length >= 4) continue;
        }
        const full = `${p}${root}`;
        if (!SEPARABLE_INFINITIVES.has(full)) continue;
        seenRoot.add(i);
        pairs.push({
          lemma: full,
          rootTokenIndex: i,
          particleTokenIndex: j,
          rootToken: t,
          particleToken: p,
        });
        break; // nearest particle only
      }
    }
    return pairs;
  }

  /**
   * @returns {Set<string>}
   */
  function findSplitSeparables(tokens) {
    return new Set(findSplitPairs(tokens).map((p) => p.lemma));
  }

  /**
   * @param {string} clickedWord surface from DOM
   * @param {string} sentenceContext nearby sentence / passage line
   * @returns {{ word: string, surface: string, reunified: boolean, lemmaUncertain: boolean }}
   */
  function resolveForSave(clickedWord, sentenceContext) {
    const surface = String(clickedWord || '').trim();
    if (!surface) {
      return { word: surface, surface, reunified: false, lemmaUncertain: true };
    }
    const low = surface.toLowerCase();
    const tokens = tokenize(sentenceContext);
    const found = findSplitSeparables(tokens);
    const clickRoot = rootOfToken(low) || (typeof Lemmatizer !== 'undefined' && Lemmatizer.normalizeLemma
      ? Lemmatizer.normalizeLemma(low, 'de')
      : low);

    for (const full of found) {
      for (const p of SEPARABLE_PREFIXES) {
        if (!full.startsWith(p) || full.length <= p.length) continue;
        const root = full.slice(p.length);
        if (clickRoot === root || low === root || FINITE_TO_INF[low] === root) {
          return {
            word: full,
            surface,
            reunified: true,
            lemmaUncertain: false,
          };
        }
      }
      for (const p of SEPARABLE_PREFIXES) {
        if (low === p && full.startsWith(p)) {
          return { word: full, surface, reunified: true, lemmaUncertain: false };
        }
      }
    }

    const looksFinite = !!FINITE_TO_INF[low] || /(?:t|st|e)$/.test(low) && !/(?:en|eln|ern)$/.test(low);
    const looksLikeNoun = /^[A-ZÄÖÜ]/.test(surface);
    const lemma = !looksLikeNoun && typeof Lemmatizer !== 'undefined' && Lemmatizer.normalizeLemma
      ? Lemmatizer.normalizeLemma(surface, 'de')
      : low;
    const useLemma = !looksLikeNoun && lemma && lemma !== low && /(?:en|eln|ern)$/.test(lemma) && lemma.length >= 5;
    return {
      word: useLemma ? lemma : surface,
      surface,
      reunified: false,
      lemmaUncertain: looksFinite && !useLemma && !looksLikeNoun,
    };
  }

  /**
   * Whether tooltip/save should ask Gemini for the lemma (separable safety net).
   * Only when allowlist reunify failed — never replaces a successful list hit.
   */
  function needsAiLemmaFallback(resolved, sentenceContext, subject) {
    if (subject && subject !== 'de') return false;
    if (!resolved || resolved.reunified) return false;
    const ctx = String(sentenceContext || '').trim();
    if (ctx.length < 12) return false;
    const surface = String(resolved.surface || '').trim();
    const word = String(resolved.word || surface).toLowerCase();
    if (!surface || surface.length < 2) return false;
    if (SEPARABLE_INFINITIVES.has(word)) return false;
    const low = surface.toLowerCase();
    // Verbal-ish only (avoid paying for nouns/adj)
    if (resolved.lemmaUncertain) return true;
    if (FINITE_TO_INF[low]) return true;
    if (/(?:t|st)$/.test(low) && !/(?:en|eln|ern|heit|keit|ung|schaft)$/.test(low)) return true;
    // Particle click without reunify
    if (SEPARABLE_PREFIXES.includes(low)) return true;
    return false;
  }

  /**
   * Keep keys ⊆ SEPARABLE_INFINITIVES.
   */
  const SEPARABLE_GLOSS = Object.freeze({
    mitmachen: { en: 'to join in', es: 'participar' , it: 'partecipare' },
    mitnehmen: { en: 'to take along', es: 'llevarse' , it: 'portare con sé' },
    mitbringen: { en: 'to bring along', es: 'traer' , it: 'portare' },
    mitkommen: { en: 'to come along', es: 'venir con' , it: 'venire insieme' },
    mitteilen: { en: 'to inform', es: 'comunicar' , it: 'comunicare' },
    mitspielen: { en: 'to play along', es: 'jugar con' , it: 'giocare insieme' },
    aufmachen: { en: 'to open', es: 'abrir' , it: 'aprire' },
    aufnehmen: { en: 'to record / take in', es: 'grabar / acoger' , it: 'registrare' },
    aufräumen: { en: 'to tidy up', es: 'ordenar' , it: 'riordinare' },
    aufstehen: { en: 'to get up', es: 'levantarse' , it: 'alzarsi' },
    aufhören: { en: 'to stop', es: 'dejar de' , it: 'smettere' },
    aufpassen: { en: 'to pay attention', es: 'prestar atención' , it: 'fare attenzione' },
    aufgeben: { en: 'to give up', es: 'rendirse' , it: 'arrendersi' },
    aufbauen: { en: 'to build up', es: 'construir' , it: 'costruire' },
    aufschreiben: { en: 'to write down', es: 'anotar' , it: 'scrivere' },
    auffallen: { en: 'to stand out', es: 'llamar la atención' , it: 'colpire' },
    aufwachen: { en: 'to wake up', es: 'despertarse' , it: 'svegliarsi' },
    anmachen: { en: 'to turn on', es: 'encender' , it: 'accendere' },
    anrufen: { en: 'to call (phone)', es: 'llamar' , it: 'telefonare' },
    anfangen: { en: 'to begin', es: 'empezar' , it: 'iniziare' },
    ankommen: { en: 'to arrive', es: 'llegar' , it: 'arrivare' },
    ankündigen: { en: 'to announce', es: 'anunciar' , it: 'annunciare' },
    anbieten: { en: 'to offer', es: 'ofrecer' , it: 'offrire' },
    ansehen: { en: 'to look at', es: 'mirar' , it: 'guardare' },
    anziehen: { en: 'to put on / attract', es: 'ponerse / atraer' , it: 'indossare' },
    anmelden: { en: 'to register', es: 'inscribirse' , it: 'registrarsi' },
    anschauen: { en: 'to look at', es: 'mirar' , it: 'guardare' },
    ausmachen: { en: 'to turn off / agree', es: 'apagar / quedar' , it: 'spegnere' },
    ausschalten: { en: 'to switch off', es: 'apagar' , it: 'spegnere' },
    aussehen: { en: 'to look (appear)', es: 'parecer' , it: 'sembrare' },
    ausziehen: { en: 'to take off / move out', es: 'quitarse / mudarse' , it: 'spogliarsi' },
    ausfüllen: { en: 'to fill out', es: 'rellenar' , it: 'compilare' },
    ausgeben: { en: 'to spend', es: 'gastar' , it: 'spendere' },
    aussteigen: { en: 'to get off', es: 'bajarse' , it: 'scendere' },
    ausprobieren: { en: 'to try out', es: 'probar' , it: 'provare' },
    auswählen: { en: 'to choose', es: 'elegir' , it: 'scegliere' },
    ausdenken: { en: 'to invent', es: 'inventar' , it: 'inventare' },
    einladen: { en: 'to invite', es: 'invitar' , it: 'invitare' },
    einkaufen: { en: 'to shop', es: 'hacer la compra' , it: 'fare la spesa' },
    einschalten: { en: 'to switch on', es: 'encender' , it: 'accendere' },
    einnehmen: { en: 'to take (medicine)', es: 'tomar' , it: 'assumere' },
    einsteigen: { en: 'to get in', es: 'subirse' , it: 'salire' },
    einpacken: { en: 'to pack', es: 'empaquetar' , it: 'impacchettare' },
    einschlafen: { en: 'to fall asleep', es: 'dormirse' , it: 'addormentarsi' },
    eintragen: { en: 'to enter (write in)', es: 'anotar' , it: 'annotare' },
    einziehen: { en: 'to move in', es: 'mudarse' , it: 'trasferirsi' },
    einfallen: { en: 'to occur (to sb)', es: 'ocurrírsele' , it: 'venire in mente' },
    zumachen: { en: 'to close', es: 'cerrar' , it: 'chiudere' },
    zubereiten: { en: 'to prepare (food)', es: 'preparar' , it: 'preparare' },
    zuhören: { en: 'to listen', es: 'escuchar' , it: 'ascoltare' },
    zugeben: { en: 'to admit', es: 'admitir' , it: 'ammettere' },
    vorbereiten: { en: 'to prepare', es: 'preparar' , it: 'preparare' },
    vorschlagen: { en: 'to suggest', es: 'proponer' , it: 'proporre' },
    vorstellen: { en: 'to introduce / imagine', es: 'presentar / imaginar' , it: 'presentare' },
    vorhaben: { en: 'to plan', es: 'tener previsto' , it: 'progettare' },
    vorlesen: { en: 'to read aloud', es: 'leer en voz alta' , it: 'leggere ad alta voce' },
    vorkommen: { en: 'to occur', es: 'ocurrir' , it: 'verificarsi' },
    nachdenken: { en: 'to think (about)', es: 'reflexionar' , it: 'riflettere' },
    nachfragen: { en: 'to inquire', es: 'preguntar' , it: 'informarsi' },
    nachschauen: { en: 'to look up / check', es: 'mirar / comprobar' , it: 'controllare' },
    nachweisen: { en: 'to prove', es: 'demostrar' , it: 'dimostrare' },
    beibringen: { en: 'to teach', es: 'enseñar' , it: 'insegnare' },
    beitragen: { en: 'to contribute', es: 'contribuir' , it: 'contribuire' },
    losfahren: { en: 'to set off', es: 'partir' , it: 'partire' },
    losgehen: { en: 'to set off (on foot)', es: 'ponerse en marcha' , it: 'mettersi in cammino' },
    weggehen: { en: 'to leave', es: 'irse' , it: 'andarsene' },
    wegfahren: { en: 'to drive away', es: 'marcharse' , it: 'partire' },
    zurückkommen: { en: 'to come back', es: 'volver' , it: 'tornare' },
    zurückgeben: { en: 'to give back', es: 'devolver' , it: 'restituire' },
    weitergehen: { en: 'to continue (go on)', es: 'seguir' , it: 'continuare' },
    weitermachen: { en: 'to continue', es: 'continuar' , it: 'continuare' },
    teilnehmen: { en: 'to take part', es: 'participar' , it: 'partecipare' },
    stattfinden: { en: 'to take place', es: 'tener lugar' , it: 'svolgersi' },
    kennenlernen: { en: 'to get to know', es: 'conocer' , it: 'conoscere' },
    abholen: { en: 'to pick up', es: 'recoger' , it: 'andare a prendere' },
    absagen: { en: 'to cancel', es: 'cancelar' , it: 'annullare' },
    abschließen: { en: 'to conclude / lock', es: 'concluir / cerrar' , it: 'concludere' },
    abfahren: { en: 'to depart', es: 'salir' , it: 'partire' },
    abgeben: { en: 'to hand in', es: 'entregar' , it: 'consegnare' },
    festhalten: { en: 'to hold on', es: 'sujetar' , it: 'trattenere' },
    feststellen: { en: 'to determine', es: 'constatar' , it: 'constatare' },
    herstellen: { en: 'to produce', es: 'fabricar' , it: 'produrre' },
    herkommen: { en: 'to come (from)', es: 'venir' , it: 'provenire' },
    // Part 1 expansion glosses
    mithelfen: { en: 'to help (along)', es: 'ayudar' , it: 'aiutare' },
    mitschreiben: { en: 'to take notes', es: 'tomar apuntes' , it: 'prendere appunti' },
    aufklären: { en: 'to clarify / enlighten', es: 'aclarar' , it: 'chiarire' },
    auflegen: { en: 'to hang up (phone)', es: 'colgar' , it: 'riagganciare' },
    aufregen: { en: 'to upset', es: 'alterar' , it: 'turbare' },
    aufteilen: { en: 'to divide / share out', es: 'repartir' , it: 'dividere' },
    angeben: { en: 'to state / indicate', es: 'indicar' , it: 'indicare' },
    ansprechen: { en: 'to address / speak to', es: 'dirigirse a' , it: 'rivolgersi a' },
    anbauen: { en: 'to grow / cultivate', es: 'cultivar' , it: 'coltivare' },
    anfragen: { en: 'to inquire', es: 'consultar' , it: 'richiedere' },
    anwenden: { en: 'to apply', es: 'aplicar' , it: 'applicare' },
    anprobieren: { en: 'to try on', es: 'probarse' , it: 'provare' },
    anklicken: { en: 'to click', es: 'hacer clic' , it: 'cliccare' },
    ankreuzen: { en: 'to tick / check', es: 'marcar' , it: 'spuntare' },
    ausgehen: { en: 'to go out', es: 'salir' , it: 'uscire' },
    austauschen: { en: 'to exchange', es: 'intercambiar' , it: 'scambiare' },
    ausdrucken: { en: 'to print out', es: 'imprimir' , it: 'stampare' },
    aussuchen: { en: 'to pick out', es: 'escoger' , it: 'scegliere' },
    ausschließen: { en: 'to exclude', es: 'excluir' , it: 'escludere' },
    ausschneiden: { en: 'to cut out', es: 'recortar' , it: 'ritagliare' },
    einreichen: { en: 'to submit', es: 'presentar' , it: 'presentare' },
    einräumen: { en: 'to put away / concede', es: 'guardar / admitir' , it: 'riporre' },
    einsparen: { en: 'to save (cut costs)', es: 'ahorrar' , it: 'risparmiare' },
    einteilen: { en: 'to divide / schedule', es: 'organizar' , it: 'organizzare' },
    zustimmen: { en: 'to agree', es: 'estar de acuerdo' , it: 'acconsentire' },
    zurückrufen: { en: 'to call back', es: 'devolver la llamada' , it: 'richiamare' },
    weitergeben: { en: 'to pass on', es: 'transmitir' , it: 'trasmettere' },
    hingehen: { en: 'to go (there)', es: 'ir (allí)' , it: 'andare lì' },
    abmelden: { en: 'to deregister / sign off', es: 'darse de baja' , it: 'cancellarsi' },
    abnehmen: { en: 'to lose weight / take off', es: 'adelgazar / quitar' , it: 'perdere peso' },
    zunehmen: { en: 'to gain weight / increase', es: 'engordar / aumentar' , it: 'aumentare' },
    ablehnen: { en: 'to decline / reject', es: 'rechazar' , it: 'rifiutare' },
    abstellen: { en: 'to turn off / put down', es: 'apagar / dejar' , it: 'spegnere' },
    festlegen: { en: 'to set / establish', es: 'fijar' , it: 'stabilire' },
    umsteigen: { en: 'to change (transport)', es: 'hacer transbordo' , it: 'cambiare' },
    umziehen: { en: 'to move (house)', es: 'mudarse' , it: 'traslocare' },
    umsetzen: { en: 'to implement', es: 'llevar a cabo' , it: 'attuare' },
    durchführen: { en: 'to carry out', es: 'realizar' , it: 'eseguire' },
    übernehmen: { en: 'to take over', es: 'asumir' , it: 'subentrare' },
    überweisen: { en: 'to transfer (money)', es: 'transferir' , it: 'trasferire' },
    unterschreiben: { en: 'to sign', es: 'firmar' , it: 'firmare' },
    zusammenfassen: { en: 'to summarize', es: 'resumir' , it: 'riassumere' },
  });

  /**
   * @param {string} lemma
   * @param {string} targetLang en|es|…
   * @param {string} [subject]
   * @returns {object|null}
   */
  function localGloss(lemma, targetLang, subject) {
    const low = String(lemma || '').toLowerCase().trim();
    if (!low || !SEPARABLE_INFINITIVES.has(low)) return null;
    const g = SEPARABLE_GLOSS[low];
    if (!g) return null;
    const lang = String(targetLang || 'en').toLowerCase();
    const isEnDef = subject === 'en' && lang === 'en';
    // Only hit when this UI language is curated — do NOT fake FR with English text.
    // Missing lang → null so fetchVocab falls through to Gemini/cache.
    const trans = g[lang] || (lang === 'en' ? g.en : null);
    if (!trans) return null;
    const data = {
      word: low,
      type: 'verb',
      pos: 'verb',
      source: 'separable-gloss',
    };
    if (isEnDef) data.definition_en = trans;
    else data[`translation_${lang}`] = trans;
    if (g.en && lang !== 'en') data.translation_en = g.en;
    if (g.es && lang !== 'es') data.translation_es = g.es;
    if (g.it && lang !== 'it') data.translation_it = g.it;
    return data;
  }

  return Object.freeze({
    resolveForSave,
    resolveSeparableFiniteToInfinitive,
    findSplitSeparables,
    findSplitPairs,
    tokenize,
    isBreakToken,
    rootOfToken,
    localGloss,
    needsAiLemmaFallback,
    SEPARABLE_PREFIXES,
    SEPARABLE_INFINITIVES,
    FINITE_TO_INF,
    SEPARABLE_GLOSS,
  });
})();

if (typeof window !== 'undefined') window.SeparableResolve = SeparableResolve;
if (typeof module !== 'undefined') module.exports = SeparableResolve;
