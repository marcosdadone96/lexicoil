// Personalized grammar drill from Progress weak production categories
function normalizeDrillAnswer(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/g, '');
}

function scoreGrammarDrill(exercises, answers) {
  const items = exercises || [];
  if (!items.length) return 0;
  let ok = 0;
  items.forEach((ex, i) => {
    const expected = normalizeDrillAnswer(ex.expected);
    const got = normalizeDrillAnswer(answers[i]);
    if (expected && got && (got === expected || got.includes(expected) || expected.includes(got))) ok++;
  });
  return Math.round((ok / items.length) * 100);
}

async function startGrammarDrill(category, goalId) {
  const goal = S.goals.find((g) => g.id === goalId) || (typeof getActiveGoal === 'function' ? getActiveGoal() : null);
  if (!goal) {
    lcToast('Select a goal first.', 'warn');
    return;
  }
  const cat = typeof GrammarCategories !== 'undefined' ? GrammarCategories.normalizeCategory(category) : String(category || 'other');
  const label =
    typeof GrammarCategories !== 'undefined' && GrammarCategories.categoryLabel
      ? GrammarCategories.categoryLabel(cat)
      : cat;
  const cost = typeof aiActionCost === 'function' ? aiActionCost('grammar_drill') : 2;
  if (typeof requireAiCredits === 'function' && !requireAiCredits('grammar_drill', { message: 'Grammar drill uses ' + cost + ' credits.' })) return;

  hideAll();
  show('loadingScreen');
  const lt = document.getElementById('loaderTitle');
  const ls = document.getElementById('loaderSub');
  if (lt) lt.textContent = 'Building grammar drill…';
  if (ls) ls.textContent = label + ' · ' + cost + ' credits';

  let exercises = [];
  try {
    if (typeof generateGrammarDrillWithAI !== 'function') throw new Error('Grammar drill unavailable');
    exercises = await generateGrammarDrillWithAI({
      lang: goal.subject || 'de',
      level: goal.level || 'B1',
      category: cat,
      examples:
        typeof AnalyticsStore !== 'undefined' && AnalyticsStore.getProductionGrammarOverview
          ? (AnalyticsStore.getProductionGrammarOverview(goal, 8).find((r) => r.category === cat)?.examples || [])
          : [],
    });
  } catch (e) {
    hideAll();
    if (typeof openMasteryForGoal === 'function') openMasteryForGoal(goal.id);
    if (e.code === 'ai_credits_exhausted' && typeof showAiCreditsExhausted === 'function') showAiCreditsExhausted();
    else lcToast('Could not start drill: ' + (e.message || 'error'), 'error', 7000);
    return;
  }

  hide('loadingScreen');
  S.grammarDrill = { category: cat, label, goalId: goal.id, exercises, answers: {} };
  renderGrammarDrillScreen();
  show('grammarScreen');
  if (typeof applyGrammarChrome === 'function') applyGrammarChrome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderGrammarDrillScreen() {
  const host = document.getElementById('grammarScreenContent');
  const d = S.grammarDrill;
  if (!host || !d) return;
  const cost = typeof aiActionCost === 'function' ? aiActionCost('grammar_drill') : 2;
  host.innerHTML =
    '<div class="ws-panel">' +
    '<p class="ws-seclbl">Grammar drill</p>' +
    '<h2 style="margin:0 0 8px;font-size:20px">' +
    esc(d.label) +
    '</h2>' +
    '<p class="exam-config-meta" style="margin:0 0 18px">Fix the sentences, then submit for a quick re-check (' +
    cost +
    ' credits already used for generation).</p>' +
    d.exercises
      .map(
        (ex, i) =>
          '<div class="grammar-drill-item" style="margin-bottom:16px">' +
          '<p style="font-size:13px;font-weight:600;margin:0 0 6px">' +
          (i + 1) +
          '. ' +
          esc(ex.prompt || ex.instruction || '') +
          '</p>' +
          (ex.context ? '<p style="font-size:12px;color:var(--text-muted);margin:0 0 8px">' + esc(ex.context) + '</p>' : '') +
          '<input type="text" class="admin-review-input grammar-drill-input" data-idx="' +
          i +
          '" placeholder="Your corrected sentence" style="width:100%">' +
          '</div>',
      )
      .join('') +
    '<button type="button" class="btn-start" onclick="submitGrammarDrill()" style="max-width:240px">Submit answers</button> ' +
    '<button type="button" class="btn-sm" onclick="openMasteryForGoal(\'' +
    esc(d.goalId) +
    '\')">← Back to progress</button>' +
    '<div id="grammarDrillResults" style="margin-top:18px"></div></div>';
}

function submitGrammarDrill() {
  const d = S.grammarDrill;
  if (!d?.exercises?.length) return;
  const inputs = document.querySelectorAll('.grammar-drill-input');
  const answers = [];
  inputs.forEach((inp) => {
    answers[Number(inp.dataset.idx)] = inp.value;
  });
  const score = scoreGrammarDrill(d.exercises, answers);
  const goal = S.goals.find((g) => g.id === d.goalId);
  if (goal && typeof AnalyticsStore !== 'undefined' && AnalyticsStore.recordGrammarDrillResult) {
    AnalyticsStore.recordGrammarDrillResult(goal, d.category, score);
  }
  const host = document.getElementById('grammarDrillResults');
  if (host) {
    host.innerHTML =
      '<div class="ve-results-panel" style="padding:16px">' +
      '<div class="ve-big ' +
      (score >= 70 ? 'pass' : score >= 50 ? 'mid' : 'fail') +
      '">' +
      score +
      '%</div>' +
      '<p class="exam-config-lede">' +
      (score >= 70
        ? 'Nice — this category was updated in your mastery profile.'
        : 'Keep practicing — your profile was updated with this attempt.') +
      '</p></div>';
  }
  inputs.forEach((inp) => {
    inp.disabled = true;
  });
}

window.startGrammarDrill = startGrammarDrill;
window.submitGrammarDrill = submitGrammarDrill;
