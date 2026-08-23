/**
 * Normalize legacy stored exams for validator (matching ads -> MCQ options).
 * Core structural fixes live in js/engine/validation/normalizeExamStructure.js.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { normalizeExamStructure } = require(path.join(
  ROOT,
  'js/engine/validation/normalizeExamStructure.js',
));

export function normalizeStoredExam(exam) {
  let d = normalizeExamStructure(exam);
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

export { normalizeExamStructure };
