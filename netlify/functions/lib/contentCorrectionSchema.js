'use strict';

/**
 * contentCorrectionSchema.js — validate admin content-correction records.
 * Shared by Netlify function + offline scripts (via scripts/lib/*.mjs re-export).
 *
 * Origins:
 *   content  — patch against a pool/batch JSON (sourceFile + targetId)
 *   assembly — bug in the exam-assembly pipeline (no single source file)
 *
 * Global locator rule: never use array indices in fieldPath (no foo[2].bar).
 * Locate assembled fields via module + teil + fieldPath (+ assemblyStage).
 */

const STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'applied',
  'conflict',
  'failed',
]);

/**
 * Runtime distribution status (PASO 13 P0-1) — separate from correction `status`.
 * correction.status = patch lifecycle; syncStatus = seed/blob/published visibility.
 */
const SYNC_STATUSES = Object.freeze([
  'sync_pending',
  'synced',
  'sync_failed',
  'published_stale',
]);

const ORIGINS = Object.freeze(['content', 'assembly']);

/** fieldPaths allowed when applying a correction to disk JSON. */
const ALLOWED_APPLY_FIELD_PATHS = Object.freeze([
  'title',
  'text',
  'topicTag',
  'question',
  'options',
  'correct',
  'correctAnswer',
  'explanation',
  'vocabularyTags',
  'grammarTags',
  'difficulty',
  'transcript',
  'signText',
  'statement',
]);

/**
 * Prose fields safe to hot-patch into the live exam session (S.examData).
 * Never includes scoring fields (options / correct / correctAnswer / tags / …).
 */
const HOT_PATCH_SAFE_FIELD_PATHS = Object.freeze([
  'text',
  'question',
  'explanation',
  'title',
  'transcript',
]);

function isHotPatchSafeFieldPath(fieldPath) {
  const leaf = String(fieldPath || '')
    .trim()
    .split('.')
    .pop();
  return HOT_PATCH_SAFE_FIELD_PATHS.includes(leaf);
}

const TARGET_TYPES = Object.freeze([
  'passage',
  'question',
  'option',
  'explanation',
  'vocabularyTags',
  'grammarTags',
  'difficulty',
  'transcript',
  'other',
]);

/**
 * fieldPath: dotted stable paths — never array indices like questions[3] or lesenParts[2].example.
 * Same rule for content and assembly (project-wide).
 */
const FIELD_PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
const FIELD_PATH_ARRAY_INDEX_RE = /\[\d+\]/;
const SOURCE_FILE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const TARGET_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const ASSEMBLY_STAGE_RE = /^[a-zA-Z_][a-zA-Z0-9_.-]{1,160}$/;
/** assemblyContext.builderFunction — code locator (file.fn or Class.method). */
const BUILDER_FUNCTION_RE = /^[a-zA-Z_][a-zA-Z0-9_./-]{1,200}$/;

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeOrigin(raw) {
  if (raw === undefined || raw === null || raw === '') return 'content';
  return String(raw).trim().toLowerCase();
}

/**
 * Validate fieldPath for any origin. Pushes into errors[]; returns true if ok / skipped.
 * @param {unknown} rawPath
 * @param {string[]} errors
 * @param {boolean} partial
 * @param {boolean} required
 */
function validateFieldPath(rawPath, errors, partial, required) {
  if (rawPath === undefined) {
    if (!partial && required) errors.push('missing_fieldPath');
    return;
  }
  if (rawPath === null || rawPath === '') {
    if (!partial && required) errors.push('missing_fieldPath');
    return;
  }
  if (typeof rawPath !== 'string') {
    errors.push('invalid_fieldPath');
    return;
  }
  const fp = rawPath.trim();
  // Explicit global ban — clear error (do not collapse into generic invalid_fieldPath).
  if (FIELD_PATH_ARRAY_INDEX_RE.test(fp)) {
    errors.push('fieldPath_array_index_forbidden');
    return;
  }
  if (!FIELD_PATH_RE.test(fp)) {
    errors.push('invalid_fieldPath');
  }
}

