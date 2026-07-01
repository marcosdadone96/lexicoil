/* German/Spanish article lookup — bundled lexicon + plural rules */
const ArticleLexicon = (() => {
  const cache = { de: null, es: null };
  const loading = {};

  /** Sync fallback until /data/lexicon/de-gender.json loads (~15 KB). */
  const DE_CORE = {
    frau: 'f', mann: 'm', auto: 'n', kind: 'n', haus: 'n', stadt: 'f', tag: 'm', nacht: 'f',
    jahr: 'n', monat: 'm', woche: 'f', stunde: 'f', morgen: 'm', abend: 'm', sommer: 'm',
    winter: 'm', welt: 'f', land: 'n', name: 'm', geld: 'n', euro: 'm', preis: 'm',
    arbeit: 'f', beruf: 'm', firma: 'f', chef: 'm', team: 'n', urlaub: 'm', reise: 'f',
    zug: 'm', bus: 'm', hotel: 'n', zimmer: 'n', wohnung: 'f', tür: 'f', fenster: 'n',
    tisch: 'm', stuhl: 'm', garten: 'm', hund: 'm', katze: 'f', essen: 'n', brot: 'n',
    wasser: 'n', kaffee: 'm', familie: 'f', vater: 'm', mutter: 'f', sohn: 'm', tochter: 'f',
    freund: 'm', freundin: 'f', schule: 'f', kurs: 'm', lehrer: 'm', schüler: 'm',
    buch: 'n', stift: 'm', ausbildung: 'f', anerkennung: 'f', bewerbung: 'f',
    information: 'f', schätzung: 'f', problem: 'n', frage: 'f', antwort: 'f', zeit: 'f',
    gesundheit: 'f', arzt: 'm', umwelt: 'f', sprache: 'f', wort: 'n', text: 'm',
    mädchen: 'n', junge: 'm', mensch: 'm', person: 'f', computer: 'm', internet: 'n',
    gemüse: 'n', auflauf: 'm', ernährung: 'f', mischung: 'f', süßigkeit: 'f',
    salat: 'm', kuchen: 'm', teig: 'm', zutat: 'f', rezept: 'n', gericht: 'n',
  };

  let _compoundSuffixes = null;
  function compoundSuffixesDe() {
    if (_compoundSuffixes) return _compoundSuffixes;
    const map = mapFor('de');
    _compoundSuffixes = Object.keys(map || {})
      .filter((k) => k.length >= 4)
      .sort((a, b) => b.length - a.length);
    return _compoundSuffixes;
  }

  /** Compound noun gender = gender of the last component (longest lexicon suffix match). */
  function compoundGenderDe(low) {
    if (!low || low.length < 6) return null;
    for (const suffix of compoundSuffixesDe()) {
      if (low.endsWith(suffix) && low.length > suffix.length + 2) {
        const g = lookupLemma(suffix, 'de');
        if (g) return g;
      }
    }
    return null;
  }

  function norm(s) {
    return String(s || '').trim().normalize('NFC').toLowerCase();
  }

  function genderToArticle(gender, lang) {
    const g = String(gender || '').toLowerCase();
    if (lang === 'de') {
      if (g === 'm' || g === 'masc' || g === 'masculine' || g === 'der') return { gender: 'm', article: 'der' };
      if (g === 'f' || g === 'fem' || g === 'feminine' || g === 'die') return { gender: 'f', article: 'die' };
      if (g === 'n' || g === 'neut' || g === 'neuter' || g === 'das') return { gender: 'n', article: 'das' };
      if (g === 'p' || g === 'pl' || g === 'plural') return { gender: 'f', article: 'die', plural: true };
    }
    if (lang === 'es') {
      if (g === 'm' || g === 'masc' || g === 'el') return { gender: 'm', article: 'el' };
      if (g === 'f' || g === 'fem' || g === 'la') return { gender: 'f', article: 'la' };
    }
    return null;
  }

  function mapFor(lang) {
    if (lang === 'de') return cache.de || DE_CORE;
    return cache[lang] || null;
  }

  function lookupLemma(low, lang) {
    const map = mapFor(lang);
    if (!map || !low) return null;
    return map[low] || (lang === 'de' ? DE_CORE[low] : null) || null;
  }

  function deUmlautToAscii(s) {
    return String(s || '')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ß/g, 'ss');
  }

  /** German plural nouns take «die». */
  function pluralGenderDe(low) {
    if (!low || low.length < 4) return null;
    if (/^(eltern|leute|ferien|kosten|geschwister|informationen|schätzungen)$/i.test(low)) return 'p';
    if (/(ungen|tionen|heiten|keiten|schaften|linge|tage|wochen|jahre|monate|stunden|minuten|sekunden)$/i.test(low)) {
      return 'p';
    }
    if (low.endsWith('s') && !/(nis|us|os|as)$/i.test(low) && low.length > 3) {
      const stem = low.slice(0, -1);
      if (lookupLemma(stem, 'de') || lookupLemma(stem + 'e', 'de')) return 'p';
    }
    if (low.endsWith('er') && low.length > 4) {
      const stem = low.slice(0, -2);
      const plain = deUmlautToAscii(stem);
      if (lookupLemma(stem, 'de') || lookupLemma(stem + 'e', 'de')) return 'p';
      if (plain !== stem && (lookupLemma(plain, 'de') || lookupLemma(plain + 'e', 'de'))) return 'p';
    }
    if (low.endsWith('en') && low.length > 5) {
      if (/ion|ierung|schaft|heit|keit|tät|ität|ung/.test(low)) return 'p';
      const stem1 = low.slice(0, -1);
      const stem2 = low.slice(0, -2);
      const stemHit = lookupLemma(stem1, 'de') || lookupLemma(stem2, 'de');
      if (stemHit) return 'p';
      // Diminutives in -chen (Mädchen) are singular neuter — not plural -en forms.
      if (/(chen|ken|den|ten)$/i.test(low) && !stemHit) return null;
    }
    if (low.endsWith('n') && low.length > 5 && /ion|ierung|schaft|heit|keit/.test(low)) return 'p';
    return null;
  }

  function singularCandidatesDe(low) {
    const out = [];
    if (low.endsWith('ungen')) out.push(low.slice(0, -3) + 'ung');
    if (low.endsWith('tionen')) out.push(low.slice(0, -2) + 'tion');
    if (low.endsWith('heiten')) out.push(low.slice(0, -2) + 'heit');
    if (low.endsWith('keiten')) out.push(low.slice(0, -2) + 'keit');
    if (low.endsWith('schaften')) out.push(low.slice(0, -2) + 'schaft');
    if (low.endsWith('en')) {
      out.push(low.slice(0, -1), low.slice(0, -2));
    }
    if (low.endsWith('n')) out.push(low.slice(0, -1));
    if (low.endsWith('e')) out.push(low.slice(0, -1));
    return [...new Set(out.filter(Boolean))];
  }

  function lookupGender(word, lang) {
    const sub = String(lang || 'de').toLowerCase();
    const low = norm(word);
    if (!low) return null;

    if (sub === 'de') {
      const pl = pluralGenderDe(low);
      if (pl) return pl;
    }

    let g = lookupLemma(low, sub);
    if (!g && sub === 'de') {
      for (const cand of singularCandidatesDe(low)) {
        g = lookupLemma(cand, sub);
        if (g) break;
      }
    }
    if (!g && sub === 'de') g = compoundGenderDe(low);
    return g;
  }

  function lookupArticle(word, lang) {
    const sub = String(lang || 'de').toLowerCase();
    const g = lookupGender(word, sub);
    return g ? genderToArticle(g, sub) : null;
  }

  function applyToFlashcard(fc, lang) {
    if (!fc) return fc;
    const sub = lang || fc.sourceLang || 'de';
    if (fc.articleUserLocked) return fc;
    const stored = typeof normWordType === 'function' ? normWordType(fc.type || fc.pos) : '';
    if (stored && stored !== 'noun') return fc;
    const hit = lookupArticle(fc.word, sub);
    if (!hit) return fc;
    fc.gender = hit.gender;
    fc.article = hit.article;
    fc.plural = !!hit.plural;
    return fc;
  }

  async function preload(lang) {
    const sub = String(lang || 'de').toLowerCase();
    if (cache[sub]) return cache[sub];
    if (loading[sub]) return loading[sub];
    if (sub !== 'de') return null;

    loading[sub] = fetch('/data/lexicon/de-gender.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        cache.de = { ...DE_CORE, ...data };
        _compoundSuffixes = null;
        delete loading.de;
        return cache.de;
      })
      .catch(() => {
        cache.de = { ...DE_CORE };
        delete loading.de;
        return cache.de;
      });
    return loading[sub];
  }

  function ready(lang) {
    return !!cache[String(lang || 'de').toLowerCase()];
  }

  return {
    preload,
    ready,
    lookupGender,
    lookupArticle,
    lookupLemma,
    applyToFlashcard,
    genderToArticle,
    pluralGenderDe,
    compoundGenderDe,
  };
})();

if (typeof window !== 'undefined') window.ArticleLexicon = ArticleLexicon;
if (typeof module !== 'undefined') module.exports = ArticleLexicon;
