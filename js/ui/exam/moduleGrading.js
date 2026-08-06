/**
 * Modular exam grading — per-module pass/fail vs blueprint passPercentPerModule.
 * Shared by results.js (browser) and unit tests (Node).
 */
const DEFAULT_PASS_PERCENT = 60;
const GOETHE_MODULAR_LEVELS = new Set(['B1', 'B2', 'C1', 'C2']);

const MODULE_LABELS = {
  de: {
    lesen: 'Leseverstehen',
    horen: 'Hörverstehen',
    schreiben: 'Schreiben',
    sprechen: 'Sprechen',
    gapfill: 'Gap-Fill',
  },
  en: {
    lesen: 'Reading',
    horen: 'Listening',
    schreiben: 'Writing',
    sprechen: 'Speaking',
    gapfill: 'Gap-Fill',
  },
};

function getGradingScope(blueprint, exam) {
  const rule = blueprint?.passRule;
  if (rule?.scope === 'whole-exam-total') return 'whole-exam-total';
  if (rule?.scope === 'cambridge-scale') return 'cambridge-scale';
  if (rule?.scope === 'dele-c2-three-tests') return 'dele-c2-three-tests';
  if (rule?.scope === 'dele-groups') return 'dele-groups';
  if (rule?.scope === 'whole-exam') return 'whole-exam';
  if (rule?.scope === 'per-module') return 'modular';
  if (blueprint?.modularGrading === true || blueprint?.passPercentPerModule != null) return 'modular';
  if (blueprint?.modularGrading === false && rule?.writtenMin) return 'whole-exam';
  if (exam?.goetheFormat) {
    const lv = String(exam.level || '').toUpperCase();
    const lang = exam.lang === 'de' ? 'de' : exam.lang === 'es' ? 'es' : 'en';
    if (lang === 'de' && GOETHE_MODULAR_LEVELS.has(lv)) return 'modular';
  }
  return 'legacy';
}

function getModuleMaxPoints(blueprint, moduleId) {
  const mod = blueprint?.modules?.find((m) => m.id === moduleId);
  if (mod?.maxPoints != null && Number.isFinite(Number(mod.maxPoints))) {
    return Number(mod.maxPoints);
  }
  if (moduleId === 'sprechen' && blueprint?.passRule?.speakingMin?.of != null) {
    return Number(blueprint.passRule.speakingMin.of);
  }
  if (blueprint?.passRule?.writtenMin?.of != null && ['lesen', 'horen', 'schreiben'].includes(moduleId)) {
    return Number(blueprint.passRule.writtenMin.of) / 3;
  }
  return 25;
}

function getModuleItemTotal(blueprint, moduleId) {
  const fromMap = blueprint?.itemsTotalByModule?.[moduleId];
  if (fromMap != null && Number(fromMap) > 0) return Number(fromMap);
  const mod = blueprint?.modules?.find((m) => m.id === moduleId);
  if (!mod?.parts?.length) return null;
  return mod.parts.reduce((s, p) => s + (p.itemsTotal ?? p.questionsTotal?.min ?? 0), 0);
}

function pointsFromScorable(correct, total, maxPoints) {
  if (!total || total <= 0 || maxPoints == null) return null;
  return Math.round((correct / total) * maxPoints);
}

function pointsFromScorePct(scorePct, maxPoints) {
  if (scorePct == null || maxPoints == null) return null;
  return Math.round((scorePct / 100) * maxPoints);
}

function moduleResultPoints(mod, blueprint, moduleId) {
  if (!mod?.evaluated) return null;
  if (mod.points != null && Number.isFinite(mod.points)) return mod.points;
  const maxPts = mod.maxPoints ?? getModuleMaxPoints(blueprint, moduleId);
  if (mod.correct != null && mod.total != null && mod.total > 0) {
    return pointsFromScorable(mod.correct, mod.total, maxPts);
  }
  if (mod.scorePct != null) return pointsFromScorePct(mod.scorePct, maxPts);
  return null;
}

function enrichModulePoints(mod, blueprint, moduleId) {
  if (!mod || !blueprint) return mod;
  const maxPoints = getModuleMaxPoints(blueprint, moduleId);
  const points = moduleResultPoints(mod, blueprint, moduleId);
  return { ...mod, maxPoints, points: points ?? mod.points ?? null };
}

function scorableModuleResultWithPoints(correct, total, passPercent, blueprint, moduleId) {
  const base = scorableModuleResult(correct, total, passPercent);
  if (!blueprint) return base;
  const maxPoints = getModuleMaxPoints(blueprint, moduleId);
  return {
    ...base,
    maxPoints,
    points: pointsFromScorable(correct, total, maxPoints),
  };
}

function aiEvaluatedModuleResultWithPoints(scorePct, passPercent, blueprint, moduleId, meta = {}) {
  const base = aiEvaluatedModuleResult(scorePct, passPercent, meta);
  if (!blueprint) return base;
  const maxPoints = getModuleMaxPoints(blueprint, moduleId);
  return {
    ...base,
    maxPoints,
    points: pointsFromScorePct(scorePct, maxPoints),
  };
}

