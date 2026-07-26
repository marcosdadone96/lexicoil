/**
 * Detect user-vocab target words inserted in lexically disconnected sentences.
 * Used post-generation (Lesen T1+) before pool-verified.
 */

const STOP = new Set([
  'dass', 'wenn', 'weil', 'aber', 'oder', 'auch', 'noch', 'schon', 'sehr', 'mehr', 'nach',
  'beim', 'beim', 'eine', 'einer', 'einem', 'einen', 'dies', 'diese', 'dieser', 'dieses',
  'haben', 'hatte', 'wird', 'werden', 'kann', 'können', 'muss', 'müssen', 'soll', 'sollen',
  'nicht', 'nur', 'sich', 'sein', 'sind', 'war', 'waren', 'wurde', 'wurden', 'gibt', 'gab',
]);

function contentTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function sentenceForWord(sentences, word) {
  const w = String(word || '').toLowerCase();
  if (!w) return null;
  return (
    sentences.find((s) => {
      const low = s.toLowerCase();
      return low.includes(w) || low.includes(w.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
    }) || null
  );
}

/**
 * @param {string} passageText
 * @param {string[]} targetWords — lemmas/surfaces from userVocabFeedback.used
 * @param {{ minShared?: number, maxJaccard?: number }} [opts]
 * @returns {{ word: string, sentence: string, shared: number, jaccard: number }[]}
 */
export function detectDisconnectedVocabSentences(passageText, targetWords, opts = {}) {
  const minShared = opts.minShared ?? 2;
  const maxJaccard = opts.maxJaccard ?? 0.07;
  const sentences = splitSentences(passageText);
  if (sentences.length < 2) return [];

  const flags = [];
  for (const word of targetWords || []) {
    const hit = sentenceForWord(sentences, word);
    if (!hit) continue;
    const sentTokens = contentTokens(hit);
    const restTokens = contentTokens(
      sentences.filter((s) => s !== hit).join(' '),
    );
    const shared = sentTokens.filter((t) => restTokens.includes(t)).length;
    const jac = jaccard(sentTokens, restTokens);
    if (shared < minShared && jac <= maxJaccard) {
      flags.push({
        word: String(word),
        sentence: hit.slice(0, 160),
        shared,
        jaccard: Math.round(jac * 1000) / 1000,
      });
    }
  }
  return flags;
}

/**
 * @param {object} batch
 * @returns {{ ok: boolean, flags: object[], reason?: string }}
 */
export function vocabNarrativeCoherenceGate(batch) {
  const fb = batch?.userVocabFeedback;
  if (!fb?.used?.length) return { ok: true, flags: [] };

  const text =
    batch.passages?.[0]?.text ||
    batch.passage?.text ||
    batch.questions?.map((q) => q.transcript || q.statement || '').join('\n') ||
    '';
  if (!text.trim()) return { ok: true, flags: [] };

  const flags = detectDisconnectedVocabSentences(text, fb.used);
  if (!flags.length) return { ok: true, flags: [] };
  return {
    ok: false,
    flags,
    reason:
      `vocab_narrative_incoherence: ${flags.map((f) => f.word).join(', ')} ` +
      `(baja coherencia léxica con el párrafo)`,
  };
}
