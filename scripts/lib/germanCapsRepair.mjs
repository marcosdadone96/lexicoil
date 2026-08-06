/**
 * AUTO vs REVIEW classification for caps repair.
 * AUTO only when POS gate + context + lexicon align (high confidence).
 */

const AUTO_WRONG_REASONS = new Set([
  'double_pass_verb_context',
  'pos_verb',
  'adv_before_verb',
  'zu_adv_capitalized',
  'adv_after_pronoun',
  'adj_before_noun',
  'adj_after_prep',
  'double_pass_after_prep',
]);

const AUTO_NOUN_REASONS = new Set([
  'lexicon_nn',
  'lexicon_after_adj',
  'modal_noun_object',
]);

const NEVER_AUTO_LOWERCASE = new Set([
  'draußen', 'draussen', 'drinnen', 'oben', 'unten', 'links', 'rechts',
  'morgens', 'abends', 'mittags', 'nachts', 'oft', 'gern', 'gerne',
  'bald', 'spät', 'spat', 'früh', 'frueh', 'nahe', 'weit',
]);

const NEVER_AUTO_CAPITALIZE = new Set([
  'groß', 'gross', 'große', 'grosse', 'großer', 'grosser', 'großen', 'grossen',
  'klein', 'kleine', 'kleiner', 'kleinen',
  'digitalen', 'digitaler', 'digitale', 'deutlich', 'deutliche',
]);

export function isAutoRepairable(finding) {
  if (finding.confidence !== 'high') {
    return { auto: false, reason: 'low_confidence' };
  }

  const lw = String(finding.word || '').toLowerCase();

  if (finding.type === 'wrong_capitalized') {
    if (!AUTO_WRONG_REASONS.has(finding.reason)) {
      return { auto: false, reason: `review_reason:${finding.reason}` };
    }
    if (NEVER_AUTO_LOWERCASE.has(lw)) {
      return { auto: false, reason: 'protected_adverb' };
    }
    return { auto: true, reason: finding.reason };
  }

  if (finding.type === 'noun_lowercase') {
    if (!AUTO_NOUN_REASONS.has(finding.reason)) {
      return { auto: false, reason: `review_reason:${finding.reason}` };
    }
    if (NEVER_AUTO_CAPITALIZE.has(lw) || NEVER_AUTO_LOWERCASE.has(lw)) {
      return { auto: false, reason: 'protected_modifier' };
    }
    if (finding.tag && finding.tag !== 'NN' && finding.reason !== 'lexicon_after_adj' && finding.reason !== 'modal_noun_object') {
      return { auto: false, reason: 'not_nn_tag' };
    }
    return { auto: true, reason: finding.reason };
  }

  return { auto: false, reason: 'unknown_type' };
}

export function applyDeterministicFix(text, finding) {
  const word = finding.word;
  if (!word || !text.includes(word)) return { text, applied: false, reason: 'word_not_found' };

  if (finding.type === 'wrong_capitalized') {
    const fix = word[0].toLowerCase() + word.slice(1);
    return { text: text.replace(word, fix), applied: true, fix };
  }

  if (finding.type === 'noun_lowercase') {
    const fix = word[0].toUpperCase() + word.slice(1);
    return { text: text.replace(word, fix), applied: true, fix };
  }

  return { text, applied: false, reason: 'unknown_type' };
}
