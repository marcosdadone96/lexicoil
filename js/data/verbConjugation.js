/* Verb conjugations for vocabulary rows (de / es / en). DE: Present, Präteritum, Perfekt, Imperativ. */
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
    // Roots used under separable prefixes (vorschlagen → schlagen + vor)
    schlagen: { ich: 'schlage', du: 'schlägst', er: 'schlägt', wir: 'schlagen', ihr: 'schlagt', sie: 'schlagen' },
    rufen: { ich: 'rufe', du: 'rufst', er: 'ruft', wir: 'rufen', ihr: 'ruft', sie: 'rufen' },
    bieten: { ich: 'biete', du: 'bietest', er: 'bietet', wir: 'bieten', ihr: 'bietet', sie: 'bieten' },
    stehen: { ich: 'stehe', du: 'stehst', er: 'steht', wir: 'stehen', ihr: 'steht', sie: 'stehen' },
    // Mixed verbs: weak present, strong Präteritum/Partizip (DWDS-verified)
    brennen: { ich: 'brenne', du: 'brennst', er: 'brennt', wir: 'brennen', ihr: 'brennt', sie: 'brennen' },
    kennen: { ich: 'kenne', du: 'kennst', er: 'kennt', wir: 'kennen', ihr: 'kennt', sie: 'kennen' },
    nennen: { ich: 'nenne', du: 'nennst', er: 'nennt', wir: 'nennen', ihr: 'nennt', sie: 'nennen' },
    rennen: { ich: 'renne', du: 'rennst', er: 'rennt', wir: 'rennen', ihr: 'rennt', sie: 'rennen' },
    senden: { ich: 'sende', du: 'sendest', er: 'sendet', wir: 'senden', ihr: 'sendet', sie: 'senden' },
    wenden: { ich: 'wende', du: 'wendest', er: 'wendet', wir: 'wenden', ihr: 'wendet', sie: 'wenden' },
    erkennen: { ich: 'erkenne', du: 'erkennst', er: 'erkennt', wir: 'erkennen', ihr: 'erkennt', sie: 'erkennen' },
    treffen: { ich: 'treffe', du: 'triffst', er: 'trifft', wir: 'treffen', ihr: 'trefft', sie: 'treffen' },
  };

  /** Präteritum for irregular/modal verbs (same keys as DE_PRESENT). DWDS-verified roots. */
  const DE_PRAETERITUM = {
    sein: { ich: 'war', du: 'warst', er: 'war', wir: 'waren', ihr: 'wart', sie: 'waren' },
    haben: { ich: 'hatte', du: 'hattest', er: 'hatte', wir: 'hatten', ihr: 'hattet', sie: 'hatten' },
    werden: { ich: 'wurde', du: 'wurdest', er: 'wurde', wir: 'wurden', ihr: 'wurdet', sie: 'wurden' },
    gehen: { ich: 'ging', du: 'gingst', er: 'ging', wir: 'gingen', ihr: 'gingt', sie: 'gingen' },
    kommen: { ich: 'kam', du: 'kamst', er: 'kam', wir: 'kamen', ihr: 'kamt', sie: 'kamen' },
    machen: { ich: 'machte', du: 'machtest', er: 'machte', wir: 'machten', ihr: 'machtet', sie: 'machten' },
    sagen: { ich: 'sagte', du: 'sagtest', er: 'sagte', wir: 'sagten', ihr: 'sagtet', sie: 'sagten' },
    geben: { ich: 'gab', du: 'gabst', er: 'gab', wir: 'gaben', ihr: 'gabt', sie: 'gaben' },
    nehmen: { ich: 'nahm', du: 'nahmst', er: 'nahm', wir: 'nahmen', ihr: 'nahmt', sie: 'nahmen' },
    sehen: { ich: 'sah', du: 'sahst', er: 'sah', wir: 'sahen', ihr: 'saht', sie: 'sahen' },
    wissen: { ich: 'wusste', du: 'wusstest', er: 'wusste', wir: 'wussten', ihr: 'wusstet', sie: 'wussten' },
    können: { ich: 'konnte', du: 'konntest', er: 'konnte', wir: 'konnten', ihr: 'konntet', sie: 'konnten' },
    müssen: { ich: 'musste', du: 'musstest', er: 'musste', wir: 'mussten', ihr: 'musstet', sie: 'mussten' },
    wollen: { ich: 'wollte', du: 'wolltest', er: 'wollte', wir: 'wollten', ihr: 'wolltet', sie: 'wollten' },
    dürfen: { ich: 'durfte', du: 'durftest', er: 'durfte', wir: 'durften', ihr: 'durftet', sie: 'durften' },
    sollen: { ich: 'sollte', du: 'solltest', er: 'sollte', wir: 'sollten', ihr: 'solltet', sie: 'sollten' },
    mögen: { ich: 'mochte', du: 'mochtest', er: 'mochte', wir: 'mochten', ihr: 'mochtet', sie: 'mochten' },
    essen: { ich: 'aß', du: 'aßest', er: 'aß', wir: 'aßen', ihr: 'aßt', sie: 'aßen' },
    fahren: { ich: 'fuhr', du: 'fuhrst', er: 'fuhr', wir: 'fuhren', ihr: 'fuhrt', sie: 'fuhren' },
    sprechen: { ich: 'sprach', du: 'sprachst', er: 'sprach', wir: 'sprachen', ihr: 'spracht', sie: 'sprachen' },
    lesen: { ich: 'las', du: 'last', er: 'las', wir: 'lasen', ihr: 'last', sie: 'lasen' },
    schreiben: { ich: 'schrieb', du: 'schriebst', er: 'schrieb', wir: 'schrieben', ihr: 'schriebt', sie: 'schrieben' },
    arbeiten: { ich: 'arbeitete', du: 'arbeitetest', er: 'arbeitete', wir: 'arbeiteten', ihr: 'arbeitetet', sie: 'arbeiteten' },
    wohnen: { ich: 'wohnte', du: 'wohntest', er: 'wohnte', wir: 'wohnten', ihr: 'wohntet', sie: 'wohnten' },
    kaufen: { ich: 'kaufte', du: 'kauftest', er: 'kaufte', wir: 'kauften', ihr: 'kauftet', sie: 'kauften' },
    nutzen: { ich: 'nutzte', du: 'nutztest', er: 'nutzte', wir: 'nutzten', ihr: 'nutztet', sie: 'nutzten' },
    verwenden: { ich: 'verwendete', du: 'verwendetest', er: 'verwendete', wir: 'verwendeten', ihr: 'verwendetet', sie: 'verwendeten' },
    helfen: { ich: 'half', du: 'halfst', er: 'half', wir: 'halfen', ihr: 'halft', sie: 'halfen' },
    finden: { ich: 'fand', du: 'fandest', er: 'fand', wir: 'fanden', ihr: 'fandet', sie: 'fanden' },
    denken: { ich: 'dachte', du: 'dachtest', er: 'dachte', wir: 'dachten', ihr: 'dachtet', sie: 'dachten' },
    bleiben: { ich: 'blieb', du: 'bliebst', er: 'blieb', wir: 'blieben', ihr: 'bliebt', sie: 'blieben' },
    bringen: { ich: 'brachte', du: 'brachtest', er: 'brachte', wir: 'brachten', ihr: 'brachtet', sie: 'brachten' },
    trinken: { ich: 'trank', du: 'trankst', er: 'trank', wir: 'tranken', ihr: 'trankt', sie: 'tranken' },
    schlagen: { ich: 'schlug', du: 'schlugst', er: 'schlug', wir: 'schlugen', ihr: 'schlugt', sie: 'schlugen' },
    rufen: { ich: 'rief', du: 'riefst', er: 'rief', wir: 'riefen', ihr: 'rieft', sie: 'riefen' },
    bieten: { ich: 'bot', du: 'botest', er: 'bot', wir: 'boten', ihr: 'botet', sie: 'boten' },
    stehen: { ich: 'stand', du: 'standest', er: 'stand', wir: 'standen', ihr: 'standet', sie: 'standen' },
    brennen: { ich: 'brannte', du: 'branntest', er: 'brannte', wir: 'brannten', ihr: 'branntet', sie: 'brannten' },
    kennen: { ich: 'kannte', du: 'kanntest', er: 'kannte', wir: 'kannten', ihr: 'kanntet', sie: 'kannten' },
    nennen: { ich: 'nannte', du: 'nanntest', er: 'nannte', wir: 'nannten', ihr: 'nanntet', sie: 'nannten' },
    rennen: { ich: 'rannte', du: 'ranntest', er: 'rannte', wir: 'rannten', ihr: 'ranntet', sie: 'rannten' },
    senden: { ich: 'sandte', du: 'sandtest', er: 'sandte', wir: 'sandten', ihr: 'sandtet', sie: 'sandten' },
    wenden: { ich: 'wandte', du: 'wandtest', er: 'wandte', wir: 'wandten', ihr: 'wandtet', sie: 'wandten' },
    erkennen: { ich: 'erkannte', du: 'erkanntest', er: 'erkannte', wir: 'erkannten', ihr: 'erkanntet', sie: 'erkannten' },
    treffen: { ich: 'traf', du: 'trafst', er: 'traf', wir: 'trafen', ihr: 'traft', sie: 'trafen' },
  };

  /** Partizip II for irregular roots (ge- prefix; separables interleave prefix before ge-). */
  const DE_PARTIZIP = {
    sein: 'gewesen',
    haben: 'gehabt',
    werden: 'geworden',
    gehen: 'gegangen',
    kommen: 'gekommen',
    machen: 'gemacht',
    sagen: 'gesagt',
    geben: 'gegeben',
    nehmen: 'genommen',
    sehen: 'gesehen',
    wissen: 'gewusst',
    können: 'gekonnt',
    müssen: 'gemusst',
    wollen: 'gewollt',
    dürfen: 'gedurft',
    sollen: 'gesollt',
    mögen: 'gemocht',
    essen: 'gegessen',
    fahren: 'gefahren',
    sprechen: 'gesprochen',
    lesen: 'gelesen',
    schreiben: 'geschrieben',
    arbeiten: 'gearbeitet',
    wohnen: 'gewohnt',
    kaufen: 'gekauft',
    nutzen: 'genutzt',
    verwenden: 'verwendet',
    helfen: 'geholfen',
    finden: 'gefunden',
    denken: 'gedacht',
    bleiben: 'geblieben',
    bringen: 'gebracht',
    trinken: 'getrunken',
    schlagen: 'geschlagen',
    rufen: 'gerufen',
    bieten: 'geboten',
    stehen: 'gestanden',
    brennen: 'gebrannt',
    kennen: 'gekannt',
    nennen: 'genannt',
    rennen: 'gerannt',
    senden: 'gesandt',
    wenden: 'gewandt',
    erkennen: 'erkannt',
    treffen: 'getroffen',
  };

  /** Perfekt auxiliary per lemma/root (default haben). */
  const DE_PERFECT_AUX = {
    sein: 'sein',
    werden: 'sein',
    bleiben: 'sein',
    gehen: 'sein',
    kommen: 'sein',
    fahren: 'sein',
    laufen: 'sein',
    reisen: 'sein',
    fliegen: 'sein',
    sterben: 'sein',
    geschehen: 'sein',
    rennen: 'sein',
  };

  /** Imperativ du / ihr / Sie for irregular roots. */
  const DE_IMPERATIVE = {
    sein: { du: 'sei', ihr: 'seid', Sie: 'seien Sie' },
    haben: { du: 'hab', ihr: 'habt', Sie: 'haben Sie' },
    werden: { du: 'werde', ihr: 'werdet', Sie: 'werden Sie' },
    gehen: { du: 'geh', ihr: 'geht', Sie: 'gehen Sie' },
    kommen: { du: 'komm', ihr: 'kommt', Sie: 'kommen Sie' },
    machen: { du: 'mach', ihr: 'macht', Sie: 'machen Sie' },
    sagen: { du: 'sag', ihr: 'sagt', Sie: 'sagen Sie' },
    geben: { du: 'gib', ihr: 'gebt', Sie: 'geben Sie' },
    nehmen: { du: 'nimm', ihr: 'nehmt', Sie: 'nehmen Sie' },
    sehen: { du: 'sieh', ihr: 'seht', Sie: 'sehen Sie' },
    essen: { du: 'iss', ihr: 'esst', Sie: 'essen Sie' },
    fahren: { du: 'fahr', ihr: 'fahrt', Sie: 'fahren Sie' },
    sprechen: { du: 'sprich', ihr: 'sprecht', Sie: 'sprechen Sie' },
    lesen: { du: 'lies', ihr: 'lest', Sie: 'lesen Sie' },
    schreiben: { du: 'schreib', ihr: 'schreibt', Sie: 'schreiben Sie' },
    helfen: { du: 'hilf', ihr: 'helft', Sie: 'helfen Sie' },
    finden: { du: 'find', ihr: 'findet', Sie: 'finden Sie' },
    bringen: { du: 'bring', ihr: 'bringt', Sie: 'bringen Sie' },
    trinken: { du: 'trink', ihr: 'trinkt', Sie: 'trinken Sie' },
    schlagen: { du: 'schlag', ihr: 'schlagt', Sie: 'schlagen Sie' },
    rufen: { du: 'ruf', ihr: 'ruft', Sie: 'rufen Sie' },
    bieten: { du: 'biete', ihr: 'bietet', Sie: 'bieten Sie' },
    stehen: { du: 'steh', ihr: 'steht', Sie: 'stehen Sie' },
    bleiben: { du: 'bleib', ihr: 'bleibt', Sie: 'bleiben Sie' },
    denken: { du: 'denk', ihr: 'denkt', Sie: 'denken Sie' },
    arbeiten: { du: 'arbeit', ihr: 'arbeitet', Sie: 'arbeiten Sie' },
    wohnen: { du: 'wohn', ihr: 'wohnt', Sie: 'wohnen Sie' },
    kaufen: { du: 'kauf', ihr: 'kauft', Sie: 'kaufen Sie' },
    nutzen: { du: 'nutz', ihr: 'nutzt', Sie: 'nutzen Sie' },
    verwenden: { du: 'verwende', ihr: 'verwendet', Sie: 'verwenden Sie' },
    brennen: { du: 'brenn', ihr: 'brennt', Sie: 'brennen Sie' },
    kennen: { du: 'kenn', ihr: 'kennt', Sie: 'kennen Sie' },
    nennen: { du: 'nenn', ihr: 'nennt', Sie: 'nennen Sie' },
    rennen: { du: 'renn', ihr: 'rennt', Sie: 'rennen Sie' },
    senden: { du: 'sende', ihr: 'sendet', Sie: 'senden Sie' },
    wenden: { du: 'wende', ihr: 'wendet', Sie: 'wenden Sie' },
    erkennen: { du: 'erkenn', ihr: 'erkennt', Sie: 'erkennen Sie' },
    treffen: { du: 'triff', ihr: 'trefft', Sie: 'treffen Sie' },
  };

  /**
   * Fused compound verbs (not separable prefix + root). DWDS: lernt kennen → kennengelernt.
   */
  const DE_COMPOUND = {
    kennenlernen: {
      present: {
        ich: 'lerne kennen', du: 'lernst kennen', er: 'lernt kennen',
        wir: 'lernen kennen', ihr: 'lernt kennen', sie: 'lernen kennen',
      },
      praeteritum: {
        ich: 'lernte kennen', du: 'lerntest kennen', er: 'lernte kennen',
        wir: 'lernten kennen', ihr: 'lerntet kennen', sie: 'lernten kennen',
      },
      partizip: 'kennengelernt',
      imperativ: { du: 'lerne kennen', ihr: 'lernt kennen', Sie: 'lernen Sie kennen' },
    },
  };

  const DE_TENSES = ['present', 'praeteritum', 'perfekt', 'imperativ'];

  const DE_TENSE_LABELS = {
    present: 'Present',
    praeteritum: 'Präteritum',
    perfekt: 'Perfekt',
    imperativ: 'Imperativ',
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

  const IMPERATIVE_PRONOUNS = {
    de: [
      ['du', 'you'],
      ['ihr', 'you (pl.)'],
      ['Sie', 'you (formal)'],
    ],
  };

  function deStem(inf) {
    const low = String(inf || '').toLowerCase();
    if (low.endsWith('en')) return low.slice(0, -2);
    if (low.endsWith('n')) return low.slice(0, -1);
    return low;
  }

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

  /**
   * Lemma source of truth: ALWAYS call Lemmatizer.normalizeLemma first.
   * No early return that skips Lemmatizer. After the call, prefer a conjugable
   * DE infinitive (DE_PRESENT / separable allowlist) when Lemmatizer over-strips
   * short forms (sein→sei) or when re-attaching -en to a finite stem.
   */
  function toLemma(word, lang) {
    const raw = String(word || '').trim();
    if (!raw) return '';
    const lg = normLang(lang);
    const low = normWord(raw);

    if (typeof Lemmatizer === 'undefined' || !Lemmatizer.normalizeLemma) {
      if (lg === 'de' && isDeInfinitive(low)) return low;
      if (lg === 'es' && /(ar|er|ir)$/.test(low)) return low;
      return low;
    }

    if (lg === 'de') {
      // Known conjugable infinitive as typed (preserves sein, trinken, vorschlagen)
      if (DE_PRESENT[low] || splitSeparableInfinitive(low)) return low;
      // Finite with glued prefix: abnimmt → abnehmen (before naive -t→-en yields abnimmen)
      if (typeof SeparableResolve !== 'undefined' && SeparableResolve.resolveSeparableFiniteToInfinitive) {
        const sepFin = SeparableResolve.resolveSeparableFiniteToInfinitive(low);
        if (sepFin) return sepFin;
      }
    }

    const stem = Lemmatizer.normalizeLemma(raw, lg);

    if (lg === 'de') {
      if (stem && (DE_PRESENT[stem] || splitSeparableInfinitive(stem))) return stem;
      if (typeof SeparableResolve !== 'undefined' && SeparableResolve.resolveSeparableFiniteToInfinitive) {
        const sepStem = SeparableResolve.resolveSeparableFiniteToInfinitive(stem);
        if (sepStem) return sepStem;
      }
      if (stem && !isDeInfinitive(stem)) {
        for (const inf of [`${stem}en`, `${stem}n`, `${stem}eln`, `${stem}ern`]) {
          if (DE_PRESENT[inf] || splitSeparableInfinitive(inf) || presentRegularDe(inf)) {
            return inf;
          }
        }
      }
      if (stem) return stem;
      if (isDeInfinitive(low)) return low;
      return low;
    }

    if (lg === 'es' && stem) return stem;
    return stem || low;
  }

  /**
   * Split allowlisted separable infinitive → { prefix, root }.
   * Reuses SeparableResolve.SEPARABLE_INFINITIVES + SEPARABLE_PREFIXES (longest prefix).
   */
  function splitSeparableInfinitive(inf) {
    const low = normWord(inf);
    if (!low || typeof SeparableResolve === 'undefined') return null;
    const allow = SeparableResolve.SEPARABLE_INFINITIVES;
    const prefixes = SeparableResolve.SEPARABLE_PREFIXES;
    if (!allow || !allow.has(low) || !prefixes || !prefixes.length) return null;
    const sorted = [...prefixes].sort((a, b) => b.length - a.length);
    for (const p of sorted) {
      if (!low.startsWith(p) || low.length <= p.length + 2) continue;
      const root = low.slice(p.length);
      if (/(?:en|eln|ern)$/i.test(root) && root.length >= 4) {
        return { prefix: p, root };
      }
    }
    return null;
  }

  /** Attach separable particle after each finite form: "schlage" + "vor" → "schlage vor". */
  function attachSeparablePrefix(forms, prefix) {
    const out = {};
    for (const [k, v] of Object.entries(forms || {})) {
      out[k] = `${v} ${prefix}`;
    }
    return out;
  }

  /** Imperativ separable: prefix at clause end — "Ruf mich an!" not "Anruf mich!". */
  function attachSeparableImperative(forms, prefix) {
    const excl = (s) => (String(s || '').endsWith('!') ? s : `${s}!`);
    return {
      du: excl(`${forms.du} ${prefix}`),
      ihr: excl(`${forms.ihr} ${prefix}`),
      Sie: excl(`${forms.Sie} ${prefix}`),
    };
  }

  /**
   * German weak-verb epenthetic -e- before -t/-et (Partizip II) or imperative -e.
   * -et: stems ending in -d/-t; clusters -chn/-ffn/-gn/-dn/-tm/-dm; atmen-style -m (not -mm).
   * NOT: vowel + n (planen→geplant, wohnen→gewohnt, lernen→gelernt).
   */
  function deStemNeedsEpentheticE(stem, mode) {
    const s = String(stem || '').toLowerCase();
    if (!s || s.length < 2) return false;
    if (mode === 'partizip') {
      if (/[dt]$/.test(s)) return true;
      if (/(?:chn|ffn|gn|dn|tm|dm)$/i.test(s)) return true;
      if (/[^aeiouäöü]m$/i.test(s) && !/mm$/i.test(s)) return true;
      return false;
    }
    if (mode === 'imperativ') {
      if (/[dt]$/.test(s)) return true;
      if (/(?:chn|ffn|gn)$/i.test(s)) return true;
      return false;
    }
    return false;
  }

  function praeteritumRegularDe(inf) {
    const low = String(inf || '').toLowerCase();
    const stem = deStem(low);
    if (!stem || stem.length < 2) return null;
    return {
      ich: stem + 'te',
      du: stem + 'test',
      er: stem + 'te',
      wir: stem + 'ten',
      ihr: stem + 'tet',
      sie: stem + 'ten',
    };
  }

  function partizipRegularDe(root) {
    const stem = deStem(root);
    if (!stem || stem.length < 2) return null;
    const suffix = deStemNeedsEpentheticE(stem, 'partizip') ? 'et' : 't';
    return 'ge' + stem + suffix;
  }

  function partizipIiDe(root) {
    return DE_PARTIZIP[root] || partizipRegularDe(root);
  }

  function buildPartizip(lemma, separable) {
    const root = separable ? separable.root : lemma;
    const base = partizipIiDe(root);
    if (!base) return null;
    if (separable) return separable.prefix + base;
    return base;
  }

  function resolvePerfektAux(lemma, root) {
    if (DE_PERFECT_AUX[lemma]) return DE_PERFECT_AUX[lemma];
    if (DE_PERFECT_AUX[root]) return DE_PERFECT_AUX[root];
    return 'haben';
  }

  function imperativeRegularDe(inf) {
    const low = String(inf || '').toLowerCase();
    const stem = deStem(low);
    if (!stem || stem.length < 2) return null;
    const du = deStemNeedsEpentheticE(stem, 'imperativ') ? stem + 'e' : stem;
    return { du, ihr: stem + 't', Sie: `${low} Sie` };
  }

  function conjugateDeCompound(lemma, tense) {
    const entry = DE_COMPOUND[lemma];
    if (!entry) return null;
    if (tense === 'present') return { lemma, tense, forms: entry.present, lang: 'de', compound: true };
    if (tense === 'praeteritum') return { lemma, tense, forms: entry.praeteritum, lang: 'de', compound: true };
    if (tense === 'imperativ') return { lemma, tense, forms: entry.imperativ, lang: 'de', compound: true };
    if (tense === 'perfekt') {
      const part = entry.partizip;
      const auxTable = DE_PRESENT.haben;
      if (!part || !auxTable) return null;
      const table = {};
      for (const [k, v] of Object.entries(auxTable)) table[k] = `${v} ${part}`;
      return { lemma, tense, forms: table, partizip: part, lang: 'de', compound: true };
    }
    return null;
  }

  function conjugateDeLemma(lemma, tense) {
    const compound = conjugateDeCompound(lemma, tense);
    if (compound) return compound;
    const separable = splitSeparableInfinitive(lemma);
    const root = separable ? separable.root : lemma;
    let table = null;
    if (tense === 'present') {
      table = DE_PRESENT[root] || presentRegularDe(root);
      if (table && separable) table = attachSeparablePrefix(table, separable.prefix);
    } else if (tense === 'praeteritum') {
      table = DE_PRAETERITUM[root] || praeteritumRegularDe(root);
      if (table && separable) table = attachSeparablePrefix(table, separable.prefix);
    } else if (tense === 'perfekt') {
      const part = buildPartizip(lemma, separable);
      if (!part) return null;
      const aux = resolvePerfektAux(lemma, root);
      const auxTable = DE_PRESENT[aux];
      if (!auxTable) return null;
      table = {};
      for (const [k, v] of Object.entries(auxTable)) table[k] = `${v} ${part}`;
    } else if (tense === 'imperativ') {
      table = DE_IMPERATIVE[root] || imperativeRegularDe(root);
      if (table && separable) table = attachSeparableImperative(table, separable.prefix);
    }
    if (!table) return null;
    const out = { lemma, tense, forms: table, lang: 'de' };
    if (separable) {
      out.separable = true;
      out.prefix = separable.prefix;
      out.root = separable.root;
    }
    if (tense === 'perfekt') out.partizip = buildPartizip(lemma, separable);
    return out;
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
    if (lg === 'de') return conjugateDeLemma(lemma, 'present');
    let table = null;
    if (lg === 'es') table = ES_PRESENT[lemma] || presentRegularEs(lemma);
    else table = EN_PRESENT[lemma] || presentRegularEn(lemma);
    if (!table) return null;
    return { lemma, tense: 'present', forms: table, lang: lg };
  }

  function getPraeteritum(word, lang) {
    const lg = normLang(lang);
    if (lg !== 'de') return null;
    const lemma = toLemma(word, lg);
    if (!lemma) return null;
    return conjugateDeLemma(lemma, 'praeteritum');
  }

  function getPerfekt(word, lang) {
    const lg = normLang(lang);
    if (lg !== 'de') return null;
    const lemma = toLemma(word, lg);
    if (!lemma) return null;
    return conjugateDeLemma(lemma, 'perfekt');
  }

  function getImperativ(word, lang) {
    const lg = normLang(lang);
    if (lg !== 'de') return null;
    const lemma = toLemma(word, lg);
    if (!lemma) return null;
    return conjugateDeLemma(lemma, 'imperativ');
  }

  function getConjugation(word, lang, tense) {
    const t = tense || 'present';
    if (t === 'present') return getPresent(word, lang);
    if (t === 'praeteritum') return getPraeteritum(word, lang);
    if (t === 'perfekt') return getPerfekt(word, lang);
    if (t === 'imperativ') return getImperativ(word, lang);
    return null;
  }

  function enrichFlashcard(fc, lang) {
    if (!fc) return fc;
    const lg = normLang(lang || fc.sourceLang);
    const pos = typeof normWordType === 'function' ? normWordType(fc.type || fc.pos) : '';
    if (pos !== 'verb') return fc;
    const conj = getPresent(fc.word, lg);
    if (!conj) return fc;
    enrichVerbConjugation(fc, lg);
    canonicalizeForDeck(fc, lg);
    return fc;
  }

  function enrichVerbConjugation(fc, lang) {
    if (!fc) return fc;
    const lg = normLang(lang || fc.sourceLang);
    const conj = getPresent(fc.word, lg);
    if (!conj) return fc;
    fc.verbLemma = conj.lemma;
    fc.conjugation = { present: conj.forms };
    if (lg === 'de') {
      const pr = getPraeteritum(fc.word, lg);
      const pf = getPerfekt(fc.word, lg);
      const imp = getImperativ(fc.word, lg);
      if (pr?.forms) fc.conjugation.praeteritum = pr.forms;
      if (pf?.forms) fc.conjugation.perfekt = pf.forms;
      if (imp?.forms) fc.conjugation.imperativ = imp.forms;
    }
    return fc;
  }

  function looksLikeDeAdjectiveForm(low) {
    return /(liche|licher|liches|lichem|lichen|lich|ig|isch|bar|sam|haft|los|voll|frei|bare|bere|bares|barer|erer|eres|ere|iger|ige|iges|igem|igen|isches|ischen|ischem|ischer|ische)$/i.test(
      low,
    );
  }

  function isLikelyInflectedAdjective(low) {
    if (looksLikeDeAdjectiveForm(low)) return true;
    if (typeof SeparableResolve !== 'undefined' && SeparableResolve.FINITE_TO_INF?.[low]) return false;
    if (DE_PRESENT[low]) return false;
    if (/[^aeiouäöü]er$/i.test(low) && low.length > 6) return true;
    if (/[^aeiouäöü](es|em|en)$/i.test(low) && low.length > 6 && !isDeInfinitive(low)) return true;
    return false;
  }

  /** Skip P0/P1 when capitalized surface is likely a mis-tagged noun (§2b noise). */
  function looksLikeMisclassifiedNoun(raw, low) {
    if (!/^[A-ZÄÖÜ]/.test(raw)) return false;
    if (DE_PRESENT[low] || splitSeparableInfinitive(low)) return false;
    if (
      /(gruppen|firmen|unternehmen|geschichten|altersgruppen|energieunternehmen|fantasiegeschichten|experten|mahlzeiten|hauptfilmen|experten|dienste|keiten|heiten|ungen|chaften|tionen|sionen)$/i.test(
        low,
      )
    ) {
      return true;
    }
    if (/(ung|heit|keit|schaft|tion|sion|tät|ität|ismus|ment|nis)$/i.test(low) && !isDeInfinitive(low)) {
      return true;
    }
    return false;
  }

  /** P0+P1 migration eligibility (high confidence only). */
  function migrationEligible(fc, lang) {
    const lg = normLang(lang || fc.sourceLang);
    if (lg !== 'de') return null;
    const stored = typeof normWordType === 'function' ? normWordType(fc.type || fc.pos) : '';
    if (stored !== 'verb') return null;
    const word = String(fc.word || '').trim();
    if (!word) return null;
    const low = normWord(word);
    if (isLikelyInflectedAdjective(low) || looksLikeMisclassifiedNoun(word, low)) return null;

    const conj = getPresent(word, lg);
    if (!conj?.lemma) return null;
    const lemma = conj.lemma.toLowerCase();
    if (!isDeInfinitive(lemma)) return null;

    const verbLemma = fc.verbLemma ? String(fc.verbLemma).toLowerCase() : null;
    if (!verbLemma || verbLemma !== lemma) return null;

    // P0: finite / wrong surface, verbLemma already correct
    if (low !== lemma) return { target: lemma, reason: 'p0' };
    // P1: capitalized infinitive
    if (word !== lemma) return { target: lemma, reason: 'p1' };
    return null;
  }

  /** Normalize deck word to lowercase infinitive; preserve clicked surface when renamed. */
  function canonicalizeForDeck(fc, lang) {
    const hit = migrationEligible(fc, lang);
    if (!hit) return false;
    const before = String(fc.word || '').trim();
    if (!fc.surface && before !== hit.target) fc.surface = before;
    fc.word = hit.target;
    fc.verbLemma = hit.target;
    fc.lemmaNormalized = true;
    return before !== fc.word;
  }

  function pronounRows(lang, tense) {
    const lg = normLang(lang);
    if (lg === 'de' && tense === 'imperativ') return IMPERATIVE_PRONOUNS.de;
    return PRONOUNS[lg] || PRONOUNS.de;
  }

  function conjugationListHtml(conj, lang, tense) {
    const rows = pronounRows(lang, tense);
    return rows
      .map(([pron]) => {
        const key = pron.includes('/') ? pron.split('/')[0] : pron;
        const form = conj.forms[pron] || conj.forms[key] || '';
        if (!form) return '';
        const pronEsc = typeof esc === 'function' ? esc(pron) : pron;
        const formEsc = typeof esc === 'function' ? esc(form) : form;
        return `<li class="vv-conj-item"><span class="vv-conj-pron">${pronEsc}</span><span class="vv-conj-form">${formEsc}</span></li>`;
      })
      .filter(Boolean)
      .join('');
  }

  function switchConjTense(btn) {
    const panel = btn?.closest?.('.vv-conj-panel');
    if (!panel) return;
    const tense = btn.getAttribute('data-tense');
    panel.querySelectorAll('.vv-conj-tense-tab').forEach((el) => {
      el.classList.toggle('vv-conj-tense-tab--active', el === btn);
    });
    panel.querySelectorAll('.vv-conj-tense-panel').forEach((el) => {
      el.classList.toggle('vv-conj-tense-panel--active', el.getAttribute('data-tense') === tense);
    });
    const title = panel.querySelector('.vv-conj-panel-title');
    if (title) {
      const labels = { present: 'Present', praeteritum: 'Präteritum', perfekt: 'Perfekt', imperativ: 'Imperativ' };
      title.textContent = labels[tense] || 'Conjugation';
    }
  }

  function conjugationSelectHtml(fc, goal, id) {
    const lg = normLang(goal?.subject || fc.sourceLang);
    const wordEsc = typeof esc === 'function' ? esc(fc.word) : fc.word;
    const uid = String(id || fc.word || 'conj').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (lg !== 'de') {
      const conj = getPresent(fc.word, lg);
      if (!conj) return '';
      const items = conjugationListHtml(conj, lg, 'present');
      if (!items) return '';
      return (
        `<details class="vv-conj-details" onclick="event.stopPropagation()">` +
        `<summary class="vv-conj-summary">▾ Conjugations</summary>` +
        `<div class="vv-conj-panel" aria-label="Present tense forms for ${wordEsc}">` +
        `<div class="vv-conj-panel-title">Present tense</div>` +
        `<ul class="vv-conj-list">${items}</ul></div></details>`
      );
    }

    const tensePanels = DE_TENSES.map((tense) => {
      const conj = getConjugation(fc.word, lg, tense);
      if (!conj) return '';
      const items = conjugationListHtml(conj, lg, tense);
      if (!items) return '';
      const active = tense === 'present' ? ' vv-conj-tense-panel--active' : '';
      return `<div class="vv-conj-tense-panel${active}" data-tense="${tense}"><ul class="vv-conj-list">${items}</ul></div>`;
    })
      .filter(Boolean)
      .join('');
    if (!tensePanels) return '';

    const tabs = DE_TENSES.map((tense) => {
      const active = tense === 'present' ? ' vv-conj-tense-tab--active' : '';
      return (
        `<button type="button" class="vv-conj-tense-tab${active}" data-tense="${tense}" ` +
        `onclick="event.stopPropagation();VerbConjugation.switchConjTense(this)">${DE_TENSE_LABELS[tense]}</button>`
      );
    }).join('');

    return (
      `<details class="vv-conj-details" onclick="event.stopPropagation()">` +
      `<summary class="vv-conj-summary">▾ Conjugations</summary>` +
      `<div class="vv-conj-panel" id="vv-conj-${uid}" aria-label="Conjugation forms for ${wordEsc}">` +
      `<div class="vv-conj-panel-title">Present</div>` +
      `<div class="vv-conj-tense-tabs" role="tablist">${tabs}</div>` +
      `<div class="vv-conj-tense-panels">${tensePanels}</div></div></details>`
    );
  }

  return {
    toLemma,
    getPresent,
    getPraeteritum,
    getPerfekt,
    getImperativ,
    getConjugation,
    enrichFlashcard,
    enrichVerbConjugation,
    canonicalizeForDeck,
    migrationEligible,
    conjugationSelectHtml,
    switchConjTense,
    pronounRows,
    splitSeparableInfinitive,
    deStemNeedsEpentheticE,
  };
})();

if (typeof window !== 'undefined') window.VerbConjugation = VerbConjugation;
if (typeof module !== 'undefined') module.exports = VerbConjugation;