// --- Cambridge English Scale grading (aggregate; each skill 25%, pass from 140). ---
// Raw%->scale mapping is piecewise-linear, anchored so passRawPct (60%) => passScale (140).
// Official per-session raw->scale tables are not public; this is a documented adaptation.
function scorePctToScale(scorePct, rule = {}) {
  if (scorePct == null) return null;
  const floor = Number(rule.scaleFloor ?? 120);
  const ceil = Number(rule.scaleCeil ?? 170);
  const passScale = Number(rule.passScale ?? 140);
  const passRawPct = Number(rule.passRawPct ?? 60);
  const p = Math.max(0, Math.min(100, Number(scorePct)));
  let scale;
  if (p <= passRawPct) {
    scale = floor + (p / passRawPct) * (passScale - floor);
  } else {
    scale = passScale + ((p - passRawPct) / (100 - passRawPct)) * (ceil - passScale);
  }
  return Math.round(Math.max(floor, Math.min(ceil, scale)));
}

function summarizeCambridgeScale(moduleResults, blueprint) {
  const rule = blueprint?.passRule || {};
  const passScale = Number(rule.passScale ?? 140);
  const moduleIds = Object.keys(moduleResults || {});
  const perModuleScale = {};
  const scales = [];
  const pcts = [];
  let modulesEvaluated = 0;
  for (const id of moduleIds) {
    const mod = moduleResults[id];
    if (!mod?.evaluated || mod.scorePct == null) { perModuleScale[id] = null; continue; }
    const scale = scorePctToScale(mod.scorePct, rule);
    perModuleScale[id] = scale;
    scales.push(scale);
    pcts.push(mod.scorePct);
    modulesEvaluated += 1;
  }
  const allEvaluated = modulesEvaluated === moduleIds.length && moduleIds.length > 0;
  const overallScale = scales.length
    ? Math.round(scales.reduce((s, v) => s + v, 0) / scales.length)
    : null;
  const globalPassed = allEvaluated && overallScale != null && overallScale >= passScale;
  const informativeScorePct = pcts.length
    ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length)
    : null;
  return {
    gradingScope: 'cambridge-scale',
    modular: false,
    passPercent: null,
    totalModules: moduleIds.length,
    modulesEvaluated,
    modulesPassed: globalPassed ? moduleIds.length : 0,
    globalPassed,
    perModuleScale,
    overallScale,
    passScale,
    scaleFloor: Number(rule.scaleFloor ?? 120),
    scaleCeil: Number(rule.scaleCeil ?? 170),
    informativeScorePct,
    legacyScore: informativeScorePct ?? 0,
  };
}

function summarizeWholeExamTotal(moduleResults, blueprint) {
  const rule = blueprint?.passRule || {};
  const minTotal = Number(rule.minTotalPoints ?? 60);
  const maxTotal = Number(rule.maxTotalPoints ?? 100);

  let totalPoints = 0;
  let modulesEvaluated = 0;
  const moduleIds = Object.keys(moduleResults || {});

  for (const id of moduleIds) {
    const mod = moduleResults[id];
    if (!mod?.evaluated) continue;
    const pts = moduleResultPoints(mod, blueprint, id);
    if (pts == null) continue;
    totalPoints += pts;
    modulesEvaluated += 1;
  }

  const allEvaluated = modulesEvaluated === moduleIds.length && moduleIds.length > 0;
  const globalPassed = allEvaluated && totalPoints >= minTotal;

  return {
    gradingScope: 'whole-exam-total',
    modular: false,
    passPercent: null,
    totalModules: moduleIds.length,
    modulesPassed: globalPassed ? moduleIds.length : 0,
    modulesEvaluated,
    globalPassed,
    totalPoints,
    totalMax: maxTotal,
    minTotalPoints: minTotal,
    informativeScorePct: maxTotal > 0 ? Math.round((totalPoints / maxTotal) * 100) : null,
    legacyScore: maxTotal > 0 ? Math.round((totalPoints / maxTotal) * 100) : 0,
  };
}

