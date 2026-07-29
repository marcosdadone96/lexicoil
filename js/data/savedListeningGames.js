// Saved AI listening sessions — text rounds only (no audio blob); replay via TTS without credits.
(function () {
  const LS_KEY = 'lc_saved_listening';
  const LS_DEL_KEY = 'lc_saved_listening_del';
  const MAX_SESSIONS = 10;

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
    return (S.savedListening || [])
      .filter((e) => matchesGoal(e, goal))
      .sort((a, b) => ts(b) - ts(a));
  }

  function getById(id) {
    if (!hasState() || !id) return null;
    return (S.savedListening || []).find((e) => String(e.id) === String(id)) || null;
  }

  function stripRound(r) {
    if (!r || typeof r !== 'object') return r;
    const copy = { ...r };
    delete copy.audioBase64;
    delete copy.audioMime;
    return copy;
  }

  function snapshotWord(fc) {
    if (!fc) return null;
    const word = String(fc.word || '').trim();
    if (!word) return null;
    return {
      id: fc.id || null,
      word,
      type: fc.type || fc.pos || '',
      sourceLang: fc.sourceLang || fc.lang || '',
    };
  }

  function poolFromSnapshots(saved) {
    const snaps = saved?.wordSnapshots || [];
    const lang = saved?.lang || 'de';
    return snaps
      .map((s) => {
        const w = String(s.word || '').trim();
        if (!w) return null;
        const key = w.toLowerCase();
        const live = (S.flashcards || []).find(
          (f) =>
            String(f.word || '').trim().toLowerCase() === key &&
            (f.sourceLang || f.lang || '') === (s.sourceLang || lang),
        );
        return live || { id: s.id || `hgsnap_${key}`, word: w, sourceLang: s.sourceLang || lang };
      })
      .filter(Boolean);
  }

  function title(saved) {
    const n = saved.roundCount || saved.rounds?.length || 0;
    const words = saved.wordCount || saved.words?.length || 0;
    const langName =
      typeof SubjectMeta !== 'undefined'
        ? SubjectMeta.langName(saved.lang)
        : String(saved.lang || '').toUpperCase();
    const topic = saved.topic ? ` · ${saved.topic}` : '';
    return `${words} words · ${saved.level} ${langName} · ${n} AI round${n === 1 ? '' : 's'}${topic}`;
  }

  function metaLine(saved) {
    const date =
      typeof formatAppDate === 'function' ? formatAppDate(saved.createdAt) : '';
    const parts = [];
    if (date) parts.push('Created ' + date);
    parts.push('Replay uses TTS (no credits)');
    if (saved.playCount > 0) {
      parts.push(saved.playCount === 1 ? 'Played once' : `Played ${saved.playCount} times`);
    }
    return parts.join(' · ');
  }

  function saveAll() {
    if (!hasState()) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(S.savedListening || []));
    } catch (_) {
      if (typeof lcToast === 'function') {
        lcToast('Could not save listening session — storage full.', 'error', 6500);
      }
    }
  }

  function persistAfterGeneration(opts) {
    if (!hasState()) return null;
    const { goal, lang, level, topic, rounds, words, pool, uiLang } = opts || {};
    const list = Array.isArray(rounds) ? rounds.map(stripRound).filter((r) => r && r.passage) : [];
    if (!list.length) return null;
    const now = Date.now();
    const id = `hg_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const wordSnapshots = (pool || []).map(snapshotWord).filter(Boolean);
    const entry = {
      id,
      goalId: goal?.id || null,
      lang: lang || goal?.subject || 'de',
      level: normLevel(level || goal?.level || 'B1'),
      topic: topic || '',
      uiLang: uiLang || 'en',
      rounds: list,
      words: [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))],
      wordSnapshots,
      wordCount: (words || []).length || wordSnapshots.length,
      roundCount: list.length,
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null,
      playCount: 0,
    };
    if (!Array.isArray(S.savedListening)) S.savedListening = [];
    S.savedListening.unshift(entry);
    if (S.savedListening.length > MAX_SESSIONS) {
      S.savedListening = S.savedListening.slice(0, MAX_SESSIONS);
    }
    saveAll();
    if (typeof SavedVocabPractice !== 'undefined') SavedVocabPractice.refreshDom(goal || null);
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
    if (!confirm('Remove this saved listening session?')) return;
    S.savedListening = (S.savedListening || []).filter((x) => String(x.id) !== String(id));
    saveAll();
    const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
    if (typeof SavedVocabPractice !== 'undefined') SavedVocabPractice.refreshDom(goal);
    if (typeof refreshVocabHubPanel === 'function') refreshVocabHubPanel();
  }

  function mountSavedSession(saved, fromVocab) {
    if (!saved?.rounds?.length) {
      if (typeof lcToast === 'function') lcToast('No rounds in this session.', 'warn');
      return;
    }
    const lang = saved.lang || 'de';
    const pool = poolFromSnapshots(saved);
    const uiLang =
      saved.uiLang ||
      (typeof resolveActiveVocabUiLang === 'function' ? resolveActiveVocabUiLang() : 'en');
    hideAll();
    show('horenGameScreen');
    if (typeof applyHorenGameChrome === 'function') applyHorenGameChrome();
    const el = document.getElementById('horenGameMount');
    if (!el || typeof HorenGame === 'undefined') {
      lcToast('Listening game unavailable.', 'warn');
      return;
    }
    const hgConfig = {
      rounds: saved.rounds.map(stripRound),
      aiSession: true,
      mode: 'ai',
      topic: saved.topic,
      lang,
      level: saved.level,
      pool,
      uiLang,
      savedReplay: true,
    };
    S._hgRetakeListeningId = saved.id;
    S._hgLastConfig = hgConfig;
    const hgHandlers = {
      onComplete() {
        if (S._hgRetakeListeningId && typeof SavedListeningGames !== 'undefined') {
          SavedListeningGames.recordPlay(S._hgRetakeListeningId);
          S._hgRetakeListeningId = null;
        }
      },
      onExit() {
        if (typeof exitHorenGame === 'function') exitHorenGame();
      },
    };
    S._hgLastHandlers = hgHandlers;
    HorenGame.mountAiSession(el, hgConfig, hgHandlers);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function retakeSaved(id) {
    const saved = getById(id);
    if (!saved) {
      if (typeof lcToast === 'function') lcToast('Saved session not found.', 'warn');
      return;
    }
    mountSavedSession(saved, true);
  }

  function renderCardsHtml(goal) {
    if (!goal) return '';
    const list = forGoal(goal);
    if (!list.length) return '';
    return list
      .map(
        (e) =>
          `<article class="svq-card" data-hgs-id="${esc(e.id)}">` +
          `<div class="svq-card-main">` +
          `<h4 class="svq-card-title">${esc(title(e))}</h4>` +
          `<p class="svq-card-meta">${esc(metaLine(e))}</p>` +
          `</div>` +
          `<div class="svq-card-actions">` +
          `<button type="button" class="btn-sm accent" onclick="retakeSavedListening('${esc(e.id)}')">Replay</button>` +
          `<button type="button" class="btn-sm" onclick="deleteSavedListening('${esc(e.id)}')" aria-label="Delete">Delete</button>` +
          `</div>` +
          `</article>`,
      )
      .join('');
  }

  window.SavedListeningGames = {
    LS_KEY,
    MAX_SESSIONS,
    forGoal,
    getById,
    persistAfterGeneration,
    recordPlay,
    deleteSaved,
    retakeSaved,
    renderCardsHtml,
    stripRound,
  };
  window.retakeSavedListening = retakeSaved;
  window.deleteSavedListening = deleteSaved;
})();
