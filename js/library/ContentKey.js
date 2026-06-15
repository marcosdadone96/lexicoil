/**
 * ContentKey — stable, content-based identity for passages/transcripts.
 *
 * Purpose: per-user, cross-module de-duplication. The SAME text used as a
 * Lesen passage or a Hören transcript must produce the SAME key, so that a
 * text "burned" for a user in one module can never reappear in another.
 *
 * Dependency-free. Resolves bank passages via PassageResolver when available.
 */
const ContentKey = (() => {
  const MIN_LEN = 24; // ignore trivial fragments (instructions, labels)

  function normalize(text) {
    return String(text || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N} ]+/gu, '')
      .trim();
  }

  /** Two independent rolling hashes concatenated → ~64-bit hex (collision-safe at app scale). */
  function hash(text) {
    const s = normalize(text);
    if (s.length < MIN_LEN) return null;
    let h1 = 5381; // djb2
    let h2 = 0; // sdbm
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = (((h1 << 5) + h1) ^ c) >>> 0;
      h2 = (c + (h2 << 6) + (h2 << 16) - h2) >>> 0;
    }
    return `t${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
  }

  function keyForText(text) {
    return hash(text);
  }

  function passageResolver() {
    if (typeof PassageResolver !== 'undefined') return PassageResolver;
    if (typeof globalThis !== 'undefined' && globalThis.PassageResolver) return globalThis.PassageResolver;
    return null;
  }

  /** Content key for a BANK question (used while filtering assembly candidates). */
  function keyForBankQuestion(bank, q) {
    const PR = passageResolver();
    const passage = PR ? PR.resolvePassageForQuestion(bank, q) : null;
    const text = passage?.text || q?.context?.passageText || q?.transcript || '';
    return keyForText(text);
  }

  function pushKey(set, text) {
    const k = keyForText(text);
    if (k) set.add(k);
  }

  /** Collect everything served by a rendered exam: text keys + item/question ids. */
  function keysForExam(exam) {
    const keys = new Set();
    const ids = new Set();
    if (!exam || typeof exam !== 'object') return { keys, ids };

    const partGroups = [
      exam.lesenParts,
      exam.horenParts,
      exam.grammatikParts,
      exam.useOfEnglishParts,
      exam.schreibenParts,
      exam.sprechenParts,
    ];

    for (const group of partGroups) {
      for (const part of group || []) {
        pushKey(keys, part.text);
        pushKey(keys, part.transcript);
        pushKey(keys, part.passage);
        for (const it of part.items || []) {
          if (it?.id) ids.add(it.id);
          pushKey(keys, it.passageText);
        }
        for (const seg of part.segments || []) {
          if (seg?.id) ids.add(seg.id);
          pushKey(keys, seg.transcript);
          for (const sq of seg.questions || []) if (sq?.id) ids.add(sq.id);
        }
        for (const qq of part.questions || []) if (qq?.id) ids.add(qq.id);
      }
    }
    return { keys, ids };
  }

  /** Does an exam contain any text/id already burned for this user? */
  function examTouchesBurned(exam, burnedKeys, burnedIds) {
    const { keys, ids } = keysForExam(exam);
    for (const k of keys) if (burnedKeys.has(k)) return true;
    for (const id of ids) if (burnedIds.has(id)) return true;
    return false;
  }

  return { normalize, hash, keyForText, keyForBankQuestion, keysForExam, examTouchesBurned };
})();

if (typeof window !== 'undefined') window.ContentKey = ContentKey;
if (typeof module !== 'undefined') module.exports = ContentKey;