function summarizeDeleC2ThreeTests(moduleResults, blueprint) {
  const rule = blueprint?.passRule || {};
  const minPts = Number(rule.minPointsPerTest ?? 20);
  const tests = rule.tests || [
    { id: 'prueba1', modules: ['lesen', 'horen'], maxPoints: 25 },
    { id: 'prueba2', modules: ['schreiben'], maxPoints: 25 },
    { id: 'prueba3', modules: ['sprechen'], maxPoints: 25 },
  ];

  function scoreTest(test) {
    const ids = test.modules || [];
    const maxPts = Number(test.maxPoints ?? 25);
    const modulePoints = [];
    for (const id of ids) {
      const mod = moduleResults?.[id];
      if (!mod?.evaluated) {
        return { allEvaluated: false, points: null, maxPoints: maxPts, minPoints: minPts };
      }
      const pts = moduleResultPoints(mod, blueprint, id);
      if (pts == null) {
        return { allEvaluated: false, points: null, maxPoints: maxPts, minPoints: minPts };
      }
      modulePoints.push(pts);
    }
    const points =
      modulePoints.length === 1
        ? modulePoints[0]
        : Math.round(modulePoints.reduce((s, v) => s + v, 0) / modulePoints.length);
    return {
      allEvaluated: true,
      points,
      maxPoints: maxPts,
      minPoints: minPts,
      passed: points >= minPts,
    };
  }

  const pruebas = tests.map((test) => {
    const row = scoreTest(test);
    return {
      id: test.id,
      label: test.label || test.id,
      modules: test.modules || [],
      ...row,
    };
  });

  const globalPassed = pruebas.length > 0 && pruebas.every((p) => p.passed);
  const totalPts = pruebas.reduce((s, p) => s + (p.points ?? 0), 0);
  const totalMax = pruebas.reduce((s, p) => s + (p.maxPoints ?? 25), 0);

  return {
    gradingScope: 'dele-c2-three-tests',
    modular: false,
    passPercent: null,
    totalModules: tests.reduce((s, t) => s + (t.modules?.length || 0), 0),
    modulesPassed: globalPassed ? pruebas.length : pruebas.filter((p) => p.passed).length,
    modulesEvaluated: pruebas.filter((p) => p.allEvaluated).length,
    globalPassed,
    pruebas,
    minPointsPerTest: minPts,
    totalPoints: totalPts,
    totalMax,
    informativeScorePct: totalMax > 0 ? Math.round((totalPts / totalMax) * 100) : null,
    legacyScore: totalMax > 0 ? Math.round((totalPts / totalMax) * 100) : 0,
  };
}

function summarizeDeleGroups(moduleResults, blueprint) {
  const rule = blueprint?.passRule || {};
  const g1 = rule.grupo1 || { modules: ['lesen', 'schreiben'], minPoints: 30, maxPoints: 50 };
  const g2 = rule.grupo2 || { modules: ['horen', 'sprechen'], minPoints: 30, maxPoints: 50 };

  function groupSummary(group) {
    const ids = group.modules || [];
    let points = 0;
    let evaluated = 0;
    for (const id of ids) {
      const mod = moduleResults?.[id];
      if (!mod?.evaluated) continue;
      const pts = moduleResultPoints(mod, blueprint, id);
      if (pts == null) continue;
      points += pts;
      evaluated += 1;
    }
    const allEvaluated = evaluated === ids.length;
    const minPts = Number(group.minPoints ?? 30);
    const maxPts = Number(group.maxPoints ?? 50);
    return {
      modules: ids,
      points,
      maxPoints: maxPts,
      minPoints: minPts,
      allEvaluated,
      passed: allEvaluated && points >= minPts,
    };
  }

  const grupo1 = groupSummary(g1);
  const grupo2 = groupSummary(g2);
  const globalPassed = grupo1.passed && grupo2.passed;
  const totalPts = grupo1.points + grupo2.points;
  const totalMax = grupo1.maxPoints + grupo2.maxPoints;

  return {
    gradingScope: 'dele-groups',
    modular: false,
    passPercent: null,
    totalModules: (g1.modules?.length || 0) + (g2.modules?.length || 0),
    modulesPassed: (grupo1.passed ? grupo1.modules.length : 0) + (grupo2.passed ? grupo2.modules.length : 0),
    modulesEvaluated: (grupo1.allEvaluated ? grupo1.modules.length : 0) + (grupo2.allEvaluated ? grupo2.modules.length : 0),
    globalPassed,
    grupo1,
    grupo2,
    totalPoints: totalPts,
    totalMax,
    informativeScorePct: totalMax > 0 ? Math.round((totalPts / totalMax) * 100) : null,
    legacyScore: totalMax > 0 ? Math.round((totalPts / totalMax) * 100) : 0,
  };
}