/**
 * @param {unknown} raw
 * @param {{ partial?: boolean }} [opts] — partial=true for PATCH (only validate present fields)
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
function validateContentCorrection(raw, opts = {}) {
  const partial = !!opts.partial;
  const errors = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['body must be an object'] };
  }

  const origin = normalizeOrigin(raw.origin);
  if (raw.origin !== undefined && raw.origin !== null && raw.origin !== '' && !ORIGINS.includes(origin)) {
    errors.push('invalid_origin');
  }

  const require = (key, pred, msg) => {
    if (partial && raw[key] === undefined) return;
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') {
      if (!partial) errors.push(`missing_${key}`);
      return;
    }
    if (!pred(raw[key])) errors.push(msg || `invalid_${key}`);
  };

  const requireOptional = (key, pred, msg) => {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') return;
    if (!pred(raw[key])) errors.push(msg || `invalid_${key}`);
  };

  // Shared fields (both origins) — module + teil are first-class locators
  require('module', (v) => typeof v === 'string' && ['lesen', 'horen', 'schreiben', 'sprechen', 'reading', 'listening', 'writing', 'speaking'].includes(String(v).toLowerCase()), 'invalid_module');
  require('teil', (v) => Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5, 'invalid_teil');
  const valueOk = (v) =>
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    Array.isArray(v) ||
    v === null;
  require('oldValue', valueOk, 'invalid_oldValue');
  require('newValue', valueOk, 'invalid_newValue');
  require('reason', (v) => typeof v === 'string' && String(v).trim().length >= 2, 'invalid_reason');

  // Global: fieldPath never carries array indices (content + assembly)
  validateFieldPath(raw.fieldPath, errors, partial, true);

  if (origin === 'assembly') {
    require(
      'assemblyStage',
      (v) => typeof v === 'string' && ASSEMBLY_STAGE_RE.test(String(v).trim()),
      'invalid_assemblyStage',
    );
    // Optional content anchors (may not exist for pure assembly bugs)
    requireOptional(
      'sourceFile',
      (v) => typeof v === 'string' && SOURCE_FILE_RE.test(v.replace(/\.json$/i, '')),
      'invalid_sourceFile',
    );
    requireOptional(
      'targetId',
      (v) => typeof v === 'string' && TARGET_ID_RE.test(v),
      'invalid_targetId',
    );
    requireOptional('targetType', (v) => TARGET_TYPES.includes(String(v)), 'invalid_targetType');

    // assemblyContext must name the builder that produces this field for module+teil
    if (!partial || raw.assemblyContext !== undefined) {
      if (raw.assemblyContext === undefined || raw.assemblyContext === null) {
        if (!partial) errors.push('missing_assemblyContext');
      } else if (!isPlainObject(raw.assemblyContext)) {
        errors.push('invalid_assemblyContext');
      } else {
        const bf = raw.assemblyContext.builderFunction;
        if (bf === undefined || bf === null || bf === '') {
          errors.push('missing_assemblyContext.builderFunction');
        } else if (typeof bf !== 'string' || !BUILDER_FUNCTION_RE.test(String(bf).trim())) {
          errors.push('invalid_assemblyContext.builderFunction');
        }
      }
    }
  } else {
    // content (default)
    require('sourceFile', (v) => typeof v === 'string' && SOURCE_FILE_RE.test(v.replace(/\.json$/i, '')), 'invalid_sourceFile');
    require('targetType', (v) => TARGET_TYPES.includes(String(v)), 'invalid_targetType');
    require('targetId', (v) => typeof v === 'string' && TARGET_ID_RE.test(v), 'invalid_targetId');
    if (!partial) {
      if (raw.assemblyStage != null && String(raw.assemblyStage).trim() !== '') {
        errors.push('assemblyStage_not_allowed_for_content');
      }
    }
  }

  if (raw.comment !== undefined && raw.comment !== null && typeof raw.comment !== 'string') {
    errors.push('invalid_comment');
  }
  if (raw.status !== undefined) {
    if (!STATUSES.includes(String(raw.status))) errors.push('invalid_status');
  } else if (!partial) {
    // default pending on create — ok
  }

  if (raw.syncStatus !== undefined && raw.syncStatus !== null && raw.syncStatus !== '') {
    if (!SYNC_STATUSES.includes(String(raw.syncStatus))) errors.push('invalid_syncStatus');
  }

  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history)) errors.push('invalid_history');
  }

  if (errors.length) return { ok: false, errors };

  const sourceFile = String(raw.sourceFile || '')
    .trim()
    .replace(/\.json$/i, '');

  const value = {
    origin,
    sourceFile,
    module: String(raw.module).toLowerCase(),
    teil: Number(raw.teil),
    targetType: raw.targetType != null && raw.targetType !== ''
      ? String(raw.targetType)
      : origin === 'assembly'
        ? 'other'
        : String(raw.targetType),
    targetId: raw.targetId != null ? String(raw.targetId).trim() : '',
    fieldPath: String(raw.fieldPath).trim(),
    oldValue: raw.oldValue,
    newValue: raw.newValue,
    reason: String(raw.reason).trim(),
    comment: raw.comment != null ? String(raw.comment).trim() : '',
    status: raw.status ? String(raw.status) : 'pending',
  };

  if (raw.syncStatus != null && String(raw.syncStatus).trim() !== '') {
    value.syncStatus = String(raw.syncStatus);
  }
  if (raw.syncReport != null && isPlainObject(raw.syncReport)) {
    value.syncReport = raw.syncReport;
  }

  if (origin === 'assembly') {
    value.assemblyStage = String(raw.assemblyStage).trim();
    const ctx = isPlainObject(raw.assemblyContext) ? { ...raw.assemblyContext } : {};
    if (ctx.builderFunction != null) ctx.builderFunction = String(ctx.builderFunction).trim();
    value.assemblyContext = ctx;
  }

  if (partial) {
    const out = {};
    for (const k of Object.keys(value)) {
      if (raw[k] !== undefined) out[k] = value[k];
    }
    if (raw.origin !== undefined) out.origin = origin;
    if (raw.sourceFile !== undefined) out.sourceFile = sourceFile;
    if (raw.assemblyStage !== undefined) out.assemblyStage = String(raw.assemblyStage).trim();
    if (raw.assemblyContext !== undefined) {
      const ctx = isPlainObject(raw.assemblyContext) ? { ...raw.assemblyContext } : {};
      if (ctx.builderFunction != null) ctx.builderFunction = String(ctx.builderFunction).trim();
      out.assemblyContext = ctx;
    }
    return { ok: true, value: out };
  }

  return { ok: true, value };
}

function normalizeSourceFile(name) {
  return String(name || '')
    .trim()
    .replace(/\.json$/i, '');
}

module.exports = {
  STATUSES,
  SYNC_STATUSES,
  ORIGINS,
  TARGET_TYPES,
  FIELD_PATH_RE,
  FIELD_PATH_ARRAY_INDEX_RE,
  SOURCE_FILE_RE,
  TARGET_ID_RE,
  ASSEMBLY_STAGE_RE,
  BUILDER_FUNCTION_RE,
  ALLOWED_APPLY_FIELD_PATHS,
  HOT_PATCH_SAFE_FIELD_PATHS,
  isHotPatchSafeFieldPath,
  validateContentCorrection,
  normalizeSourceFile,
  normalizeOrigin,
};
