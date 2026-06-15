/** Exam Profile — certification-scoped preparation context (client-side). */
const ExamProfile = (() => {
  const PROFILES_KEY = 'lc_profiles';
  const ACTIVE_KEY = 'lc_active_profile';

  function certLabel(subject, level) {
    if (typeof SubjectMeta !== 'undefined') return SubjectMeta.certLabel(subject, level);
    if (subject === 'de') return `Goethe ${level}`;
    if (subject === 'es') return `DELE ${level}`;
    return `Cambridge ${level}`;
  }

  function profileId(subject, level) {
    return `${subject}_${level}`;
  }

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      /* ignore */
    }
    return [];
  }

  function saveProfiles(list) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  }

  function migrateFromGoal() {
    if (loadProfiles().length) return;
    try {
      const g = localStorage.getItem('lc_goal');
      if (!g) return;
      const o = JSON.parse(g);
      if (o.subject && o.level) createProfile(o.subject, o.level, false);
    } catch (_) {
      /* ignore */
    }
  }

  function getActiveId() {
    return localStorage.getItem(ACTIVE_KEY) || '';
  }

  function getActive() {
    migrateFromGoal();
    const id = getActiveId();
    if (!id) return null;
    return loadProfiles().find((p) => p.id === id) || null;
  }

  function getProfiles() {
    migrateFromGoal();
    return loadProfiles();
  }

  function createProfile(subject, level, setActive = true) {
    const id = profileId(subject, level);
    const list = loadProfiles();
    let p = list.find((x) => x.id === id);
    if (!p) {
      p = {
        id,
        subject,
        level,
        label: certLabel(subject, level),
        createdAt: Date.now(),
      };
      list.push(p);
      saveProfiles(list);
    }
    if (setActive) setActiveProfile(id);
    return p;
  }

  function setActiveProfile(id) {
    localStorage.setItem(ACTIVE_KEY, id);
    try {
      const p = loadProfiles().find((x) => x.id === id);
      if (p) {
        localStorage.setItem('lc_goal', JSON.stringify({ subject: p.subject, level: p.level }));
        if (typeof S !== 'undefined') {
          S.subject = p.subject;
          S.level = p.level;
        }
      }
    } catch (_) {
      /* ignore */
    }
    if (typeof renderProfileBar === 'function') renderProfileBar();
    if (typeof renderCoachDashboard === 'function') renderCoachDashboard();
  }

  function getActiveLabel() {
    const p = getActive();
    return p ? p.label : 'Choose your exam';
  }

  function matchesActive(item) {
    const p = getActive();
    if (!p) return true;
    if (!item || !item.profileId) return true;
    return item.profileId === p.id;
  }

  function filterList(items) {
    const p = getActive();
    if (!p) return items || [];
    return (items || []).filter((i) => matchesActive(i));
  }

  function tagItem(item) {
    const p = getActive();
    if (p && item) item.profileId = p.id;
    return item;
  }

  function needsOnboarding() {
    return !getActiveId() && typeof Auth !== 'undefined' && Auth.isGuest && !Auth.isGuest();
  }

  function getMasterySummaryForGoal(goal) {
    if (!goal) return null;
    if (typeof GoalStore !== 'undefined' && GoalStore.masterySummary) return GoalStore.masterySummary(goal);
    if (typeof AnalyticsStore !== 'undefined') return AnalyticsStore.getMasterySummary(goal);
    return null;
  }

  return {
    certLabel,
    profileId,
    getProfiles,
    getActive,
    getActiveId,
    getActiveLabel,
    createProfile,
    setActiveProfile,
    filterList,
    tagItem,
    matchesActive,
    needsOnboarding,
    migrateFromGoal,
    getMasterySummaryForGoal,
  };
})();