function summarizeWholeExam(moduleResults, blueprint) {
  const rule = blueprint?.passRule || {};
  const writtenMin = Number(rule.writtenMin?.points ?? 45);
  const writtenMax = Number(rule.writtenMin?.of ?? 75);
  const speakingMin = Number(rule.speakingMin?.points ?? 15);
  const speakingMax = Number(rule.speakingMin?.of ?? 25);
  const writtenIds = ['lesen', 'horen', 'schreiben'];

  let writtenPoints = 0;
  let writtenModulesEvaluated = 0;
  for (const id of writtenIds) {
    const mod = moduleResults?.[id];
    if (!mod?.evaluated) continue;
    const pts = moduleResultPoints(mod, blueprint, id);
    if (pts == null) continue;
    writtenPoints += pts;
    writtenModulesEvaluated += 1;
  }

  const spMod = moduleResults?.sprechen;
  const speakingPoints = spMod?.evaluated ? moduleResultPoints(spMod, blueprint, 'sprechen') : null;
  const speakingEvaluated = speakingPoints != null;

  const allWrittenEvaluated = writtenModulesEvaluated === writtenIds.length;
  const writtenPassed = allWrittenEvaluated && writtenPoints >= writtenMin;
  const speakingPassed = speakingEvaluated && speakingPoints >= speakingMin;
  const globalPassed = writtenPassed && speakingPassed;

  const totalPts = writtenPoints + (speakingPoints ?? 0);
  let evaluatedWrittenMax = 0;
  for (const id of writtenIds) {
    const mod = moduleResults?.[id];
    if (!mod?.evaluated) continue;
    evaluatedWrittenMax += getModuleMaxPoints(blueprint, id);
  }
  const evaluatedMax = evaluatedWrittenMax + (speakingEvaluated ? speakingMax : 0);
  const totalMax = writtenMax + speakingMax;

  return {
    gradingScope: 'whole-exam',
    modular: false,
    passPercent: null,
    totalModules: writtenIds.length + 1,
    modulesPassed: (writtenPassed ? writtenIds.length : 0) + (speakingPassed ? 1 : 0),
    modulesEvaluated: writtenModulesEvaluated + (speakingEvaluated ? 1 : 0),
    globalPassed,
    writtenPoints,
    writtenMax,
    writtenMin,
    writtenPassed,
    allWrittenEvaluated,
    speakingPoints,
    speakingMax,
    speakingMin,
    speakingPassed,
    speakingEvaluated,
    informativeScorePct:
      evaluatedMax > 0 ? Math.round((totalPts / evaluatedMax) * 100) : null,
    legacyScore: evaluatedMax > 0 ? Math.round((totalPts / evaluatedMax) * 100) : 0,
    totalMax,
    evaluatedMax,
  };
}

function defaultPassPercent() {
  return DEFAULT_PASS_PERCENT;
}

function getPassPercent(blueprint, exam) {
  const raw = blueprint?.passPercentPerModule ?? exam?.passPercentPerModule;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PASS_PERCENT;
}

function isModularGoetheExam(exam, blueprint) {
  return getGradingScope(blueprint, exam) === 'modular';
}

function isWholeExamGrading(exam, blueprint) {
  const scope = getGradingScope(blueprint, exam);
  return scope === 'whole-exam' || scope === 'whole-exam-total';
}

function isDeleGroupGrading(exam, blueprint) {
  return getGradingScope(blueprint, exam) === 'dele-groups';
}

function isDeleC2ThreeTestGrading(exam, blueprint) {
  return getGradingScope(blueprint, exam) === 'dele-c2-three-tests';
}

function scorePctFromCounts(correct, total) {
  if (!total || total <= 0) return null;
  return Math.round((correct / total) * 100);
}

/** User actually submitted an answer (empty / skipped does not count). */
function isAnswerProvided(user) {
  if (user == null || user === '') return false;
  if (Array.isArray(user)) return user.length > 0;
  const s = String(user).trim();
  if (!s || s === '[]') return false;
  return true;
}

/**
 * Objective module score — denominator is answered items only, not all presented.
 * @param {number} correct
 * @param {number} answered — items the user actually answered
 * @param {number} [presented] — total items shown (informational)
 */
function buildObjectiveModuleResult(correct, answered, presented, passPercent) {
  if (!answered || answered <= 0) {
    return {
      scorePct: null,
      passed: false,
      evaluated: false,
      correct: 0,
      total: 0,
      answered: 0,
      totalPresented: presented ?? 0,
    };
  }
  const base = scorableModuleResult(correct, answered, passPercent);
  return {
    ...base,
    answered,
    totalPresented: presented ?? answered,
  };
}

/** Score shown in history / progress — only evaluated, answered modules. */
function computeDisplayScore(summary, moduleResults) {
  if (!summary) return 0;
  const scope = summary.gradingScope || 'legacy';
  if (scope === 'whole-exam' || scope === 'whole-exam-total') {
    return summary.informativeScorePct ?? summary.legacyScore ?? 0;
  }
  if (scope === 'cambridge-scale') {
    return summary.informativeScorePct ?? summary.legacyScore ?? 0;
  }
  if (scope === 'modular' || summary.modular) {
    return summary.informativeScorePct ?? 0;
  }
  return summary.informativeScorePct ?? summary.legacyScore ?? 0;
}

