/**
 * reindexVocabV3.mjs — shared helpers for P0-5 vocabIndex v3-quality reindex.
 * Only mutates vocabIndex / vocabIndexVersion (never content text fields).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { partText } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const {
  VOCAB_INDEX_VERSION,
  buildVocabIndex,
  qualityFilterToken,
  TYPO_OR_TRUNCATED,
  NEVER_INDEX,
  resolveConcept,
} = require(path.join(ROOT, 'netlify/functions/lib/vocabIndexQuality.js'));

export { VOCAB_INDEX_VERSION };

function entryLemma(e) {
  if (e == null) return '';
  if (typeof e === 'string') return String(e).toLowerCase();
  return String(e.lemma || e.word || e.concept || '').toLowerCase();
}

function oldSurfaceList(vocabIndex) {
  if (!Array.isArray(vocabIndex)) return [];
  return vocabIndex.map((e) => {
    if (typeof e === 'string') return e;
    return String(e.word || e.lemma || '');
  }).filter(Boolean);
}

/**
 * Snapshot of content fields that must never change during reindex.
 */
export function contentFingerprint(part) {
  if (!part || typeof part !== 'object') return '';
  const qSlim = (qs) => (Array.isArray(qs) ? qs.map((q) => ({
    id: q?.id,
    question: q?.question,
    correct: q?.correct,
    correctAnswer: q?.correctAnswer,
    options: q?.options,
    explanation: q?.explanation,
    type: q?.type,
  })) : qs);
  return JSON.stringify({
    text: part.text,
    transcript: part.transcript,
    task: part.task,
    instruction: part.instruction,
    passage: part.passage,
    passages: part.passages,
    segments: part.segments,
    ads: part.ads,
    questions: qSlim(part.questions),
  });
}

/**
 * Compare old vs new vocabIndex and accumulate metrics.
 */
export function analyzeVocabDiff(oldIndex, newIndex) {
  const oldSurfaces = oldSurfaceList(oldIndex);
  const newEntries = Array.isArray(newIndex) ? newIndex : [];

  let noiseRemoved = 0;
  let typosRemoved = 0;
  for (const s of oldSurfaces) {
    const low = String(s).toLowerCase();
    if (TYPO_OR_TRUNCATED.has(low)) {
      typosRemoved++;
      noiseRemoved++;
      continue;
    }
    if (NEVER_INDEX.has(low)) {
      noiseRemoved++;
      continue;
    }
    const q = qualityFilterToken(s, { source: 'vocabularyTag' });
    if (!q.ok) noiseRemoved++;
  }

  const oldConcepts = new Set(
    oldSurfaces.map((s) => {
      const q = qualityFilterToken(s, { source: 'text' });
      if (q.ok) return q.concept || q.lemma;
      return resolveConcept(String(s || '').toLowerCase(), s);
    }).filter(Boolean),
  );

  const newConcepts = new Set(
    newEntries.map((e) => e.concept || e.lemma || entryLemma(e)).filter(Boolean),
  );
  const conceptsMerged = Math.max(0, oldConcepts.size - newConcepts.size);

  let aliases = 0;
  for (const e of newEntries) {
    if (Array.isArray(e.aliases)) aliases += e.aliases.length;
  }

  return {
    oldCount: oldSurfaces.length,
    newCount: newEntries.length,
    concepts: newConcepts.size,
    aliases,
    noiseRemoved,
    typosRemoved,
    conceptsMerged,
  };
}

export function isAlreadyV3(part) {
  return part?.vocabIndexVersion === VOCAB_INDEX_VERSION
    && Array.isArray(part.vocabIndex)
    && part.vocabIndex.length > 0
    && part.vocabIndex.some((e) => e && typeof e === 'object' && e.lemma);
}

/**
 * Rebuild vocabIndex only — preserves all content fields.
 * Mutates `part` in place when not skipped.
 */
