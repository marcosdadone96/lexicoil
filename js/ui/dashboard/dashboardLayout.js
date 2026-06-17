/** Dashboard widget layout — persisted in lc_dashboard_layout */
const DASH_WIDGET_DEFS = [
  { id: 'coach', label: 'Study coach' },
  { id: 'kpis', label: 'Key metrics' },
  { id: 'weak', label: 'Weak areas' },
  { id: 'activity', label: 'Recent activity' },
  { id: 'quick', label: 'Quick actions' },
  { id: 'foot', label: 'Motivation footer' },
];
const DASH_KPI_DEFS = [
  { id: 'words', label: 'Words saved' },
  { id: 'practice', label: 'Practice exams' },
  { id: 'streak', label: 'Study streak' },
  { id: 'time', label: 'Time studied' },
];
let _showDashCustomize = false;
let _goalDragId = null;

function defaultDashboardLayout() {
  return {
    widgets: { coach: true, kpis: true, weak: true, activity: true, quick: true, foot: true },
    sectionOrder: ['coach', 'kpis', 'bottom', 'foot'],
    bottomOrder: ['weak', 'activity', 'quick'],
    kpiOrder: ['words', 'practice', 'streak', 'time'],
    goalOrder: [],
  };
}
function normalizeDashboardLayout(raw) {
  const d = defaultDashboardLayout();
  if (!raw || typeof raw !== 'object') return d;
  const w = raw.widgets && typeof raw.widgets === 'object' ? raw.widgets : {};
  DASH_WIDGET_DEFS.forEach((x) => {
    if (typeof w[x.id] === 'boolean') d.widgets[x.id] = w[x.id];
  });
  if (Array.isArray(raw.sectionOrder)) {
    d.sectionOrder = raw.sectionOrder.filter((id) => id === 'coach' || id === 'kpis' || id === 'bottom' || id === 'foot');
    ['coach', 'kpis', 'bottom', 'foot'].forEach((id) => {
      if (!d.sectionOrder.includes(id)) d.sectionOrder.push(id);
    });
  }
  if (Array.isArray(raw.bottomOrder)) {
    d.bottomOrder = raw.bottomOrder.filter((id) => id === 'weak' || id === 'activity' || id === 'quick');
    ['weak', 'activity', 'quick'].forEach((id) => {
      if (!d.bottomOrder.includes(id)) d.bottomOrder.push(id);
    });
  }
  if (Array.isArray(raw.kpiOrder)) {
    d.kpiOrder = raw.kpiOrder.filter((id) => DASH_KPI_DEFS.some((k) => k.id === id));
    DASH_KPI_DEFS.forEach((k) => {
      if (!d.kpiOrder.includes(k.id)) d.kpiOrder.push(k.id);
    });
  }
  d.goalOrder = Array.isArray(raw.goalOrder) ? raw.goalOrder.map(String) : [];
  return d;
}
function loadDashboardLayout() {
  try {
    const raw = localStorage.getItem('lc_dashboard_layout');
    if (raw) return normalizeDashboardLayout(JSON.parse(raw));
  } catch (_) {}
  return defaultDashboardLayout();
}
function saveDashboardLayout(layout) {
  S.dashboardLayout = normalizeDashboardLayout(layout);
  localStorage.setItem('lc_dashboard_layout', JSON.stringify(S.dashboardLayout));
}
function dashLayout() {
  return S.dashboardLayout || defaultDashboardLayout();
}
function orderedGoalIds() {
  const ids = S.goals.map((g) => g.id);
  const order = (dashLayout().goalOrder || []).filter((id) => ids.includes(id));
  ids.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  return order;
}
function orderedGoals() {
  return orderedGoalIds().map((id) => S.goals.find((g) => g.id === id)).filter(Boolean);
}
function syncDashboardGoalOrder() {
  const L = dashLayout();
  const ids = S.goals.map((g) => g.id);
  L.goalOrder = orderedGoalIds().filter((id) => ids.includes(id));
  ids.forEach((id) => {
    if (!L.goalOrder.includes(id)) L.goalOrder.push(id);
  });
  saveDashboardLayout(L);
}
function dashboardGoal() {
  if (!S.goals.length) return null;
  if (S.goals.length === 1) return S.goals[0];
  return S.goals.find((g) => g.id === S.activeGoalId) || orderedGoals()[0] || S.goals[0];
}
