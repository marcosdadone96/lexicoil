#!/usr/bin/env node
import fs from 'fs';

const path = 'index.html';
let src = fs.readFileSync(path, 'utf8');

const removeFns = new Set([
  'saveGoals', 'syncGoalToProfile', 'prepGoalContext', 'ensureGoalSlugs', 'goalSlug', 'findGoalBySlug',
  'updateWorkspaceUrl', 'parseAppRoute', 'goalLabel', 'deckForGoal', 'dueForGoal', 'historyForGoal',
  'getReadinessPctForGoal', 'getWeakAreasForGoal', 'createGoal', 'updateGoal', 'deleteGoal',
  'confirmDeleteGoal', 'editGoal', 'getActiveGoal', 'openGoal', 'goalPrimaryMetric', 'daysUntilExam',
  'syncGoalToProfile',
  'defaultDashboardLayout', 'normalizeDashboardLayout', 'loadDashboardLayout', 'saveDashboardLayout',
  'dashLayout', 'orderedGoalIds', 'orderedGoals', 'syncDashboardGoalOrder', 'dashboardGoal',
  'openDashboardCustomize', 'closeDashboardCustomize', 'toggleDashWidget', 'moveDashListItem',
  'renderDashboardCustomizeModal', 'resetDashboardLayout', 'onGoalDragStart', 'onGoalDragEnd',
  'onGoalDragOver', 'onGoalDragLeave', 'onGoalDrop', 'selectDashboardGoal',
  'renderDashboardCoachHtml', 'renderDashboardKpiTile', 'renderDashboardKpisHtml',
  'renderDashboardWeakAreasHtml', 'renderDashboardActivityHtml', 'runDashboardReview',
  'dashQuickPersonalized', 'dashQuickFlashcards', 'dashQuickQuiz', 'renderDashboardQuickActionsHtml',
  'renderDashboardFootHtml', 'renderDashboardBottomHtml', 'renderDashboardBodyHtml',
  'showAddGoalWizard', 'cancelGoalWizard', 'selectWizSubject', 'selectWizLevel', 'submitGoalWizard',
  'renderGoalWizardHtml', 'renderGoalCardHtml', 'renderGoalCardsRow', 'renderHomeScreen',
  'normalizeWsTab', 'getScoreSeries', 'countNewWords', 'countMasteredWords', 'countDifficultWords',
  'renderWsTabsHtml', 'renderWsRecentActivityHtml', 'renderWsSkillBarsHtml', 'renderWsVocabKpisHtml',
  'renderWsVocabCategoriesHtml', 'wsGoalSubline', 'renderWsExamsHtml', 'renderGoalHistoryHtml',
  'renderWsSavedExams', 'wsOvTablerIcon', 'renderWsCoachBannerHtml',
  'startOverviewExam', 'renderGoalWorkspace', 'openGoalWorkspace', 'startQuickForGoal',
  'setWsTab', 'backToWorkspace', 'formatGoalExamDate', 'getSkillPerformance', 'getKpiDelta',
]);

function stripFunctions(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let skip = 0;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    if (skip > 0) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth <= 0) {
        skip = 0;
        depth = 0;
      }
      continue;
    }
    const m = lines[i].match(/^(?:async )?function (\w+)\s*\(/);
    if (m && removeFns.has(m[1])) {
      skip = 1;
      depth = 0;
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth <= 0) {
        skip = 0;
        depth = 0;
      }
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

src = stripFunctions(src);

// Remove moved const/let blocks
src = src.replace(
  /const DASH_WIDGET_DEFS=\[[\s\S]*?\];\r?\nconst DASH_KPI_DEFS=\[[\s\S]*?\];\r?\nlet _showDashCustomize=false;\r?\nlet _goalDragId=null;\r?\n/,
  '',
);
src = src.replace(
  /const _goalWizard=\{subject:'de',level:'B2',examDate:''\};\r?\nlet _showGoalWizard=false;\r?\nlet _editingGoalId=null;\r?\n/,
  '',
);

// Script tags before inline script
const scripts = `<script src="js/goalStore.js?v=1"></script>
<script src="js/dashboardLayout.js?v=1"></script>
<script src="js/dashboardUi.js?v=1"></script>
<script src="js/workspaceUi.js?v=1"></script>
`;
if (!src.includes('js/goalStore.js')) {
  src = src.replace('<script src="js/manualVocab.js?v=2"></script>', `<script src="js/manualVocab.js?v=2"></script>\n${scripts}`);
}

// Fix loadLS goals section
src = src.replace(
  /let migrated=false;\r?\n  if\(S\.goals\.length===0\)\{[\s\S]*?if\(migrated\)saveGoals\(\);\r?\n  ensureGoalSlugs\(\);/,
  `let migrated=GoalStore.migrateFromLegacy();
  if(migrated)GoalStore.save();`,
);
src = src.replace(
  /  try\{const g=localStorage\.getItem\('lc_goal'\);if\(g\)\{const o=JSON\.parse\(g\);if\(o\.subject\)S\.subject=o\.subject;if\(o\.level\)S\.level=o\.level;\}\}catch\(e\)\{\}\r?\n  if\(typeof ExamProfile!=='undefined'\)ExamProfile\.migrateFromGoal\(\);\r?\n  const activeGoal=S\.goals\.find\(g=>g\.id===S\.activeGoalId\);\r?\n  if\(activeGoal\)\{S\.subject=activeGoal\.subject;S\.level=activeGoal\.level;\}\r?\n  else\{\r?\n    const ap=typeof ExamProfile!=='undefined'\?ExamProfile\.getActive\(\):null;\r?\n    if\(ap\)\{S\.subject=ap\.subject;S\.level=ap\.level;\}\r?\n  \}/,
  `  if(typeof ExamProfile!=='undefined')ExamProfile.migrateFromGoal();
  GoalStore.afterLoad();`,
);

src = src.replace(/function saveGoals\(\)\{[\s\S]*?\}\r?\n/, '');

fs.writeFileSync(path, src);
console.log('Stripped Fase 5 duplicates from index.html');
