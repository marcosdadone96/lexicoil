/**
 * Normalize MCQ options so ExamValidator can extract option keys (A/B/C).
 * Pool questions often store plain strings with correct:"b" but no letter prefix.
 */

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const OPTION_PREFIX_RE = /^([a-d]\)\s+)([\s\S]*)$/i;

function splitMcqOptionString(opt) {
  const s = String(opt ?? '').trim();
  const m = s.match(OPTION_PREFIX_RE);
  if (m) return { prefix: m[1], body: m[2].trim() };
  return { prefix: '', body: s };
}

function firstAlphaIndex(word) {
  return String(word || '').search(/[a-zäöüß]/i);
}

/** True when the first content word starts with a lowercase letter. */
export function mcqOptionBodyStartsLowercase(body) {
  const word = String(body || '').trim().split(/\s+/)[0] || '';
  const idx = firstAlphaIndex(word);
  if (idx < 0) return false;
  const ch = word[idx];
  return ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

/** Capitalize the first alphabetic character of the option body. */
export function capitalizeMcqOptionBody(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return trimmed;
  const idx = firstAlphaIndex(trimmed);
  if (idx < 0) return trimmed;
  return (
    trimmed.slice(0, idx) +
    trimmed.charAt(idx).toUpperCase() +
    trimmed.slice(idx + 1)
  );
}

/** Collect option bodies from all MCQ questions in a batch. */
export function collectMcqOptionBodies(batch) {
  const bodies = [];
  for (const q of batch?.questions || []) {
    if (!isMcqQuestion(q)) continue;
    for (const opt of q.options || []) {
      if (typeof opt === 'string') {
        const { body } = splitMcqOptionString(opt);
        if (body) bodies.push(body);
      } else if (opt && typeof opt === 'object') {
        const text = String(opt.text ?? opt.label ?? opt.option ?? '').trim();
        if (text) bodies.push(text);
      }
    }
  }
  return bodies;
}

/** True only when every MCQ option body starts lowercase (consistent alternate style). */
export function batchMcqOptionsConsistentlyLowercase(batch) {
  const bodies = collectMcqOptionBodies(batch);
  if (!bodies.length) return false;
  return bodies.every(mcqOptionBodyStartsLowercase);
}

function isMcqQuestion(q) {
  const t = String(q?.type || '').toLowerCase();
  return t === 'multiple_choice' || t === 'multiple' || t === 'mcq';
}

/**
 * Capitalize first word of each MCQ option after "a) "/"b) "/"c) " unless the
 * whole batch consistently uses lowercase option starts (rare B1 variant).
 */
export function normalizeMcqOptionCapitalization(options, { consistentlyLowercase = false } = {}) {
  if (!Array.isArray(options) || !options.length || consistentlyLowercase) return options;

  return options.map((o, i) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const key = String(o.key ?? o.id ?? LETTERS[i] ?? 'x')
        .trim()
        .replace(/^\s*([a-z])\).*/i, '$1')
        .toLowerCase();
      const text = String(o.text ?? o.label ?? o.option ?? '').trim();
      const body = capitalizeMcqOptionBody(text);
      if (/^[a-z]$/.test(key)) return `${key}) ${body}`;
      return o;
    }

    const { prefix, body } = splitMcqOptionString(o);
    if (!prefix) return String(o ?? '').trim();
    return `${prefix}${capitalizeMcqOptionBody(body)}`;
  });
}

export function normalizeBatchMcqOptionCapitalization(batch) {
  if (!batch?.questions?.length) return batch;
  const consistentlyLowercase = batchMcqOptionsConsistentlyLowercase(batch);
  const questions = batch.questions.map((q) => {
    if (!isMcqQuestion(q) || !Array.isArray(q.options) || !q.options.length) return q;
    return {
      ...q,
      options: normalizeMcqOptionCapitalization(q.options, { consistentlyLowercase }),
    };
  });
  return { ...batch, questions };
}

export function normalizeMcqOptions(options) {
  if (!Array.isArray(options) || !options.length) return options;
  return options.map((o, i) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const key = String(o.key ?? o.id ?? LETTERS[i] ?? 'x')
        .trim()
        .replace(/^\s*([a-z])\).*/i, '$1')
        .toLowerCase();
      const text = String(o.text ?? o.label ?? o.option ?? '').trim();
      if (/^[a-z]$/.test(key)) return `${key}) ${text}`;
    }

    let s = String(o ?? '').trim();
    s = s.replace(/^[a-z]\//i, '');
    const m = s.match(/^([a-z])\)\s*(.*)$/i);
    if (m) return `${m[1].toLowerCase()}) ${m[2].trim()}`;
    const letter = LETTERS[i] ?? 'x';
    return `${letter}) ${s}`;
  });
}

export function normalizeQuestionFields(q) {
  if (!q || typeof q !== 'object') return q;
  if (q.questionText && !q.question) q.question = q.questionText;
  if (q.statement && !q.question) q.question = q.statement;
  if (q.questionType && !q.type) {
    q.type = q.questionType === 'multiple_choice' ? 'multiple' : q.questionType;
  }
  if (q.type === 'multiple_choice' || q.type === 'mcq') q.type = 'multiple';
  if (q.type === 'multiple' && Array.isArray(q.options) && q.options.length) {
    q.options = normalizeMcqOptions(q.options);
  }
  // `correct` is canonical; backfill from correctAnswer only when correct is absent.
  if (q.correct == null && q.correctAnswer != null) q.correct = q.correctAnswer;
  // Canonical key normalization: multiple_choice correct must be lowercase (a/b/c/d).
  if ((q.type === 'multiple' || q.type === 'multiple_choice') && q.correct != null) {
    const cs = String(q.correct);
    if (/^[A-Z]$/.test(cs)) q.correct = cs.toLowerCase();
  }
  if (q.correct != null) q.correctAnswer = q.correct;
  return q;
}

export function normalizeExamQuestions(exam) {
  for (const p of exam.lesenParts || []) {
    for (const q of p.questions || []) normalizeQuestionFields(q);
    for (const q of p.items || []) normalizeQuestionFields(q);
  }
  for (const p of exam.horenParts || []) {
    for (const seg of p.segments || []) {
      for (const q of seg.questions || []) normalizeQuestionFields(q);
    }
    for (const q of p.questions || []) normalizeQuestionFields(q);
  }
  return exam;
}
