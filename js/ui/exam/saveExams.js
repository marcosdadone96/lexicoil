// ═══════════════════════════════════════════
// SAVE / LOAD EXAMS
// ═══════════════════════════════════════════
const AUTO_SAVE_CAP = 10;
const GLOBAL_SAVE_CAP = 50;

function savedExamTs(e) {
  return Date.parse(e?.savedAt) || Number(e?.id) || 0;
}

function isProtectedSavedStatus(st) {
  return st === 'in_progress' || st === 'completed' || st === 'aborted';
}

function applySavedExamsEviction() {
  if (!Array.isArray(S.savedExams)) return;
  const autos = S.savedExams
    .filter((e) => e.status === 'auto')
    .sort((a, b) => savedExamTs(a) - savedExamTs(b));
  if (autos.length > AUTO_SAVE_CAP) {
    const drop = new Set(autos.slice(0, autos.length - AUTO_SAVE_CAP).map((e) => e.id));
    S.savedExams = S.savedExams.filter((e) => !drop.has(e.id));
  }
  while (S.savedExams.length > GLOBAL_SAVE_CAP) {
    const autoCandidates = S.savedExams
      .filter((e) => e.status === 'auto')
      .sort((a, b) => savedExamTs(a) - savedExamTs(b));
    if (autoCandidates.length) {
      const idx = S.savedExams.findIndex((e) => e.id === autoCandidates[0].id);
      if (idx >= 0) {
        S.savedExams.splice(idx, 1);
        continue;
      }
    }
    const unprotected = S.savedExams
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !isProtectedSavedStatus(e.status))
      .sort((a, b) => savedExamTs(a.e) - savedExamTs(b.e));
    if (unprotected.length) {
      S.savedExams.splice(unprotected[0].i, 1);
    } else {
      break;
    }
  }
}

function promoteAutoSavedAtIndex(i, targetStatus) {
  const e = S.savedExams[i];
  if (!e || e.status !== 'auto') return false;
  S.savedExams[i] = { ...e, status: targetStatus || 'in_progress' };
  saveSaved();
  return true;
}

function saveCurrentExam(statusOverride, opts) {
  if (!S.examData) {
    if (!opts?.silent) lcToast('No exam loaded yet.', 'warn');
    return;
  }
  const id = S.examData._savedId || S.examData._flightId || Date.now();
  S.examData._savedId = id;
  const existing = S.savedExams.findIndex((e) => e.id === id);
  if (statusOverride === 'auto' && existing >= 0) {
    const prev = S.savedExams[existing].status;
    if (isProtectedSavedStatus(prev)) return;
  }
  const source =
    S.examSource ||
    (S.isDemo || S.examData?.demo
      ? 'demo'
      : S.examData?.poolSource
        ? 'pool'
        : S.examSource === 'library'
          ? 'library'
          : 'ai');
  let status =
    statusOverride ||
    (existing >= 0 && S.savedExams[existing].status === 'completed' ? 'completed' : 'in_progress');
  if (statusOverride !== 'auto' && existing >= 0 && S.savedExams[existing].status === 'auto') {
    status = statusOverride || 'in_progress';
  }
  const entry = {
    id,
    savedAt: new Date().toLocaleDateString(),
    topic: S.examData.topic || 'Unknown topic',
    level: S.examData.level,
    lang: S.examData.lang,
    mode: normalizeMode(S.mode),
    status,
    source,
    goalId: S.activeGoalId || S.examData.goalId || null,
    data: S.examData,
    answers: { ...S.answers },
    gapAnswers: { ...S.gapAnswers },
    fieldValues: captureExamFieldValues(),
    markedWords: (S.activeSession?.markedWords || []).map((m) => m.word),
  };
  if (existing >= 0) S.savedExams[existing] = { ...S.savedExams[existing], ...entry };
  else S.savedExams.unshift(entry);
  applySavedExamsEviction();
  saveSaved();
  if (typeof syncExamRouteUrl === 'function') syncExamRouteUrl();
  if (!opts?.silent) {
    document.querySelectorAll('[onclick="saveCurrentExam()"]').forEach((btn) => {
      const orig = btn.textContent;
      btn.textContent = '\u2713 Saved!';
      btn.style.color = 'var(--green)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 2000);
    });
  }
}

function autoSaveExam() {
  if (!S.examData) return;
  try {
    saveCurrentExam('auto', { silent: true });
  } catch (err) {
    if (typeof lcDebug !== 'undefined') lcDebug.warn('[autoSaveExam]', err);
  }
}

function pinSavedExam(i) {
  if (!promoteAutoSavedAtIndex(i, 'in_progress')) return;
  lcToast('Exam saved to your library.', 'success');
  const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
  if (goal && document.getElementById('wsSavedGrid')) renderWsSavedExams(goal);
}

