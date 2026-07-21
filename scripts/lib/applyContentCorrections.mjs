/**
 * ESM façades for PASO 5 apply + learning (offline scripts).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const applyLib = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));
export const feedbackSchema = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackSchema.js'));
export const feedbackStore = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));
export const extractLearning = require(path.join(ROOT, 'netlify/functions/lib/extractLearningFromCorrection.js'));

export const applyCorrection = applyLib.applyCorrection;
export const applyApprovedCorrections = applyLib.applyApprovedCorrections;
export const buildAdminApplyOptions = applyLib.buildAdminApplyOptions;
export const extractLearningFromCorrection = extractLearning.extractLearningFromCorrection;
export const createFeedback = feedbackStore.createFeedback;
export const getActiveFeedbackForPrompt = feedbackStore.getActiveFeedbackForPrompt;
export {
  getActiveGenerationFeedback,
  buildGenerationFeedbackContext,
  generationFeedbackPreview,
} from './generationFeedbackResolver.mjs';
export const FEEDBACK_TYPES = feedbackSchema.FEEDBACK_TYPES;
export const FEEDBACK_STATUSES = feedbackSchema.FEEDBACK_STATUSES;

export default applyLib;
