/** Certification metadata — single source for subject → provider mapping */
const SubjectMeta = (() => {
  const META = Object.freeze({
    de: Object.freeze({
      slug: 'goethe',
      cert: 'Goethe',
      board: 'Goethe-Institut',
      flag: '🇩🇪',
      pill: 'DE',
      vocabLang: 'en',
      langName: 'German',
      usesGermanKeys: true,
    }),
    en: Object.freeze({
      slug: 'cambridge',
      cert: 'Cambridge',
      board: 'Cambridge English',
      flag: '🇬🇧',
      pill: 'EN',
      vocabLang: 'es',
      langName: 'English',
      usesGermanKeys: false,
    }),
    es: Object.freeze({
      slug: 'dele',
      cert: 'DELE',
      board: 'Instituto Cervantes',
      flag: '🇪🇸',
      pill: 'ES',
      vocabLang: 'en',
      langName: 'Spanish',
      usesGermanKeys: false,
    }),
  });

  const CAMBRIDGE_NAMES = Object.freeze({
    A1: 'A1',
    A2: 'A2',
    B1: 'B1 Preliminary',
    B2: 'B2 First',
    C1: 'C1 Advanced',
    C2: 'C2 Proficiency',
  });

  function get(subject) {
    return META[subject] || META.en;
  }

  function certLabel(subject, level) {
    if (subject === 'en') return `Cambridge ${CAMBRIDGE_NAMES[level] || level}`;
    if (subject === 'es') return `DELE ${level}`;
    return `Goethe ${level}`;
  }

  function providerSlug(subject) {
    return get(subject).slug;
  }

  function providerFor(subject) {
    return get(subject).slug;
  }

  function pill(subject) {
    return get(subject).pill;
  }

  function vocabLang(subject) {
    return get(subject).vocabLang;
  }

  function eyebrow(subject) {
    return `${get(subject).board} · A1–C2`;
  }

  function langName(subject) {
    return get(subject).langName;
  }

  function usesGermanKeys(subject) {
    return !!get(subject).usesGermanKeys;
  }

  return Object.freeze({
    META,
    get,
    certLabel,
    providerSlug,
    providerFor,
    pill,
    vocabLang,
    eyebrow,
    langName,
    usesGermanKeys,
  });
})();

if (typeof window !== 'undefined') window.SubjectMeta = SubjectMeta;
