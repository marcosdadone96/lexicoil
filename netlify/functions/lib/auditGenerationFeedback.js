'use strict';

/**
 * auditGenerationFeedback.js — PASO 8 audit of generationFeedbackStore records.
 * Read-only analysis: counts, duplicates, specificity, contradictions, quality gate.
 */

const { listFeedback } = require('./generationFeedbackStore.js');
const {
  validateGenerationFeedbackRule,
  resolveCategory,
  TYPE_TO_CATEGORY,
} = require('./validateGenerationFeedbackRule.js');

function normalizeWs(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function reportCategoryKey(cat) {
  const map = {
    grammar: 'grammar',
    vocabulary: 'vocabulary',
    naturalness: 'naturalness',
    CEFR: 'CEFR',
    exam_quality: 'exam_quality',
    typo: 'typo',
    other: 'other',
  };
  return map[cat] || 'other';
}

function specificityScore(rec) {
  const avoid = normalizeWs(rec.avoid || rec.wrong || '');
  const prefer = normalizeWs(rec.use || rec.preferred || rec.correct || '');
  const reason = normalizeWs(rec.reason || '');
  const tokens = avoid.split(/\s+/).filter(Boolean);
  if (!avoid && !prefer) return { label: 'vague', score: 0 };
  if (tokens.length === 1 && tokens[0].length <= 5) return { label: 'too_specific_narrow', score: 1 };
  if (/siempre|always|never|nunca|todos|all cases/i.test(reason) && tokens.length <= 2) {
    return { label: 'too_general', score: 2 };
  }
  if (tokens.length >= 3 || (avoid && prefer)) return { label: 'balanced', score: 3 };
  if (/colocaci|collocation|literal|natural|prepos/i.test(reason)) return { label: 'balanced', score: 3 };
  return { label: 'borderline', score: 2 };
}

function dedupeKey(rec) {
  return [
    reportCategoryKey(resolveCategory(rec)),
    normalizeWs(rec.avoid || rec.wrong || '').slice(0, 80),
    normalizeWs(rec.use || rec.preferred || rec.correct || '').slice(0, 80),
    normalizeWs(rec.pattern || '').slice(0, 80),
  ].join('|');
}

function findContradictions(records) {
  const byAvoid = new Map();
  const contradictions = [];
  for (const rec of records) {
    const avoid = normalizeWs(rec.avoid || rec.wrong || '');
    const prefer = normalizeWs(rec.use || rec.preferred || rec.correct || '');
    if (!avoid || !prefer) continue;
    if (!byAvoid.has(avoid)) byAvoid.set(avoid, []);
    byAvoid.get(avoid).push({ id: rec.id, prefer, status: rec.status });
  }
  for (const [avoid, list] of byAvoid) {
    const prefers = [...new Set(list.map((x) => x.prefer))];
    if (prefers.length > 1) {
      contradictions.push({
        kind: 'conflicting_prefer_for_same_avoid',
        avoid,
        prefers,
        ids: list.map((x) => x.id),
      });
    }
  }
  // A prefers X while B avoids X as the preferred of another
  const preferSet = new Set(
    records.map((r) => normalizeWs(r.use || r.preferred || r.correct || '')).filter(Boolean),
  );
  for (const rec of records) {
    const avoid = normalizeWs(rec.avoid || rec.wrong || '');
    if (avoid && preferSet.has(avoid)) {
      const others = records.filter(
        (r) => r.id !== rec.id && normalizeWs(r.use || r.preferred || r.correct || '') === avoid,
      );
      if (others.length) {
        contradictions.push({
          kind: 'avoid_equals_others_prefer',
          id: rec.id,
          avoid,
          conflictingIds: others.map((o) => o.id),
        });
      }
    }
  }
  return contradictions;
}

/**
 * @param {object} store
 * @param {{ feedback?: object[], limit?: number }} [opts]
 */
async function auditGenerationFeedbackStore(store, opts = {}) {
  let records = opts.feedback;
  if (!records) {
    if (!store) return { ok: false, error: 'missing_store' };
    const listed = await listFeedback(store, { status: 'all', limit: opts.limit || 2000 });
    if (!listed.ok) return { ok: false, error: listed.error };
    records = listed.feedback || [];
  }

  const byStatus = { candidate: 0, approved: 0, active: 0, deprecated: 0, other: 0 };
  const byCategory = {
    grammar: 0,
    vocabulary: 0,
    naturalness: 0,
    CEFR: 0,
    exam_quality: 0,
    typo: 0,
    other: 0,
  };

  const tooSpecific = [];
  const tooGeneral = [];
  const balanced = [];
  const gateAccepted = [];
  const gateRejected = [];
  const duplicateGroups = new Map();

  for (const rec of records) {
    const st = rec.status && byStatus[rec.status] != null ? rec.status : 'other';
    byStatus[st]++;

    const cat = reportCategoryKey(resolveCategory(rec));
    if (byCategory[cat] != null) byCategory[cat]++;
    else byCategory.other++;

    const spec = specificityScore(rec);
    const row = {
      id: rec.id,
      status: rec.status,
      category: cat,
      type: rec.type,
      reason: (rec.reason || '').slice(0, 120),
      avoid: (rec.avoid || rec.wrong || '').slice(0, 80),
      prefer: (rec.use || rec.preferred || rec.correct || '').slice(0, 80),
      specificity: spec.label,
    };
    if (spec.label === 'too_specific_narrow') tooSpecific.push(row);
    else if (spec.label === 'too_general') tooGeneral.push(row);
    else if (spec.label === 'balanced') balanced.push(row);

    const gate = validateGenerationFeedbackRule(rec);
    if (gate.accepted) gateAccepted.push({ ...row, warnings: gate.warnings });
    else gateRejected.push({ ...row, reasons: gate.reasons });

    const key = dedupeKey(rec);
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(rec.id);
  }

  const duplicates = [...duplicateGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key: key.slice(0, 120), ids, count: ids.length }));

  const contradictions = findContradictions(records);

  const recommendations = {
    promoteToActive: gateAccepted
      .filter((r) => r.status === 'approved' || r.status === 'candidate')
      .slice(0, 50)
      .map((r) => r.id),
    demoteToCandidate: gateRejected
      .filter((r) => r.status === 'active' || r.status === 'approved')
      .slice(0, 50)
      .map((r) => r.id),
    reviewDuplicates: duplicates.slice(0, 30),
    reviewContradictions: contradictions.slice(0, 30),
  };

  return {
    ok: true,
    total: records.length,
    byStatus,
    byCategory,
    duplicates,
    tooSpecific,
    tooGeneral,
    balancedCount: balanced.length,
    contradictions,
    qualityGate: {
      accepted: gateAccepted.length,
      rejected: gateRejected.length,
      acceptedIds: gateAccepted.map((r) => r.id),
      rejectedSample: gateRejected.slice(0, 40),
    },
    recommendations,
    examples: {
      bad: tooSpecific.slice(0, 5).concat(tooGeneral.slice(0, 5)),
      good: balanced.slice(0, 10),
    },
  };
}

