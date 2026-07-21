/**
 * resolveGenerationFeedback.mjs — async resolve of rules for prompt builders (PASO 7–8).
 * Fail-safe: any error → empty rules (generation continues unchanged).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resolver = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackResolver.js'));

export const isGenerationFeedbackEnabled = resolver.isGenerationFeedbackEnabled;
export const resolveFeedbackMode = resolver.resolveFeedbackMode;
export const appendGenerationFeedback = resolver.appendGenerationFeedback;
export const selectRulesForPrompt = resolver.selectRulesForPrompt;
export const DEFAULT_MAX_FEEDBACK_RULES = resolver.DEFAULT_MAX_FEEDBACK_RULES;
export const FEEDBACK_VERSION = resolver.FEEDBACK_VERSION;
export const FEEDBACK_MODES = resolver.FEEDBACK_MODES;

async function tryOpenBlobsStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) return null;
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'lexicoil-data', siteID, token });
  } catch (_) {
    return null;
  }
}

/**
 * Resolve reusable rules for a generation attempt.
 * Modes off → []; preview|active → resolve rules.
 */
export async function resolveGenerationFeedbackRules(query = {}) {
  const mode = resolver.resolveFeedbackMode({
    feedbackMode: query.feedbackMode,
    enabled: query.enabled,
  });
  if (mode === 'off') return [];

  try {
    if (Array.isArray(query.feedbackRules) && query.feedbackRules.length) {
      return resolver.selectRulesForPrompt(query.feedbackRules, {
        maxRules: query.maxRules,
      });
    }

    const store = query.store || (Array.isArray(query.feedback) ? null : await tryOpenBlobsStore());
    const resolved = await resolver.getActiveGenerationFeedback(store, {
      module: query.module,
      level: query.level || 'B1',
      topic: query.topic,
      teil: query.teil,
      lang: query.lang || 'de',
      feedback: query.feedback,
      limit: query.limit || 500,
    });
    if (!resolved.ok) return [];
    return resolver.selectRulesForPrompt(resolved.rules || [], {
      maxRules: query.maxRules,
    });
  } catch (err) {
    console.warn('[generationFeedback] resolve failed — continuing without rules:', err.message);
    return [];
  }
}

export async function resolveAndAppendGenerationFeedback(prompt, query = {}) {
  const rules = await resolveGenerationFeedbackRules(query);
  return resolver.appendGenerationFeedback(prompt, {
    rules,
    enabled: query.enabled,
    feedbackMode: query.feedbackMode,
    maxRules: query.maxRules,
    header: query.header,
  });
}

export { tryOpenBlobsStore };
