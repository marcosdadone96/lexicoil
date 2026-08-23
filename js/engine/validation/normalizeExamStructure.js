/**
 * Canonical exam shape before fidelity validation / publish / sync-to-served.
 * Aligns stored exams with Eje-2 Fase B (segments authority) and Goethe A2/B1 contracts.
 */
const {
  GOETHE_B1_SCHREIBEN_WORDS,
  GOETHE_A2_SCHREIBEN_WORDS,
  GOETHE_B1_PRESENTATION_SLIDES,
  GOETHE_B1_LESEN_T3_EXAMPLE,
} = require('../../library/goetheB1Constants.js');

const A2_LESEN_T4_KEYS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'X']);
const B1_H4_KEYS = Object.freeze(['a', 'b', 'c']);

function cloneExam(exam) {
  return JSON.parse(JSON.stringify(exam));
}

function schreibenWordsForLevel(level) {
  return String(level || '').toUpperCase() === 'A2' ? GOETHE_A2_SCHREIBEN_WORDS : GOETHE_B1_SCHREIBEN_WORDS;
}

function normalizeSchreibenPart(part, level) {
  if (!part || typeof part !== 'object') return;
  const teil = Number(part.teil ?? part.aufgabe);
  const spec = schreibenWordsForLevel(level)[teil];
  if (!spec) return;
  part.minWords = spec.min;
  part.maxWords = spec.max;
  part.targetWords = spec.target;
}

function normalizeA2LesenT4Questions(part) {
  if (!part || Number(part.teil) !== 4) return;
  for (const q of part.questions || []) {
    const t = String(q.type || '').toLowerCase();
    if (t !== 'matching' && t !== 'match') continue;
    const opts = (q.options || []).map((o) =>
      String(typeof o === 'object' ? o.key ?? o.text : o).trim(),
    );
    const hasX = opts.some((o) => /^x$/i.test(o) || o.toUpperCase() === 'G');
    const hasLetters = opts.some((o) => /^[a-f]$/i.test(o.replace(/\).*$/, '')));
    if (!hasLetters || !hasX) {
      q.options = [...A2_LESEN_T4_KEYS];
    }
    let corr = String(q.correct ?? q.correctAnswer ?? '').trim();
    if (/^g$/i.test(corr)) corr = 'X';
    if (corr) {
      q.correct = corr;
      q.correctAnswer = corr;
    }
  }
}

function isStubLetterOption(opt) {
  const raw = String(typeof opt === 'object' ? opt.text ?? opt.label ?? opt.key : opt ?? '').trim();
  const m = raw.match(/^([a-cA-C])\)\s*(.*)$/s);
  if (!m) return false;
  const body = m[2].trim();
  return !body || body.toUpperCase() === m[1].toUpperCase();
}

function parseHorenSpeakers(transcript) {
  const names = [];
  const seen = new Set();
  for (const m of String(transcript || '').matchAll(
    /(?:^|\n)(Moderator|Frau\s+[A-ZÄÖÜ][a-zäöüß]+|Herr\s+[A-ZÄÖÜ][a-zäöüß]+):/gm,
  )) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  if (names.length >= 3) return names.slice(0, 3);
  return ['Moderator', 'Gast A', 'Gast B'];
}

/** B1 Hören T4 — replace stub options (a) a) with speaker labels from transcript. */
function normalizeHorenT4SpeakerOptions(part) {
  if (!part || Number(part.teil) !== 4) return;
  const transcript = String(part.transcript || part.segments?.[0]?.transcript || '').trim();
  if (!transcript) return;
  const speakers = parseHorenSpeakers(transcript);
  const speakerOptions = B1_H4_KEYS.map((k, i) => `${k}) ${speakers[i] || `Gast ${k.toUpperCase()}`}`);

  const patchQs = (qs) => {
    for (const q of qs || []) {
      const opts = q.options || [];
      if (opts.length < 2) continue;
      if (!opts.every(isStubLetterOption)) continue;
      q.options = [...speakerOptions];
      q._keyOnlyMatch = true;
    }
  };
  patchQs(part.questions);
  for (const seg of part.segments || []) patchQs(seg.questions);
}

