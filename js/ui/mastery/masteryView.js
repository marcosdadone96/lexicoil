/** Mastery UI + recommended exam loop (Phase 6) — ≤2 clicks to exam or mastery detail */
const MasteryView = (() => {
  const WEAK_RATIO_LABEL = '70% weakness · 30% mixed';

  function formatTagLabel(tag) {
    if (!tag) return '';
    const tail = String(tag)
      .replace(/^g-[^-]+-[^-]+-/, '')
      .replace(/^t-[^-]+-[^-]+-/, '');
    return tail.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function moduleLabel(mod, subject) {
    const isDE = subject === 'de';
    const map = {
      lesen: isDE ? 'Leseverstehen' : 'Reading',
      horen: isDE ? 'Hörverstehen' : 'Listening',
      schreiben: isDE ? 'Schreiben' : 'Writing',
      sprechen: isDE ? 'Sprechen' : 'Speaking',
      reading: 'Reading',
      listening: 'Listening',
      writing: 'Writing',
      speaking: 'Speaking',
      grammatik: isDE ? 'Grammatik' : 'Grammar',
      grammar: 'Grammar',
      use_of_english: 'Use of English',
    };
    return map[mod] || mod;
  }

  function moduleIcon(mod) {
    const icons = {
      lesen: '📖',
      horen: '🎧',
      schreiben: '✍',
      sprechen: '🎤',
      reading: '📖',
      listening: '🎧',
      writing: '✍',
      speaking: '🎤',
      grammatik: '✏',
      grammar: '✏',
      use_of_english: '🔤',
    };
    return icons[mod] || '📊';
  }

  function masteryColor(mastery) {
    if (mastery === 'solid') return 'var(--green)';
    if (mastery === 'developing') return 'var(--amber)';
    if (mastery === 'weak') return 'var(--red)';
    return 'var(--text-muted)';
  }

  function analyticsStore() {
    if (typeof AnalyticsStore !== 'undefined') return AnalyticsStore;
    const g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : null;
    if (g?.AnalyticsStore) return g.AnalyticsStore;
    return null;
  }

  function summaryFor(goal) {
    if (typeof getMasterySummaryForGoal === 'function') return getMasterySummaryForGoal(goal);
    if (typeof GoalStore !== 'undefined' && GoalStore.masterySummary) return GoalStore.masterySummary(goal);
    const store = analyticsStore();
    if (store && goal) return store.getMasterySummary(goal);
    return null;
  }

  function libraryReady(goal) {
    if (!goal) return false;
    const hasLib = typeof QuestionLibrary !== 'undefined' && QuestionLibrary.hasLibrary(goal.subject, goal.level);
    const servible = typeof isLevelServable === 'function' && isLevelServable(goal.subject, goal.level);
    return !!(hasLib || servible);
  }

  function canRunWeaknessExam(goal) {
    if (!goal || !libraryReady(goal)) return false;
    const store = analyticsStore();
    if (!store) return false;
    return store.getWeakGrammarTags(goal, 1).length > 0 || store.getWeakTopicTags(goal, 1).length > 0;
  }

  function weakTagLabels(goal, limit = 3) {
    const summary = summaryFor(goal);
    if (!summary) return [];
    const rows = [...(summary.weakGrammar || []), ...(summary.weakTopics || [])].slice(0, limit);
    return rows.map((r) => formatTagLabel(r.tag));
  }

  function getRecommendedExam(goal) {
    if (!goal) {
      return {
        kind: 'setup',
        title: 'Set your first exam goal',
        desc: 'Choose the certification you are preparing for.',
        cta: 'Add goal →',
        badges: [],
        oneClick: true,
        run: () => showAddGoalWizard(),
      };
    }

    const fc = typeof deckForGoal === 'function' ? deckForGoal(goal) : [];
    const hist = typeof historyForGoal === 'function' ? historyForGoal(goal) : [];
    const due = typeof dueForGoal === 'function' ? dueForGoal(goal).length : 0;

    if (due >= 3) {
      return {
        kind: 'flashcards',
        title: 'Review due flashcards',
        desc: due + ' words need review before your next exam.',
        cta: 'Review now →',
        badges: [],
        oneClick: true,
        run: () => {
          prepGoalContext(goal);
          openDeckHub(goal.id);
          if (typeof setFcTab === 'function') setFcTab('due');
        },
      };
    }

    if (canRunWeaknessExam(goal)) {
      const tags = weakTagLabels(goal, 3);
      const focus = tags.length ? tags.join(', ') : 'your weak areas';
      return {
        kind: 'weakness',
        title: 'Recommended weakness exam',
        desc: WEAK_RATIO_LABEL + ' · focused on ' + focus + ' · from library, no AI',
        cta: 'Start weakness exam →',
        badges: [WEAK_RATIO_LABEL, 'Library'],
        tags,
        oneClick: true,
        run: () => {
          prepGoalContext(goal);
          generateWeaknessExam(goal.id);
        },
      };
    }

    if (fc.length >= 5) {
      return {
        kind: 'personal',
        title: 'Personalized vocab exam',
        desc: 'Built from ' + fc.length + ' words in your deck.',
        cta: 'Configure exam →',
        badges: ['Your words'],
        oneClick: false,
        run: () => {
          prepGoalContext(goal);
          openExamConfigurator(goal.id);
        },
      };
    }

    if (!hist.length) {
      return {
        kind: 'first',
        title: 'Take your first mock exam',
        desc: 'Start with a realistic ' + goalLabel(goal) + ' practice test.',
        cta: 'Start now →',
        badges: [],
        oneClick: true,
        run: () => {
          prepGoalContext(goal);
          launchGoalExam('official', { goalId: goal.id });
        },
      };
    }

    const last = hist[0];
    if (last.score < 70) {
      return {
        kind: 'retry',
        title: 'Practice your weak areas',
        desc: 'Last score: ' + last.score + '% on ' + (last.topic || 'your last exam') + '.',
        cta: 'Practice again →',
        badges: [],
        oneClick: true,
        run: () => {
          prepGoalContext(goal);
          launchGoalExam('practice', { goalId: goal.id });
        },
      };
    }

    return {
      kind: 'mock',
      title: 'Take a mock exam',
      desc: 'Keep your momentum — you are improving steadily.',
      cta: 'Start exam →',
      badges: [],
      oneClick: true,
      run: () => {
        prepGoalContext(goal);
        launchGoalExam('official', { goalId: goal.id });
      },
    };
  }

  function renderTagChip(label) {
    return '<span class="mastery-tag-chip">' + esc(label) + '</span>';
  }

  function renderBarRow(label, pct, mastery, extra) {
    const col = mastery ? masteryColor(mastery) : pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--brand)' : 'var(--red)';
    return (
      '<div class="mastery-bar-row">' +
      '<div class="mastery-bar-top"><span>' +
      esc(label) +
      '</span><span style="color:' +
      col +
      '">' +
      pct +
      '%' +
      (mastery ? ' · ' + esc(mastery) : '') +
      (extra || '') +
      '</span></div>' +
      '<div class="dash-bar"><i style="width:' +
      pct +
      '%;background:' +
      col +
      '"></i></div></div>'
    );
  }

  function renderWeakAreasSnippetHtml(goal, opts) {
    opts = opts || {};
    const summary = summaryFor(goal);
    const gid = esc(goal.id);
    let body = '';
    if (summary?.weakGrammar?.length || summary?.weakTopics?.length) {
      const rows = [...(summary.weakGrammar || []), ...(summary.weakTopics || [])].slice(0, opts.limit || 4);
      body = rows
        .map(
          (r) =>
            '<button type="button" class="mastery-weak-row" onclick="openMasteryForGoal(\'' +
            gid +
            '\')">' +
            renderBarRow(formatTagLabel(r.tag), r.accuracy, r.mastery) +
            '</button>',
        )
        .join('');
    } else {
      const skills = typeof getSkillPerformance === 'function' ? getSkillPerformance(goal) : [];
      if (skills.length) {
        body = skills
          .slice(0, opts.limit || 4)
          .map(
            (s) =>
              '<div class="mastery-weak-row">' +
              renderBarRow(s.icon + ' ' + s.label, s.pct, s.mastery) +
              '</div>',
          )
          .join('');
      } else {
        const areas = typeof getWeakAreasForGoal === 'function' ? getWeakAreasForGoal(goal) : [];
        if (areas.length) {
          body = areas
            .slice(0, opts.limit || 4)
            .map((a) => '<div class="mastery-weak-row">' + renderBarRow(formatTagLabel(a), 45, 'weak') + '</div>')
            .join('');
        } else {
          body =
            '<p style="font-size:12px;font-weight:600;color:var(--text-muted);margin:0">Complete a practice exam to identify weak areas.</p>';
        }
      }
    }
    const examsNote = summary?.examsTaken
      ? '<p class="mastery-meta">Based on ' +
        summary.examsTaken +
        ' tracked exam' +
        (summary.examsTaken === 1 ? '' : 's') +
        '.</p>'
      : '';
    const practiceBtn = canRunWeaknessExam(goal)
      ? '<button type="button" class="dash-panel-link" onclick="startRecommendedExam(\'' +
        gid +
        '\')">Start recommended exam →</button>'
      : '';
    return body + examsNote + practiceBtn;
  }

  function renderRecommendedExamCardHtml(goal, opts) {
    opts = opts || {};
    const rec = getRecommendedExam(goal);
    const gid = esc(goal.id);
    const compact = opts.compact ? ' rec-exam-card--compact' : '';
    const variant = opts.variant === 'workspace' ? ' rec-exam-card--ws' : '';
    const badges = (rec.badges || [])
      .map((b) => '<span class="rec-exam-badge">' + esc(b) + '</span>')
      .join('');
    const tags = (rec.tags || []).map(renderTagChip).join('');
    const art =
      opts.showArt !== false
        ? '<div class="rec-exam-art" aria-hidden="true"><svg width="120" height="90" viewBox="0 0 120 90" fill="none"><circle cx="78" cy="45" r="34" stroke="var(--brand)" stroke-width="2" opacity=".25"/><circle cx="78" cy="45" r="22" stroke="var(--brand)" stroke-width="2" opacity=".45"/><circle cx="78" cy="45" r="10" fill="var(--brand)"/><path d="M14 70 L74 47" stroke="var(--accent2,var(--brand))" stroke-width="3" stroke-linecap="round"/><path d="M70 41 l10 6 -4 -11z" fill="var(--accent2,var(--brand))"/></svg></div>'
        : '';
    return (
      '<div class="rec-exam-card' +
      compact +
      variant +
      '">' +
      '<div class="rec-exam-main">' +
      '<div class="dash-eyebrow">Recommended exam · ' +
      esc(goalLabel(goal)) +
      '</div>' +
      '<h2>' +
      esc(rec.title) +
      '</h2>' +
      '<p>' +
      esc(rec.desc) +
      '</p>' +
      (badges ? '<div class="rec-exam-badges">' + badges + '</div>' : '') +
      (tags ? '<div class="rec-exam-tags">' + tags + '</div>' : '') +
      '<div class="rec-exam-actions">' +
      '<button type="button" class="btn-sm accent" onclick="startRecommendedExam(\'' +
      gid +
      '\')">' +
      esc(rec.cta) +
      '</button>' +
      '<button type="button" class="btn-sm rec-exam-secondary" onclick="openMasteryForGoal(\'' +
      gid +
      '\')">View mastery →</button>' +
      '</div></div>' +
      art +
      '</div>'
    );
  }

  function renderMasteryPanelHtml(goal) {
    const summary = summaryFor(goal);
    const gid = esc(goal.id);
    const rec = getRecommendedExam(goal);
    if (!summary?.hasData) {
      return (
        '<div class="mastery-panel ws-panel">' +
        '<p class="ws-seclbl" style="margin:0 0 8px">Mastery</p>' +
        '<p style="font-size:13px;font-weight:600;color:var(--text-muted);margin:0 0 14px">Complete a practice exam to unlock grammar and skill tracking.</p>' +
        '<button type="button" class="btn-sm accent" onclick="startRecommendedExam(\'' +
        gid +
        '\')">' +
        esc(rec.cta) +
        '</button></div>'
      );
    }

    let modulesHtml = '';
    if (summary.modulePerformance?.length) {
      modulesHtml =
        '<p class="mastery-seclbl">Skills</p>' +
        summary.modulePerformance
          .map((m) =>
            renderBarRow(
              moduleIcon(m.module) + ' ' + moduleLabel(m.module, goal.subject),
              m.accuracy,
              m.mastery,
              ' · ' + m.total + ' q',
            ),
          )
          .join('');
    }

    let grammarHtml = '';
    if (summary.grammarOverview?.length) {
      grammarHtml =
        '<p class="mastery-seclbl">Grammar tags</p>' +
        summary.grammarOverview
          .map((r) => renderBarRow(formatTagLabel(r.tag), r.accuracy, r.mastery, ' · ' + r.total + ' q'))
          .join('');
    }

    let topicsHtml = '';
    if (summary.weakTopics?.length) {
      topicsHtml =
        '<p class="mastery-seclbl">Weak topics</p>' +
        summary.weakTopics
          .map((r) => renderBarRow(formatTagLabel(r.tag), r.accuracy, r.mastery))
          .join('');
    }

    let gapsHtml = '';
    if (summary.vocabularyGaps?.length) {
      gapsHtml =
        '<p class="mastery-seclbl">Vocabulary gaps</p><ul class="mastery-gap-list">' +
        summary.vocabularyGaps
          .map((g) => '<li><strong>' + esc(g.word) + '</strong> · missed ' + g.count + '×</li>')
          .join('') +
        '</ul>';
    }

    return (
      '<div id="masteryPanel" class="mastery-panel ws-panel">' +
      '<div class="mastery-panel-head">' +
      '<div><p class="ws-seclbl" style="margin:0 0 4px">Mastery breakdown</p>' +
      '<p class="mastery-meta">' +
      summary.examsTaken +
      ' exam' +
      (summary.examsTaken === 1 ? '' : 's') +
      ' tracked</p></div>' +
      '<button type="button" class="btn-sm accent" onclick="startRecommendedExam(\'' +
      gid +
      '\')">' +
      esc(rec.cta) +
      '</button></div>' +
      modulesHtml +
      grammarHtml +
      topicsHtml +
      gapsHtml +
      '</div>'
    );
  }

  function openMasteryForGoal(goalId) {
    const goal = S.goals.find((g) => g.id === goalId);
    if (!goal) return;
    prepGoalContext(goal);
    openGoalWorkspace(goal.id, 'progress');
    requestAnimationFrame(() => {
      document.getElementById('masteryPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function startRecommendedExam(goalId) {
    const goal = S.goals.find((g) => g.id === goalId) || (typeof getActiveGoal === 'function' ? getActiveGoal() : null);
    if (!goal) return;
    const rec = getRecommendedExam(goal);
    prepGoalContext(goal);
    if (typeof _coachAction !== 'undefined') _coachAction = rec.run;
    rec.run();
  }

  return {
    formatTagLabel,
    moduleLabel,
    moduleIcon,
    masteryColor,
    summaryFor,
    libraryReady,
    canRunWeaknessExam,
    weakTagLabels,
    getRecommendedExam,
    renderWeakAreasSnippetHtml,
    renderRecommendedExamCardHtml,
    renderMasteryPanelHtml,
    openMasteryForGoal,
    startRecommendedExam,
    WEAK_RATIO_LABEL,
  };
})();

function openMasteryForGoal(goalId) {
  MasteryView.openMasteryForGoal(goalId);
}
function startRecommendedExam(goalId) {
  MasteryView.startRecommendedExam(goalId);
}

if (typeof window !== 'undefined') window.MasteryView = MasteryView;
if (typeof module !== 'undefined') module.exports = MasteryView;
