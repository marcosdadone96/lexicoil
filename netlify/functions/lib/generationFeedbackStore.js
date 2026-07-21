'use strict';

/**
 * generationFeedbackStore.js — Blobs store for generation learning rules (PASO 13 P0-2).
 * Keys: generation_feedback:{id}, generation_feedback_index
 *
 * Status workflow (no auto-activate):
 *   candidate → approved → active → deprecated
 * Generic updateFeedback must NOT change status — use approve/activate/deprecate.
 */

const {
  validateGenerationFeedback,
  FEEDBACK_STATUSES,
  FEEDBACK_CATEGORIES,
  canTransition,
  typeToDefaultCategory,
} = require('./generationFeedbackSchema.js');
const { validateGenerationFeedbackRule } = require('./validateGenerationFeedbackRule.js');

const INDEX_KEY = 'generation_feedback_index';
const INDEX_MAX = 3000;

function feedbackKey(id) {
  return `generation_feedback:${id}`;
}

function newFeedbackId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `gf-${Date.now().toString(36)}-${rand}`;
}

function historyEntry(action, user, extra = {}) {
  const ts = new Date().toISOString();
  return { action, user: user || 'unknown', date: ts, timestamp: ts, ...extra };
}

function toSummary(rec) {
  return {
    id: rec.id,
    type: rec.type,
    category: rec.category || typeToDefaultCategory(rec.type),
    severity: rec.severity || 'medium',
    status: rec.status,
    reason: rec.reason,
    rule: (rec.rule || '').slice(0, 120),
    module: rec.module,
    teil: rec.teil,
    sourceCorrection: rec.sourceCorrection || rec.createdFromCorrection || '',
    createdAt: rec.createdAt,
    activatedAt: rec.activatedAt || null,
    wrong: (rec.wrong || rec.avoid || '').slice(0, 80),
    correct: (rec.correct || rec.use || rec.preferred || '').slice(0, 80),
  };
}

async function loadIndex(store) {
  try {
    const index = await store.get(INDEX_KEY, { type: 'json' });
    return Array.isArray(index) ? index : [];
  } catch (_) {
    return [];
  }
}

async function saveIndex(store, index) {
  await store.setJSON(INDEX_KEY, index.slice(-INDEX_MAX));
}

async function loadFeedback(store, id) {
  if (!id) return null;
  try {
    return await store.get(feedbackKey(id), { type: 'json' });
  } catch (_) {
    return null;
  }
}

async function saveFeedback(store, rec) {
  await store.setJSON(feedbackKey(rec.id), rec);
  const index = await loadIndex(store);
  const summary = toSummary(rec);
  const i = index.findIndex((r) => r.id === rec.id);
  if (i >= 0) index[i] = summary;
  else index.push(summary);
  await saveIndex(store, index);
  return rec;
}

async function createFeedback(store, input, ctx = {}) {
  const validated = validateGenerationFeedback(input);
  if (!validated.ok) return { ok: false, error: 'validation_failed', errors: validated.errors };

  const id = newFeedbackId();
  const now = new Date().toISOString();
  const rec = {
    id,
    ...validated.value,
    status: 'candidate', // never create as active
    approvedBy: ctx.email || validated.value.approvedBy || '',
    createdAt: now,
    updatedAt: now,
    history: [historyEntry('created', ctx.email || 'system')],
  };
  await saveFeedback(store, rec);
  return { ok: true, feedback: rec };
}

