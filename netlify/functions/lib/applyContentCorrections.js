'use strict';

/**
 * applyContentCorrections.js — PASO 5 controlled apply of approved corrections to pool JSON.
 *
 * Flow: validate → backup → write fieldPath → post-validate → metadata → learning → mark applied
 * On conflict (oldValue ≠ current): status=conflict, no write.
 * On post-validate fail: rollback file, status=failed.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const {
  ALLOWED_APPLY_FIELD_PATHS,
  normalizeSourceFile,
} = require('./contentCorrectionSchema.js');
const {
  loadCorrection,
  listCorrections,
  saveCorrection,
  historyEntry,
  valuesEqual,
  tryLoadSourceBatch,
} = require('./contentCorrectionsStore.js');
const { extractLearningFromCorrection } = require('./extractLearningFromCorrection.js');
const { createFeedback } = require('./generationFeedbackStore.js');
const { regenerateCorrectionMetadata } = require('./regenerateCorrectionMetadata.js');

const LEAF_FIELDS = new Set(ALLOWED_APPLY_FIELD_PATHS);

function dryRunFingerprint(correction) {
  const payload = JSON.stringify({
    sourceFile: correction.sourceFile,
    targetId: correction.targetId,
    fieldPath: correction.fieldPath,
    oldValue: correction.oldValue,
    newValue: correction.newValue,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

async function recordDryRunOk(store, correction, user) {
  const fp = dryRunFingerprint(correction);
  const hist = Array.isArray(correction.history) ? [...correction.history] : [];
  hist.push(historyEntry('dry_run', user, { fingerprint: fp, ok: true }));
  const next = {
    ...correction,
    lastDryRunAt: new Date().toISOString(),
    lastDryRunFingerprint: fp,
    history: hist,
  };
  await saveCorrection(store, next);
  return next;
}

function projectRootFrom(ctx) {
  return ctx.projectRoot || path.join(__dirname, '..', '..', '..');
}

function backupDir(root) {
  return path.join(root, 'backups', 'content-corrections');
}

function resolveFieldKey(fieldPath) {
  const fp = String(fieldPath || '').trim();
  if (!fp || /\[\d+\]/.test(fp)) return null;
  const parts = fp.split('.');
  const leaf = parts[parts.length - 1];
  if (!LEAF_FIELDS.has(leaf)) return null;
  // Disallow nested dangerous paths beyond a single leaf (or known aliases)
  if (parts.length > 2) return null;
  if (parts.length === 2 && !['passage', 'question', 'transcript'].includes(parts[0])) {
    // allow only simple leaves
    if (parts[0] !== leaf) return null;
  }
  return leaf;
}

function findTargetObject(batch, targetId, targetType) {
  const tid = String(targetId);
  const questions = Array.isArray(batch.questions) ? batch.questions : [];
  const passages = Array.isArray(batch.passages) ? batch.passages : [];

  const q = questions.find((x) => x && String(x.id) === tid);
  const p = passages.find((x) => x && String(x.id) === tid);

  if (targetType === 'passage' || targetType === 'transcript') {
    if (p) return { kind: 'passage', obj: p };
    // some batches use passageId only on questions
    if (q && q.passageId) {
      const via = passages.find((x) => x && String(x.id) === String(q.passageId));
      if (via) return { kind: 'passage', obj: via };
    }
    // single-passage files sometimes omit passages[].id matching — allow question hit only for non-passage types
    return null;
  }

  if (q) return { kind: 'question', obj: q };
  if (p && (targetType === 'other' || !targetType)) return { kind: 'passage', obj: p };
  return null;
}

function readField(obj, leaf) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (leaf === 'correctAnswer' && obj.correct != null && obj.correctAnswer == null) return obj.correct;
  if (leaf === 'correct' && obj.correct == null && obj.correctAnswer != null) return obj.correctAnswer;
  return obj[leaf];
}

function writeField(obj, leaf, value) {
  obj[leaf] = value;
  if (leaf === 'correct') obj.correctAnswer = value;
  if (leaf === 'correctAnswer') obj.correct = value;
}

function structuralValidate(batch) {
  const errors = [];
  if (!batch || typeof batch !== 'object') return { ok: false, errors: ['invalid_json_object'] };
  try {
    JSON.stringify(batch);
  } catch (err) {
    return { ok: false, errors: [`json_stringify:${err.message}`] };
  }
  const qs = batch.questions || [];
  if (!Array.isArray(qs) && batch.questions != null) errors.push('questions_not_array');
  for (const q of qs) {
    if (!q || q.id == null) {
      errors.push('question_missing_id');
      continue;
    }
    if (Array.isArray(q.options) && q.options.length) {
      const correct = q.correct != null ? q.correct : q.correctAnswer;
      if (correct != null && correct !== '' && correct !== 'rubric') {
        const keys = q.options.map((o) =>
          typeof o === 'string' ? o.trim() : String(o.key != null ? o.key : o).trim(),
        );
        const c = Array.isArray(correct) ? correct.map(String) : [String(correct)];
        const ok = c.every((x) => keys.includes(x) || keys.includes(x.toUpperCase()) || keys.includes(x.toLowerCase()));
        // ja/nein / R/F often have no options
        if (q.options.length >= 2 && !ok && !/^(J|N|R|F|Ja|Nein)$/i.test(String(correct))) {
          errors.push(`correct_not_in_options:${q.id}`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function writeBackup(root, sourcePath, batch, correctionIds) {
  const dir = backupDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(sourcePath, '.json');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(dir, `${base}_${stamp}.json`);
  const payload = {
    _backupMeta: {
      sourcePath,
      createdAt: new Date().toISOString(),
      correctionIds: correctionIds || [],
    },
    batch,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');
  return out;
}

async function markStatus(store, correction, status, user, extra = {}) {
  const hist = Array.isArray(correction.history) ? [...correction.history] : [];
  hist.push(
    historyEntry(status === 'applied' ? 'applied' : 'status_changed', user, {
      from: correction.status,
      to: status,
      ...extra,
    }),
  );
  const next = {
    ...correction,
    status,
    history: hist,
  };
  if (status === 'applied') {
    next.appliedAt = new Date().toISOString();
    next.appliedBy = user;
  }
  await saveCorrection(store, next);
  return next;
}

/**
 * Dry-run or apply a single approved correction.
 * @param {object} store — Blobs store (for correction + feedback records)
 * @param {string} correctionId
 * @param {{ email?: string, projectRoot?: string, dryRun?: boolean, skipLearning?: boolean, regenerateMetadata?: Function, syncEnabled?: boolean, confirmPublish?: boolean, localOnly?: boolean, skipBlob?: boolean, skipSeed?: boolean, skipPublished?: boolean, blobStore?: object, lang?: string, level?: string }} ctx
 */
