/**
 * Deterministic MCQ option distinctness (Lesen L2).
 * Detects non-exclusive distractors via token overlap + B1 synonym groups — no LLM.
 */
import { hasLongLiteralOverlap, optionLetter } from './lesenBatchQuality.mjs';
import { jaccardSimilarity, tokenize as dedupTokenize } from './semanticDedup.mjs';

/** Content tokens for option comparison (≥4 chars, dedup stopwords). */
export function optionContentTokens(text) {
  return dedupTokenize(stripOptionPrefix(text));
}

const PHRASE_CANON = [
  ['besser machen', 'verbessern'],
  ['besser gemacht', 'verbessern'],
  ['gute unterstützung', 'unterstützung'],
  ['gute betreuung', 'betreuung'],
  ['für lehrer', 'lehrer'],
  ['der lehrer', 'lehrer'],
  ['die lehrer', 'lehrer'],
];

/** B1 synonym groups → canonical lemma (first entry). */
const SYNONYM_GROUPS = [
  ['verbessern', 'verbesserung', 'besser', 'optimieren', 'verbessert'],
  ['unterstützung', 'betreuung', 'hilfe', 'beistand', 'förderung'],
  ['schulung', 'schulungen', 'fortbildung', 'weiterbildung'],
  ['anbieten', 'bieten', 'anbietet', 'bietet'],
  ['entscheidend', 'wichtig', 'notwendig', 'wesentlich'],
  ['ermöglichen', 'ermöglicht', 'möglich', 'ermögliche'],
  ['funktion', 'funktionen', 'gerätefunktion', 'gerätefunktionen'],
  ['gerät', 'geräte', 'geräten'],
  ['schule', 'schulen'],
  ['lehrer', 'lehrern', 'lehrkräfte', 'lehrkraft'],
  ['nutzen', 'verwenden', 'benutzen', 'anwenden'],
  ['steigern', 'erhöhen', 'verbessern'],
  ['reduzieren', 'senken', 'verringern'],
  ['kosten', 'kostenlos', 'gebühr', 'preis'],
];

const COMPOUND_SPLITS = [
  ['gerätefunktionen', 'geräte funktionen'],
  ['gerätefunktion', 'geräte funktion'],
  ['lernplattformen', 'lern plattformen'],
  ['lernplattform', 'lern plattform'],
  ['gemeinschaftsgärten', 'gemeinschaft gärten'],
];

const _synonymMap = new Map();
for (const group of SYNONYM_GROUPS) {
  const canon = group[0];
  for (const w of group) _synonymMap.set(w, canon);
}

/** Tunable after calibration — exported for tests. */
export const MCQ_DISTINCT_THRESHOLDS = {
  jaccard: 0.42,
  overlapCoef: 0.52,
  literalMinWords: 3,
  /** Both must hold (paraphrase with partial overlap). */
  comboJaccard: 0.32,
  comboOverlap: 0.42,
};

export function stripOptionPrefix(opt) {
  const raw = optionRawText(opt);
  return raw.replace(/^[a-d]\)\s*/i, '').trim();
}

/** MCQ option as plain text (batch strings or seed {key,text}). */
export function optionRawText(opt) {
  if (opt && typeof opt === 'object' && !Array.isArray(opt)) {
    const text = opt.text ?? opt.label ?? opt.value ?? '';
    if (text) return String(text).trim();
    const key = opt.key ?? opt.letter ?? '';
    return String(key).trim();
  }
  return String(opt || '').trim();
}

export function optionLetterFromOpt(opt, fallbackIdx = 0) {
  const fromFn = optionLetter(typeof opt === 'string' ? opt : `${opt?.key || ''}) ${opt?.text || ''}`);
  if (fromFn) return fromFn;
  if (opt && typeof opt === 'object' && opt.key) {
    return String(opt.key).toUpperCase().replace(/[^A-D]/g, '').slice(0, 1) || null;
  }
  return String.fromCharCode(97 + fallbackIdx).toUpperCase();
}

