/**
 * Hash router + explicit navigation stack (phase 11).
 * Maps routes to the 11 existing screens; no framework.
 */
(function () {
  const LEGACY_WORKSPACE = /^workspace\/([^/]+)/;
  const GOAL_TAB = /^goal\/([^/]+)\/(exams|vocab|progress|config|oral|deck)$/;
  const EXAM = /^exam\/([^/]+)$/;
  const EXAM_RESULTS = /^exam\/([^/]+)\/results$/;
  const REVIEW = /^review\/(\d+)$/;
  const SIMPLE = {
    '': 'home',
    dashboard: 'home',
    flashcards: 'flashcards',
    'vocab-exam': 'vocabExam',
    'profile-setup': 'profileSetup',
  };

  const TAB_MAP = { exams: 'exams', vocab: 'vocabulary', progress: 'progress' };

  let _stack = [{ path: '#/', screen: 'home', label: 'Dashboard' }];
  let _applying = false;
  let _fromHistory = false;

  function normalizeHash(raw) {
    const h = String(raw || '').trim();
    if (!h || h === '#') return '#/';
    if (h.startsWith('#/')) return h;
    if (h.startsWith('#')) return '#/' + h.slice(1).replace(/^\//, '');
    return '#/' + h.replace(/^\//, '');
  }

  function hashPath(hash) {
    return normalizeHash(hash).slice(2).replace(/\/$/, '') || '';
  }

  function parseHash(hash) {
    const path = hashPath(hash);
    if (LEGACY_WORKSPACE.test(path)) {
      const slug = decodeURIComponent(path.match(LEGACY_WORKSPACE)[1]);
      return routeGoal(slug, 'exams');
    }
    if (SIMPLE[path] !== undefined) {
      return { path: normalizeHash(hash), screen: SIMPLE[path], label: defaultLabel(SIMPLE[path]) };
    }
    let m = path.match(GOAL_TAB);
    if (m) return routeGoal(decodeURIComponent(m[1]), m[2]);
    m = path.match(EXAM_RESULTS);
    if (m) return { path: normalizeHash(hash), screen: 'examResults', examId: m[1], label: 'Results' };
    m = path.match(EXAM);
    if (m) return { path: normalizeHash(hash), screen: 'exam', examId: m[1], label: 'Exam' };
    m = path.match(REVIEW);
    if (m) return { path: normalizeHash(hash), screen: 'review', historyId: Number(m[1]), label: 'Progress' };
    return { path: normalizeHash(hash), screen: 'unknown', label: 'Dashboard' };
  }

  function routeGoal(slug, segment) {
    const goal = typeof findGoalBySlug === 'function' ? findGoalBySlug(slug) : null;
    const base = { goalSlug: slug, goal, path: '#/goal/' + slug + '/' + segment };
    if (segment === 'exams' || segment === 'vocab' || segment === 'progress') {
      return {
        ...base,
        screen: 'goalWorkspace',
        tab: TAB_MAP[segment] || 'exams',
        label: segment === 'progress' ? 'Progress' : segment === 'vocab' ? 'Vocabulary' : 'Exams',
      };
    }
    if (segment === 'config') return { ...base, screen: 'examConfig', label: 'Exams' };
    if (segment === 'oral') return { ...base, screen: 'oralPractice', label: 'Exams' };
    if (segment === 'deck') return { ...base, screen: 'deck', label: 'Vocabulary' };
    return { ...base, screen: 'goalWorkspace', tab: 'exams', label: 'Exams' };
  }

  function defaultLabel(screen) {
    const map = {
      home: 'Dashboard',
      flashcards: 'Dashboard',
      vocabExam: 'Deck',
      profileSetup: 'Dashboard',
    };
    return map[screen] || 'Back';
  }

  function goalPath(goal, segment) {
    const slug = typeof GoalStore !== 'undefined' ? GoalStore.slug(goal) : goal?.slug;
    if (!slug) return '#/';
    return '#/goal/' + slug + '/' + segment;
  }

  function showRouteRecovery(title, message, actionsHtml) {
    hideAll();
    show('homeScreen');
    if (typeof renderHomeScreen === 'function') renderHomeScreen();
    const host = document.getElementById('homeScreen');
    if (!host) return;
    let box = document.getElementById('navRouteRecovery');
    if (!box) {
      box = document.createElement('div');
      box.id = 'navRouteRecovery';
      box.className = 'nav-route-recovery';
      host.insertBefore(box, host.firstChild);
    }
    box.innerHTML =
      '<div class="nav-route-recovery__inner">' +
      '<h2 class="nav-route-recovery__title">' +
      esc(title) +
      '</h2>' +
      '<p class="nav-route-recovery__msg">' +
      esc(message) +
      '</p>' +
      (actionsHtml || '') +
      '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearRouteRecovery() {
    document.getElementById('navRouteRecovery')?.remove();
  }

  function findSavedExamById(id) {
    const sid = String(id);
    let idx = (S.savedExams || []).findIndex((e) => String(e.id) === sid);
    if (idx >= 0) return { entry: S.savedExams[idx], index: idx, source: 'saved' };
    const hist = (S.history || []).find((h) => String(h.id) === sid);
    if (hist?.data) return { entry: { ...hist, data: hist.data || hist.examData }, index: -1, source: 'history' };
    if (S.examData && String(S.examData._savedId || S.examData._flightId) === sid) {
      return { entry: { id: sid, data: S.examData, lang: S.subject, level: S.level, mode: S.mode }, index: -1, source: 'active' };
    }
    return null;
  }

  function applyRoute(entry, opts) {
    if (!entry) return;
    _applying = true;
    try {
      clearRouteRecovery();
      if (entry.screen === 'unknown') {
        showRouteRecovery(
          'Page not found',
          'That link does not match any screen in LexiCoil.',
          '<button type="button" class="btn-sm accent" onclick="goHome()">Go to dashboard</button>',
        );
        return;
      }
      if (entry.screen === 'home') {
        if (typeof requireAppAuth === 'function' && !requireAppAuth()) return;
        clearVocabHubFlashcardMode?.();
        hideAll();
        show('homeScreen');
        setNavActive?.('dashboard');
        if (S.goals?.length === 1) {
          S.activeGoalId = S.goals[0].id;
          syncGoalToProfile?.(S.goals[0]);
        }
        updBadges?.();
        updQuotaUI?.();
        renderHomeScreen?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (entry.screen === 'goalWorkspace') {
        if (!entry.goal) {
          showRouteRecovery(
            'Goal not found',
            'This workspace link is invalid or the goal was removed.',
            '<button type="button" class="btn-sm accent" onclick="goHome()">Go to dashboard</button>',
          );
          return;
        }
        if (typeof gateAppRoute === 'function' && !gateAppRoute()) return;
        openGoalWorkspace(entry.goal.id, entry.tab, true);
        return;
      }
      if (entry.screen === 'examConfig') {
        if (!entry.goal) {
          showRouteRecovery('Exam setup unavailable', 'Goal not found for this link.', '');
          return;
        }
        if (typeof gateAppRoute === 'function' && !gateAppRoute()) return;
        openExamConfigurator(entry.goal.id);
        return;
      }
      if (entry.screen === 'oralPractice') {
        if (!entry.goal) {
          showRouteRecovery('Speaking practice unavailable', 'Goal not found.', '');
          return;
        }
        if (typeof _oralSession !== 'undefined' && _oralSession.task && _oralSession.goalId === entry.goal.id) {
          hideAll();
          show('oralPracticeScreen');
          renderOralPracticeTask?.(entry.goal);
          return;
        }
        showRouteRecovery(
          'Speaking session expired',
          'Start oral practice again from your goal workspace.',
          '<button type="button" class="btn-sm accent" onclick="routerNavigate(\'#/goal/' +
            esc(entry.goalSlug) +
            '/exams\' , { replace: true })">Back to exams</button>',
        );
        return;
      }
      if (entry.screen === 'deck') {
        if (!entry.goal) {
          showRouteRecovery('Deck unavailable', 'Goal not found.', '');
          return;
        }
        openDeckHub(entry.goal.id);
        return;
      }
      if (entry.screen === 'flashcards') {
        goFlashcards(true);
        return;
      }
      if (entry.screen === 'exam' || entry.screen === 'examResults') {
        const found = findSavedExamById(entry.examId);
        if (!found) {
          showRouteRecovery(
            'Exam not found',
            'This exam link may have expired or was removed from saved exams.',
            '<button type="button" class="btn-sm accent" onclick="goHome()">Go to dashboard</button>',
          );
          return;
        }
        if (typeof gateAppRoute === 'function' && !gateAppRoute()) return;
        if (entry.screen === 'examResults' || (found.entry.status === 'completed' && found.entry.score != null && found.entry.correction)) {
          if (found.index >= 0) reviewSavedExam(found.index);
          else if (typeof openMistakeReview === 'function' && found.source === 'history') openMistakeReview(found.entry.id);
          return;
        }
        if (found.index >= 0) retakeExam(found.index, found.entry.status === 'in_progress');
        else {
          S.examData = found.entry.data;
          S.subject = found.entry.lang;
          S.level = found.entry.level;
          S.mode = normalizeMode(found.entry.mode || 'official');
          renderExam?.();
        }
        return;
      }
      if (entry.screen === 'review') {
        const hist = (S.history || []).find((h) => h.id === entry.historyId);
        if (!hist?.correction) {
          showRouteRecovery(
            'Review unavailable',
            'No mistake review saved for this exam.',
            '<button type="button" class="btn-sm" onclick="routerNavigate(\'#/\' , { replace: true })">Dashboard</button>',
          );
          return;
        }
        openMistakeReview(entry.historyId);
        return;
      }
      if (entry.screen === 'vocabExam') {
        if (getActiveScreenId?.() === 'vocabExamScreen') return;
        showRouteRecovery(
          'Vocabulary quiz',
          'Open a vocabulary quiz from your flashcard deck.',
          '<button type="button" class="btn-sm accent" onclick="goFlashcards()">Open flashcards</button>',
        );
        return;
      }
      if (entry.screen === 'profileSetup') {
        hideAll();
        show('profileSetupScreen');
        return;
      }
    } finally {
      _applying = false;
      _fromHistory = false;
      syncNavBackLabels?.();
    }
  }

  function routerNavigate(path, opts) {
    opts = opts || {};
    path = normalizeHash(path);
    if (_applying) return;
    const entry = parseHash(path);
    if (opts.label) entry.label = opts.label;

    if (opts.replace) {
      if (_stack.length) _stack[_stack.length - 1] = entry;
      else _stack.push(entry);
      try {
        history.replaceState({ lcNav: _stack.length }, '', path);
      } catch (_) {}
    } else if (!_fromHistory) {
      _stack.push(entry);
      try {
        history.pushState({ lcNav: _stack.length }, '', path);
      } catch (_) {}
    }

    applyRoute(entry, opts);
  }

  function syncStackToHash() {
    const path = normalizeHash(location.hash);
    while (_stack.length > 1 && _stack[_stack.length - 1].path !== path) {
      _stack.pop();
    }
    const entry = parseHash(path);
    if (!_stack.length || _stack[_stack.length - 1].path !== path) {
      _stack.push(entry);
    }
  }

  function handleHashChange() {
    _fromHistory = true;
    syncStackToHash();
    applyRoute(parseHash(location.hash), { fromHistory: true });
  }

  function navStackBackLabel() {
    if (_stack.length >= 2) return _stack[_stack.length - 2].label || 'Back';
    return 'Dashboard';
  }

  function navStackBack() {
    if (_stack.length <= 1) {
      routerNavigate('#/', { replace: true, label: 'Dashboard' });
      return;
    }
    try {
      history.back();
    } catch (_) {
      routerNavigate('#/', { replace: true });
    }
  }

  function replaceRoute(path, label) {
    path = normalizeHash(path);
    const entry = parseHash(path);
    if (label) entry.label = label;
    if (_stack.length) _stack[_stack.length - 1] = entry;
    else _stack.push(entry);
    try {
      history.replaceState({ lcNav: _stack.length }, '', path);
    } catch (_) {}
  }

  function updateWorkspaceUrl(goal, opts) {
    if (_applying) return;
    if (goal) {
      const tab = typeof normalizeWsTab === 'function' ? normalizeWsTab(S.wsTab || 'exams') : 'exams';
      const seg = tab === 'vocabulary' ? 'vocab' : tab === 'progress' ? 'progress' : 'exams';
      routerNavigate(goalPath(goal, seg), {
        label: seg === 'progress' ? 'Progress' : seg === 'vocab' ? 'Vocabulary' : 'Exams',
        replace: opts?.replace !== false,
      });
    } else {
      routerNavigate('#/', { replace: true, label: 'Dashboard' });
    }
  }

  function parseAppRoute() {
    const path = hashPath(location.hash);
    if (!path || path === 'dashboard') return false;
    if (typeof gateAppRoute === 'function' && !gateAppRoute()) return true;
    handleHashChange();
    return getActiveScreenId?.() !== 'homeScreen' || document.getElementById('navRouteRecovery');
  }

  function syncExamRouteUrl() {
    if (_applying || !S.examData) return;
    const id = S.examData._savedId || S.examData._flightId;
    if (!id) return;
    replaceRoute('#/exam/' + id, 'Exam');
  }

  function getShareableExamUrl(examId) {
    const id = examId || S.examData?._savedId || S.examData?._flightId;
    if (!id) return null;
    return location.origin + location.pathname + '#/exam/' + id;
  }

  function routeTable() {
    return [
      { route: '#/', screen: 'homeScreen' },
      { route: '#/goal/:slug/exams', screen: 'goalWorkspaceScreen' },
      { route: '#/goal/:slug/vocab', screen: 'goalWorkspaceScreen' },
      { route: '#/goal/:slug/progress', screen: 'goalWorkspaceScreen' },
      { route: '#/goal/:slug/config', screen: 'examConfigScreen' },
      { route: '#/goal/:slug/oral', screen: 'oralPracticeScreen' },
      { route: '#/goal/:slug/deck', screen: 'flashcardScreen' },
      { route: '#/exam/:id', screen: 'examScreen' },
      { route: '#/exam/:id/results', screen: 'resultsScreen' },
      { route: '#/review/:historyId', screen: 'mistakeReviewScreen' },
      { route: '#/flashcards', screen: 'flashcardScreen' },
      { route: '#/vocab-exam', screen: 'vocabExamScreen' },
      { route: '#/profile-setup', screen: 'profileSetupScreen' },
      { route: '(transient)', screen: 'loadingScreen' },
    ];
  }

  window.LcRouter = {
    normalizeHash,
    parseHash,
    navigate: routerNavigate,
    back: navStackBack,
    backLabel: navStackBackLabel,
    applyRoute,
    handleHashChange,
    goalPath,
    syncExamRouteUrl,
    getShareableExamUrl,
    replaceRoute,
    routeTable,
    getStack: () => _stack.slice(),
  };
  window.routerNavigate = routerNavigate;
  window.parseAppRoute = parseAppRoute;
  window.updateWorkspaceUrl = updateWorkspaceUrl;
  window.getShareableExamUrl = getShareableExamUrl;
  window.syncExamRouteUrl = syncExamRouteUrl;

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', handleHashChange);
    window.addEventListener('hashchange', handleHashChange);
  }
})();