function reviewSavedExam(i) {
  const e = S.savedExams[i];
  if (!e || !e.data) {
    lcToast('Exam data missing.', 'warn');
    return;
  }
  if (e.status === 'auto') promoteAutoSavedAtIndex(i, 'in_progress');
  S.subject = e.lang;
  S.level = e.level;
  S.mode = normalizeMode(e.mode || 'official');
  if (e.status === 'completed' && e.score != null && e.correction) {
    const isDE = e.lang === 'de';
    const marked = (e.markedWords || []).map((w) => (typeof w === 'string' ? { word: w } : { word: w.word || w }));
    renderResults(
      e.score,
      e.moduleScores || {},
      e.data,
      isDE,
      e.writeAns || '',
      e.speakAns || '',
      e.id,
      e.correction,
      e.speakingEvals || [],
      e.savedWords || [],
      marked,
    );
    return;
  }
  hideAll();
  show('resultsScreen');
  const scr = document.getElementById('resultsScreen');
  const st = S.savedExams[i]?.status || e.status;
  const stLbl =
    st === 'aborted' ? 'Exam aborted' : st === 'completed' ? 'Completed exam' : 'In progress';
  const isDE = e.lang === 'de';
  const ansN =
    Object.keys(e.answers || {}).length +
    Object.keys(e.gapAnswers || {}).filter((k) => e.gapAnswers[k]?.trim()).length;
  const markedN = (e.markedWords || []).length;
  scr.innerHTML = `${renderNavBackBtn('Exams')}
    <div class="results-hero"><div class="res-score mid">—</div><div class="res-label">${stLbl} — ${esc(e.level)} ${examFlag(e.lang)} ${esc(e.topic)}</div></div>
    <div class="results-detail"><p style="font-size:13px;font-weight:600;color:var(--text-secondary)">${st === 'aborted' ? 'This official exam was ended when you started a new one. It was not submitted.' : st === 'in_progress' ? 'This practice exam was saved before completion. Resume to continue or retake from scratch.' : 'Saved exam snapshot.'} ${ansN} answer${ansN === 1 ? '' : 's'} recorded${markedN ? `, ${markedN} word${markedN === 1 ? '' : 's'} marked` : ''}.</p></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:22px">
      ${st === 'in_progress' ? `<button class="btn-sm accent" onclick="retakeExam(${i},true)">Resume</button>` : ''}
      <button class="btn-sm blue" onclick="retakeExam(${i})">↺ Retake from start</button>
      <button class="btn-sm" onclick="backToWorkspace('exams')">Back to workspace</button>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function retakeExam(i, resume) {
  const e = S.savedExams[i];
  if (!e) return;
  if (e.status === 'auto') promoteAutoSavedAtIndex(i, 'in_progress');
  S.examData = e.data;
  S.examData._fromSaved = true;
  S.quickMod = null;
  S.subject = e.lang;
  S.level = e.level;
  S.mode = normalizeMode(e.mode || 'official');
  if (S.mode === 'practice') S.vocabLang = vocabLangFor(S.subject);
  if (e.goalId) {
    S.activeGoalId = e.goalId;
    const g = S.goals.find((x) => x.id === e.goalId);
    if (g) syncGoalToProfile(g);
  }
  const cur = S.savedExams[i];
  if (resume && cur?.status === 'in_progress') {
    S.answers = { ...(e.answers || {}) };
    S.gapAnswers = { ...(e.gapAnswers || {}) };
    S._resumeFieldValues = e.fieldValues;
    initExamSession(S.mode);
    if (S.activeSession) {
      S.activeSession.examData = e.data;
      S.activeSession.answers = S.answers;
      S.activeSession.gapAnswers = S.gapAnswers;
      S.activeSession.fieldValues = e.fieldValues;
    }
  } else {
    S.answers = {};
    S.gapAnswers = {};
    if (isOfficialMode()) abortOfficialInProgress();
    initExamSession(S.mode);
  }
  renderExam();
}

function deleteSaved(i) {
  if (!confirm('Remove this saved exam?')) return;
  const removed = S.savedExams[i];
  if (removed?.id) {
    if (!Array.isArray(S.deletedSavedExams)) S.deletedSavedExams = [];
    S.deletedSavedExams.push({ id: removed.id, deletedAt: Date.now() });
    try {
      localStorage.setItem('lc_saved_del', JSON.stringify(S.deletedSavedExams));
    } catch (_) {}
  }
  S.savedExams.splice(i, 1);
  saveSaved();
  const goal = getActiveGoal();
  if (goal && document.getElementById('wsSavedGrid')) renderWsSavedExams(goal);
}

window.autoSaveExam = autoSaveExam;
window.pinSavedExam = pinSavedExam;

// History UI now lives in the workspace Progress tab (renderGoalHistoryHtml in workspaceUi.js).
