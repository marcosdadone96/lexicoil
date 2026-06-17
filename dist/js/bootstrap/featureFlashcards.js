/* Flashcard type filters and sorting */
(function () {
  if (typeof S === 'undefined') return;

  S.fcTypeFilter = S.fcTypeFilter || 'all';

  window.normWordType = function (pos) {
    const p = String(pos || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (p.startsWith('noun') || p === 'n') return 'noun';
    if (p.startsWith('verb') || p === 'v') return 'verb';
    if (p.startsWith('adj')) return 'adjective';
    if (p.startsWith('adv')) return 'adverb';
    if (p.startsWith('phrase')) return 'phrase';
    return 'other';
  };

  window.typeBadge = function (t) {
    const map = {
      noun: ['noun', 'var(--blue)'],
      verb: ['verb', 'var(--orange)'],
      adjective: ['adj', 'var(--green)'],
      adverb: ['adv', 'var(--purple)'],
      phrase: ['phrase', 'var(--text-muted)'],
      other: ['other', 'var(--text-muted)'],
    };
    const [lbl, col] = map[t] || map.other;
    return `<span class="fc-type-badge" style="color:${col};border-color:${col}">${lbl}</span>`;
  };

  window.setFcTypeFilter = function (t, btn) {
    S.fcTypeFilter = t;
    document.querySelectorAll('.fc-type-filter').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderFC(false);
  };

  window.filterCardsByType = function (cards) {
    if (!S.fcTypeFilter || S.fcTypeFilter === 'all') return cards;
    if (S.fcTypeFilter === 'other') {
      return cards.filter((fc) => !['noun', 'verb', 'adjective'].includes(normWordType(fc.type || fc.pos)));
    }
    return cards.filter((fc) => normWordType(fc.type || fc.pos) === S.fcTypeFilter);
  };

  const FC_TYPE_ORDER = { noun: 0, verb: 1, adjective: 2, adverb: 3, phrase: 4, other: 5 };

  window.sortFlashcardsByType = function (cards) {
    return [...cards].sort((a, b) => {
      const ta = FC_TYPE_ORDER[normWordType(a.type || a.pos)] ?? 5;
      const tb = FC_TYPE_ORDER[normWordType(b.type || b.pos)] ?? 5;
      if (ta !== tb) return ta - tb;
      return String(a.word || '').localeCompare(String(b.word || ''), undefined, { sensitivity: 'base' });
    });
  };

  window.fcTypeSectionLabel = function (t) {
    const map = {
      noun: 'Nouns',
      verb: 'Verbs',
      adjective: 'Adjectives',
      adverb: 'Adverbs',
      phrase: 'Phrases',
      other: 'Other',
    };
    return map[t] || 'Other';
  };
})();
