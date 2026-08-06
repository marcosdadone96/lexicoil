/**
 * Deduplicate question.skills[] (case-insensitive).
 * Shared by Sprechen/Schreiben backlog reprocessors and normalizeBatch.
 *
 * Typical LLM artifact: ["writing","writing"] or ["writing","writing","grammar","writing"].
 */

export function dedupSkillsArray(skills) {
  if (!Array.isArray(skills) || skills.length <= 1) {
    return { skills: skills || [], removed: 0 };
  }
  const seen = new Set();
  const out = [];
  for (const s of skills) {
    const key = String(s).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(typeof s === 'string' ? s : key);
  }
  return { skills: out, removed: skills.length - out.length };
}

/** @returns {{ batch: object, skillsDupRemoved: number }} */
export function dedupSkillsInBatch(batch) {
  let skillsDupRemoved = 0;
  const questions = (batch.questions || []).map((q) => {
    if (!Array.isArray(q.skills) || q.skills.length <= 1) return q;
    const { skills, removed } = dedupSkillsArray(q.skills);
    if (!removed) return q;
    skillsDupRemoved += removed;
    return { ...q, skills };
  });
  return { batch: { ...batch, questions }, skillsDupRemoved };
}
