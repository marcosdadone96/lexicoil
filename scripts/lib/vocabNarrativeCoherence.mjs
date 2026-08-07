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

/** B1 Lesen T1 — blog/diary: vocab should share ≥2 content tokens with rest of passage. */
export const VOCAB_NARRATIVE_THRESHOLDS_B1 = Object.freeze({
  minShared: 2,
  maxJaccard: 0.07,
  minSentences: 2,
});

/**
 * A2 Lesen T1 — Medientext/informativo: oraciones más cortas y temas en bloque;
 * exige desconexión más extrema (0 tokens compartidos, jaccard muy bajo).
 */
export const VOCAB_NARRATIVE_THRESHOLDS_A2_LESEN_T1 = Object.freeze({
  minShared: 1,
  maxJaccard: 0.05,
  minSentences: 3,
});

function inferBatchLevel(batch) {
  const levels = new Set();
  for (const q of batch?.questions || []) {
    if (q?.level) levels.add(String(q.level).toUpperCase());
  }
  for (const p of batch?.passages || []) {
    if (p?.level) levels.add(String(p.level).toUpperCase());
  }
  if (batch?.level) levels.add(String(batch.level).toUpperCase());
  if (levels.size === 1) return [...levels][0];
  return 'B1';
}

function inferLesenTeil(batch) {
  const t = batch?.teil ?? batch?.questions?.[0]?.teil ?? batch?.passages?.[0]?.teil;
  return Number(t) || 1;
}

/**
 * @param {object} [batch]
 * @returns {{ minShared: number, maxJaccard: number, minSentences: number, profile: string }}
 */
export function resolveVocabNarrativeThresholds(batch = null) {
  const level = inferBatchLevel(batch || {});
  const teil = inferLesenTeil(batch || {});
  const mod = String(
    batch?.module || batch?.questions?.[0]?.module || batch?.passages?.[0]?.module || 'lesen',
  ).toLowerCase();
  if (level === 'A2' && mod === 'lesen' && teil === 1) {
    return { ...VOCAB_NARRATIVE_THRESHOLDS_A2_LESEN_T1, profile: 'A2-lesen-t1-medientext' };
  }
  return { ...VOCAB_NARRATIVE_THRESHOLDS_B1, profile: 'B1-lesen-t1-narrative' };
}

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
  const minSentences = opts.minSentences ?? 2;
  const sentences = splitSentences(passageText);
  if (sentences.length < minSentences) return [];

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

  const thresholds = resolveVocabNarrativeThresholds(batch);
  const flags = detectDisconnectedVocabSentences(text, fb.used, thresholds);
  if (!flags.length) return { ok: true, flags: [], profile: thresholds.profile };
  return {
    ok: false,
    flags,
    profile: thresholds.profile,
    reason:
      `vocab_narrative_incoherence: ${flags.map((f) => f.word).join(', ')} ` +
      `(baja coherencia léxica con el párrafo; ${thresholds.profile})`,
  };
}
