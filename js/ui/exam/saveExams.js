// ═══════════════════════════════════════════
// SAVE / LOAD EXAMS
// ═══════════════════════════════════════════
const AUTO_SAVE_CAP = 10;
const GLOBAL_SAVE_CAP = 50;
let _savedExamSelection = new Set();

function savedExamTs(e) {
  return Number(e?.updatedAt) || Date.parse(e?.savedAtIso) || Date.parse(e?.savedAt) || Number(e?.id) || 0;
}

function savedExamStatusRank(st) {
  if (st === 'completed') return 4;
  if (st === 'in_progress') return 3;
  if (st === 'aborted') return 2;
  if (st === 'auto') return 1;
  return 0;
}

function savedExamGoalMatch(e, goalId) {
  if (!goalId) return true;
  if (e.goalId === goalId) return true;
  if (!e.goalId && typeof S !== 'undefined') {
    const goal = (S.goals || []).find((g) => g.id === goalId);
    if (goal && e.lang === goal.subject && e.level === goal.level) return true;
  }
  return false;
}

/** Stable key for the same catalog exam (published / pool) within a goal + mode. */
function getExamContentKey(examData, goalId, mode) {
  if (!examData) return null;
  const gid = goalId || examData.goalId || '';
  const m = normalizeMode(mode || (typeof S !== 'undefined' ? S.mode : null) || examData.mode || 'practice');
  const catalogId =
    examData.examId ||
    examData.poolId ||
    (examData.publishedExam && examData.id ? examData.id : null) ||
    null;
  if (catalogId) {
    return [examData.lang || examData.subject, examData.level, catalogId, gid, m].join('|');
  }
  if (examData.demo) {
    return ['demo', examData.lang, examData.level, examData.topic || '', gid, m].join('|');
  }
  return null;
}

function resolveSavedExamIdentity(examData, goalId, mode) {
  const contentKey = getExamContentKey(examData, goalId, mode);
  if (!contentKey) {
    const id = examData._savedId || examData._flightId || Date.now();
    return { id, contentKey: null };
  }
  const existing = (S.savedExams || []).find(
    (e) => e.contentKey === contentKey && savedExamGoalMatch(e, goalId || examData.goalId),
  );
  const id = existing?.id || examData._savedId || `ck:${contentKey}`;
  return { id, contentKey };
}

function assignSavedExamIdentity(examData, goalId, mode) {
  if (!examData) return;
  const { id, contentKey } = resolveSavedExamIdentity(
    examData,
    goalId || (typeof S !== 'undefined' ? S.activeGoalId : null),
    mode || (typeof S !== 'undefined' ? S.mode : null),
  );
  examData._savedId = id;
  if (contentKey) {
    examData._contentKey = contentKey;
    delete examData._flightId;
  } else if (!examData._savedId && !examData._flightId) {
    examData._flightId = Date.now();
    examData._savedId = examData._flightId;
  }
}

function findSavedExamIndex(examData, goalId, mode, preferredId) {
  if (preferredId != null) {
    const byId = S.savedExams.findIndex((e) => String(e.id) === String(preferredId));
    if (byId >= 0) return byId;
  }
  const contentKey = getExamContentKey(examData, goalId, mode);
  if (!contentKey) return -1;
  return S.savedExams.findIndex(
    (e) => e.contentKey === contentKey && savedExamGoalMatch(e, goalId || examData?.goalId),
  );
}

function mergeSavedExamEntries(keep, drop) {
  const winner = savedExamStatusRank(keep.status) >= savedExamStatusRank(drop.status) ? keep : drop;
  const loser = winner === keep ? drop : keep;
  return {
    ...loser,
    ...winner,
    id: winner.id,
    contentKey: winner.contentKey || loser.contentKey || getExamContentKey(winner.data, winner.goalId, winner.mode),
    score: winner.score != null ? winner.score : loser.score,
    updatedAt: Math.max(savedExamTs(winner), savedExamTs(loser)),
  };
}

