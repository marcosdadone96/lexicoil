/**
 * Normalize legacy stored exams for validator (matching ads -> MCQ options).
 */
export function normalizeStoredExam(exam) {
  const d = JSON.parse(JSON.stringify(exam));
  (d.lesenParts || []).forEach((part) => {
    (part.questions || []).forEach((q) => {
      const t = String(q.type || '').toLowerCase();
      if ((t === 'matching' || t === 'match') && part.ads?.length && !q.options?.length) {
        q.type = 'multiple';
        q.options = part.ads.map((a) => String(a.key).toUpperCase());
        if (!q.options.includes('0')) q.options.push('0');
      }
    });
  });
  return d;
}
