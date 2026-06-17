/**
 * AnswerKeyVerifier — optional second pass: solve MCQs and compare with marked keys.
 * Behind EXAM_ANSWER_KEY_VERIFY=1 on the server; does not change exam format.
 */
class AnswerKeyVerifier {
  collectMcqItems(exam) {
    const items = [];
    const skipTypes = new Set([
      'tf', 'true_false', 'rf', 'richtig_falsch', 'rfn', 'r_f_n',
      'yn', 'ja_nein', 'match', 'matching', 'person_match', 'person_multi',
    ]);
    const walk = (validator) => {
      validator._walk(exam, (item, path, kind) => {
        if (kind !== 'mcq') return;
        const type = String(item.type || 'multiple').toLowerCase();
        if (skipTypes.has(type)) return;
        const opts = (item.options || []).map((o) => this._formatOption(o)).filter(Boolean);
        if (opts.length < 2) return;
        items.push({
          id: String(item.id || path),
          path,
          question: String(item.question || item.text || '').slice(0, 600),
          options: opts.slice(0, 8),
          marked: item.correct,
        });
      });
    };
    if (typeof ExamValidator !== 'undefined') {
      walk(new ExamValidator());
    } else if (typeof require !== 'undefined') {
      walk(new (require('./ExamValidator.js'))());
    }
    return items;
  }

  _formatOption(o) {
    if (typeof o === 'string') return o.trim();
    if (o && typeof o === 'object') {
      const key = o.key != null ? String(o.key).trim() : '';
      const text = String(o.text ?? o.label ?? o.option ?? '').trim();
      if (key && text) return `${key}) ${text}`;
      return text || key;
    }
    return '';
  }

  buildSolverPrompt(items) {
    const payload = items.map((it) => ({
      id: it.id,
      question: it.question,
      options: it.options,
    }));
    return [
      'You verify multiple-choice exam answer keys.',
      'For each item pick exactly ONE option key (A, B, C, D, etc. — the letter before the parenthesis).',
      'Reply with ONLY valid JSON, no markdown:',
      '{"answers":[{"id":"<id>","key":"B"},...]}',
      '',
      JSON.stringify(payload),
    ].join('\n');
  }

  parseSolverResponse(text) {
    const raw = String(text || '').replace(/```json|```/g, '').trim();
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data.answers) ? data.answers : [];
    } catch (_) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return [];
      try {
        const data = JSON.parse(m[0]);
        return Array.isArray(data.answers) ? data.answers : [];
      } catch (_2) {
        return [];
      }
    }
  }

  compare(items, solved) {
    const byId = new Map(solved.map((s) => [String(s.id), s]));
    const discrepancies = [];
    for (const item of items) {
      const got = byId.get(item.id);
      if (!got || got.key == null) continue;
      const marked = Array.isArray(item.marked) ? item.marked[0] : item.marked;
      if (this._normKey(got.key) !== this._normKey(marked)) {
        discrepancies.push({
          id: item.id,
          path: item.path,
          marked,
          solved: got.key,
        });
      }
    }
    return discrepancies;
  }

  _normKey(v) {
    return String(v ?? '')
      .trim()
      .replace(/^\s*([a-zA-Z0-9]+)\)\s*/, '$1')
      .toUpperCase();
  }
}

if (typeof window !== 'undefined') window.AnswerKeyVerifier = AnswerKeyVerifier;
if (typeof module !== 'undefined') module.exports = AnswerKeyVerifier;