/** Hören: segments[] is authority; derive flat index; wrap flat H4 into one segment. */
function normalizeHorenPart(part, level) {
  if (!part || typeof part !== 'object') return;

  const hasSegments = Array.isArray(part.segments) && part.segments.length > 0;
  const hasFlatQs = Array.isArray(part.questions) && part.questions.length > 0;
  const transcript = String(part.transcript || '').trim();

  if (!hasSegments && transcript && hasFlatQs) {
    part.segments = [
      {
        id: part.passageId || `horen-t${part.teil || 0}-seg0`,
        label: part.context || 'Aufnahme',
        transcript,
        passageId: part.passageId,
        questions: part.questions.map((q) => ({ ...q })),
        pictures: part.pictures,
      },
    ];
  }

  if (Array.isArray(part.segments) && part.segments.length > 0) {
    const derived = [];
    for (const seg of part.segments) {
      for (const q of seg.questions || []) derived.push(q);
    }
    if (derived.length) part.questions = derived;
  }

  if (String(level || '').toUpperCase() === 'B1' && Number(part.teil) === 4) {
    normalizeHorenT4SpeakerOptions(part);
  }
}

function normalizeLesenT3Part(part, level) {
  if (!part || Number(part.teil) !== 3) return;
  if (String(level || '').toUpperCase() !== 'B1') return;
  if (!part.example && !part.solvedExample) {
    part.example = { ...GOETHE_B1_LESEN_T3_EXAMPLE };
    part._t3HasNoMatch = true;
  }
}

function normalizeSprechenPart(part, examTopic, level) {
  if (!part || typeof part !== 'object') return;
  if (!part.topic || !String(part.topic).trim()) {
    const topic =
      part.topicTags?.[0] ||
      part.questions?.[0]?.topicTags?.[0] ||
      examTopic ||
      '';
    if (topic) {
      part.topic = topic;
      if (!Array.isArray(part.topicTags) || !part.topicTags.length) {
        part.topicTags = [topic];
      }
    }
  }
  if (String(level || '').toUpperCase() === 'B1' && Number(part.teil) === 2) {
    if (!Array.isArray(part.slides) || part.slides.length !== GOETHE_B1_PRESENTATION_SLIDES.length) {
      part.slides = GOETHE_B1_PRESENTATION_SLIDES.map((s) => ({ ...s }));
    }
  }
}

/**
 * @param {object} exam
 * @param {{ level?: string }} [opts]
 * @returns {object}
 */
function normalizeExamStructure(exam, opts = {}) {
  if (!exam || typeof exam !== 'object') return exam;
  const out = cloneExam(exam);
  const level = String(opts.level || out.level || '').toUpperCase();
  const examTopic = out.topic || out.title || '';

  for (const part of out.lesenParts || []) {
    if (level === 'A2' && Number(part.teil) === 4) normalizeA2LesenT4Questions(part);
    if (level === 'B1' && Number(part.teil) === 3) normalizeLesenT3Part(part, level);
  }
  for (const part of out.schreibenParts || []) normalizeSchreibenPart(part, level);
  for (const part of out.horenParts || []) normalizeHorenPart(part, level);
  for (const part of out.sprechenParts || []) normalizeSprechenPart(part, examTopic, level);

  if (Array.isArray(out.blueprintCoverage)) {
    for (const row of out.blueprintCoverage) {
      if (row.module !== 'schreiben') continue;
      const spec = schreibenWordsForLevel(level)[Number(row.teil)];
      if (spec) row.wordsPerPassage = { min: spec.min, max: spec.max };
    }
  }

  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeExamStructure,
    normalizeHorenPart,
    normalizeHorenT4SpeakerOptions,
    normalizeA2LesenT4Questions,
    normalizeSprechenPart,
    normalizeSchreibenPart,
    parseHorenSpeakers,
  };
}
if (typeof window !== 'undefined') {
  window.normalizeExamStructure = normalizeExamStructure;
}
