/**
 * horenT4ChronoEvidence.mjs
 *
 * Chronological order gate for Hören T4 matching (Wer sagt was?).
 * Reuses char-offset evidence from horenRfChronoEvidence.mjs (same metric as T3 R/F).
 *
 * Version stamp: bump when locator rules or mono contract changes.
 */
import {
  HOREN_RF_CHRONO_EVIDENCE_VERSION,
  evidenceCharPos,
  isCharEvidenceMonotonic,
} from './horenRfChronoEvidence.mjs';

export const HOREN_T4_CHRONO_EVIDENCE_VERSION =
  'v1-matching-char-pos-intro-heuristic-2026-07-16';

const INTRO_EXPL_RE =
  /\b(zu Beginn|am Anfang|stellt\s+(?:die\s+)?(?:Frage|das Thema)|leitet die Sendung|Fragestellung ein)\b/i;

const HIGH_CONFIDENCE_VIA = new Set(['quote', 'quote-ci', 'substr', 'manual']);

/** Late matching slots often false-anchor on intro boilerplate via substr/density. */
function isWeakLateSlotEarlyAnchor(d, textLen) {
  if (!d || d.slot < 6 || d.pos < 0) return false;
  if (d.pos > textLen * 0.15) return false;
  return d.via === 'substr' || d.via === 'density';
}

function passageText(batch) {
  return String(batch?.passages?.[0]?.text || '');
}

function isHorenT4MatchingBatch(batch) {
  const qs = batch?.questions || [];
  if (!qs.length) return false;
  return qs.every(
    (q) =>
      q.module === 'horen' &&
      Number(q.teil) === 4 &&
      q.type === 'matching',
  );
}

function speakerLetter(q) {
  return String(q.correct || q.correctAnswer || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-c]/g, '');
}

function chronoRank(details) {
  const sorted = [...details]
    .map((d) => d.slot - 1)
    .sort((a, b) => {
      const pa = details[a].pos;
      const pb = details[b].pos;
      return (pa < 0 ? Number.MAX_SAFE_INTEGER : pa) -
        (pb < 0 ? Number.MAX_SAFE_INTEGER : pb) ||
        a - b;
    });
  const rankBySlot = new Map();
  sorted.forEach((slotIdx, rank) => rankBySlot.set(slotIdx + 1, rank + 1));
  return rankBySlot;
}

/**
 * @param {object} batch
 * @returns {{
 *   ok: boolean,
 *   metric: string,
 *   version: string,
 *   evidenceVersion: string,
 *   mono: boolean,
 *   details: Array<object>,
 *   introViolations: Array<object>,
 *   rankWarnings: Array<object>,
 *   blockingIssues: string[],
 *   warnings: string[],
 * }}
 */