async function listFeedback(store, opts = {}) {
  const status = opts.status ? String(opts.status).toLowerCase() : 'all';
  const limit = Math.min(Number(opts.limit) || 200, 500);
  const index = await loadIndex(store);
  let rows = index;
  if (status && status !== 'all') {
    if (!FEEDBACK_STATUSES.includes(status)) return { ok: false, error: 'invalid_status' };
    rows = rows.filter((r) => r.status === status);
  }
  if (opts.type) {
    const t = String(opts.type);
    rows = rows.filter((r) => r.type === t);
  }
  if (opts.category) {
    const c = String(opts.category).toLowerCase();
    rows = rows.filter((r) => String(r.category || '').toLowerCase() === c);
  }
  if (opts.module) {
    const m = String(opts.module).toLowerCase();
    rows = rows.filter((r) => String(r.module || '').toLowerCase() === m);
  }
  rows = [...rows].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const slice = rows.slice(0, limit);
  const feedback = [];
  for (const row of slice) {
    feedback.push((await loadFeedback(store, row.id)) || row);
  }
  const counts = { candidate: 0, approved: 0, active: 0, deprecated: 0, all: index.length };
  for (const r of index) {
    if (counts[r.status] != null) counts[r.status]++;
  }
  return { ok: true, feedback, count: feedback.length, counts, status };
}

/**
 * Edit fields (rule, severity, examples, …) — status changes forbidden.
 */
async function updateFeedback(store, id, patch, ctx = {}) {
  const existing = await loadFeedback(store, id);
  if (!existing) return { ok: false, error: 'not_found' };

  if (patch && patch.status !== undefined) {
    return {
      ok: false,
      error: 'status_via_promote_only',
      message: 'Use approve_generation_feedback / activate_generation_feedback / deprecate_generation_feedback',
    };
  }

  const validated = validateGenerationFeedback(patch, { partial: true });
  if (!validated.ok) return { ok: false, error: 'validation_failed', errors: validated.errors };

  const hist = Array.isArray(existing.history) ? [...existing.history] : [];
  hist.push(historyEntry('edited', ctx.email || 'admin', { fields: Object.keys(validated.value) }));

  const next = {
    ...existing,
    ...validated.value,
    status: existing.status, // immutable here
    updatedAt: new Date().toISOString(),
    history: hist,
  };
  await saveFeedback(store, next);
  return { ok: true, feedback: next };
}

async function approveFeedback(store, id, ctx = {}) {
  const existing = await loadFeedback(store, id);
  if (!existing) return { ok: false, error: 'not_found' };
  if (!canTransition(existing.status, 'approved')) {
    return { ok: false, error: 'invalid_transition', from: existing.status, to: 'approved' };
  }
  const hist = Array.isArray(existing.history) ? [...existing.history] : [];
  hist.push(historyEntry('approved', ctx.email || 'admin', { from: existing.status }));
  const next = {
    ...existing,
    status: 'approved',
    approvedBy: ctx.email || existing.approvedBy || '',
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: hist,
  };
  await saveFeedback(store, next);
  return { ok: true, feedback: next };
}

/**
 * Activate only after validateGenerationFeedbackRule accepts.
 * Optional patch (e.g. rule edit) applied before gate.
 */
async function activateFeedback(store, id, ctx = {}) {
  const existing = await loadFeedback(store, id);
  if (!existing) return { ok: false, error: 'not_found' };
  if (!canTransition(existing.status, 'active')) {
    return { ok: false, error: 'invalid_transition', from: existing.status, to: 'active' };
  }

  let draft = { ...existing };
  if (ctx.patch && typeof ctx.patch === 'object') {
    if (ctx.patch.status !== undefined) {
      return { ok: false, error: 'status_via_promote_only' };
    }
    const validated = validateGenerationFeedback(ctx.patch, { partial: true });
    if (!validated.ok) return { ok: false, error: 'validation_failed', errors: validated.errors };
    draft = { ...draft, ...validated.value };
  }

  // Ensure category present for legacy records
  if (!draft.category) draft.category = typeToDefaultCategory(draft.type);

  const gate = validateGenerationFeedbackRule(draft, { requireRule: true, minAssociated: 1 });
  if (!gate.accepted) {
    return {
      ok: false,
      error: 'activation_rejected',
      reasons: gate.reasons,
      warnings: gate.warnings,
      category: gate.category,
      evidence: gate.evidence,
    };
  }

  const user = ctx.email || 'admin';
  const now = new Date().toISOString();
  const hist = Array.isArray(draft.history) ? [...draft.history] : [];
  hist.push(historyEntry('activated', user, { from: existing.status, category: gate.category }));

  const next = {
    ...draft,
    status: 'active',
    category: gate.category,
    activatedAt: now,
    activatedBy: user,
    approvedBy: draft.approvedBy || user,
    updatedAt: now,
    history: hist,
  };
  await saveFeedback(store, next);
  return { ok: true, feedback: next, gate };
}

