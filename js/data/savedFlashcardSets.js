// Saved flashcard sets from vocabulary hub — replay without re-picking words.
(function () {
  const LS_KEY = 'lc_saved_flashcard_sets';
  const MAX_SETS = 25;

  function hasState() {
    return typeof S !== 'undefined' && !!S;
  }

  function ts(entry) {
    return Number(entry?.updatedAt) || Number(entry?.createdAt) || 0;
  }

  function normLevel(level) {
    return typeof normalizeGoalLevel === 'function'
      ? normalizeGoalLevel(level)
      : String(level || '').trim().toUpperCase();
  }

  function matchesGoal(entry, goal) {
    if (!entry || !goal) return false;
    if (entry.goalId && goal.id && entry.goalId === goal.id) return true;
    return entry.lang === goal.subject && normLevel(entry.level) === normLevel(goal.level);
  }

  function forGoal(goal) {
    if (!hasState() || !goal) return [];
    return (S.savedFlashcardSets || [])
      .filter((e) => matchesGoal(e, goal))
      .sort((a, b) => ts(b) - ts(a));
  }

  function getById(id) {
    if (!hasState() || !id) return null;
    return (S.savedFlashcardSets || []).find((e) => String(e.id) === String(id)) || null;
  }

  function snapshotWord(fc) {
    if (!fc) return null;
    const word = String(fc.word || '').trim();
    if (!word) return null;
    return {
      id: fc.id || null,
      cardId: typeof fcId === 'function' ? fcId(fc) : fc.id,
      word,
      type: fc.type || fc.pos || '',
      sourceLang: fc.sourceLang || fc.lang || '',
    };
  }

  function saveAll() {
    if (!hasState()) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(S.savedFlashcardSets || []));
    } catch (_) {
      if (typeof lcToast === 'function') {
        lcToast('Could not save flashcard set — storage full.', 'error', 6500);
      }
    }
  }

  function persistSession(opts) {
    if (!hasState()) return null;
    const { goal, selectedIds } = opts || {};
    const ids = [...(selectedIds || [])].filter(Boolean);
    if (!ids.length || !goal) return null;
    const deck = typeof deckForGoal === 'function' ? deckForGoal(goal) : [];
    const cards = ids
      .map((id) => deck.find((f) => (typeof fcId === 'function' ? fcId(f) : f.id) === id))
      .filter(Boolean);
    if (!cards.length) return null;
    const now = Date.now();
    const id = `fcset_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const wordSnapshots = cards.map(snapshotWord).filter(Boolean);
    const entry = {
      id,
      goalId: goal.id || null,
      lang: goal.subject || 'de',
      level: normLevel(goal.level || 'B1'),
      cardIds: ids,
      wordSnapshots,
      wordCount: wordSnapshots.length,
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null,
      playCount: 0,
    };
    if (!Array.isArray(S.savedFlashcardSets)) S.savedFlashcardSets = [];
    S.savedFlashcardSets.unshift(entry);
    if (S.savedFlashcardSets.length > MAX_SETS) {
      S.savedFlashcardSets = S.savedFlashcardSets.slice(0, MAX_SETS);
    }
    saveAll();
    if (typeof SavedVocabPractice !== 'undefined') SavedVocabPractice.refreshDom(goal);
    return id;
  }

  function recordPlay(id) {
    const e = getById(id);
    if (!e) return;
    const now = Date.now();
    e.lastPlayedAt = now;
    e.updatedAt = now;
    e.playCount = (Number(e.playCount) || 0) + 1;
    saveAll();
    const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
    if (typeof SavedVocabPractice !== 'undefined') SavedVocabPractice.refreshDom(goal);
  }

  function deleteSaved(id) {
    if (!hasState() || !id) return;
    if (!confirm('Remove this saved flashcard set?')) return;
    S.savedFlashcardSets = (S.savedFlashcardSets || []).filter(
      (x) => String(x.id) !== String(id),
    );
    saveAll();
    const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
    if (typeof SavedVocabPractice !== 'undefined') SavedVocabPractice.refreshDom(goal);
    if (typeof refreshVocabHubPanel === 'function') refreshVocabHubPanel();
  }

  function retakeSaved(id) {
    const saved = getById(id);
    if (!saved?.cardIds?.length) {
      if (typeof lcToast === 'function') lcToast('Saved set not found.', 'warn');
      return;
    }
    const goal =
      (saved.goalId && S.goals.find((g) => g.id === saved.goalId)) ||
      (typeof getActiveGoal === 'function' ? getActiveGoal() : null);
    if (!goal) {
      if (typeof lcToast === 'function') lcToast('Goal not found for this set.', 'warn');
      return;
    }
    S.activeGoalId = goal.id;
    if (typeof syncGoalToProfile === 'function') syncGoalToProfile(goal);
    _vocabHub.goalId = goal.id;
    _vocabHub.pickActivity = null;
    _vocabHub.selectedIds = new Set(saved.cardIds);
    S.fcSelected = new Set(saved.cardIds);
    S._fcSavedSetId = saved.id;
    if (typeof launchVocabHubFlashcards === 'function') {
      launchVocabHubFlashcards({ skipPersist: true });
    }
  }

  function title(saved) {
    const n = saved.wordCount || saved.cardIds?.length || 0;
    const langName =
      typeof SubjectMeta !== 'undefined'
        ? SubjectMeta.langName(saved.lang)
        : String(saved.lang || '').toUpperCase();
    return `${n} words · ${saved.level} ${langName} · flashcards`;
  }

  function metaLine(saved) {
    const date =
      typeof formatAppDate === 'function' ? formatAppDate(saved.createdAt) : '';
    const parts = [];
    if (date) parts.push('Created ' + date);
    parts.push('Replay free');
    if (saved.playCount > 0) {
      parts.push(saved.playCount === 1 ? 'Played once' : `Played ${saved.playCount} times`);
    }
    return parts.join(' · ');
  }

  function renderCardsHtml(goal) {
    if (!goal) return '';
    const list = forGoal(goal);
    if (!list.length) return '';
    return list
      .map(
        (e) =>
          `<article class="svq-card" data-fcset-id="${esc(e.id)}">` +
          `<div class="svq-card-main">` +
          `<h4 class="svq-card-title">${esc(title(e))}</h4>` +
          `<p class="svq-card-meta">${esc(metaLine(e))}</p>` +
          `</div>` +
          `<div class="svq-card-actions">` +
          `<button type="button" class="btn-sm accent" onclick="retakeSavedFlashcards('${esc(e.id)}')">Replay</button>` +
          `<button type="button" class="btn-sm" onclick="deleteSavedFlashcards('${esc(e.id)}')" aria-label="Delete">Delete</button>` +
          `</div>` +
          `</article>`,
      )
      .join('');
  }

  window.SavedFlashcardSets = {
    LS_KEY,
    persistSession,
    recordPlay,
    deleteSaved,
    retakeSaved,
    renderCardsHtml,
    forGoal,
  };
  window.retakeSavedFlashcards = retakeSaved;
  window.deleteSavedFlashcards = deleteSaved;
})();
