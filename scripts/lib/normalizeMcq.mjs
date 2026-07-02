/**
 * Normalize MCQ options so ExamValidator can extract option keys (A/B/C).
 * Pool questions often store plain strings with correct:"b" but no letter prefix.
 */

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

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
