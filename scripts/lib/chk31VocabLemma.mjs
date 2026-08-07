/** CHK-31 vocabularyTag corruption check (mirrors audit-pass-2.mjs). */
import { loadVocabBankLemmaSet } from './vocabBank.mjs';
import { isVocabLemmaCorruption } from './enrichBatchMetadata.mjs';
import { inferBatchLevel } from './batchPaths.mjs';

const LEMMA_SAFETY_NET = new Set([
  'interessanen', 'kaputen', 'direken', 'hingegangen', 'förderen', 'schlechen',
]);

export function vocabularyTagLooksCorrupted(tag, b1Set) {
  const t = String(tag || '').toLowerCase().trim();
  if (!t) return false;
  if (LEMMA_SAFETY_NET.has(t)) return true;
  if (b1Set?.has(t)) return false;
  if (t.endsWith('ieren')) return false;
  // Dative/plural adjectives («anderen», «neuen») — not verb «-eren» artifacts («förderen»).
  if (t.endsWith('deren') || t.endsWith('teren') || t.endsWith('genen')) return false;
  if (!t.endsWith('eren')) return false;
  if (b1Set?.has(`${t.slice(0, -1)}n`)) return true;
  const fromT = `${t.slice(0, -2)}t`;
  return isVocabLemmaCorruption(fromT, t, b1Set);
}

export function collectChk31TagIssues(batch) {
  const lv = inferBatchLevel(batch);
  const level = lv === 'MIXED' ? 'B1' : lv;
  const b1Set = loadVocabBankLemmaSet('de', level);
  const issues = [];
  for (const q of batch.questions || []) {
    for (const tag of q.vocabularyTags || []) {
      if (vocabularyTagLooksCorrupted(tag, b1Set)) {
        issues.push({ questionId: q.id, tag, level });
      }
    }
  }
  return { issues, level, b1Set };
}

export function stripCorruptedVocabularyTags(batch) {
  const { issues, b1Set } = collectChk31TagIssues(batch);
  if (!issues.length) return { batch, stripped: 0 };
  const bad = new Set(issues.map((i) => `${i.questionId}\0${i.tag}`));
  let stripped = 0;
  const questions = (batch.questions || []).map((q) => {
    const tags = q.vocabularyTags || [];
    const kept = tags.filter((tag) => {
      if (!bad.has(`${q.id}\0${tag}`)) return true;
      stripped++;
      return false;
    });
    if (kept.length === tags.length) return q;
    return { ...q, vocabularyTags: kept };
  });
  return {
    batch: stripped ? { ...batch, questions } : batch,
    stripped,
    b1Set,
  };
}
