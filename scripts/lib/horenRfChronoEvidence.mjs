/**
 * horenRfChronoEvidence.mjs
 *
 * CANONICAL metric for Hören T3 richtig_falsch "chronological order":
 *   character offset of the answering evidence inside passages[0].text
 *
 * ⚠️  DO NOT use audio-turn token-overlap as a chrono / monotonicity metric.
 *     That weak metric produced a false green on horen-t3-gemini-004
 *     (turns 0→1→2→3→4→5→10 looked mono while the file was never reordered:
 *     chronoChanged: false). Dialogue turn indices are a different signal;
 *     they are not the chrono contract.
 *
 * Evidence locator priority:
 *   1. Quoted snippets in explanation that appear in the passage text
 *   2. Distinctive rare substrings shared by explanation/question and text
 *   3. vocabularyTags that appear in the text (rarer / longer preferred)
 *   4. Content-word density window (last resort)
 *
 * Version stamp: bump when the locator or mono contract changes.
 */

export const HOREN_RF_CHRONO_EVIDENCE_VERSION =
  'v1-char-pos-passages0-text-2026-07-12';

/** Explicit ban — tests and callers must not treat this as chrono. */
export const HOREN_RF_CHRONO_FORBIDDEN_METRIC =
  'audio-turn-token-overlap (NOT chronological; false-green risk)';

const STOP = new Set([
  'richtig',
  'falsch',
  'beide',
  'stimmen',
  'aussagen',
  'sagen',
  'finden',
  'dass',
  'nicht',
  'keine',
  'einen',
  'einer',
  'einem',
  'dieses',
  'dieser',
  'diese',
  'ihren',
  'seine',
  'seinen',
  'haben',
  'wurde',
  'werden',
  'können',
  'müssen',
  'sollen',
  'wollen',
  'markus',
  'lena',
  'anna',
  'ben',
  'mia',
  'zeigt',
  'äussert',
  'aeusser',
  'gegenteil',
  'implizit',
  'indem',
  'anderen',
  'halten',
  'wegen',
  'stimme',
  'stimmt',
  'schon',
  'wirklich',
  'absolut',
  'manchmal',
  'besonders',
  'hauptsache',
  'heutzutage',
  'wichtiger',
  'wichtigkeit',
  'betonen',
  'erwähnt',
  'berichtet',
  'bevorzugt',
  'gegenüber',
  'sogenannte',
  'schwierigkeit',
  'verbreitung',
  'besorgnis',
  'glauben',
  'wissen',
  'klar',
]);

function passageText(batch) {
  return String(batch?.passages?.[0]?.text || '');
}

function quotes(s) {
  return [
    ...String(s || '').matchAll(/["„«»“”']([^"„«»“”']{6,140})["„«»“”']/g),
  ].map((m) => m[1].trim());
}

function contentWords(s) {
  return (String(s || '')
    .toLowerCase()
    .match(/[a-zäöüß]{5,}/g) || []).filter((w) => !STOP.has(w));
}

function wordOcc(hayLow, w) {
  let n = 0;
  let from = 0;
  while (from < hayLow.length) {
    const i = hayLow.indexOf(w, from);
    if (i < 0) break;
    n++;
    from = i + w.length;
  }
  return n;
}

