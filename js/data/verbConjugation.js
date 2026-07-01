/* Present-tense verb conjugations for vocabulary rows (de / es / en). */
const VerbConjugation = (() => {
  const DE_PRESENT = {
    sein: { ich: 'bin', du: 'bist', er: 'ist', wir: 'sind', ihr: 'seid', sie: 'sind' },
    haben: { ich: 'habe', du: 'hast', er: 'hat', wir: 'haben', ihr: 'habt', sie: 'haben' },
    werden: { ich: 'werde', du: 'wirst', er: 'wird', wir: 'werden', ihr: 'werdet', sie: 'werden' },
    gehen: { ich: 'gehe', du: 'gehst', er: 'geht', wir: 'gehen', ihr: 'geht', sie: 'gehen' },
    kommen: { ich: 'komme', du: 'kommst', er: 'kommt', wir: 'kommen', ihr: 'kommt', sie: 'kommen' },
    machen: { ich: 'mache', du: 'machst', er: 'macht', wir: 'machen', ihr: 'macht', sie: 'machen' },
    sagen: { ich: 'sage', du: 'sagst', er: 'sagt', wir: 'sagen', ihr: 'sagt', sie: 'sagen' },
    geben: { ich: 'gebe', du: 'gibst', er: 'gibt', wir: 'geben', ihr: 'gebt', sie: 'geben' },
    nehmen: { ich: 'nehme', du: 'nimmst', er: 'nimmt', wir: 'nehmen', ihr: 'nehmt', sie: 'nehmen' },
    sehen: { ich: 'sehe', du: 'siehst', er: 'sieht', wir: 'sehen', ihr: 'seht', sie: 'sehen' },
    wissen: { ich: 'weiß', du: 'weißt', er: 'weiß', wir: 'wissen', ihr: 'wisst', sie: 'wissen' },
    können: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' },
    müssen: { ich: 'muss', du: 'musst', er: 'muss', wir: 'müssen', ihr: 'müsst', sie: 'müssen' },
    wollen: { ich: 'will', du: 'willst', er: 'will', wir: 'wollen', ihr: 'wollt', sie: 'wollen' },
    dürfen: { ich: 'darf', du: 'darfst', er: 'darf', wir: 'dürfen', ihr: 'dürft', sie: 'dürfen' },
    sollen: { ich: 'soll', du: 'sollst', er: 'soll', wir: 'sollen', ihr: 'sollt', sie: 'sollen' },
    mögen: { ich: 'mag', du: 'magst', er: 'mag', wir: 'mögen', ihr: 'mögt', sie: 'mögen' },
    essen: { ich: 'esse', du: 'isst', er: 'isst', wir: 'essen', ihr: 'esst', sie: 'essen' },
    fahren: { ich: 'fahre', du: 'fährst', er: 'fährt', wir: 'fahren', ihr: 'fahrt', sie: 'fahren' },
    sprechen: { ich: 'spreche', du: 'sprichst', er: 'spricht', wir: 'sprechen', ihr: 'sprecht', sie: 'sprechen' },
    lesen: { ich: 'lese', du: 'liest', er: 'liest', wir: 'lesen', ihr: 'lest', sie: 'lesen' },
    schreiben: { ich: 'schreibe', du: 'schreibst', er: 'schreibt', wir: 'schreiben', ihr: 'schreibt', sie: 'schreiben' },
    arbeiten: { ich: 'arbeite', du: 'arbeitest', er: 'arbeitet', wir: 'arbeiten', ihr: 'arbeitet', sie: 'arbeiten' },
    wohnen: { ich: 'wohne', du: 'wohnst', er: 'wohnt', wir: 'wohnen', ihr: 'wohnt', sie: 'wohnen' },
    kaufen: { ich: 'kaufe', du: 'kaufst', er: 'kauft', wir: 'kaufen', ihr: 'kauft', sie: 'kaufen' },
    nutzen: { ich: 'nutze', du: 'nutzt', er: 'nutzt', wir: 'nutzen', ihr: 'nutzt', sie: 'nutzen' },
    verwenden: { ich: 'verwende', du: 'verwendest', er: 'verwendet', wir: 'verwenden', ihr: 'verwendet', sie: 'verwenden' },
    helfen: { ich: 'helfe', du: 'hilfst', er: 'hilft', wir: 'helfen', ihr: 'helft', sie: 'helfen' },
    finden: { ich: 'finde', du: 'findest', er: 'findet', wir: 'finden', ihr: 'findet', sie: 'finden' },
    denken: { ich: 'denke', du: 'denkst', er: 'denkt', wir: 'denken', ihr: 'denkt', sie: 'denken' },
    bleiben: { ich: 'bleibe', du: 'bleibst', er: 'bleibt', wir: 'bleiben', ihr: 'bleibt', sie: 'bleiben' },
    bringen: { ich: 'bringe', du: 'bringst', er: 'bringt', wir: 'bringen', ihr: 'bringt', sie: 'bringen' },
    trinken: { ich: 'trinke', du: 'trinkst', er: 'trinkt', wir: 'trinken', ihr: 'trinkt', sie: 'trinken' },
  };

  const ES_PRESENT = {
    ser: { yo: 'soy', tú: 'eres', él: 'es', nosotros: 'somos', vosotros: 'sois', ellos: 'son' },
    estar: { yo: 'estoy', tú: 'estás', él: 'está', nosotros: 'estamos', vosotros: 'estáis', ellos: 'están' },
    haber: { yo: 'he', tú: 'has', él: 'ha', nosotros: 'hemos', vosotros: 'habéis', ellos: 'han' },
    tener: { yo: 'tengo', tú: 'tienes', él: 'tiene', nosotros: 'tenemos', vosotros: 'tenéis', ellos: 'tienen' },
    hacer: { yo: 'hago', tú: 'haces', él: 'hace', nosotros: 'hacemos', vosotros: 'hacéis', ellos: 'hacen' },
    ir: { yo: 'voy', tú: 'vas', él: 'va', nosotros: 'vamos', vosotros: 'vais', ellos: 'van' },
    poder: { yo: 'puedo', tú: 'puedes', él: 'puede', nosotros: 'podemos', vosotros: 'podéis', ellos: 'pueden' },
    decir: { yo: 'digo', tú: 'dices', él: 'dice', nosotros: 'decimos', vosotros: 'decís', ellos: 'dicen' },
    ver: { yo: 'veo', tú: 'ves', él: 've', nosotros: 'vemos', vosotros: 'veis', ellos: 'ven' },
    dar: { yo: 'doy', tú: 'das', él: 'da', nosotros: 'damos', vosotros: 'dais', ellos: 'dan' },
    saber: { yo: 'sé', tú: 'sabes', él: 'sabe', nosotros: 'sabemos', vosotros: 'sabéis', ellos: 'saben' },
    querer: { yo: 'quiero', tú: 'quieres', él: 'quiere', nosotros: 'queremos', vosotros: 'queréis', ellos: 'quieren' },
    venir: { yo: 'vengo', tú: 'vienes', él: 'viene', nosotros: 'venimos', vosotros: 'venís', ellos: 'vienen' },
  };

  const EN_PRESENT = {
    be: { I: 'am', you: 'are', he: 'is', we: 'are', you_pl: 'are', they: 'are' },
    have: { I: 'have', you: 'have', he: 'has', we: 'have', you_pl: 'have', they: 'have' },
    do: { I: 'do', you: 'do', he: 'does', we: 'do', you_pl: 'do', they: 'do' },
    go: { I: 'go', you: 'go', he: 'goes', we: 'go', you_pl: 'go', they: 'go' },
    say: { I: 'say', you: 'say', he: 'says', we: 'say', you_pl: 'say', they: 'say' },
    get: { I: 'get', you: 'get', he: 'gets', we: 'get', you_pl: 'get', they: 'get' },
    make: { I: 'make', you: 'make', he: 'makes', we: 'make', you_pl: 'make', they: 'make' },
    know: { I: 'know', you: 'know', he: 'knows', we: 'know', you_pl: 'know', they: 'know' },
    think: { I: 'think', you: 'think', he: 'thinks', we: 'think', you_pl: 'think', they: 'think' },
    take: { I: 'take', you: 'take', he: 'takes', we: 'take', you_pl: 'take', they: 'take' },
    see: { I: 'see', you: 'see', he: 'sees', we: 'see', you_pl: 'see', they: 'see' },
    come: { I: 'come', you: 'come', he: 'comes', we: 'come', you_pl: 'come', they: 'come' },
    want: { I: 'want', you: 'want', he: 'wants', we: 'want', you_pl: 'want', they: 'want' },
    use: { I: 'use', you: 'use', he: 'uses', we: 'use', you_pl: 'use', they: 'use' },
    find: { I: 'find', you: 'find', he: 'finds', we: 'find', you_pl: 'find', they: 'find' },
    give: { I: 'give', you: 'give', he: 'gives', we: 'give', you_pl: 'give', they: 'give' },
    tell: { I: 'tell', you: 'tell', he: 'tells', we: 'tell', you_pl: 'tell', they: 'tell' },
    work: { I: 'work', you: 'work', he: 'works', we: 'work', you_pl: 'work', they: 'work' },
    call: { I: 'call', you: 'call', he: 'calls', we: 'call', you_pl: 'call', they: 'call' },
    try: { I: 'try', you: 'try', he: 'tries', we: 'try', you_pl: 'try', they: 'try' },
    ask: { I: 'ask', you: 'ask', he: 'asks', we: 'ask', you_pl: 'ask', they: 'ask' },
    need: { I: 'need', you: 'need', he: 'needs', we: 'need', you_pl: 'need', they: 'need' },
    feel: { I: 'feel', you: 'feel', he: 'feels', we: 'feel', you_pl: 'feel', they: 'feel' },
    become: { I: 'become', you: 'become', he: 'becomes', we: 'become', you_pl: 'become', they: 'become' },
    leave: { I: 'leave', you: 'leave', he: 'leaves', we: 'leave', you_pl: 'leave', they: 'leave' },
    put: { I: 'put', you: 'put', he: 'puts', we: 'put', you_pl: 'put', they: 'put' },
    mean: { I: 'mean', you: 'mean', he: 'means', we: 'mean', you_pl: 'mean', they: 'mean' },
    keep: { I: 'keep', you: 'keep', he: 'keeps', we: 'keep', you_pl: 'keep', they: 'keep' },
    let: { I: 'let', you: 'let', he: 'lets', we: 'let', you_pl: 'let', they: 'let' },
    begin: { I: 'begin', you: 'begin', he: 'begins', we: 'begin', you_pl: 'begin', they: 'begin' },
    seem: { I: 'seem', you: 'seem', he: 'seems', we: 'seem', you_pl: 'seem', they: 'seem' },
    help: { I: 'help', you: 'help', he: 'helps', we: 'help', you_pl: 'help', they: 'help' },
    talk: { I: 'talk', you: 'talk', he: 'talks', we: 'talk', you_pl: 'talk', they: 'talk' },
    turn: { I: 'turn', you: 'turn', he: 'turns', we: 'turn', you_pl: 'turn', they: 'turn' },
    start: { I: 'start', you: 'start', he: 'starts', we: 'start', you_pl: 'start', they: 'start' },
    show: { I: 'show', you: 'show', he: 'shows', we: 'show', you_pl: 'show', they: 'show' },
    hear: { I: 'hear', you: 'hear', he: 'hears', we: 'hear', you_pl: 'hear', they: 'hear' },
    play: { I: 'play', you: 'play', he: 'plays', we: 'play', you_pl: 'play', they: 'play' },
    run: { I: 'run', you: 'run', he: 'runs', we: 'run', you_pl: 'run', they: 'run' },
    move: { I: 'move', you: 'move', he: 'moves', we: 'move', you_pl: 'move', they: 'move' },
    live: { I: 'live', you: 'live', he: 'lives', we: 'live', you_pl: 'live', they: 'live' },
    believe: { I: 'believe', you: 'believe', he: 'believes', we: 'believe', you_pl: 'believe', they: 'believe' },
    bring: { I: 'bring', you: 'bring', he: 'brings', we: 'bring', you_pl: 'bring', they: 'bring' },
    happen: { I: 'happen', you: 'happen', he: 'happens', we: 'happen', you_pl: 'happen', they: 'happen' },
    write: { I: 'write', you: 'write', he: 'writes', we: 'write', you_pl: 'write', they: 'write' },
    provide: { I: 'provide', you: 'provide', he: 'provides', we: 'provide', you_pl: 'provide', they: 'provide' },
    sit: { I: 'sit', you: 'sit', he: 'sits', we: 'sit', you_pl: 'sit', they: 'sit' },
    stand: { I: 'stand', you: 'stand', he: 'stands', we: 'stand', you_pl: 'stand', they: 'stand' },
    lose: { I: 'lose', you: 'lose', he: 'loses', we: 'lose', you_pl: 'lose', they: 'lose' },
    pay: { I: 'pay', you: 'pay', he: 'pays', we: 'pay', you_pl: 'pay', they: 'pay' },
    meet: { I: 'meet', you: 'meet', he: 'meets', we: 'meet', you_pl: 'meet', they: 'meet' },
    include: { I: 'include', you: 'include', he: 'includes', we: 'include', you_pl: 'include', they: 'include' },
    continue: { I: 'continue', you: 'continue', he: 'continues', we: 'continue', you_pl: 'continue', they: 'continue' },
    set: { I: 'set', you: 'set', he: 'sets', we: 'set', you_pl: 'set', they: 'set' },
    learn: { I: 'learn', you: 'learn', he: 'learns', we: 'learn', you_pl: 'learn', they: 'learn' },
    change: { I: 'change', you: 'change', he: 'changes', we: 'change', you_pl: 'change', they: 'change' },
    lead: { I: 'lead', you: 'lead', he: 'leads', we: 'lead', you_pl: 'lead', they: 'lead' },
    understand: { I: 'understand', you: 'understand', he: 'understands', we: 'understand', you_pl: 'understand', they: 'understand' },
    watch: { I: 'watch', you: 'watch', he: 'watches', we: 'watch', you_pl: 'watch', they: 'watch' },
    follow: { I: 'follow', you: 'follow', he: 'follows', we: 'follow', you_pl: 'follow', they: 'follow' },
    stop: { I: 'stop', you: 'stop', he: 'stops', we: 'stop', you_pl: 'stop', they: 'stop' },
    create: { I: 'create', you: 'create', he: 'creates', we: 'create', you_pl: 'create', they: 'create' },
    speak: { I: 'speak', you: 'speak', he: 'speaks', we: 'speak', you_pl: 'speak', they: 'speak' },
    read: { I: 'read', you: 'read', he: 'reads', we: 'read', you_pl: 'read', they: 'read' },
    spend: { I: 'spend', you: 'spend', he: 'spends', we: 'spend', you_pl: 'spend', they: 'spend' },
    grow: { I: 'grow', you: 'grow', he: 'grows', we: 'grow', you_pl: 'grow', they: 'grow' },
    open: { I: 'open', you: 'open', he: 'opens', we: 'open', you_pl: 'open', they: 'open' },
    walk: { I: 'walk', you: 'walk', he: 'walks', we: 'walk', you_pl: 'walk', they: 'walk' },
    win: { I: 'win', you: 'win', he: 'wins', we: 'win', you_pl: 'win', they: 'win' },
    teach: { I: 'teach', you: 'teach', he: 'teaches', we: 'teach', you_pl: 'teach', they: 'teach' },
    offer: { I: 'offer', you: 'offer', he: 'offers', we: 'offer', you_pl: 'offer', they: 'offer' },
    remember: { I: 'remember', you: 'remember', he: 'remembers', we: 'remember', you_pl: 'remember', they: 'remember' },
    consider: { I: 'consider', you: 'consider', he: 'considers', we: 'consider', you_pl: 'consider', they: 'consider' },
    appear: { I: 'appear', you: 'appear', he: 'appears', we: 'appear', you_pl: 'appear', they: 'appear' },
    buy: { I: 'buy', you: 'buy', he: 'buys', we: 'buy', you_pl: 'buy', they: 'buy' },
    serve: { I: 'serve', you: 'serve', he: 'serves', we: 'serve', you_pl: 'serve', they: 'serve' },
    die: { I: 'die', you: 'die', he: 'dies', we: 'die', you_pl: 'die', they: 'die' },
    send: { I: 'send', you: 'send', he: 'sends', we: 'send', you_pl: 'send', they: 'send' },
    expect: { I: 'expect', you: 'expect', he: 'expects', we: 'expect', you_pl: 'expect', they: 'expect' },
    build: { I: 'build', you: 'build', he: 'builds', we: 'build', you_pl: 'build', they: 'build' },
    stay: { I: 'stay', you: 'stay', he: 'stays', we: 'stay', you_pl: 'stay', they: 'stay' },
    fall: { I: 'fall', you: 'fall', he: 'falls', we: 'fall', you_pl: 'fall', they: 'fall' },
    cut: { I: 'cut', you: 'cut', he: 'cuts', we: 'cut', you_pl: 'cut', they: 'cut' },
    reach: { I: 'reach', you: 'reach', he: 'reaches', we: 'reach', you_pl: 'reach', they: 'reach' },
    kill: { I: 'kill', you: 'kill', he: 'kills', we: 'kill', you_pl: 'kill', they: 'kill' },
    remain: { I: 'remain', you: 'remain', he: 'remains', we: 'remain', you_pl: 'remain', they: 'remain' },
  };

  const PRONOUNS = {
    de: [
      ['ich', 'I'],
      ['du', 'you'],
      ['er/sie/es', 'he/she/it'],
      ['wir', 'we'],
      ['ihr', 'you (pl.)'],
      ['sie/Sie', 'they / you (formal)'],
    ],
    es: [
      ['yo', 'I'],
      ['tú', 'you'],
      ['él/ella', 'he/she'],
      ['nosotros', 'we'],
      ['vosotros', 'you (pl.)'],
      ['ellos', 'they'],
    ],
    en: [
      ['I', 'I'],
      ['you', 'you'],
      ['he/she/it', 'he/she/it'],
      ['we', 'we'],
      ['you', 'you (pl.)'],
      ['they', 'they'],
    ],
  };

  function normLang(lang) {
    const l = String(lang || 'de').toLowerCase();
    if (l === 'de' || l.startsWith('de')) return 'de';
    if (l === 'es' || l.startsWith('es')) return 'es';
    return 'en';
  }

  function normWord(w) {
    return String(w || '').trim().normalize('NFC').toLowerCase();
  }

  function isDeInfinitive(low) {
    return /(?:en|eln|ern)$/i.test(low) && low.length > 4;
  }

  function toLemma(word, lang) {
    const raw = String(word || '').trim();
    if (!raw) return '';
    const lg = normLang(lang);
    const low = normWord(raw);

    if (lg === 'de' && isDeInfinitive(low)) {
      if (DE_PRESENT[low] || presentRegularDe(low)) return low;
    }

    if (typeof Lemmatizer !== 'undefined' && Lemmatizer.normalizeLemma) {
      const stem = Lemmatizer.normalizeLemma(raw, lg);
      if (lg === 'de' && stem && !isDeInfinitive(stem)) {
        for (const inf of [`${stem}en`, `${stem}n`, `${stem}eln`, `${stem}ern`]) {
          if (DE_PRESENT[inf] || presentRegularDe(inf)) return inf;
        }
      }
      if (stem) return stem;
    }

    if (lg === 'de' && isDeInfinitive(low)) return low;
    if (lg === 'es' && /(ar|er|ir)$/.test(low)) return low;
    return low;
  }

  function presentRegularDe(inf) {
    const low = String(inf || '').toLowerCase();
    if (!low.endsWith('en') && !low.endsWith('n')) return null;
    const stem = low.endsWith('en') ? low.slice(0, -2) : low.slice(0, -1);
    if (!stem || stem.length < 2) return null;
    const endsE = stem.endsWith('e') || stem.endsWith('d') || stem.endsWith('t');
    const ich = endsE && low.endsWith('en') ? stem + 'e' : stem + 'e';
    const du = stem + 'st';
    const er = stem + 't';
    return { ich, du, er, wir: low, ihr: stem + 't', sie: low };
  }

  function presentRegularEs(inf) {
    const low = String(inf || '').toLowerCase();
    let stem = low;
    let ending = '';
    if (low.endsWith('ar')) {
      stem = low.slice(0, -2);
      ending = 'ar';
    } else if (low.endsWith('er') || low.endsWith('ir')) {
      stem = low.slice(0, -2);
      ending = low.slice(-2);
    } else return null;
    if (!stem) return null;
    const yo = stem + (ending === 'ar' ? 'o' : ending === 'er' ? 'o' : 'o');
    const tú = stem + (ending === 'ar' ? 'as' : 'es');
    const él = stem + (ending === 'ar' ? 'a' : 'e');
    const nos = stem + (ending === 'ar' ? 'amos' : ending === 'er' ? 'emos' : 'imos');
    const vos = stem + (ending === 'ar' ? 'áis' : ending === 'er' ? 'éis' : 'ís');
    const ellos = stem + (ending === 'ar' ? 'an' : 'en');
    return { yo, 'tú': tú, él, nosotros: nos, vosotros: vos, ellos };
  }

  function presentRegularEn(inf) {
    const low = String(inf || '').toLowerCase();
    if (!low || low.length < 2) return null;
    const es = /(s|x|z|ch|sh)$/.test(low) || /[^aeiou]y$/.test(low);
    const ies = /[^aeiou]y$/.test(low);
    const he = ies ? low.slice(0, -1) + 'ies' : es ? low + 'es' : low + 's';
    return { I: low, you: low, he, we: low, you_pl: low, they: low };
  }

  function getPresent(word, lang) {
    const lg = normLang(lang);
    const lemma = toLemma(word, lg);
    if (!lemma) return null;
    let table = null;
    if (lg === 'de') table = DE_PRESENT[lemma] || presentRegularDe(lemma);
    else if (lg === 'es') table = ES_PRESENT[lemma] || presentRegularEs(lemma);
    else table = EN_PRESENT[lemma] || presentRegularEn(lemma);
    if (!table) return null;
    return { lemma, tense: 'present', forms: table, lang: lg };
  }

  function enrichFlashcard(fc, lang) {
    if (!fc) return fc;
    const lg = normLang(lang || fc.sourceLang);
    const pos = typeof normWordType === 'function' ? normWordType(fc.type || fc.pos) : '';
    if (pos !== 'verb') return fc;
    const conj = getPresent(fc.word, lg);
    if (!conj) return fc;
    fc.verbLemma = conj.lemma;
    fc.conjugation = { present: conj.forms };
    return fc;
  }

  function pronounRows(lang) {
    return PRONOUNS[normLang(lang)] || PRONOUNS.de;
  }

  function conjugationSelectHtml(fc, goal, id) {
    const lg = normLang(goal?.subject || fc.sourceLang);
    const conj = getPresent(fc.word, lg);
    if (!conj) return '';
    const rows = pronounRows(lg);
    const opts = rows
      .map(([pron, lbl]) => {
        const key = pron.includes('/') ? pron.split('/')[0] : pron;
        const form = conj.forms[pron] || conj.forms[key] || '';
        if (!form) return '';
        const label = `${pron}: ${form}`;
        return `<option value="${typeof esc === 'function' ? esc(key) : key}">${typeof esc === 'function' ? esc(label) : label}</option>`;
      })
      .filter(Boolean)
      .join('');
    if (!opts) return '';
    const wordEsc = typeof esc === 'function' ? esc(fc.word) : fc.word;
    return (
      `<details class="vv-conj-details" onclick="event.stopPropagation()">` +
      `<summary class="vv-conj-summary">▾ Conjugations</summary>` +
      `<select class="vv-conj-select" aria-label="Conjugations for ${wordEsc}" ` +
      `onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">` +
      `<option value="">Present tense…</option>${opts}</select></details>`
    );
  }

  return {
    toLemma,
    getPresent,
    enrichFlashcard,
    conjugationSelectHtml,
    pronounRows,
  };
})();

if (typeof window !== 'undefined') window.VerbConjugation = VerbConjugation;
if (typeof module !== 'undefined') module.exports = VerbConjugation;