/** Hero label for results — module-specific when only one module was answered. */
function getDisplayScoreInfo(moduleResults, summary, passPercent, isDE) {
  const score = computeDisplayScore(summary, moduleResults);
  const labels = isDE ? MODULE_LABELS.de : MODULE_LABELS.en;
  const evaluated = Object.entries(moduleResults || {}).filter(
    ([, m]) => m?.evaluated && m?.scorePct != null,
  );

  if (evaluated.length === 1) {
    const [key, m] = evaluated[0];
    const lbl = labels[key] || key;
    return {
      score,
      heroScore: `${lbl}: ${m.scorePct}%`,
      heroSub: isDE
        ? 'Teilprüfung — nur beantwortete Fragen zählen'
        : 'Partial — score from answered questions only',
      partial: true,
    };
  }

  if (summary?.gradingScope === 'cambridge-scale') {
    return {
      score,
      heroScore: `${summary.overallScale ?? score}`,
      heroSub: isDE
        ? `Cambridge English Scale - Bestehen ab ${summary.passScale}`
        : `Cambridge English Scale - pass from ${summary.passScale}`,
      partial: false,
    };
  }

  if (summary?.gradingScope === 'whole-exam') {
    const sub =
      summary.modulesEvaluated < (summary.totalModules || 4)
        ? isDE
          ? `Bewertet: ${summary.modulesEvaluated}/${summary.totalModules} Module · nur beantwortete Fragen`
          : `Scored: ${summary.modulesEvaluated}/${summary.totalModules} modules · answered questions only`
        : typeof wholeExamHeroSub === 'function'
          ? wholeExamHeroSub(summary, isDE)
          : '';
    const heroScore =
      summary.informativeScorePct != null ? `${summary.informativeScorePct}%` : `${score}%`;
    return { score, heroScore, heroSub: sub, partial: false };
  }

  if (summary?.modular || summary?.gradingScope === 'modular') {
    const heroScore = `${score}%`;
    const heroSub =
      summary.informativeScorePct != null
        ? isDE
          ? `Ø bewertete Module: ${summary.informativeScorePct}% · Schwelle ${passPercent}% pro Modul`
          : `Avg scored modules: ${summary.informativeScorePct}% · ${passPercent}% pass per module`
        : isDE
          ? `Schwelle ${passPercent}% pro Modul`
          : `${passPercent}% pass per module`;
    return { score, heroScore, heroSub, partial: false };
  }

  return { score, heroScore: `${score}%`, heroSub: '', partial: false };
}

function modulePassed(scorePct, passPercent) {
  return scorePct != null && scorePct >= passPercent;
}

function scorableModuleResult(correct, total, passPercent) {
  const scorePct = scorePctFromCounts(correct, total);
  return {
    scorePct,
    passed: modulePassed(scorePct, passPercent),
    evaluated: true,
    correct,
    total,
  };
}

function unevaluatedModuleResult() {
  return { scorePct: null, passed: false, evaluated: false, correct: 0, total: 0 };
}

function unevaluatedOrientativeResult(hint, isDE) {
  const defaultHint = isDE
    ? 'Nicht evaluiert (orientativ) — keine KI-Bewertung verfügbar'
    : 'Not evaluated (orientative) — no AI scoring available';
  return {
    scorePct: null,
    passed: false,
    evaluated: false,
    orientative: true,
    hint: hint || defaultHint,
    correct: 0,
    total: 0,
  };
}

function aiEvaluatedModuleResult(scorePct, passPercent, meta = {}) {
  return {
    scorePct,
    passed: modulePassed(scorePct, passPercent),
    evaluated: true,
    ai: true,
    correct: 0,
    total: 0,
    ...meta,
  };
}

function legacyFlatScores(moduleResults) {
  const flat = {};
  for (const [k, v] of Object.entries(moduleResults || {})) {
    if (v?.evaluated && v.scorePct != null) flat[k] = v.scorePct;
    else if (typeof v === 'number') flat[k] = v;
  }
  return flat;
}

function normalizeModuleResults(entry, passPercent = DEFAULT_PASS_PERCENT) {
  if (!entry || typeof entry !== 'object') return {};
  if (entry.moduleResults && typeof entry.moduleResults === 'object') {
    return entry.moduleResults;
  }
  return migrateLegacyModuleScores(entry.moduleScores, passPercent);
}

function migrateLegacyModuleScores(moduleScores, passPercent = DEFAULT_PASS_PERCENT) {
  const out = {};
  for (const [k, v] of Object.entries(moduleScores || {})) {
    if (v == null) continue;
    if (typeof v === 'object' && 'evaluated' in v) {
      out[k] = v;
      continue;
    }
    const scorePct = Number(v);
    if (!Number.isFinite(scorePct)) continue;
    out[k] = {
      scorePct,
      passed: scorePct >= passPercent,
      evaluated: true,
    };
  }
  return out;
}

/** Pool section tracking rows — not scored exam results (no Progress UI). */
function isPartTrackingHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.source === 'part') return true;
  if (entry.partId && !entry.correction && !entry.moduleResults && !entry.moduleScores) return true;
  return false;
}

/** Completed exam rows eligible for Progress / readiness / score trend. */
function isExamResultHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (isPartTrackingHistoryEntry(entry)) return false;
  if (entry.correction || entry.moduleResults || entry.moduleScores) return true;
  if (Number.isFinite(Number(entry.score))) return true;
  return false;
}

