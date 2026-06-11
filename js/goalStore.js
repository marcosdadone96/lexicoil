/**
 * Exam goals — single source of truth (lc_goals + lc_active_goal).
 * Legacy lc_goal is read-only for one-time migration; writes go through applyContext().
 */
const GoalStore = (() => {
  const GOALS_KEY = 'lc_goals';
  const ACTIVE_KEY = 'lc_active_goal';
  const LEGACY_KEY = 'lc_goal';

  // NOTE: `S` is declared with `const` in the inline script (global lexical binding,
  // NOT window.S). Guard with typeof, never window.S.
  function hasState() {
    return typeof S !== 'undefined' && !!S;
  }

  function goals() {
    return hasState() ? S.goals || [] : [];
  }

  function applyContext(goal) {
    if (!goal || !hasState()) return;
    S.activeGoalId = goal.id;
    S.subject = goal.subject;
    S.level = goal.level;
    if (typeof ExamProfile !== 'undefined') ExamProfile.createProfile(goal.subject, goal.level);
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ subject: goal.subject, level: goal.level }));
    } catch (_) {}
  }

  function clearContext() {
    if (!hasState()) return;
    S.activeGoalId = null;
    S.subject = null;
    S.level = null;
  }

  function save() {
    if (!hasState()) return;
    localStorage.setItem(GOALS_KEY, JSON.stringify(S.goals));
    if (S.activeGoalId) localStorage.setItem(ACTIVE_KEY, S.activeGoalId);
    else localStorage.removeItem(ACTIVE_KEY);
  }

  function getActive() {
    if (!hasState() || !S.activeGoalId) return null;
    return S.goals.find((g) => g.id === S.activeGoalId) || null;
  }

  function setActive(id) {
    const goal = S.goals.find((g) => g.id === id);
    if (!goal) return null;
    applyContext(goal);
    save();
    return goal;
  }

  function migrateFromLegacy() {
    if (!hasState() || S.goals.length) return false;
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o.subject || !o.level) return false;
      const goal = {
        id: 'goal_' + Date.now().toString(36),
        subject: o.subject,
        level: o.level,
        examDate: null,
        createdAt: Date.now(),
      };
      S.goals.push(goal);
      S.activeGoalId = goal.id;
      return true;
    } catch (_) {
      return false;
    }
  }

  function afterLoad() {
    if (!hasState()) return;
    ensureSlugs();
    const active = getActive();
    if (active) {
      applyContext(active);
      return;
    }
    if (S.goals.length === 1) {
      applyContext(S.goals[0]);
      return;
    }
    if (typeof ExamProfile !== 'undefined') {
      const ap = ExamProfile.getActive();
      if (ap) {
        S.subject = ap.subject;
        S.level = ap.level;
      }
    }
  }

  function prepContext(goal) {
    if (!goal) return;
    applyContext(goal);
    save();
  }

  function ensureSlugs() {
    if (!Array.isArray(S.goals)) return;
    const used = new Set();
    let changed = false;
    S.goals.forEach((g) => {
      if (!g || typeof g !== 'object') return;
      const base = provSlug(g.subject) + '-' + String(g.level || 'b1').toLowerCase();
      let slug = base;
      let n = 2;
      while (used.has(slug)) {
        slug = base + '-' + n++;
        changed = true;
      }
      if (g.slug !== slug) {
        g.slug = slug;
        changed = true;
      }
      used.add(slug);
    });
    if (changed) save();
  }

  function slug(goal) {
    return goal?.slug || (goal ? provSlug(goal.subject) + '-' + String(goal.level).toLowerCase() : '');
  }

  function findBySlug(s) {
    if (!s) return null;
    return S.goals.find((g) => slug(g) === s) || null;
  }

  function label(goal) {
    if (typeof ExamProfile !== 'undefined') return ExamProfile.certLabel(goal.subject, goal.level);
    return certLbl(goal.subject, goal.level);
  }

  function deckFor(goal) {
    return (S.flashcards || []).filter((f) => f.sourceLang === goal.subject);
  }

  function dueFor(goal) {
    return deckFor(goal).filter(isDue);
  }

  function historyFor(goal) {
    return (S.history || []).filter((h) => h.lang === goal.subject && h.level === goal.level);
  }

  function readinessPct(goal) {
    const hist = historyFor(goal);
    if (!hist.length) return 0;
    const recent = hist.slice(0, 5);
    const avg = recent.reduce((s, h) => s + h.score, 0) / recent.length;
    const mastered = deckFor(goal).filter((f) => f.interval && f.interval > 7).length;
    const bonus = Math.min(15, mastered * 2);
    return Math.min(100, Math.round(avg * 0.85 + bonus));
  }

  function weakAreas(goal) {
    if (typeof AnalyticsStore !== 'undefined') {
      const grammar = AnalyticsStore.getWeakGrammarTags(goal, 3);
      if (grammar.length) return grammar;
    }
    const topicScores = {};
    historyFor(goal).forEach((h) => {
      if (h.tagStats?.grammarTags) {
        Object.entries(h.tagStats.grammarTags).forEach(([tag, s]) => {
          if (s.total >= 1) (topicScores[tag] = topicScores[tag] || []).push(Math.round((s.correct / s.total) * 100));
        });
        return;
      }
      if (!h.topic) return;
      (topicScores[h.topic] = topicScores[h.topic] || []).push(h.score);
    });
    const weak = Object.entries(topicScores)
      .map(([topic, scores]) => ({ topic, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
      .filter((x) => x.avg < 70)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3)
      .map((x) => x.topic);
    if (weak.length) return weak;
    const dueWords = dueFor(goal).slice(0, 3).map((f) => f.word);
    if (dueWords.length) return dueWords;
    return [];
  }

  function updateWorkspaceUrl(goal) {
    try {
      if (goal) history.replaceState(null, '', '#/workspace/' + slug(goal));
      else history.replaceState(null, '', '#/');
    } catch (_) {}
  }

  return {
    applyContext,
    clearContext,
    save,
    getActive,
    setActive,
    migrateFromLegacy,
    afterLoad,
    prepContext,
    ensureSlugs,
    slug,
    findBySlug,
    label,
    deckFor,
    dueFor,
    historyFor,
    readinessPct,
    weakAreas,
    updateWorkspaceUrl,
  };
})();

