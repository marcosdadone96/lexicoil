/**
 * Post-generation gate: vocab background parts must integrate ≥2 user anchor words.
 */
import { computeVocabFeedback } from './generationFeedback.mjs';

export const MIN_BG_ANCHOR_INTEGRATED = 2;

/**
 * @param {object} batch — generated exam batch (with passages/questions)
 * @param {string[]} anchorWords — planned user anchors (not gap-fill pool words)
 * @param {number} [minHits]
 */
export function verifyBgAnchorIntegration(batch, anchorWords, minHits = MIN_BG_ANCHOR_INTEGRATED) {
  const anchors = (anchorWords || []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  const uniqueAnchors = [...new Set(anchors)];

  if (uniqueAnchors.length < minHits) {
    return {
      ok: false,
      count: 0,
      minHits,
      anchors: uniqueAnchors,
      used: [],
      notUsed: uniqueAnchors,
      reason: 'insufficient_anchors_planned',
    };
  }

  const feedback = computeVocabFeedback(batch, uniqueAnchors, {});
  const count = feedback.used.length;

  return {
    ok: count >= minHits,
    count,
    minHits,
    anchors: uniqueAnchors,
    used: feedback.used,
    notUsed: feedback.notUsed,
    targetUsage: feedback.targetUsage,
    reason: count >= minHits ? null : `anchor_integrated_${count}_of_${minHits}`,
  };
}