export function reindexPartVocab(part, { lang, level, force = false } = {}) {
  if (!part || typeof part !== 'object') {
    return { part, skipped: true, reason: 'invalid', diff: null, changed: false };
  }
  if (!force && isAlreadyV3(part)) {
    return { part, skipped: true, reason: 'already_v3', diff: null, changed: false };
  }

  const beforeFp = contentFingerprint(part);
  const oldIndex = Array.isArray(part.vocabIndex)
    ? JSON.parse(JSON.stringify(part.vocabIndex))
    : [];
  const oldVersion = part.vocabIndexVersion || null;

  const normLang = String(lang || part.lang || 'de').toLowerCase();
  const normLevel = String(level || part.level || 'B1').toUpperCase();
  const text = partText(part);

  part.vocabIndex = buildVocabIndex(part, {
    lang: normLang,
    level: normLevel,
    text,
  });
  part.vocabIndexVersion = VOCAB_INDEX_VERSION;

  const afterFp = contentFingerprint(part);
  if (beforeFp !== afterFp) {
    throw new Error(`content mutated during reindex (id=${part.id || '?'})`);
  }

  const diff = analyzeVocabDiff(oldIndex, part.vocabIndex);
  diff.oldVersion = oldVersion;
  diff.newVersion = part.vocabIndexVersion;

  const changed = JSON.stringify(oldIndex) !== JSON.stringify(part.vocabIndex)
    || oldVersion !== part.vocabIndexVersion;

  return { part, skipped: false, diff, changed };
}

/**
 * Normalize pool-verified batch JSON into a part-like object for indexing.
 * Returns the object that should hold vocabIndex (mutated in place on `data`).
 */
export function asIndexablePart(data, { lang = 'de', level = 'B1' } = {}) {
  if (!data || typeof data !== 'object') return null;
  // Already a reusable part record
  if (data.passage || data.module || Array.isArray(data.vocabIndex)) {
    if (!data.lang) data.lang = lang;
    if (!data.level) data.level = level;
    return data;
  }
  // Batch wrapper: passages[] + questions[]
  if (Array.isArray(data.passages) || Array.isArray(data.questions)) {
    if (!data.lang) {
      data.lang = data.passages?.[0]?.lang || data.questions?.[0]?.lang || lang;
    }
    if (!data.level) {
      data.level = data.passages?.[0]?.level || data.questions?.[0]?.level || level;
    }
    if (!data.id) {
      data.id = data.passages?.[0]?.id || data.questions?.[0]?.passageId || null;
    }
    if (!data.module) {
      data.module = data.passages?.[0]?.module || data.questions?.[0]?.module || null;
    }
    return data;
  }
  return data;
}

export function emptyReport() {
  return {
    generatedAt: null,
    elapsedMs: 0,
    mode: null,
    targetVersion: VOCAB_INDEX_VERSION,
    total: 0,
    alreadyV3: 0,
    updated: 0,
    wouldUpdate: 0,
    skipped: 0,
    errors: [],
    oldVersions: {},
    concepts: 0,
    aliases: 0,
    noiseRemoved: 0,
    typosRemoved: 0,
    conceptsMerged: 0,
    byLayer: {
      'pool-verified': { total: 0, updated: 0, alreadyV3: 0, skipped: 0, errors: 0 },
      seed: { total: 0, updated: 0, alreadyV3: 0, skipped: 0, errors: 0 },
      blobs: { total: 0, updated: 0, alreadyV3: 0, skipped: 0, errors: 0 },
      published: {
        total: 0,
        updated: 0,
        alreadyV3: 0,
        skipped: 0,
        errors: 0,
        note: 'Published mocks are not rewritten here; refresh via habitual publish/sync after seed+blobs are v3.',
      },
    },
    verification: [],
  };
}

export function accumulateDiff(report, diff) {
  if (!diff) return;
  report.concepts += diff.concepts || 0;
  report.aliases += diff.aliases || 0;
  report.noiseRemoved += diff.noiseRemoved || 0;
  report.typosRemoved += diff.typosRemoved || 0;
  report.conceptsMerged += diff.conceptsMerged || 0;
  const ov = diff.oldVersion || 'none';
  report.oldVersions[ov] = (report.oldVersions[ov] || 0) + 1;
}

function entrySurfaces(e) {
  const out = [];
  if (!e) return out;
  if (typeof e === 'string') return [e.toLowerCase()];
  for (const k of [e.lemma, e.word, e.concept, ...(e.aliases || [])]) {
    if (k) out.push(String(k).toLowerCase());
  }
  return out;
}