function formatHistoryDate(entry) {
  const raw = entry?.date;
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toLocaleDateString();
  }
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && String(raw).trim().length >= 10) {
    return new Date(asNum).toLocaleDateString();
  }
  const parsed = Date.parse(String(raw));
  if (!Number.isNaN(parsed)) return String(raw);
  return String(raw);
}

/** Resolve display score for history — backfills modular rows saved with score undefined. */
function resolveHistoryScore(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const direct = Number(entry.score);
  if (Number.isFinite(direct)) return Math.round(Math.max(0, Math.min(100, direct)));

  const passPercent = getPassPercent(null, entry);
  const moduleResults = normalizeModuleResults(entry, passPercent);
  if (!Object.keys(moduleResults).length) return null;

  const gradingScope =
    entry.gradingScope || (entry.modularGrading ? 'modular' : null) || 'legacy';
  const summary = summarizeExam(moduleResults, {
    modular: gradingScope === 'modular' || !!entry.modularGrading,
    passPercent,
    gradingScope,
    exam: entry,
  });
  const score = computeDisplayScore(summary, moduleResults);
  return Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : null;
}

function migrateHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const passPercent = getPassPercent(null, entry);
  if (!entry.moduleResults && entry.moduleScores) {
    entry.moduleResults = migrateLegacyModuleScores(entry.moduleScores, passPercent);
  }
  if (entry.passPercentPerModule == null) {
    entry.passPercentPerModule = passPercent;
  }
  if (entry.moduleResults && !entry.moduleScores) {
    entry.moduleScores = legacyFlatScores(entry.moduleResults);
  }
  if (typeof entry.date === 'number' && Number.isFinite(entry.date)) {
    entry.date = formatHistoryDate(entry);
  }
  if (!Number.isFinite(Number(entry.score)) && isExamResultHistoryEntry(entry)) {
    const resolved = resolveHistoryScore(entry);
    if (resolved != null) entry.score = resolved;
  }
  return entry;
}

function summarizeExam(moduleResults, opts = {}) {
  const blueprint = opts.blueprint || null;
  const scope = opts.gradingScope || (blueprint ? getGradingScope(blueprint, opts.exam) : null);
  if (scope === 'whole-exam-total' && blueprint) {
    return summarizeWholeExamTotal(moduleResults, blueprint);
  }
  if (scope === 'cambridge-scale' && blueprint) {
    return summarizeCambridgeScale(moduleResults, blueprint);
  }
  if (scope === 'dele-c2-three-tests' && blueprint) {
    return summarizeDeleC2ThreeTests(moduleResults, blueprint);
  }
  if (scope === 'dele-groups' && blueprint) {
    return summarizeDeleGroups(moduleResults, blueprint);
  }
  if (scope === 'whole-exam' && blueprint) {
    return summarizeWholeExam(moduleResults, blueprint);
  }

  const passPercent = opts.passPercent ?? DEFAULT_PASS_PERCENT;
  const modular = opts.modular === true || scope === 'modular';
  const keys = Object.keys(moduleResults || {});
  const totalModules = keys.length;
  let modulesPassed = 0;
  let modulesEvaluated = 0;
  const scored = [];

  for (const k of keys) {
    const m = moduleResults[k];
    if (!m) continue;
    if (m.evaluated) {
      modulesEvaluated += 1;
      if (m.scorePct != null) scored.push(m.scorePct);
      if (m.passed) modulesPassed += 1;
    }
  }

  const informativeScorePct = scored.length
    ? Math.round(scored.reduce((s, v) => s + v, 0) / scored.length)
    : opts.legacyTotal
      ? scorePctFromCounts(opts.legacyCorrect, opts.legacyTotal)
      : null;

  const globalPassed =
    totalModules > 0 &&
    modulesEvaluated === totalModules &&
    modulesPassed === totalModules;

  let legacyScore = informativeScorePct;
  if (!modular && opts.legacyTotal) {
    legacyScore = scorePctFromCounts(opts.legacyCorrect, opts.legacyTotal);
  }

  return {
    gradingScope: modular ? 'modular' : 'legacy',
    passPercent,
    modular,
    totalModules,
    modulesPassed,
    modulesEvaluated,
    globalPassed,
    informativeScorePct,
    legacyScore: legacyScore ?? 0,
  };
}

function weakModules(moduleResults, passPercent, isDE) {
  const labels = isDE ? MODULE_LABELS.de : MODULE_LABELS.en;
  return Object.entries(moduleResults || {})
    .filter(([, v]) => v?.evaluated && v.scorePct != null && v.scorePct < passPercent)
    .map(([k, v]) => ({ label: labels[k] || k, score: v.scorePct }))
    .sort((a, b) => a.score - b.score);
}

function scoreColor(scorePct, passPercent) {
  if (scorePct == null) return 'var(--text-muted)';
  if (scorePct >= passPercent) return 'var(--green)';
  if (scorePct >= passPercent - 10) return 'var(--warning,var(--orange))';
  if (scorePct >= passPercent - 20) return 'var(--orange)';
  return 'var(--red)';
}