function normalizeOptionSurface(text) {
  let s = stripOptionPrefix(text).toLowerCase();
  for (const [from, to] of PHRASE_CANON) {
    s = s.split(from).join(to);
  }
  for (const [compound, split] of COMPOUND_SPLITS) {
    s = s.split(compound).join(split);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function canonicalToken(word) {
  const w = String(word || '').toLowerCase();
  if (_synonymMap.has(w)) return _synonymMap.get(w);
  for (const [compound, split] of COMPOUND_SPLITS) {
    if (w === compound) {
      return split.split(/\s+/).map((p) => _synonymMap.get(p) || p);
    }
  }
  return w;
}

/** Canonical content tokens after synonym + compound normalization. */
export function canonicalOptionTokens(text) {
  const normalized = normalizeOptionSurface(text);
  const raw = dedupTokenize(normalized);
  const out = [];
  for (const t of raw) {
    const canon = canonicalToken(t);
    if (Array.isArray(canon)) out.push(...canon.filter((x) => x.length >= 4));
    else if (canon.length >= 4) out.push(canon);
  }
  return [...new Set(out)];
}

/**
 * @returns {{ jaccard: number, overlapCoef: number, shared: string[], literal: string|null }}
 */
export function scoreOptionPair(textA, textB) {
  const tokensA = canonicalOptionTokens(textA);
  const tokensB = canonicalOptionTokens(textB);
  const setA = new Set(tokensA);
  const shared = tokensB.filter((t) => setA.has(t));
  const minLen = Math.max(1, Math.min(tokensA.length, tokensB.length));
  const overlapCoef = shared.length / minLen;
  const jaccard = jaccardSimilarity(tokensA, tokensB);
  const literal = hasLongLiteralOverlap(
    normalizeOptionSurface(textA),
    normalizeOptionSurface(textB),
    MCQ_DISTINCT_THRESHOLDS.literalMinWords,
  );
  return { jaccard, overlapCoef, shared, literal };
}

/** A2 Lesen T2 short floor options — tokenize strips digits so «im N. Stock» collapses to «stock». */
const A2_FLOOR_NUM_RE = /^im\s+(\d+)\.\s*stock\s*$/i;
const A2_FLOOR_NAMED_RE = /^im\s+(erdgeschoss|untergeschoss|obergeschoss|parterre)\s*$/i;
const A2_ANDERER_STOCK_RE =
  /^(in\s+einem\s+)?ander(er|es)\s+stock(work)?\s*$|^in\s+einem\s+anderen\s+stock(work)?\s*$/i;

/** @returns {{ type: 'floor', key: string } | { type: 'other' } | null} */
export function parseA2StockFloorLabel(text) {
  const s = stripOptionPrefix(text).trim();
  const num = s.match(A2_FLOOR_NUM_RE);
  if (num) return { type: 'floor', key: `num:${num[1]}` };
  const named = s.match(A2_FLOOR_NAMED_RE);
  if (named) return { type: 'floor', key: `name:${named[1].toLowerCase()}` };
  if (A2_ANDERER_STOCK_RE.test(s)) return { type: 'other' };
  return null;
}

/** @returns {'distinct' | 'duplicate' | null} null = not A2 short floor pair — use generic scorer */
export function a2StockOptionPairVerdict(textA, textB) {
  const a = parseA2StockFloorLabel(textA);
  const b = parseA2StockFloorLabel(textB);
  if (!a || !b) return null;
  if (a.type === 'other' || b.type === 'other') return 'distinct';
  if (a.type === 'floor' && b.type === 'floor') return a.key === b.key ? 'duplicate' : 'distinct';
  return null;
}

export function isNonExclusiveOptionPair(textA, textB, thresholds = MCQ_DISTINCT_THRESHOLDS) {
  const a2Verdict = a2StockOptionPairVerdict(textA, textB);
  if (a2Verdict === 'distinct') {
    return { hit: false, jaccard: 0, overlapCoef: 0, shared: [] };
  }
  if (a2Verdict === 'duplicate') {
    return { hit: true, reason: 'mismo piso (A2 Stock)', jaccard: 1, overlapCoef: 1, shared: ['stock'] };
  }

  const { jaccard, overlapCoef, literal, shared } = scoreOptionPair(textA, textB);
  if (literal) return { hit: true, reason: `literal≥${thresholds.literalMinWords}w («${literal}»)`, jaccard, overlapCoef, shared };
  if (jaccard >= thresholds.jaccard) {
    return { hit: true, reason: `jaccard=${jaccard.toFixed(2)}`, jaccard, overlapCoef, shared };
  }
  if (overlapCoef >= thresholds.overlapCoef && shared.length >= 3) {
    return { hit: true, reason: `overlap=${overlapCoef.toFixed(2)} (${shared.join(', ')})`, jaccard, overlapCoef, shared };
  }
  if (jaccard >= thresholds.comboJaccard && overlapCoef >= thresholds.comboOverlap && shared.length >= 3) {
    return { hit: true, reason: `combo j=${jaccard.toFixed(2)} o=${overlapCoef.toFixed(2)}`, jaccard, overlapCoef, shared };
  }
  return { hit: false, jaccard, overlapCoef, shared };
}

/**
 * @returns {{ ok: boolean, findings: Array<{ itemId: string, pair: string, detail: string, reason: string }> }}
 */
export function checkMcqDistinctBatch(batch, teil = 2) {
  const findings = [];
  if (Number(teil) !== 2) return { ok: true, findings };

  for (const q of batch?.questions || []) {
    if (String(q.type || '').toLowerCase() !== 'multiple_choice') continue;
    const opts = q.options || [];
    if (opts.length < 2) continue;

    for (let i = 0; i < opts.length; i++) {
      for (let j = i + 1; j < opts.length; j++) {
        const letterA = optionLetterFromOpt(opts[i], i);
        const letterB = optionLetterFromOpt(opts[j], j);
        const hit = isNonExclusiveOptionPair(opts[i], opts[j]);
        if (!hit.hit) continue;
        findings.push({
          itemId: q.id,
          pair: `${letterA}/${letterB}`,
          reason: hit.reason,
          detail:
            `opciones ${letterA}/${letterB} no excluyentes (${hit.reason}): ` +
            `«${stripOptionPrefix(opts[i]).slice(0, 55)}…» vs «${stripOptionPrefix(opts[j]).slice(0, 55)}…»`,
        });
      }
    }
  }

  return { ok: findings.length === 0, findings };
}

/** Issue string for calidad gate / repair triage. */
export function formatMcqDistinctIssue(finding) {
  return `${finding.itemId}: opciones no excluyentes — ${finding.pair} (${finding.reason})`;
}

export function checkMcqDistinctIssues(batch, teil = 2) {
  const { ok, findings } = checkMcqDistinctBatch(batch, teil);
  return { ok, findings, issues: findings.map(formatMcqDistinctIssue) };
}