function bestSubstrPos(src, hay, minLen = 12) {
  const s = String(src || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const h = hay.toLowerCase();
  let best = { pos: -1, len: 0, score: -1, needle: '', via: 'substr' };
  for (let len = Math.min(70, s.length); len >= minLen; len--) {
    for (let i = 0; i <= s.length - len; i++) {
      const sub = s.slice(i, i + len);
      const words = contentWords(sub);
      if (!words.length) continue;
      const rare = words.filter((w) => {
        const occ = wordOcc(h, w);
        return occ > 0 && occ <= 2;
      });
      if (!rare.length) continue;
      const j = h.indexOf(sub);
      if (j < 0) continue;
      const score = len + rare.reduce((a, w) => a + w.length, 0) * 2;
      if (score > best.score) {
        best = { pos: j, len, score, needle: sub.slice(0, 60), via: 'substr' };
      }
    }
  }
  return best;
}

function tagPos(q, text) {
  const hayLow = text.toLowerCase();
  let best = { pos: -1, score: -1, needle: '', via: 'tag' };
  for (const tag of q.vocabularyTags || []) {
    const t = String(tag || '').toLowerCase();
    if (t.length < 6 || STOP.has(t)) continue;
    const variants = [t, ...t.split(/[-_/]/).filter((x) => x.length >= 6)];
    for (const v of variants) {
      const i = hayLow.indexOf(v);
      if (i < 0) continue;
      const occ = wordOcc(hayLow, v);
      const score = v.length / Math.sqrt(Math.max(1, occ)) + 30; // prefer tags slightly
      if (score > best.score) best = { pos: i, score, needle: v, via: 'tag' };
    }
  }
  return best;
}

function densityPos(q, text) {
  const hayLow = text.toLowerCase();
  const words = [
    ...new Set([
      ...contentWords(q.question),
      ...contentWords(q.explanation),
    ]),
  ].filter((w) => {
    const occ = wordOcc(hayLow, w);
    return occ > 0 && occ <= 3;
  });
  const hits = [];
  for (const w of words) {
    let from = 0;
    const occ = wordOcc(hayLow, w);
    while (from < hayLow.length) {
      const i = hayLow.indexOf(w, from);
      if (i < 0) break;
      hits.push({ i, w, len: w.length, occ });
      from = i + w.length;
    }
  }
  if (!hits.length) return { pos: -1, score: -1, via: 'density' };
  hits.sort((a, b) => a.i - b.i);
  let best = { pos: hits[0].i, score: -1, via: 'density', needle: hits[0].w };
  for (let s = 0; s < hits.length; s++) {
    const start = hits[s].i;
    const end = start + 200;
    let score = 0;
    const seen = new Set();
    for (let k = s; k < hits.length && hits[k].i < end; k++) {
      if (seen.has(hits[k].w)) continue;
      seen.add(hits[k].w);
      score += hits[k].len / Math.sqrt(hits[k].occ);
    }
    if (score > best.score) {
      best = {
        pos: start,
        score,
        via: 'density',
        needle: hits[s].w,
      };
    }
  }
  return best;
}

/**
 * Canonical evidence character offset in passages[0].text for one R/F question.
 * Optional `q._rfChronoManualCharPos` wins when set (semantic override for
 * colliding / wrong auto-anchors — must not change question text).
 * @returns {{ pos: number, via: string, needle?: string, score?: number }}
 */
export function evidenceCharPos(q, text) {
  const hay = String(text || '');
  const manual = Number(q?._rfChronoManualCharPos);
  if (Number.isFinite(manual) && manual >= 0) {
    return {
      pos: manual,
      via: 'manual',
      needle: String(q._rfChronoManualNeedle || 'manual-override').slice(0, 50),
      score: 10_000,
    };
  }
  for (const qt of quotes(q?.explanation)) {
    const i = hay.indexOf(qt);
    if (i >= 0) {
      return { pos: i, via: 'quote', needle: qt.slice(0, 50), score: 1000 + qt.length };
    }
    const j = hay.toLowerCase().indexOf(qt.toLowerCase());
    if (j >= 0) {
      return {
        pos: j,
        via: 'quote-ci',
        needle: qt.slice(0, 50),
        score: 900 + qt.length,
      };
    }
  }
  const subE = bestSubstrPos(q?.explanation, hay, 12);
  const subQ = bestSubstrPos(q?.question, hay, 14);
  const tag = tagPos(q, hay);
  const dens = densityPos(q, hay);
  const cands = [subE, subQ, tag, dens].filter((c) => c.pos >= 0);
  if (!cands.length) return { pos: -1, via: 'none', score: -1 };
  cands.sort((a, b) => (b.score || -1) - (a.score || -1));
  return cands[0];
}

/** @returns {number[]} character offsets in question order */
export function evidenceCharVector(batch) {
  const text = passageText(batch);
  return (batch.questions || []).map((q) => evidenceCharPos(q, text).pos);
}

/**
 * Non-decreasing character offsets (skip unknown -1).
 * THIS is the only allowed monotonicity check for R/F chrono.
 */
export function isCharEvidenceMonotonic(positions) {
  const usable = positions.filter((p) => typeof p === 'number' && p >= 0);
  if (usable.length < Math.min(2, positions.length)) return false;
  for (let i = 1; i < usable.length; i++) {
    if (usable[i] < usable[i - 1]) return false;
  }
  // Also require full vector (no holes) for strict contract when all resolved
  if (positions.every((p) => p >= 0)) {
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1]) return false;
    }
  }
  return true;
}

export function verifyRfChronoByCharPos(batch) {
  const details = [];
  const text = passageText(batch);
  for (const q of batch.questions || []) {
    const e = evidenceCharPos(q, text);
    details.push({
      id: q.id,
      pos: e.pos,
      via: e.via,
      needle: e.needle || '',
      q: String(q.question || '').slice(0, 70),
    });
  }
  const positions = details.map((d) => d.pos);
  return {
    metric: 'char-pos-passages[0].text',
    version: HOREN_RF_CHRONO_EVIDENCE_VERSION,
    forbiddenMetric: HOREN_RF_CHRONO_FORBIDDEN_METRIC,
    ok: isCharEvidenceMonotonic(positions),
    positions,
    details,
  };
}

/**
 * Sort richtig_falsch questions by canonical evidence char position
 * (stable tie-break: trailing numeric id).
 * Returns { changed, before, after, beforePos, afterPos, mode }.
 */
export function reorderRfByCharEvidence(batch) {
  const qs = batch.questions || [];
  if (qs.length < 2) {
    return {
      changed: false,
      before: [],
      after: [],
      beforePos: [],
      afterPos: [],
      mode: 'noop',
    };
  }
  if (!qs.every((q) => q.type === 'richtig_falsch')) {
    return {
      changed: false,
      before: [],
      after: [],
      beforePos: [],
      afterPos: [],
      mode: 'noop-not-rf',
    };
  }
  const text = passageText(batch);
  const before = qs.map((q) => q.id);
  const beforePos = qs.map((q) => evidenceCharPos(q, text).pos);
  const scored = qs.map((q) => {
    const pos = evidenceCharPos(q, text).pos;
    const idn = Number(String(q.id).match(/-(\d+)$/)?.[1] || 0);
    return { q, pos: pos < 0 ? Number.MAX_SAFE_INTEGER : pos, idn };
  });
  const sorted = [...scored]
    .sort((a, b) => a.pos - b.pos || a.idn - b.idn)
    .map((s) => s.q);
  const after = sorted.map((q) => q.id);
  const afterPos = sorted.map((q) => evidenceCharPos(q, text).pos);
  const changed = before.join('|') !== after.join('|');
  if (changed) batch.questions = sorted;
  return {
    changed,
    before,
    after,
    beforePos,
    afterPos,
    mode: 'char-evidence',
    version: HOREN_RF_CHRONO_EVIDENCE_VERSION,
  };
}
