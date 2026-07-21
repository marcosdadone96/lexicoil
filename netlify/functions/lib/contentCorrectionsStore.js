'use strict';

/**
 * contentCorrectionsStore.js — Admin content-correction patches (Netlify Blobs).
 *
 * Why Blobs (not Supabase): same pattern as stagingStore / poolIndex / reusableParts —
 * content workflow already lives in lexicoil-data Blobs; admin auth stays on Supabase
 * (lc_admin_roles) while patch payloads stay next to staging candidates.
 *
 * Keys:
 *   content_correction:{id}     — full record
 *   content_corrections_index   — summary rows for list/filter (capped)
 */

const fs = require('fs');
const path = require('path');
const {
  validateContentCorrection,
  normalizeSourceFile,
  normalizeOrigin,
  STATUSES,
} = require('./contentCorrectionSchema.js');

const INDEX_KEY = 'content_corrections_index';
const INDEX_MAX = 2000;

function correctionKey(id) {
  return `content_correction:${id}`;
}

function newCorrectionId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cc-${Date.now().toString(36)}-${rand}`;
}

function historyEntry(action, user, extra = {}) {
  const ts = new Date().toISOString();
  return {
    action,
    user: user || 'unknown',
    date: ts,
    timestamp: ts,
    ...extra,
  };
}

function toSummary(rec) {
  const origin = normalizeOrigin(rec.origin);
  return {
    id: rec.id,
    origin,
    sourceFile: rec.sourceFile || '',
    assemblyStage: rec.assemblyStage || '',
    module: rec.module,
    teil: rec.teil,
    targetType: rec.targetType,
    targetId: rec.targetId || '',
    fieldPath: rec.fieldPath,
    status: rec.status,
    syncStatus: rec.syncStatus || null,
    reason: rec.reason,
    createdBy: rec.createdBy,
    createdAt: rec.createdAt,
    appliedAt: rec.appliedAt || null,
  };
}

/** Compact summary for API responses / future admin panel (no source JSON needed). */
function panelSummary(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const origin = normalizeOrigin(rec.origin);
  return {
    origin,
    sourceFile: rec.sourceFile || '',
    assemblyStage: rec.assemblyStage || '',
    module: rec.module,
    teil: rec.teil,
    targetType: rec.targetType,
    targetId: rec.targetId || '',
    fieldPath: rec.fieldPath,
  };
}

/** Stable compare for oldValue/newValue (strings, numbers, arrays, null). */
function canonicalValue(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    try {
      return JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  }
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

function valuesEqual(a, b) {
  return canonicalValue(a) === canonicalValue(b);
}

/**
 * Location half of the dedupe key (no newValue).
 *
 * Shared by dedupeFingerprint and findPendingDuplicates so the two cannot drift.
 *
 * Intentional split: findPendingDuplicates may omit newValue to list *all* pending
 * edits at the same site (content: file+targetId+fieldPath; assembly: stage+module+teil+fieldPath).
 * dedupeFingerprint always appends canonical newValue for exact-change identity.
 */
function dedupeLocationKey(input) {
  const origin = normalizeOrigin(input && input.origin);
  const fp = String((input && input.fieldPath) || '').trim();
  if (origin === 'assembly') {
    return [
      'assembly',
      String((input && input.assemblyStage) || '').trim(),
      String((input && input.module) || '')
        .trim()
        .toLowerCase(),
      String(Number(input && input.teil)),
      fp,
    ].join('\u0001');
  }
  return [
    'content',
    normalizeSourceFile(input && input.sourceFile),
    String((input && input.targetId) || '').trim(),
    fp,
  ].join('\u0001');
}

/**
 * Stable dedupe key for an exact pending change.
 * - content:  sourceFile + targetId + fieldPath + newValue
 * - assembly: assemblyStage + module + teil + fieldPath + newValue
 *   (fieldPath alone is not enough — e.g. "example" exists on several Teile)
 */
function dedupeFingerprint(input) {
  return `${dedupeLocationKey(input)}\u0001${canonicalValue(input && input.newValue)}`;
}

/**
 * Find pending corrections matching the origin-specific location key
 * (+ optional newValue filter when provided).
 * Uses dedupeLocationKey / valuesEqual — same normalizers as dedupeFingerprint.
 */
async function findPendingDuplicates(store, query) {
  const loc = dedupeLocationKey(query);
  const index = await loadIndex(store);

  const candidates = index.filter(
    (r) => r && r.status === 'pending' && dedupeLocationKey(r) === loc,
  );

  const out = [];
  for (const row of candidates) {
    const full = await loadCorrection(store, row.id);
    if (!full || full.status !== 'pending') continue;
    if (query.newValue !== undefined && !valuesEqual(full.newValue, query.newValue)) continue;
    out.push(full);
  }
  out.sort((a, b) => {
    const ca = String(a.createdAt || '');
    const cb = String(b.createdAt || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return out;
}

async function hardDeleteCorrection(store, id) {
  if (!id) return;
  try {
    await store.delete(correctionKey(id));
  } catch (_) {
    /* ignore */
  }
  const index = await loadIndex(store);
  await saveIndex(
    store,
    index.filter((r) => r.id !== id),
  );
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

async function loadCorrection(store, id) {
  if (!id) return null;
  try {
    return await store.get(correctionKey(id), { type: 'json' });
  } catch (_) {
    return null;
  }
}

async function saveCorrection(store, rec) {
  await store.setJSON(correctionKey(rec.id), rec);
  const index = await loadIndex(store);
  const summary = toSummary(rec);
  const i = index.findIndex((r) => r.id === rec.id);
  if (i >= 0) index[i] = summary;
  else index.push(summary);
  await saveIndex(store, index);
  return rec;
}

/**
 * Resolve source JSON on disk when available (local / included_files).
 * @returns {{ ok: boolean, path?: string, batch?: object, error?: string }}
 */
function tryLoadSourceBatch(sourceFile, projectRoot) {
  const base = normalizeSourceFile(sourceFile);
  if (!base) return { ok: false, error: 'missing_sourceFile' };
  const root = projectRoot || path.join(__dirname, '..', '..', '..');
  const candidates = [
    path.join(root, 'batches/ready/pool-verified', `${base}.json`),
    path.join(root, 'batches/generated', `${base}.json`),
    path.join(root, 'batches/ready/lesen', `${base}.json`),
    path.join(root, 'batches/merged', `${base}.json`),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const batch = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ok: true, path: p, batch };
    } catch (err) {
      return { ok: false, error: `unreadable_source:${err.message}` };
    }
  }
  return { ok: false, error: 'sourceFile_not_found_on_disk' };
}

/**
 * Soft existence check for targetId inside a batch (questions / passages).
 * @returns {{ ok: boolean, error?: string }}
 */
function assertTargetInBatch(batch, targetType, targetId) {
  if (!batch || !targetId) return { ok: true };
  const qHit = (batch.questions || []).some((q) => q && String(q.id) === targetId);
  const pHit = (batch.passages || []).some((p) => p && String(p.id) === targetId);
  if (targetType === 'passage' || targetType === 'transcript') {
    if (pHit || qHit) return { ok: true };
    // some horen parts use passage id only on questions.passageId
    const viaQ = (batch.questions || []).some((q) => String(q.passageId || '') === targetId);
    if (viaQ) return { ok: true };
    return { ok: false, error: 'targetId_not_in_source' };
  }
  if (['question', 'option', 'explanation', 'vocabularyTags', 'grammarTags', 'difficulty'].includes(targetType)) {
    if (qHit) return { ok: true };
    return { ok: false, error: 'targetId_not_in_source' };
  }
  // other: accept if either
  if (qHit || pHit) return { ok: true };
  return { ok: false, error: 'targetId_not_in_source' };
}

/**
 * Create a pending correction (or reuse / ignore).
 * Opt-in auto-approve: input.autoApprove===true AND ctx.isAdmin===true → status approved
 * (skips pending wait; still writes created + status_changed history).
 * @param {object} store
 * @param {object} input — raw body fields (+ optional autoApprove)
 * @param {{ email: string, projectRoot?: string, requireSourceOnDisk?: boolean, isAdmin?: boolean }} ctx
 * @returns {Promise<object>} ok + correction | reused | ignored | validation error
 */
async function createCorrection(store, input, ctx = {}) {
  const validated = validateContentCorrection(input);
  if (!validated.ok) {
    return { ok: false, error: 'validation_failed', errors: validated.errors };
  }

  const value = validated.value;
  const origin = normalizeOrigin(value.origin);
  const wantAutoApprove =
    input?.autoApprove === true ||
    input?.autoApprove === 'true' ||
    input?.autoApprove === 1;
  const doAutoApprove = wantAutoApprove && (ctx.isAdmin === true || ctx.canApprove === true);

  // No-op patches must not enter the queue.
  if (valuesEqual(value.oldValue, value.newValue)) {
    return {
      ok: true,
      ignored: true,
      reason: 'no_changes',
      message: 'No hay cambios entre oldValue y newValue.',
      summary: panelSummary({ ...value, status: 'pending' }),
    };
  }

  const warnings = [];
  // Disk / target checks only apply to content origin (and only when sourceFile is set).
  if (origin === 'content') {
    const disk = tryLoadSourceBatch(value.sourceFile, ctx.projectRoot);
    if (!disk.ok) {
      warnings.push(disk.error || 'sourceFile_not_found_on_disk');
      if (ctx.requireSourceOnDisk) {
        return { ok: false, error: 'sourceFile_not_found', errors: [disk.error], warnings };
      }
    } else {
      const t = assertTargetInBatch(disk.batch, value.targetType, value.targetId);
      if (!t.ok) {
        warnings.push(t.error);
        if (ctx.requireSourceOnDisk) {
          return { ok: false, error: t.error, errors: [t.error], warnings };
        }
      }
    }
  }

  const dedupeQuery =
    origin === 'assembly'
      ? {
          origin: 'assembly',
          assemblyStage: value.assemblyStage,
          module: value.module,
          teil: value.teil,
          fieldPath: value.fieldPath,
          newValue: value.newValue,
        }
      : {
          origin: 'content',
          sourceFile: value.sourceFile,
          targetId: value.targetId,
          fieldPath: value.fieldPath,
          newValue: value.newValue,
        };

  // Dedup: same pending change → reuse (tabs / admins / double-submit).
  const existing = await findPendingDuplicates(store, dedupeQuery);
  if (existing.length) {
    const keep = existing[0];
    return {
      ok: true,
      reused: true,
      correction: keep,
      correctionId: keep.id,
      message: 'Ya existe una corrección pendiente para este cambio.',
      summary: panelSummary(keep),
      warnings,
    };
  }

  const id = newCorrectionId();
  const now = new Date().toISOString();
  const user = ctx.email || 'admin';
  const history = [historyEntry('created', user)];
  let status = 'pending';
  if (doAutoApprove) {
    status = 'approved';
    history.push(
      historyEntry('status_changed', user, {
        from: 'pending',
        to: 'approved',
        autoApprove: true,
        note: 'auto_approved_on_create',
      }),
    );
  } else if (wantAutoApprove && ctx.isAdmin !== true) {
    warnings.push('autoApprove_ignored_not_admin');
  }

  const rec = {
    id,
    ...value,
    origin,
    // Never trust client-supplied status on create — only autoApprove+isAdmin may set approved.
    status,
    createdBy: user,
    createdAt: now,
    appliedAt: null,
    appliedBy: null,
    history,
  };

  await saveCorrection(store, rec);

  // Race: another create may have landed the same fingerprint — keep oldest.
  const after = await findPendingDuplicates(store, dedupeQuery);
  if (after.length > 1) {
    const keep = after[0];
    for (const extra of after.slice(1)) {
      await hardDeleteCorrection(store, extra.id);
    }
    if (keep.id !== rec.id) {
      return {
        ok: true,
        reused: true,
        correction: keep,
        correctionId: keep.id,
        message: 'Ya existe una corrección pendiente para este cambio.',
        summary: panelSummary(keep),
        warnings,
      };
    }
  }

  return {
    ok: true,
    reused: false,
    correction: rec,
    correctionId: rec.id,
    summary: panelSummary(rec),
    warnings,
  };
}

/**
 * @param {object} store
 * @param {{ status?: string, limit?: number, module?: string, sourceFile?: string }} [opts]
 */
async function listCorrections(store, opts = {}) {
  const status = opts.status ? String(opts.status).toLowerCase() : 'pending';
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const index = await loadIndex(store);
  let rows = index;
  if (status && status !== 'all') {
    if (!STATUSES.includes(status)) {
      return { ok: false, error: 'invalid_status' };
    }
    rows = rows.filter((r) => r.status === status);
  }
  if (opts.module) {
    const m = String(opts.module).toLowerCase();
    rows = rows.filter((r) => String(r.module).toLowerCase() === m);
  }
  if (opts.sourceFile) {
    const sf = normalizeSourceFile(opts.sourceFile);
    rows = rows.filter((r) => normalizeSourceFile(r.sourceFile) === sf);
  }
  rows = [...rows].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const slice = rows.slice(0, limit);

  // Optionally hydrate full records
  const corrections = [];
  for (const row of slice) {
    const full = await loadCorrection(store, row.id);
    corrections.push(full || row);
  }

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    applied: 0,
    conflict: 0,
    failed: 0,
    all: index.length,
  };
  for (const r of index) {
    if (counts[r.status] != null) counts[r.status]++;
  }

  return { ok: true, corrections, count: corrections.length, counts, status };
}

/**
 * PATCH: status and/or editable fields (newValue, comment, reason).
 * PASO 4: status may be pending|approved|rejected — never applied (PASO 5).
 */
async function updateCorrection(store, id, patch, ctx = {}) {
  const existing = await loadCorrection(store, id);
  if (!existing) return { ok: false, error: 'not_found' };

  const user = ctx.email || 'admin';
  const validated = validateContentCorrection(patch, { partial: true });
  if (!validated.ok) {
    return { ok: false, error: 'validation_failed', errors: validated.errors };
  }

  if (validated.value.status === 'applied') {
    return {
      ok: false,
      error: 'applied_not_allowed',
      errors: ['applied_reserved_for_apply_engine'],
    };
  }
  if (validated.value.status === 'conflict' || validated.value.status === 'failed') {
    return {
      ok: false,
      error: 'status_reserved',
      errors: [`${validated.value.status}_reserved_for_apply_engine`],
    };
  }

  const next = { ...existing };
  const hist = Array.isArray(next.history) ? [...next.history] : [];
  const note =
    patch.historyNote != null
      ? String(patch.historyNote).trim()
      : patch.note != null
        ? String(patch.note).trim()
        : '';

  if (validated.value.newValue !== undefined && !valuesEqual(validated.value.newValue, existing.newValue)) {
    hist.push(
      historyEntry('edited', user, {
        field: 'newValue',
        oldValue: existing.newValue,
        newValue: validated.value.newValue,
        ...(note ? { comment: note } : {}),
      }),
    );
    next.newValue = validated.value.newValue;
  }
  if (validated.value.comment !== undefined && validated.value.comment !== existing.comment) {
    hist.push(
      historyEntry('edited', user, {
        field: 'comment',
        oldValue: existing.comment,
        newValue: validated.value.comment,
      }),
    );
    next.comment = validated.value.comment;
  }
  if (validated.value.reason !== undefined && validated.value.reason !== existing.reason) {
    hist.push(
      historyEntry('edited', user, {
        field: 'reason',
        oldValue: existing.reason,
        newValue: validated.value.reason,
      }),
    );
    next.reason = validated.value.reason;
  }
  // oldValue / sourceFile / targetId / fieldPath / createdBy / createdAt are immutable on purpose

  if (validated.value.status !== undefined && validated.value.status !== existing.status) {
    const to = validated.value.status;
    if (to === 'applied') {
      return { ok: false, error: 'applied_not_allowed', errors: ['applied_reserved_for_apply_engine'] };
    }
    if (to === 'conflict' || to === 'failed') {
      return {
        ok: false,
        error: 'status_reserved',
        errors: [`${to}_reserved_for_apply_engine`],
      };
    }
    // Re-approve after conflict/failed: admin must set oldValue-aligned new patch first if needed
    hist.push(
      historyEntry('status_changed', user, {
        from: existing.status,
        to,
        ...(note ? { comment: note } : {}),
      }),
    );
    next.status = to;
    next.appliedAt = null;
    next.appliedBy = null;
  }

  next.history = hist;
  await saveCorrection(store, next);
  return { ok: true, correction: next };
}

/**
 * Soft-reject (default) or hard-delete from Blobs.
 * Soft reject keeps the record; optional ctx.comment goes into history.
 */
async function deleteCorrection(store, id, ctx = {}) {
  const existing = await loadCorrection(store, id);
  if (!existing) return { ok: false, error: 'not_found' };

  if (ctx.hard) {
    await hardDeleteCorrection(store, id);
    return { ok: true, deleted: true, id };
  }

  return updateCorrection(
    store,
    id,
    {
      status: 'rejected',
      ...(ctx.comment != null ? { historyNote: String(ctx.comment) } : {}),
      ...(ctx.comment != null && existing.comment !== ctx.comment
        ? { comment: String(ctx.comment) }
        : {}),
    },
    ctx,
  );
}

module.exports = {
  INDEX_KEY,
  correctionKey,
  newCorrectionId,
  toSummary,
  panelSummary,
  valuesEqual,
  canonicalValue,
  dedupeLocationKey,
  dedupeFingerprint,
  findPendingDuplicates,
  loadIndex,
  loadCorrection,
  saveCorrection,
  createCorrection,
  listCorrections,
  updateCorrection,
  deleteCorrection,
  tryLoadSourceBatch,
  assertTargetInBatch,
  historyEntry,
  STATUSES,
};