export function verifyHorenT4MatchingChrono(batch) {
  const text = passageText(batch);
  const qs = batch?.questions || [];
  const empty = {
    ok: true,
    metric: 'char-pos-passages[0].text',
    version: HOREN_T4_CHRONO_EVIDENCE_VERSION,
    evidenceVersion: HOREN_RF_CHRONO_EVIDENCE_VERSION,
    mono: true,
    details: [],
    introViolations: [],
    rankWarnings: [],
    blockingIssues: [],
    warnings: [],
  };

  if (!isHorenT4MatchingBatch(batch)) return empty;

  const details = qs.map((q, i) => {
    const e = evidenceCharPos(q, text);
    return {
      slot: i + 1,
      id: q.id,
      pos: e.pos,
      via: e.via,
      needle: e.needle || '',
      question: String(q.question || '').slice(0, 80),
      correct: speakerLetter(q),
    };
  });

  const positions = details.map((d) => d.pos);
  const mono = isCharEvidenceMonotonic(positions);
  const introThreshold = text.length * 0.25;

  const introViolations = [];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (speakerLetter(q) !== 'a') continue;
    const expl = String(q.explanation || '');
    const isIntro = INTRO_EXPL_RE.test(expl);
    if (!isIntro) continue;
    if (q._rfChronoManualCharPos != null && Number(q._rfChronoManualCharPos) >= 0) {
      continue;
    }
    const e = evidenceCharPos(q, text);
    if (e.pos < 0) {
      introViolations.push({
        id: q.id,
        slot: i + 1,
        pos: e.pos,
        via: e.via,
        reason: 'intro-moderator-unresolved',
      });
      continue;
    }
    if (e.pos > introThreshold) {
      introViolations.push({
        id: q.id,
        slot: i + 1,
        pos: e.pos,
        via: e.via,
        threshold: Math.round(introThreshold),
        reason: 'intro-moderator-late-anchor',
      });
    }
  }

  const rankBySlot = chronoRank(details);
  const rankWarnings = [];
  for (const d of details) {
    const chronoRankN = rankBySlot.get(d.slot) ?? d.slot;
    const delta = Math.abs(chronoRankN - d.slot);
    if (delta >= 3) {
      rankWarnings.push({
        id: d.id,
        slot: d.slot,
        chronoRank: chronoRankN,
        delta,
        pos: d.pos,
        via: d.via,
      });
    }
  }

  const blockingIssues = [];
  const warnings = [];

  if (!mono) {
    for (let i = 1; i < details.length; i++) {
      const prev = details[i - 1];
      const cur = details[i];
      if (cur.pos < 0 || prev.pos < 0 || cur.pos >= prev.pos) continue;
      if (!HIGH_CONFIDENCE_VIA.has(prev.via) || !HIGH_CONFIDENCE_VIA.has(cur.via)) {
        continue;
      }
      const prevRank = rankBySlot.get(prev.slot) ?? prev.slot;
      const curRank = rankBySlot.get(cur.slot) ?? cur.slot;
      const maxDelta = Math.max(
        Math.abs(prevRank - prev.slot),
        Math.abs(curRank - cur.slot),
      );
      const posGap = prev.pos - cur.pos;
      if (maxDelta < 2 && posGap < 200) {
        warnings.push(
          `${cur.id}: posible micro-inversión de ancla (${cur.pos} < ${prev.pos}, gap ${posGap}) — revisar si es FP del locator`,
        );
        continue;
      }
      if (isWeakLateSlotEarlyAnchor(cur, text.length) || isWeakLateSlotEarlyAnchor(prev, text.length)) {
        warnings.push(
          `${cur.id}: ancla temprana débil en slot tardío (${cur.pos} via ${cur.via}) — no bloquea chrono`,
        );
        continue;
      }
      blockingIssues.push(
        `Hören T4 chrono: ${cur.id} (slot ${i + 1}, pos ${cur.pos}, via ${cur.via}) precedes ${prev.id} (slot ${i}, pos ${prev.pos}, via ${prev.via}) in passages[0].text`,
      );
    }
  }

  for (const v of introViolations) {
    if (v.reason === 'intro-moderator-unresolved') {
      blockingIssues.push(
        `${v.id}: intro-moderador sin ancla char (slot ${v.slot}) — añadir _rfChronoManualCharPos o corregir orden`,
      );
    } else {
      blockingIssues.push(
        `${v.id}: intro-moderador anclado tarde (pos ${v.pos} > ${v.threshold}, slot ${v.slot}, via ${v.via}) — evidencia debe estar en el primer 25% del transcript`,
      );
    }
  }

  for (const w of rankWarnings) {
    warnings.push(
      `${w.id}: desplazamiento cronológico rank ${w.delta} (slot ${w.slot} vs rank ${w.chronoRank}, pos ${w.pos}, via ${w.via})`,
    );
  }

  return {
    ok: blockingIssues.length === 0,
    metric: 'char-pos-passages[0].text',
    version: HOREN_T4_CHRONO_EVIDENCE_VERSION,
    evidenceVersion: HOREN_RF_CHRONO_EVIDENCE_VERSION,
    mono,
    details,
    introViolations,
    rankWarnings,
    blockingIssues,
    warnings,
  };
}