function formatAuditReport(audit) {
  if (!audit || !audit.ok) return `Audit failed: ${audit?.error || 'unknown'}`;
  const lines = [
    '# Generation Feedback Audit (PASO 8)',
    '',
    `Total records: ${audit.total}`,
    '',
    '## By status',
    ...Object.entries(audit.byStatus).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## By category',
    ...Object.entries(audit.byCategory).map(([k, v]) => `- ${k}: ${v}`),
    '',
    `## Duplicates: ${audit.duplicates.length} groups`,
    `## Too specific (narrow): ${audit.tooSpecific.length}`,
    `## Too general: ${audit.tooGeneral.length}`,
    `## Contradictions: ${audit.contradictions.length}`,
    '',
    '## Quality gate',
    `- accepted: ${audit.qualityGate.accepted}`,
    `- rejected: ${audit.qualityGate.rejected}`,
    '',
    '## Recommendations (ids only — no mutations applied)',
    `- promoteToActive: ${audit.recommendations.promoteToActive.length}`,
    `- demoteToCandidate: ${audit.recommendations.demoteToCandidate.length}`,
    '',
  ];
  return lines.join('\n');
}

module.exports = {
  auditGenerationFeedbackStore,
  formatAuditReport,
  specificityScore,
  findContradictions,
  TYPE_TO_CATEGORY,
};
