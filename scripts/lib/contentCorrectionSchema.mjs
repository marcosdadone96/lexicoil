/**
 * contentCorrectionSchema.mjs — ESM façade over Netlify CJS schema (offline scripts).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionSchema.js'));

export const STATUSES = schema.STATUSES;
export const ORIGINS = schema.ORIGINS;
export const TARGET_TYPES = schema.TARGET_TYPES;
export const ALLOWED_APPLY_FIELD_PATHS = schema.ALLOWED_APPLY_FIELD_PATHS;
export const HOT_PATCH_SAFE_FIELD_PATHS = schema.HOT_PATCH_SAFE_FIELD_PATHS;
export const isHotPatchSafeFieldPath = schema.isHotPatchSafeFieldPath;
export const validateContentCorrection = schema.validateContentCorrection;
export const normalizeSourceFile = schema.normalizeSourceFile;
export const normalizeOrigin = schema.normalizeOrigin;
export default schema;