function dedupeSavedExamsByContentKey() {
  if (!Array.isArray(S.savedExams) || !S.savedExams.length) return;
  const keyed = new Map();
  const rest = [];
  for (const e of S.savedExams) {
    const key = e.contentKey || getExamContentKey(e.data, e.goalId, e.mode);
    if (!key) {
      rest.push(e);
      continue;
    }
    e.contentKey = key;
    const mapKey = `${key}::${e.goalId || ''}`;
    if (keyed.has(mapKey)) {
      keyed.set(mapKey, mergeSavedExamEntries(keyed.get(mapKey), e));
    } else {
      keyed.set(mapKey, e);
    }
  }
  S.savedExams = [...keyed.values(), ...rest].sort((a, b) => savedExamTs(b) - savedExamTs(a));
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
  assignSavedExamIdentity(S.examData, S.activeGoalId, S.mode);
  const { id, contentKey } = resolveSavedExamIdentity(S.examData, S.activeGoalId, S.mode);
  S.examData._savedId = id;
  if (contentKey) S.examData._contentKey = contentKey;
  if (S.activeGoalId) S.examData.goalId = S.activeGoalId;
  const existing = findSavedExamIndex(S.examData, S.activeGoalId, S.mode, id);
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
    contentKey: contentKey || S.examData._contentKey || null,
    savedAt: new Date().toLocaleDateString(),
    savedAtIso: new Date().toISOString(),
    updatedAt: Date.now(),
    topic: S.examData.topic || 'Unknown topic',
    level: S.examData.level,
    lang: S.examData.lang,
    mode: normalizeMode(S.mode),
    status,
    source,
    goalId: S.activeGoalId || S.examData?.goalId || null,
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
    const passPercent = typeof ModuleGrading !== 'undefined'
      ? ModuleGrading.getPassPercent(null, e)
      : e.passPercentPerModule || 60;
    const moduleResults = typeof ModuleGrading !== 'undefined'
      ? ModuleGrading.normalizeModuleResults(e, passPercent)
      : e.moduleResults || {};
    const summary = typeof ModuleGrading !== 'undefined'
      ? ModuleGrading.summarizeExam(moduleResults, {
        modular: !!e.modularGrading,
        passPercent,
      })
      : null;
    renderResults(
      e.score,
      moduleResults,
      e.data,
      isDE,
      e.writeAns || '',
      e.speakAns || '',
      e.id,
      e.correction,
      e.speakingEvals || [],
      e.savedWords || [],
      marked,
      e,
      summary,
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
  S.examData._savedId = e.id;
  if (e.contentKey) S.examData._contentKey = e.contentKey;
  S.examData._fromSaved = true;
  S.quickMod = null;
  S.subject = e.lang;
  S.level = e.level;
  S.mode = normalizeMode(e.mode || 'official');
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
      S.activeSession.examSavedId = e.id;
      S.activeSession.answers = S.answers;
      S.activeSession.gapAnswers = S.gapAnswers;
      S.activeSession.fieldValues = e.fieldValues;
      saveActiveSession();
    }
  } else {
    S.answers = {};
    S.gapAnswers = {};
    if (isOfficialMode()) abortOfficialInProgress();
    initExamSession(S.mode);
  }
  renderExam();
}

function recordDeletedSavedExam(removed) {
  if (!removed?.id) return;
  if (!Array.isArray(S.deletedSavedExams)) S.deletedSavedExams = [];
  S.deletedSavedExams.push({ id: removed.id, deletedAt: Date.now() });
  try {
    localStorage.setItem('lc_saved_del', JSON.stringify(S.deletedSavedExams));
  } catch (_) {}
}

function deleteSaved(i) {
  if (!confirm('Remove this saved exam?')) return;
  const removed = S.savedExams[i];
  recordDeletedSavedExam(removed);
  if (removed?.id) _savedExamSelection.delete(String(removed.id));
  S.savedExams.splice(i, 1);
  saveSaved();
  const goal = getActiveGoal();
  if (goal && document.getElementById('wsSavedGrid')) renderWsSavedExams(goal);
}

function deleteSavedById(id) {
  const i = S.savedExams.findIndex((e) => String(e.id) === String(id));
  if (i >= 0) deleteSaved(i);
}

function setSavedExamArchived(id, archived) {
  const i = S.savedExams.findIndex((e) => String(e.id) === String(id));
  if (i < 0) return;
  S.savedExams[i] = { ...S.savedExams[i], archived: !!archived, updatedAt: Date.now() };
  saveSaved();
  const goal = typeof getActiveGoal === 'function' ? getActiveGoal() : null;
  if (goal && document.getElementById('wsSavedGrid')) renderWsSavedExams(goal);
}

