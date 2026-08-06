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
  if (!/eren$/.test(t) || /ieren$/.test(t)) return false;
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

export function countChk31Issues(batch) {
  return collectChk31TagIssues(batch).issues.length;
}