function globalResultClass(summary) {
  if (summary.gradingScope === 'dele-c2-three-tests') {
    if (summary.globalPassed) return 'pass';
    if (summary.pruebas?.some((p) => p.passed)) return 'mid';
    return 'fail';
  }
  if (summary.gradingScope === 'dele-groups') {
    if (summary.globalPassed) return 'pass';
    if (summary.grupo1?.passed || summary.grupo2?.passed) return 'mid';
    return 'fail';
  }
  if (summary.gradingScope === 'cambridge-scale') {
    if (summary.globalPassed) return 'pass';
    if ((summary.overallScale ?? 0) >= (summary.passScale ?? 140) - 6) return 'mid';
    return 'fail';
  }
  if (summary.gradingScope === 'whole-exam-total') {
    if (summary.globalPassed) return 'pass';
    if ((summary.totalPoints ?? 0) >= (summary.minTotalPoints ?? 60) * 0.85) return 'mid';
    return 'fail';
  }
  if (summary.gradingScope === 'whole-exam') {
    if (summary.globalPassed) return 'pass';
    if (summary.writtenPassed || summary.speakingPassed) return 'mid';
    return 'fail';
  }
  if (summary.globalPassed) return 'pass';
  if (summary.modulesPassed > 0) return 'mid';
  return 'fail';
}

function globalResultLabel(summary, isDE) {
  if (summary.gradingScope === 'dele-c2-three-tests') {
    if (summary.globalPassed) return isDE ? 'Apto ✓' : 'Pass ✓';
    const minPts = summary.minPointsPerTest ?? 20;
    const parts = (summary.pruebas || [])
      .filter((p) => !p.passed)
      .map((p) =>
        isDE
          ? `${p.label || p.id} ${p.points ?? '—'}/${p.maxPoints} (mín. ${minPts})`
          : `${p.label || p.id} ${p.points ?? '—'}/${p.maxPoints} (min ${minPts})`,
      );
    if (parts.length) return isDE ? `No apto — ${parts.join('; ')}` : `Fail — ${parts.join('; ')}`;
    return isDE ? 'No apto' : 'Fail';
  }
  if (summary.gradingScope === 'dele-groups') {
    if (summary.globalPassed) return isDE ? 'Apto ✓' : 'Pass ✓';
    const parts = [];
    if (!summary.grupo1?.passed) {
      parts.push(
        isDE
          ? `Grupo 1 ${summary.grupo1?.points ?? '—'}/${summary.grupo1?.maxPoints} (mín. ${summary.grupo1?.minPoints})`
          : `Group 1 ${summary.grupo1?.points ?? '—'}/${summary.grupo1?.maxPoints} (min ${summary.grupo1?.minPoints})`,
      );
    }
    if (!summary.grupo2?.passed) {
      parts.push(
        isDE
          ? `Grupo 2 ${summary.grupo2?.points ?? '—'}/${summary.grupo2?.maxPoints} (mín. ${summary.grupo2?.minPoints})`
          : `Group 2 ${summary.grupo2?.points ?? '—'}/${summary.grupo2?.maxPoints} (min ${summary.grupo2?.minPoints})`,
      );
    }
    if (parts.length) return isDE ? `No apto — ${parts.join('; ')}` : `Fail — ${parts.join('; ')}`;
    return isDE ? 'No apto' : 'Fail';
  }
  if (summary.gradingScope === 'cambridge-scale') {
    if (summary.globalPassed) return isDE ? 'Bestanden ✓' : 'Pass ✓';
    return isDE
      ? `Nicht bestanden - ${summary.overallScale ?? '—'}/${summary.passScale} (Cambridge Scale)`
      : `Fail - ${summary.overallScale ?? '—'}/${summary.passScale} (Cambridge Scale)`;
  }
  if (summary.gradingScope === 'whole-exam-total') {
    if (summary.globalPassed) return isDE ? 'Bestanden ✓' : 'Pass ✓';
    return isDE
      ? `Nicht bestanden — ${summary.totalPoints ?? '—'}/${summary.totalMax} (mind. ${summary.minTotalPoints})`
      : `Fail — ${summary.totalPoints ?? '—'}/${summary.totalMax} (min ${summary.minTotalPoints})`;
  }
  if (summary.gradingScope === 'whole-exam') {
    if (summary.globalPassed) return isDE ? 'Bestanden ✓' : 'Pass ✓';
    const parts = [];
    if (!summary.writtenPassed) {
      parts.push(
        isDE
          ? `Schrift ${summary.writtenPoints ?? '—'}/${summary.writtenMax} (mind. ${summary.writtenMin})`
          : `Written ${summary.writtenPoints ?? '—'}/${summary.writtenMax} (min ${summary.writtenMin})`,
      );
    }
    if (!summary.speakingPassed) {
      parts.push(
        isDE
          ? `Sprechen ${summary.speakingPoints ?? '—'}/${summary.speakingMax} (mind. ${summary.speakingMin})`
          : `Speaking ${summary.speakingPoints ?? '—'}/${summary.speakingMax} (min ${summary.speakingMin})`,
      );
    }
    if (parts.length) return isDE ? `Nicht bestanden — ${parts.join('; ')}` : `Fail — ${parts.join('; ')}`;
    return isDE ? 'Nicht bestanden' : 'Fail';
  }
  if (summary.globalPassed) return isDE ? 'Bestanden ✓' : 'Pass ✓';
  if (summary.modulesPassed > 0) {
    return isDE
      ? `${summary.modulesPassed}/${summary.totalModules} Module bestanden`
      : `${summary.modulesPassed}/${summary.totalModules} modules passed`;
  }
  return isDE ? 'Nicht bestanden' : 'Fail';
}