function archiveSavedExam(id) {
  setSavedExamArchived(id, true);
  _savedExamSelection.delete(String(id));
}

function archiveSavedExamAt(i) {
  const e = S.savedExams[i];
  if (e) archiveSavedExam(e.id);
}

function unarchiveSavedExamAt(i) {
  const e = S.savedExams[i];
  if (e) unarchiveSavedExam(e.id);
}

function unarchiveSavedExam(id) {
  setSavedExamArchived(id, false);
}

function toggleSavedExamSelect(id, checked) {
  const key = String(id);
  if (checked) _savedExamSelection.add(key);
  else _savedExamSelection.delete(key);
}

function toggleSavedExamSelectAt(i, checked) {
  const e = S.savedExams[i];
  if (e) toggleSavedExamSelect(e.id, checked);
}

function isSavedExamSelected(id) {
  return _savedExamSelection.has(String(id));
}

function clearSavedExamSelection() {
  _savedExamSelection.clear();
}

function getSavedExamsForGoal(goal) {
  return (S.savedExams || []).filter((e) => {
    if (e.lang !== goal.subject || e.level !== goal.level) return false;
    if (e.goalId && e.goalId !== goal.id) return false;
    return true;
  });
}

function deleteSelectedSavedExams(goalId) {
  const goal = (S.goals || []).find((g) => g.id === goalId) || (typeof getActiveGoal === 'function' ? getActiveGoal() : null);
  if (!goal || !_savedExamSelection.size) return;
  if (!confirm(`Delete ${_savedExamSelection.size} saved exam(s)?`)) return;
  const drop = new Set(_savedExamSelection);
  S.savedExams.filter((e) => drop.has(String(e.id))).forEach(recordDeletedSavedExam);
  S.savedExams = S.savedExams.filter((e) => !drop.has(String(e.id)));
  clearSavedExamSelection();
  saveSaved();
  if (document.getElementById('wsSavedGrid')) renderWsSavedExams(goal);
}

function archiveSelectedSavedExams(goalId) {
  const goal = (S.goals || []).find((g) => g.id === goalId) || (typeof getActiveGoal === 'function' ? getActiveGoal() : null);
  if (!goal || !_savedExamSelection.size) return;
  const drop = new Set(_savedExamSelection);
  S.savedExams.forEach((e, i) => {
    if (drop.has(String(e.id))) {
      S.savedExams[i] = { ...e, archived: true, updatedAt: Date.now() };
    }
  });
  clearSavedExamSelection();
  saveSaved();
  if (document.getElementById('wsSavedGrid')) renderWsSavedExams(goal);
}

function selectAllVisibleSavedExams(goalId, checked) {
  const goal = (S.goals || []).find((g) => g.id === goalId);
  if (!goal) return;
  getSavedExamsForGoal(goal)
    .filter((e) => !e.archived)
    .forEach((e) => toggleSavedExamSelect(e.id, checked));
  renderWsSavedExams(goal);
}

window.autoSaveExam = autoSaveExam;
window.pinSavedExam = pinSavedExam;
window.assignSavedExamIdentity = assignSavedExamIdentity;
window.dedupeSavedExamsByContentKey = dedupeSavedExamsByContentKey;
window.getExamContentKey = getExamContentKey;
window.deleteSavedById = deleteSavedById;
window.archiveSavedExam = archiveSavedExam;
window.unarchiveSavedExam = unarchiveSavedExam;
window.toggleSavedExamSelect = toggleSavedExamSelect;
window.toggleSavedExamSelectAt = toggleSavedExamSelectAt;
window.isSavedExamSelected = isSavedExamSelected;
window.deleteSelectedSavedExams = deleteSelectedSavedExams;
window.archiveSelectedSavedExams = archiveSelectedSavedExams;
window.selectAllVisibleSavedExams = selectAllVisibleSavedExams;
window.archiveSavedExamAt = archiveSavedExamAt;
window.unarchiveSavedExamAt = unarchiveSavedExamAt;

// History UI now lives in the workspace Progress tab (renderGoalHistoryHtml in workspaceUi.js).