async function applyCorrection(store, correctionId, ctx = {}) {
  const user = ctx.email || 'admin';
  const root = projectRootFrom(ctx);
  const dryRun = !!ctx.dryRun;

  const correction = await loadCorrection(store, correctionId);
  if (!correction) return { ok: false, error: 'not_found', correctionId };

  if (correction.status === 'conflict') {
    return {
      ok: false,
      error: 'status_conflict',
      correction,
      message: 'Resuelve el conflicto y vuelve a aprobar.',
    };
  }
  if (correction.status !== 'approved' && correction.status !== 'failed') {
    return { ok: false, error: 'not_approved', status: correction.status, correction };
  }

  const leaf = resolveFieldKey(correction.fieldPath);
  if (!leaf) {
    return { ok: false, error: 'invalid_fieldPath', fieldPath: correction.fieldPath };
  }

  const disk = tryLoadSourceBatch(correction.sourceFile, root);
  if (!disk.ok || !disk.batch || !disk.path) {
    return {
      ok: false,
      error: 'sourceFile_not_found',
      detail: disk.error,
      sourceFile: correction.sourceFile,
    };
  }

  const target = findTargetObject(disk.batch, correction.targetId, correction.targetType);
  if (!target) {
    return {
      ok: false,
      error: 'targetId_not_found',
      targetId: correction.targetId,
      sourceFile: correction.sourceFile,
    };
  }

  const current = readField(target.obj, leaf);
  if (!valuesEqual(current, correction.oldValue)) {
    if (!dryRun) {
      await markStatus(store, correction, 'conflict', user, {
        expectedOld: correction.oldValue,
        actual: current,
        sourceFile: correction.sourceFile,
        correctionId: correction.id,
      });
    }
    return {
      ok: false,
      error: 'conflict',
      status: 'conflict',
      correctionId: correction.id,
      expectedOld: correction.oldValue,
      actual: current,
      message: 'oldValue no coincide con el JSON actual.',
    };
  }

  if (dryRun) {
    const updated = await recordDryRunOk(store, correction, user);
    return {
      ok: true,
      dryRun: true,
      wouldApply: true,
      correctionId: correction.id,
      sourceFile: correction.sourceFile,
      path: disk.path,
      fieldPath: leaf,
      targetId: correction.targetId,
      oldValue: correction.oldValue,
      newValue: correction.newValue,
      lastDryRunAt: updated.lastDryRunAt,
      lastDryRunFingerprint: updated.lastDryRunFingerprint,
    };
  }

  const fp = dryRunFingerprint(correction);
  if (!correction.lastDryRunAt || correction.lastDryRunFingerprint !== fp) {
    return {
      ok: false,
      error: 'confirm_required',
      message: 'Ejecuta dry-run (sin confirm:true) antes de aplicar.',
      correctionId: correction.id,
      requiresDryRun: true,
    };
  }

  const before = JSON.parse(JSON.stringify(disk.batch));
  let backupPath = null;
  try {
    backupPath = writeBackup(root, disk.path, before, [correction.id]);
    writeField(target.obj, leaf, correction.newValue);

    regenerateCorrectionMetadata(disk.batch, correction, {
      findTarget: findTargetObject,
    });
    if (typeof ctx.regenerateMetadata === 'function') {
      await ctx.regenerateMetadata(disk.batch, correction);
    }

    const gate = structuralValidate(disk.batch);
    if (!gate.ok) {
      fs.writeFileSync(disk.path, JSON.stringify(before, null, 2), 'utf8');
      await markStatus(store, correction, 'failed', user, {
        sourceFile: correction.sourceFile,
        correctionId: correction.id,
        errors: gate.errors,
        backupPath,
      });
      return { ok: false, error: 'post_validate_failed', errors: gate.errors, rolledBack: true, backupPath };
    }

    if (typeof ctx.postValidate === 'function') {
      const extra = await ctx.postValidate(disk.batch, correction);
      if (extra && extra.ok === false) {
        fs.writeFileSync(disk.path, JSON.stringify(before, null, 2), 'utf8');
        await markStatus(store, correction, 'failed', user, {
          sourceFile: correction.sourceFile,
          correctionId: correction.id,
          errors: extra.errors || ['post_validate_failed'],
          backupPath,
        });
        return {
          ok: false,
          error: 'post_validate_failed',
          errors: extra.errors,
          rolledBack: true,
          backupPath,
        };
      }
    }

    fs.writeFileSync(disk.path, JSON.stringify(disk.batch, null, 2), 'utf8');

    const applied = await markStatus(store, correction, 'applied', user, {
      sourceFile: correction.sourceFile,
      correctionId: correction.id,
      backupPath,
      timestamp: new Date().toISOString(),
    });

    let learning = null;
    if (!ctx.skipLearning) {
      const extracted = extractLearningFromCorrection(applied);
      if (extracted.reusable && extracted.feedback) {
        const fb = await createFeedback(store, extracted.feedback, { email: user });
        learning = { reusable: true, feedback: fb.feedback || null, kind: extracted.kind };
      } else {
        learning = { reusable: false, kind: extracted.kind, skipReason: extracted.skipReason };
      }
    }

    // PASO 13 P0-1 — opt-in runtime sync (default off)
    let sync = null;
    if (ctx.syncEnabled === true) {
      try {
        const { pathToFileURL } = require('url');
        // Sync module lives in the repo (not under fixture projectRoot).
        const syncPath = path.join(__dirname, '..', '..', '..', 'scripts', 'lib', 'syncCorrectionToRuntime.mjs');
        const syncMod = await import(pathToFileURL(syncPath).href);
        const syncResult = await syncMod.syncCorrectionToRuntime(applied, {
          projectRoot: root,
          confirm: true,
          dryRun: false,
          confirmPublish: ctx.confirmPublish === true,
          localOnly: ctx.localOnly === true,
          skipBlob: ctx.skipBlob === true,
          skipSeed: ctx.skipSeed === true,
          skipPublished: ctx.skipPublished === true,
          persistSyncStatus: true,
          correctionsStore: store,
          email: user,
          store: ctx.blobStore || undefined,
          lang: ctx.lang,
          level: ctx.level,
        });
        sync = syncResult;
        if (syncResult.report?.correction) {
          sync.correction = syncResult.report.correction;
        }
      } catch (err) {
        sync = { ok: false, error: err.message };
        const hist = Array.isArray(applied.history) ? [...applied.history] : [];
        hist.push(historyEntry('sync', user, { syncStatus: 'sync_failed', error: err.message }));
        const failedSync = {
          ...applied,
          syncStatus: 'sync_failed',
          history: hist,
        };
        await saveCorrection(store, failedSync);
        sync.correction = failedSync;
      }
    } else {
      // Traceability: applied but runtime not synced yet
      const hist = Array.isArray(applied.history) ? [...applied.history] : [];
      hist.push(
        historyEntry('sync', user, {
          syncStatus: 'sync_pending',
          note: 'syncEnabled=false',
        }),
      );
      const pending = { ...applied, syncStatus: 'sync_pending', history: hist };
      await saveCorrection(store, pending);
      sync = { ok: true, skipped: true, syncStatus: 'sync_pending', correction: pending };
    }

    return {
      ok: true,
      applied: true,
      correctionId: correction.id,
      sourceFile: correction.sourceFile,
      path: disk.path,
      backupPath,
      learning,
      correction: sync?.correction || applied,
      sync,
    };
  } catch (err) {
    try {
      if (before && disk.path) fs.writeFileSync(disk.path, JSON.stringify(before, null, 2), 'utf8');
    } catch (_) {
      /* ignore */
    }
    await markStatus(store, correction, 'failed', user, {
      sourceFile: correction.sourceFile,
      correctionId: correction.id,
      error: err.message,
      backupPath,
    });
    return { ok: false, error: 'apply_exception', message: err.message, rolledBack: true, backupPath };
  }
}

