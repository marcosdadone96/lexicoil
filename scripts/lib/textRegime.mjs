/**
 * Text regime classifier for German caps gate (v6.1-A).
 * Coarse structural classification before spaCy analysis.
 */

export const REGIME = {
  PROSE: 'PROSE',
  TELEGRAPHIC_AD: 'TELEGRAPHIC_AD',
  TITLE_HEADING: 'TITLE_HEADING',
};

/** @typedef {{ regime: string, signals: string[], confidence: 'high'|'medium'|'low' }} RegimeResult */

const TELEGRAPHIC_MARKERS = [
  { id: 'letter_prefix', re: /^[A-Z]\)\s/m },
  { id: 'em_dash', re: /—/ },
  { id: 'anfaengerkurs', re: /\bAnfängerkurs\b/i },
  { id: 'probestunde', re: /\bProbestunde\b/i },
  { id: 'abholung', re: /\bAbholung\b/i },
  { id: 'professioneller', re: /\bProfessioneller\b/i },
  { id: 'weekday_hour', re: /\b(Mo|Di|Mi|Do|Fr|Sa|So)\s+\d/i },
  { id: 'online_daheim', re: /online oder daheim/i },
  { id: 'hour_range', re: /\d+\s*[-–]\s*\d+\s*Uhr/i },
  { id: 'unterricht_klavier', re: /Unterricht am Klavier/i },
  { id: 'camelcase_brand', re: /\b[A-ZÄÖÜ][a-zäöüß]+[A-Z]\S*/ },
  { id: 'paren_brand_tail', re: /\)\s*[A-ZÄÖÜ]/ },
];

const STRONG_FINITE_VERBS =
  /\b(ist|sind|war|waren|wird|werden|hat|haben|kann|können|muss|müssen|bietet|gibt|zeigt)\b/i;

/**
 * @param {string} file
 * @returns {number|null}
 */
export function teilFromFile(file) {
  const m = String(file || '').match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : null;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasCommaListDensity(text) {
  const t = String(text || '');
  const commas = (t.match(/,/g) || []).length;
  return commas >= 2 && t.length < 200 && !/[.!?]$/.test(t.trim());
}

/**
 * @param {string} text
 * @returns {{ count: number, ids: string[] }}
 */
export function telegraphicMarkerHits(text) {
  const ids = [];
  const body = String(text || '');
  for (const { id, re } of TELEGRAPHIC_MARKERS) {
    if (re.test(body)) ids.push(id);
  }
  if (hasCommaListDensity(body)) ids.push('comma_list_density');
  return { count: ids.length, ids };
}

/**
 * Weak prose cue — kept for diagnostics; not used for t3 override (v6.1-A).
 * @param {string} text
 */
export function looksLikeProseSentence(text) {
  return STRONG_FINITE_VERBS.test(String(text || ''));
}

/**
 * Strong orational structure required to promote t3 options → PROSE.
 * Does not treat modal "soll" alone as a prose signal.
 * @param {string} text
 */
export function looksLikeProseSentenceStrong(text) {
  const t = String(text || '').trim();
  if (!t) return false;

  if (/^(?:[a-z]\)\s*)?[A-ZÄÖÜ][^\n.!?]{5,}[.!?]$/.test(t) && STRONG_FINITE_VERBS.test(t)) {
    return true;
  }

  if (/^(?:[a-z]\)\s*)?[A-ZÄÖÜ][a-zäöüß]+\s+\S+\s+(ist|sind|wird|werden|bietet|gibt|zeigt|kann|muss)\b/i.test(t)) {
    return true;
  }

  if (STRONG_FINITE_VERBS.test(t) && /\b(ist|sind|wird|werden|bietet|gibt|zeigt)\b/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * @param {string} body
 * @param {number} markers
 * @returns {boolean}
 */
export function hasTelegraphicStructure(body, markers) {
  if (markers >= 1) return true;
  return hasCommaListDensity(body);
}

/**
 * @param {{ text: string, field?: string, file?: string }} input
 * @returns {RegimeResult}
 */
export function classifyTextRegime({ text, field = '', file = '' }) {
  const signals = [];
  const teil = teilFromFile(file);
  const body = String(text || '');

  if (field === 'questions.signText') {
    signals.push('field:questions.signText');
    return { regime: REGIME.TITLE_HEADING, signals, confidence: 'high' };
  }

  if (field === 'passages.ads') {
    signals.push('field:passages.ads');
    return { regime: REGIME.TELEGRAPHIC_AD, signals, confidence: 'high' };
  }

  const { count: markers, ids } = telegraphicMarkerHits(body);
  if (ids.length) signals.push(...ids.map((id) => `marker:${id}`));

  const isT3 = teil === 3;
  const isOptions = field === 'questions.options';
  const isExplanation = field === 'questions.explanation' || field === 'questions.question';
  const isPassageText = field === 'passages.text';
  const structural = hasTelegraphicStructure(body, markers);

  if (isT3 && !isPassageText) {
    signals.push('source:t3');

    if (isOptions) {
      if (looksLikeProseSentenceStrong(body)) {
        signals.push('override:prose_strong');
        return { regime: REGIME.PROSE, signals, confidence: 'high' };
      }
      signals.push('t3:options:telegraphic');
      return {
        regime: REGIME.TELEGRAPHIC_AD,
        signals,
        confidence: structural ? 'high' : 'medium',
      };
    }

    if (isExplanation) {
      if (structural) {
        signals.push('t3:explanation:telegraphic_copy');
        return { regime: REGIME.TELEGRAPHIC_AD, signals, confidence: 'high' };
      }
      signals.push('t3:explanation:prose');
      return { regime: REGIME.PROSE, signals, confidence: 'high' };
    }

    if (structural) {
      signals.push('t3:field:telegraphic');
      return { regime: REGIME.TELEGRAPHIC_AD, signals, confidence: 'high' };
    }

    signals.push('t3:default:prose');
    return { regime: REGIME.PROSE, signals, confidence: 'medium' };
  }

  signals.push('default:prose');
  return { regime: REGIME.PROSE, signals, confidence: 'high' };
}