export function verifySamplePart(part, label, { requireVerzichten = false } = {}) {
  const checks = [];
  const idx = part?.vocabIndex || [];
  const lemmas = idx.map((e) => entryLemma(e));
  const concepts = idx.map((e) => String(e.concept || e.lemma || '').toLowerCase());
  const allSurf = idx.flatMap(entrySurfaces);

  const hasVerzichten = allSurf.some((s) => s.includes('verzicht'))
    || concepts.some((c) => c.includes('verzicht'));
  checks.push({
    name: 'verzichten_family',
    ok: !requireVerzichten || hasVerzichten,
    detail: hasVerzichten
      ? 'verzichten family present'
      : (requireVerzichten ? 'FAIL: expected verzichten family' : 'n/a (not required for random sample)'),
  });

  const hasMitmachen = lemmas.includes('mitmachen') || concepts.includes('mitmachen');
  const hasBareMachen = lemmas.includes('machen') || concepts.includes('machen');
  checks.push({
    name: 'mitmachen_not_machen',
    ok: !hasBareMachen,
    detail: hasMitmachen
      ? (hasBareMachen ? 'FAIL: both' : 'mitmachen kept, machen absent')
      : (hasBareMachen ? 'FAIL bare machen' : 'no machen family in index'),
  });

  const anmeld = concepts.filter((c) => c === 'anmelden' || c === 'anmeldung');
  checks.push({
    name: 'anmelden_concept_dedupe',
    ok: anmeld.length <= 1,
    detail: `anmelden concepts=${anmeld.length}`,
  });

  const we = allSurf.some((s) => s.includes('wochenend'));
  const wt = allSurf.some((s) => s.includes('wochentag'));
  const sameConcept = resolveConcept('wochenende') === resolveConcept('wochentag');
  checks.push({
    name: 'wochenende_wochentag_distinct',
    ok: !sameConcept,
    detail: `we=${we} wt=${wt} sameCanon=${sameConcept}`,
  });

  const noise = allSurf.filter((l) => NEVER_INDEX.has(l) || TYPO_OR_TRUNCATED.has(l));
  checks.push({
    name: 'no_noise_tags',
    ok: noise.length === 0,
    detail: noise.length ? [...new Set(noise)].join(',') : 'clean',
  });

  return {
    label,
    id: part?.id || null,
    version: part?.vocabIndexVersion || null,
    indexSize: idx.length,
    checks,
    ok: checks.every((c) => c.ok),
  };
}

/**
 * Mandatory fixtures — always run after reindex (independent of random samples).
 */
export function runMandatoryVerification() {
  const fixtures = [
    {
      label: 'fixture:verzichten_auf',
      requireVerzichten: true,
      part: {
        id: 'fix-verzichten',
        lang: 'de',
        level: 'B1',
        passage: { text: 'Viele Menschen verzichten auf Plastik.' },
        questions: [{ vocabularyTags: ['verzichten auf'], question: 'Was?' }],
      },
    },
    {
      label: 'fixture:mitmachen',
      part: {
        id: 'fix-mitmachen',
        lang: 'de',
        level: 'B1',
        passage: { text: 'Wir wollen mitmachen und etwas machen.' },
        questions: [{ vocabularyTags: ['mitmachen', 'machen'], question: 'Was?' }],
      },
    },
    {
      label: 'fixture:anmelden',
      part: {
        id: 'fix-anmelden',
        lang: 'de',
        level: 'B1',
        passage: { text: 'Die Anmeldung ist online. Bitte anmelden.' },
        questions: [{ vocabularyTags: ['Anmeldung', 'anmelden'], question: 'Was?' }],
      },
    },
    {
      label: 'fixture:wochenende_wochentag',
      part: {
        id: 'fix-wochen',
        lang: 'de',
        level: 'B1',
        passage: { text: 'Am Wochenende frei. Am Wochentag Arbeit.' },
        questions: [{ vocabularyTags: ['Wochenende', 'Wochentag'], question: 'Was?' }],
      },
    },
  ];

  const out = [];
  for (const f of fixtures) {
    const part = structuredClone(f.part);
    reindexPartVocab(part, { lang: 'de', level: 'B1', force: true });
    const v = verifySamplePart(part, f.label, { requireVerzichten: !!f.requireVerzichten });
    // Extra: Wochenende ≠ Wochentag as separate concepts when both present
    if (f.label.includes('wochenende')) {
      const concepts = new Set(part.vocabIndex.map((e) => e.concept || e.lemma));
      const both = [...concepts].filter((c) => /wochen/.test(String(c)));
      v.checks.push({
        name: 'wochen_two_concepts',
        ok: both.length >= 2,
        detail: `concepts=${[...both].join(',')}`,
      });
      v.ok = v.checks.every((c) => c.ok);
    }
    // Extra: anmelden single concept
    if (f.label.includes('anmelden')) {
      const n = part.vocabIndex.filter((e) => (e.concept || e.lemma) === 'anmelden').length;
      v.checks.push({
        name: 'anmelden_single_entry',
        ok: n === 1,
        detail: `entries=${n}`,
      });
      v.ok = v.checks.every((c) => c.ok);
    }
    out.push(v);
  }
  return out;
}

/** Pick up to n random parts from list (deterministic seed optional). */
export function pickRandomSamples(parts, n = 5, seed = Date.now()) {
  const arr = [...parts];
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}