/**
 * Options for Admin API apply paths only.
 * syncEnabled defaults ON (seed+blobs); confirmPublish stays OFF unless explicit.
 * Callers may still pass syncEnabled:false / confirmPublish:true in the body.
 * @param {object} body
 * @param {string} email
 */
function buildAdminApplyOptions(body = {}, email) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    email,
    dryRun: b.confirm !== true,
    skipLearning: !!b.skipLearning,
    // Admin default: sync seed/blobs. Explicit false still disables.
    syncEnabled: b.syncEnabled !== false,
    confirmPublish: b.confirmPublish === true,
    localOnly: b.localOnly === true,
    skipBlob: b.skipBlob === true,
    skipSeed: b.skipSeed === true,
    skipPublished: b.skipPublished === true,
    lang: b.lang,
    level: b.level,
  };
}

/**
 * @param {object} store
 * @param {{ email?: string, projectRoot?: string, dryRun?: boolean, sourceFile?: string, module?: string, ids?: string[], limit?: number, skipLearning?: boolean, regenerateMetadata?: Function, postValidate?: Function, confirm?: boolean, syncEnabled?: boolean, confirmPublish?: boolean, localOnly?: boolean, skipBlob?: boolean, skipSeed?: boolean, skipPublished?: boolean, blobStore?: object, lang?: string, level?: string }} opts
 *
 * Default is dry-run. Real writes require `confirm: true` (and dryRun !== true).
 * Runtime sync (PASO 13) is opt-in via `syncEnabled: true` (default false on this engine /
 * CLI). Admin API uses buildAdminApplyOptions() which defaults syncEnabled to true.
 */