async function deprecateFeedback(store, id, ctx = {}) {
  const existing = await loadFeedback(store, id);
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.status === 'deprecated') {
    return { ok: true, feedback: existing, already: true };
  }
  if (!canTransition(existing.status, 'deprecated') && existing.status !== 'active' && existing.status !== 'approved' && existing.status !== 'candidate') {
    return { ok: false, error: 'invalid_transition', from: existing.status, to: 'deprecated' };
  }
  // Allow deprecate from candidate/approved/active (canTransition covers these)
  if (!canTransition(existing.status, 'deprecated')) {
    return { ok: false, error: 'invalid_transition', from: existing.status, to: 'deprecated' };
  }

  const hist = Array.isArray(existing.history) ? [...existing.history] : [];
  hist.push(
    historyEntry('deprecated', ctx.email || 'admin', {
      from: existing.status,
      note: ctx.note || '',
    }),
  );
  const next = {
    ...existing,
    status: 'deprecated',
    deprecatedAt: new Date().toISOString(),
    deprecatedBy: ctx.email || '',
    updatedAt: new Date().toISOString(),
    history: hist,
  };
  await saveFeedback(store, next);
  return { ok: true, feedback: next };
}

/**
 * Format active feedback for prompt injection (active only — PASO 13).
 */
async function getActiveFeedbackForPrompt(store, opts = {}) {
  const {
    getActiveGenerationFeedback,
    buildGenerationFeedbackContext,
  } = require('./generationFeedbackResolver.js');
  const resolved = await getActiveGenerationFeedback(store, opts);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, lines: [], feedback: [], promptBlock: '' };
  }
  const ctx = buildGenerationFeedbackContext(resolved.rules);
  const lines = resolved.rules.map((r) => {
    const bits = [`[${r.type}]`];
    if (r.avoid) bits.push(`Avoid: ${r.avoid.slice(0, 120)}`);
    if (r.prefer) bits.push(`Prefer: ${r.prefer.slice(0, 120)}`);
    if (r.rule) bits.push(r.rule.slice(0, 160));
    return bits.join(' ');
  });
  return {
    ok: true,
    feedback: resolved.rules,
    rules: resolved.rules,
    lines,
    promptBlock: ctx.block,
    skipped: resolved.skipped,
  };
}

function feedbackMetrics(indexOrCounts) {
  if (indexOrCounts && indexOrCounts.candidate != null) {
    return {
      candidate_count: indexOrCounts.candidate || 0,
      approved_count: indexOrCounts.approved || 0,
      active_count: indexOrCounts.active || 0,
      deprecated_count: indexOrCounts.deprecated || 0,
    };
  }
  const counts = { candidate: 0, approved: 0, active: 0, deprecated: 0 };
  for (const r of indexOrCounts || []) {
    if (counts[r.status] != null) counts[r.status]++;
  }
  return {
    candidate_count: counts.candidate,
    approved_count: counts.approved,
    active_count: counts.active,
    deprecated_count: counts.deprecated,
  };
}

module.exports = {
  INDEX_KEY,
  feedbackKey,
  createFeedback,
  listFeedback,
  loadFeedback,
  updateFeedback,
  approveFeedback,
  activateFeedback,
  deprecateFeedback,
  saveFeedback,
  toSummary,
  getActiveFeedbackForPrompt,
  feedbackMetrics,
  FEEDBACK_STATUSES,
  FEEDBACK_CATEGORIES,
};