function syncGoalToProfile(goal) {
  GoalStore.applyContext(goal);
}
function saveGoals() {
  GoalStore.save();
}
function getActiveGoal() {
  return GoalStore.getActive();
}
function prepGoalContext(goal) {
  GoalStore.prepContext(goal);
}
function ensureGoalSlugs() {
  GoalStore.ensureSlugs();
}
function goalSlug(goal) {
  return GoalStore.slug(goal);
}
function findGoalBySlug(slug) {
  return GoalStore.findBySlug(slug);
}
function updateWorkspaceUrl(goal) {
  GoalStore.updateWorkspaceUrl(goal);
}
function goalLabel(goal) {
  return GoalStore.label(goal);
}
function deckForGoal(goal) {
  return GoalStore.deckFor(goal);
}
function dueForGoal(goal) {
  return GoalStore.dueFor(goal);
}
function historyForGoal(goal) {
  return GoalStore.historyFor(goal);
}
function getReadinessPctForGoal(goal) {
  return GoalStore.readinessPct(goal);
}
function getWeakAreasForGoal(goal) {
  return GoalStore.weakAreas(goal);
}

const _goalWizard = { subject: 'de', level: 'B2', examDate: '' };
let _showGoalWizard = false;
let _editingGoalId = null;

function daysUntilExam(examDate) {
  if (!examDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate + 'T00:00:00');
  return Math.ceil((exam - today) / 86400000);
}

function createGoal({ subject, level, examDate }) {
  if (S.goals.some((g) => g.subject === subject && g.level === level)) {
    lcToast('You already have a goal for ' + goalLabel({ subject, level }) + '.', 'warn');
    return null;
  }
  const goal = {
    id: 'goal_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    subject,
    level,
    examDate: examDate || null,
    createdAt: Date.now(),
  };
  S.goals.push(goal);
  GoalStore.applyContext(goal);
  ensureGoalSlugs();
  if (typeof syncDashboardGoalOrder === 'function') syncDashboardGoalOrder();
  saveGoals();
  _showGoalWizard = false;
  _editingGoalId = null;
  lcToast('Exam goal created: ' + goalLabel(goal), 'success');
  goHome();
  return goal;
}

function updateGoal(id, { subject, level, examDate }) {
  const goal = S.goals.find((g) => g.id === id);
  if (!goal) return null;
  if (S.goals.some((g) => g.id !== id && g.subject === subject && g.level === level)) {
    lcToast('You already have a goal for ' + goalLabel({ subject, level }) + '.', 'warn');
    return null;
  }
  goal.subject = subject;
  goal.level = level;
  goal.examDate = examDate || null;
  ensureGoalSlugs();
  if (S.activeGoalId === id) GoalStore.applyContext(goal);
  saveGoals();
  _showGoalWizard = false;
  _editingGoalId = null;
  renderHomeScreen();
  renderProfileBar();
  lcToast('Exam goal updated: ' + goalLabel(goal), 'success');
  return goal;
}

function deleteGoal(id) {
  const i = S.goals.findIndex((g) => g.id === id);
  if (i < 0) return;
  if (S.activeSession?.goalId === id) clearActiveSession();
  if (S._officialInProgress?.goalId === id) S._officialInProgress = null;
  S.goals.splice(i, 1);
  if (typeof syncDashboardGoalOrder === 'function') syncDashboardGoalOrder();
  if (S.activeGoalId === id) {
    if (S.goals[0]) GoalStore.applyContext(S.goals[0]);
    else GoalStore.clearContext();
  }
  saveGoals();
  updateWorkspaceUrl(null);
  goHome();
}

function confirmDeleteGoal(id) {
  const goal = S.goals.find((g) => g.id === id);
  if (!goal) return;
  if (!confirm('Remove ' + goalLabel(goal) + ' from your goals? Your saved vocabulary and exam history stay in your account.')) return;
  deleteGoal(id);
  lcToast('Goal removed', 'success');
}

function editGoal(id) {
  const goal = S.goals.find((g) => g.id === id);
  if (!goal) return;
  _editingGoalId = id;
  _goalWizard.subject = goal.subject;
  _goalWizard.level = goal.level;
  _goalWizard.examDate = goal.examDate || '';
  _showGoalWizard = true;
  renderHomeScreen();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openGoal(id) {
  const goal = GoalStore.setActive(id);
  if (!goal) return;
  openGoalWorkspace(id, 'exams');
}

function parseAppRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (raw.startsWith('workspace/')) {
    if (!gateAppRoute()) return true;
    const slug = decodeURIComponent(raw.slice('workspace/'.length).split('/')[0]);
    const goal = findGoalBySlug(slug);
    if (goal) {
      openGoalWorkspace(goal.id, normalizeWsTab(S.wsTab || 'exams'), true);
      return true;
    }
  }
  if (raw === '' || raw === 'dashboard') return false;
  return false;
}