async function applyApprovedCorrections(store, opts = {}) {
  const doApply = opts.confirm === true && opts.dryRun !== true;

  const listed = await listCorrections(store, {
    status: 'approved',
    limit: opts.limit || 500,
    module: opts.module,
    sourceFile: opts.sourceFile,
  });
  if (!listed.ok) return { ok: false, error: listed.error };

  let items = listed.corrections || [];
  if (opts.ids && opts.ids.length) {
    const set = new Set(opts.ids.map(String));
    items = [];
    for (const id of set) {
      const c = await loadCorrection(store, id);
      if (c) items.push(c);
    }
    items = items.filter((c) => c.status === 'approved' || c.status === 'failed');
  }

  const plan = {
    corrections: items.length,
    files: new Set(),
    questions: new Set(),
    conflicts: [],
    wouldApply: [],
    learningEstimate: 0,
  };

  const results = [];
  for (const c of items) {
    const r = await applyCorrection(store, c.id, {
      ...opts,
      dryRun: true,
      skipLearning: true,
    });
    results.push(r);
    if (r.sourceFile || c.sourceFile) plan.files.add(normalizeSourceFile(r.sourceFile || c.sourceFile));
    if (r.targetId || c.targetId) plan.questions.add(String(r.targetId || c.targetId));
    if (r.error === 'conflict') plan.conflicts.push(r);
    if (r.ok && r.wouldApply) {
      plan.wouldApply.push(c.id);
      const ex = extractLearningFromCorrection(c);
      if (ex.reusable) plan.learningEstimate++;
    }
  }

  const summary = {
    corrections: items.length,
    filesAffected: plan.files.size,
    targetsAffected: plan.questions.size,
    questionsAffected: plan.questions.size,
    conflicts: plan.conflicts.length,
    learningRulesEstimated: plan.learningEstimate,
    learningRulesGenerated: plan.learningEstimate,
    wouldApply: plan.wouldApply.length,
  };

  if (!doApply) {
    return {
      ok: true,
      dryRun: true,
      summary,
      message:
        'Dry run — no se escribió ningún JSON. Confirma con confirm:true (o --confirm en CLI) para aplicar.',
      results,
      conflictDetails: plan.conflicts,
    };
  }

  const applied = [];
  const failed = [];
  const conflicts = [];
  for (const id of plan.wouldApply) {
    const r = await applyCorrection(store, id, { ...opts, dryRun: false });
    if (r.ok && r.applied) applied.push(r);
    else if (r.error === 'conflict') conflicts.push(r);
    else failed.push(r);
  }

  return {
    ok: failed.length === 0 && conflicts.length === 0,
    dryRun: false,
    summary: {
      ...summary,
      applied: applied.length,
      failed: failed.length,
      conflicts: conflicts.length,
      learningRulesGenerated: applied.filter((r) => r.learning && r.learning.reusable).length,
    },
    applied,
    failed,
    conflicts,
  };
}

module.exports = {
  applyCorrection,
  applyApprovedCorrections,
  buildAdminApplyOptions,
  resolveFieldKey,
  findTargetObject,
  structuralValidate,
  writeBackup,
  LEAF_FIELDS,
};