function wholeExamHeroSub(summary, isDE) {
  if (summary.gradingScope !== 'whole-exam') return '';
  return isDE
    ? `Schriftlich: ${summary.writtenPoints ?? '—'}/${summary.writtenMax} (mind. ${summary.writtenMin}) · Sprechen: ${summary.speakingPoints ?? '—'}/${summary.speakingMax} (mind. ${summary.speakingMin})`
    : `Written: ${summary.writtenPoints ?? '—'}/${summary.writtenMax} (min ${summary.writtenMin}) · Speaking: ${summary.speakingPoints ?? '—'}/${summary.speakingMax} (min ${summary.speakingMin})`;
}

function moduleDisplayValue(mod, summary, passPercent) {
  if (summary?.gradingScope === 'whole-exam' && mod.points != null && mod.maxPoints != null) {
    return `${mod.points}/${mod.maxPoints}`;
  }
  if (mod.evaluated && mod.scorePct != null) return `${mod.scorePct}%`;
  return '—';
}

function moduleCardClass(mod, summary) {
  if (summary?.gradingScope === 'whole-exam') return 'mod-neutral';
  if (!mod?.evaluated) return 'mod-pending';
  return mod.passed ? 'mod-pass' : 'mod-fail';
}

function moduleStatusLabel(mod, isDE, summary) {
  if (summary?.gradingScope === 'whole-exam') {
    if (!mod?.evaluated) {
      if (mod?.orientative) {
        return isDE ? 'Nicht evaluiert (orientativ)' : 'Not evaluated (orientative)';
      }
      return isDE ? 'Nicht bewertet' : 'Not scored';
    }
    if (mod.points != null && mod.maxPoints != null) {
      return isDE ? `${mod.points} von ${mod.maxPoints} Punkten` : `${mod.points} of ${mod.maxPoints} points`;
    }
    return isDE ? 'Bewertet' : 'Scored';
  }
  if (!mod?.evaluated) {
    if (mod?.orientative) {
      return isDE ? 'Nicht evaluiert (orientativ)' : 'Not evaluated (orientative)';
    }
    return isDE ? 'Nicht bewertet' : 'Not scored';
  }
  return mod.passed ? (isDE ? 'Bestanden' : 'Pass') : isDE ? 'Nicht bestanden' : 'Fail';
}

const moduleGradingExports = {
  DEFAULT_PASS_PERCENT,
  GOETHE_MODULAR_LEVELS,
  defaultPassPercent,
  getPassPercent,
  getGradingScope,
  isModularGoetheExam,
  isWholeExamGrading,
  getModuleMaxPoints,
  getModuleItemTotal,
  pointsFromScorable,
  pointsFromScorePct,
  moduleResultPoints,
  enrichModulePoints,
  scorableModuleResultWithPoints,
  aiEvaluatedModuleResultWithPoints,
  summarizeWholeExam,
  summarizeWholeExamTotal,
  summarizeCambridgeScale,
  scorePctToScale,
  summarizeDeleGroups,
  summarizeDeleC2ThreeTests,
  isDeleGroupGrading,
  isDeleC2ThreeTestGrading,
  scorePctFromCounts,
  isAnswerProvided,
  buildObjectiveModuleResult,
  computeDisplayScore,
  getDisplayScoreInfo,
  modulePassed,
  scorableModuleResult,
  unevaluatedModuleResult,
  unevaluatedOrientativeResult,
  aiEvaluatedModuleResult,
  legacyFlatScores,
  normalizeModuleResults,
  migrateLegacyModuleScores,
  isPartTrackingHistoryEntry,
  isExamResultHistoryEntry,
  formatHistoryDate,
  resolveHistoryScore,
  migrateHistoryEntry,
  summarizeExam,
  weakModules,
  scoreColor,
  globalResultClass,
  globalResultLabel,
  wholeExamHeroSub,
  moduleDisplayValue,
  moduleCardClass,
  moduleStatusLabel,
  MODULE_LABELS,
};

if (typeof module !== 'undefined') module.exports = moduleGradingExports;
if (typeof window !== 'undefined') window.ModuleGrading = moduleGradingExports;
