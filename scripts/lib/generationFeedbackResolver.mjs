/**
 * ESM façade — generation feedback resolver (PASO 6 observation layer).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackResolver.js'));

export const getActiveGenerationFeedback = lib.getActiveGenerationFeedback;
export const buildGenerationFeedbackContext = lib.buildGenerationFeedbackContext;
export const appendFeedbackBlock = lib.appendFeedbackBlock;
export const appendGenerationFeedback = lib.appendGenerationFeedback;
export const generationFeedbackPreview = lib.generationFeedbackPreview;
export const isSafeForGeneration = lib.isSafeForGeneration;
export const toReusableRule = lib.toReusableRule;
export const dedupeRules = lib.dedupeRules;
export const isGenerationFeedbackEnabled = lib.isGenerationFeedbackEnabled;
export const resolveFeedbackMode = lib.resolveFeedbackMode;
export const selectRulesForPrompt = lib.selectRulesForPrompt;
export const GENERATION_STATUSES = lib.GENERATION_STATUSES;
export const FEEDBACK_MODES = lib.FEEDBACK_MODES;
export const DEFAULT_MAX_FEEDBACK_RULES = lib.DEFAULT_MAX_FEEDBACK_RULES;
export const FEEDBACK_VERSION = lib.FEEDBACK_VERSION;
export default lib;
