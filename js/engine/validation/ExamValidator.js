/**
 * ExamValidator — structural validation for AI-generated exams.
 * Rejects exams with missing or ambiguous answer keys before users or pool see them.
 * Optional blueprint + strict mode for passage, item-count, and length checks (phase 02).
 */
const LEVEL_READING_MIN = {
  A1: 25,
  A2: 60,
  B1: 150,
  B2: 250,
  C1: 350,
  C2: 450,
};

let CefrGateRef = null;
let cefrGateEnabledRef = null;

function getCefrGateDeps() {
  if (!CefrGateRef) {
    try {
      CefrGateRef = require('./CefrGate.js');
    } catch (_) {
      CefrGateRef = typeof CefrGate !== 'undefined' ? CefrGate : null;
    }
  }
  if (!cefrGateEnabledRef) {
    try {
      cefrGateEnabledRef = require('./cefrGateFlags.js').cefrGateEnabled;
    } catch (_) {
      cefrGateEnabledRef = () => false;
    }
  }
  return { CefrGateRef, cefrGateEnabledRef };
}

const PLACEHOLDER_RE =
  /\.\.\.|Option [A-D]"|"Text here"|"Question here"|Ein Text ueber|Ein Text über|An article about/gi;

const MODULE_PART_KEYS = [
  ['lesenParts', 'lesen'],
  ['readingParts', 'reading'],
  ['horenParts', 'horen'],
  ['listeningParts', 'listening'],
];

class ExamValidator {
  validate(exam, options = {}) {
    const errors = [];
    const warnings = [];
    const strict = this._resolveStrict(options);
    const blueprint =
      options.blueprint === false ? null : this._resolveBlueprint(exam, options.blueprint);

    if (!exam || typeof exam !== 'object' || Array.isArray(exam)) {
      return { valid: false, errors: ['exam_not_object'], warnings: [] };
    }

    let scorable = 0;
    this._walk(exam, (item, path, kind) => {
      let err = null;
      if (kind === 'mcq') err = this._validateMcq(item, path);
      else if (kind === 'match') err = this._validateMatch(item, path);
      else if (kind === 'gap') err = this._validateGap(item, path);
      if (err) errors.push(err);
      else scorable++;
    });

    if (!this._hasRenderableContent(exam)) errors.push('exam_missing_modules');
    if (scorable === 0 && !this._allowsNoScorableKeys(exam)) errors.push('exam_no_answer_keys');

    this._checkPassageAndTranscript(exam, errors);
    this._checkReadingLength(exam, strict, errors, warnings);
    this._checkPlaceholders(exam, strict, errors, warnings);

    if (blueprint) {
      this._checkBlueprint(exam, blueprint, strict, errors, warnings);
    } else {
      warnings.push('blueprint_missing');
    }

    this._checkCefrGate(exam, options, strict, errors, warnings);

    return { valid: errors.length === 0, errors, warnings };
  }

  _resolveStrict(options) {
    if (options && typeof options.strict === 'boolean') return options.strict;
    if (typeof process !== 'undefined' && process.env && process.env.VALIDATOR_STRICT === '1') {
      return true;
    }
    return false;
  }

  _resolveBlueprint(exam, explicit) {
    if (explicit) return explicit;
    try {
      const resolver = require('./blueprintResolver.js');
      return resolver.resolveBlueprint(exam, null);
    } catch {
      return null;
    }
  }

  _pushIssue(code, strict, errors, warnings) {
    if (strict) errors.push(code);
    else warnings.push(code);
  }

  _checkPassageAndTranscript(exam, errors) {
    for (const [key, mod] of MODULE_PART_KEYS) {
      (exam[key] || []).forEach((part, pi) => {
        const base = `${key}[${pi}]`;
        if (mod === 'lesen' || mod === 'reading') {
          if (!this._partHasScorableContent(part, mod)) return;
          if (!this._collectReadingText(part)) errors.push(`${base}:passage_missing`);
        }
        if (mod === 'horen' || mod === 'listening') {
          if (!this._partHasScorableContent(part, mod)) return;
          if (!this._collectTranscript(part)) errors.push(`${base}:transcript_missing`);
        }
      });
    }

    if (exam.lesen?.questions?.length && !this._collectReadingText(exam.lesen)) {
      errors.push('lesen:passage_missing');
    }
    if (exam.reading?.questions?.length && !this._collectReadingText(exam.reading)) {
      errors.push('reading:passage_missing');
    }
    if (exam.horen?.questions?.length && !this._collectTranscript(exam.horen)) {
      errors.push('horen:transcript_missing');
    }
    if (exam.listening?.questions?.length && !this._collectTranscript(exam.listening)) {
      errors.push('listening:transcript_missing');
    }
  }

  _checkReadingLength(exam, strict, errors, warnings) {
    const level = String(exam.level || '').toUpperCase();
    const min = LEVEL_READING_MIN[level];
    if (!min) return;

    let longest = 0;
    for (const [key, mod] of MODULE_PART_KEYS) {
      if (mod !== 'lesen' && mod !== 'reading') continue;
      (exam[key] || []).forEach((part) => {
        this._readingTextChunks(part).forEach((t) => {
          longest = Math.max(longest, this._wordCount(t));
        });
      });
    }
    if (exam.lesen) {
      this._readingTextChunks(exam.lesen).forEach((t) => {
        longest = Math.max(longest, this._wordCount(t));
      });
    }
    if (exam.reading) {
      this._readingTextChunks(exam.reading).forEach((t) => {
        longest = Math.max(longest, this._wordCount(t));
      });
    }

    if (longest > 0 && longest < min) {
      this._pushIssue(`passage_too_short:level=${level},longest=${longest},min=${min}`, strict, errors, warnings);
    }
  }

  _checkPlaceholders(exam, strict, errors, warnings) {
    const text = JSON.stringify(exam || {});
    const n = (text.match(PLACEHOLDER_RE) || []).length;
    if (n > 5) {
      this._pushIssue(`exam_placeholder_content:count=${n}`, strict, errors, warnings);
    } else if (n > 0) {
      warnings.push(`exam_placeholder_tolerated:count=${n}`);
    }
  }

  _checkCefrGate(exam, options, strict, errors, warnings) {
    const { CefrGateRef, cefrGateEnabledRef } = getCefrGateDeps();
    if (!CefrGateRef || !cefrGateEnabledRef(options)) return;

    const result = CefrGateRef.validateExam(exam);
    if (result.withinRange) return;

    result.reasons.forEach((r) => {
      const code = `cefr_gate:${r}`;
      if (strict || options.curation) errors.push(code);
      else warnings.push(code);
    });
  }

  _checkBlueprint(exam, blueprint, strict, errors, warnings) {
    const moduleMap = {
      lesen: 'lesenParts',
      reading: 'readingParts',
      horen: 'horenParts',
      listening: 'listeningParts',
    };

    (blueprint.modules || []).forEach((mod) => {
      const modId = String(mod.id || '').toLowerCase();
      const examKey = moduleMap[modId];
      if (!examKey) return;

      const examParts = exam[examKey] || [];
      if (!examParts.length) return;

      const bpParts = mod.parts || [];
      bpParts.forEach((bpPart, idx) => {
        if (idx >= examParts.length) {
          this._pushIssue(
            `part_missing:${modId}:teil=${bpPart.teil ?? idx + 1}`,
            strict,
            errors,
            warnings
          );
          return;
        }
        const count = this._countPartItems(examParts[idx]);
        const qt = bpPart.questionsTotal;
        if (!qt) return;
        const min = qt.min ?? 0;
        const max = qt.max ?? min;
        if (count < min || count > max) {
          this._pushIssue(
            `item_count_mismatch:${modId}:teil=${bpPart.teil ?? idx + 1},expected=${min}-${max},received=${count}`,
            strict,
            errors,
            warnings
          );
        }
      });

      if (examParts.length > bpParts.length) {
        for (let i = bpParts.length; i < examParts.length; i++) {
          warnings.push(`part_unexpected:${modId}:index=${i}`);
        }
      }
    });
  }

  _countPartItems(part) {
    if (!part || typeof part !== 'object') return 0;
    let n = 0;
    if (Array.isArray(part.items)) n += part.items.length;
    if (Array.isArray(part.questions)) n += part.questions.length;
    if (Array.isArray(part.segments)) {
      for (const seg of part.segments) {
        if (Array.isArray(seg?.questions)) n += seg.questions.length;
        else if (seg && (seg.options || seg.correct != null || seg.question)) n += 1;
      }
    }
    if (Array.isArray(part.noteFields)) n += part.noteFields.length;
    return n;
  }

  _collectReadingText(part) {
    return this._readingTextChunks(part).join(' ').trim();
  }

  _readingTextChunks(part) {
    if (!part || typeof part !== 'object') return [];
    const texts = [];
    const push = (t) => {
      if (t != null && typeof t === 'string' && t.trim()) texts.push(t.trim());
    };
    push(part.text);
    push(part.passage);
    (part.passages || []).forEach((p) => push(typeof p === 'string' ? p : p?.text));
    (part.items || []).forEach((it) => {
      push(it.signText);
      push(it.text);
    });
    (part.ads || []).forEach((a) => push(a.text));
    (part.persons || []).forEach((p) => push(p.text));
    (part.opinions || []).forEach((o) => push(o.text));
    return texts;
  }

  _collectTranscript(part) {
    if (!part || typeof part !== 'object') return '';
    const chunks = [];
    const push = (t) => {
      if (t != null && typeof t === 'string' && t.trim()) chunks.push(t.trim());
    };
    push(part.transcript);
    push(part.audioScript);
    (part.segments || []).forEach((s) => push(s.transcript));
    return chunks.join(' ').trim();
  }

  _wordCount(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  _partHasScorableContent(part, mod) {
    if (!part || typeof part !== 'object') return false;
    if (mod === 'lesen' || mod === 'reading') {
      return !!(part.items?.length || part.questions?.length);
    }
    if (mod === 'horen' || mod === 'listening') {
      return !!(part.segments?.length || part.questions?.length || part.noteFields?.length);
    }
    return false;
  }

  _walk(exam, fn) {
    const parts = [
      ['lesenParts', 'lesen'],
      ['horenParts', 'horen'],
      ['readingParts', 'reading'],
      ['listeningParts', 'listening'],
    ];
    for (const [key, mod] of parts) {
      (exam[key] || []).forEach((part, pi) => {
        const base = `${key}[${pi}]`;
        (part.items || []).forEach((it, ii) => {
          if (it.signText && !it.question && !it.options?.length) return;
          this._dispatchQuestion(it, `${base}.items[${ii}]`, part, fn);
        });
        (part.questions || []).forEach((q, qi) => this._dispatchQuestion(q, `${base}.questions[${qi}]`, part, fn));
        (part.segments || []).forEach((seg, si) => {
          const segPath = `${base}.segments[${si}]`;
          if (seg.options || seg.correct != null) fn(seg, segPath, 'mcq');
          (seg.questions || []).forEach((q, qi) =>
            this._dispatchQuestion(q, `${segPath}.questions[${qi}]`, part, fn),
          );
        });
        (part.noteFields || []).forEach((f, fi) => fn(f, `${base}.noteFields[${fi}]`, 'gap'));
      });
    }

    if (exam.lesen?.questions) {
      exam.lesen.questions.forEach((q, i) => this._dispatchQuestion(q, `lesen.questions[${i}]`, exam.lesen, fn));
    }
    if (exam.horen?.questions) {
      exam.horen.questions.forEach((q, i) => this._dispatchQuestion(q, `horen.questions[${i}]`, exam.horen, fn));
    }
    if (exam.reading?.questions) {
      exam.reading.questions.forEach((q, i) => this._dispatchQuestion(q, `reading.questions[${i}]`, exam.reading, fn));
    }
    if (exam.listening?.questions) {
      exam.listening.questions.forEach((q, i) => this._dispatchQuestion(q, `listening.questions[${i}]`, exam.listening, fn));
    }
    (exam.gapfill?.sentences || []).forEach((s, i) => fn(s, `gapfill.sentences[${i}]`, 'gap'));
  }

  _dispatchQuestion(q, path, part, fn) {
    if (!q || typeof q !== 'object') return;
    const type = String(q.type || 'multiple').toLowerCase();
    if (type === 'gap_fill' || type === 'gap') return fn(q, path, 'gap');
    if (type === 'match' || type === 'matching' || type === 'person_match') return fn(q, path, 'match');
    if (
      type === 'multiple' ||
      type === 'abcd' ||
      type === 'tf' ||
      type === 'rf' ||
      type === 'yn' ||
      type === 'rfn' ||
      type === 'true_false' ||
      type === 'richtig_falsch' ||
      type === 'ja_nein' ||
      type === 'r_f_n'
    ) {
      return fn(q, path, 'mcq');
    }
    if (q.options && q.correct != null) return fn(q, path, 'mcq');
    if (q.options && type === 'person_multi') return fn(q, path, 'match');
    const c = String(q.correct ?? '').trim();
    if (!type && c && /^(R|F|T|W|N|Richtig|Falsch|True|False)$/i.test(c)) return fn(q, path, 'mcq');
  }

  _validateMcq(q, path) {
    const type = String(q.type || '').toLowerCase();
    const isTf =
      type === 'tf' ||
      type === 'true_false' ||
      type === 'rf' ||
      type === 'richtig_falsch' ||
      type === 'rfn' ||
      type === 'r_f_n';
    const isYn = type === 'yn' || type === 'ja_nein';

    if (!isTf && !isYn && Array.isArray(q.options) && q.options.length) {
      const optErr = this._validateMcqOptions(q.options, path);
      if (optErr) return optErr;
    }

    if (q.correct == null || q.correct === '') return `${path}: mcq_missing_correct`;
    const correct = q.correct;
    if (Array.isArray(correct)) {
      if (correct.length !== 1) return `${path}: mcq_multiple_correct`;
      return this._correctInOptions(correct[0], q, path);
    }
    if (isTf) {
      const c = String(correct).toUpperCase();
      if (!['R', 'F', 'T', 'W', 'N', 'TRUE', 'FALSE', 'RICHTIG', 'FALSCH'].includes(c)) {
        return `${path}: mcq_invalid_tf_correct`;
      }
      return null;
    }
    if (isYn) {
      const c = String(correct).toUpperCase();
      if (!['J', 'N', 'Y', 'JA', 'NEIN', 'YES', 'NO'].includes(c)) return `${path}: mcq_invalid_yn_correct`;
      return null;
    }
    return this._correctInOptions(correct, q, path);
  }

  _validateMcqOptions(options, path) {
    if (!Array.isArray(options) || !options.length) return `${path}: mcq_missing_options`;
    const keys = [];
    let flaggedCorrect = 0;
    for (let i = 0; i < options.length; i++) {
      const parsed = this._parseOption(options[i]);
      if (!parsed.text) return `${path}: mcq_empty_option_text[${i}]`;
      if (parsed.key) {
        if (keys.includes(parsed.key)) return `${path}: mcq_duplicate_options`;
        keys.push(parsed.key);
      }
      if (parsed.flaggedCorrect) flaggedCorrect++;
    }
    if (flaggedCorrect > 1) return `${path}: mcq_multiple_correct`;
    return null;
  }

  _parseOption(o) {
    if (typeof o === 'string') {
      const m = o.match(/^([A-Za-z0-9]+)\)\s*(.*)$/s);
      const key = m ? this._normKey(m[1]) : this._normKey(o);
      const text = (m ? m[2] : o).trim();
      return { key, text, flaggedCorrect: false };
    }
    if (o && typeof o === 'object') {
      const rawKey = o.key != null ? o.key : o.id;
      const text = String(o.text ?? o.label ?? o.option ?? '').trim();
      const key = rawKey != null ? this._normKey(rawKey) : null;
      return { key, text, flaggedCorrect: o.correct === true };
    }
    return { key: null, text: '', flaggedCorrect: false };
  }

  _validateMatch(q, path) {
    if (q.correct == null || q.correct === '') return `${path}: match_missing_correct`;
    const keys = this._optionKeys(q.options || q.matchLabels);
    if (!keys.length) return `${path}: match_missing_options`;
    const vals = Array.isArray(q.correct) ? q.correct : [q.correct];
    for (const v of vals) {
      const k = this._normKey(v);
      if (k === '0') continue;
      if (!keys.includes(k)) return `${path}: match_invalid_reference`;
    }
    return null;
  }

  _validateGap(item, path) {
    const ans = item.answer != null ? item.answer : item.correct;
    if (ans == null || String(ans).trim() === '') return `${path}: gap_missing_answer`;
    return null;
  }

  _correctInOptions(correct, q, path) {
    const keys = this._optionKeys(q.options);
    if (!keys.length) return `${path}: mcq_missing_options`;
    const k = this._normKey(correct);
    if (!keys.includes(k)) return `${path}: mcq_correct_not_in_options`;
    const flagged = (q.options || []).filter((o) => o && typeof o === 'object' && o.correct === true);
    if (flagged.length === 1) {
      const fk = flagged[0].key != null ? this._normKey(flagged[0].key) : null;
      if (fk && fk !== k) return `${path}: mcq_correct_flag_mismatch`;
    }
    return null;
  }

  _optionKeys(options) {
    if (!Array.isArray(options)) return [];
    return options.map((o) => this._parseOption(o).key).filter(Boolean);
  }

  _normKey(v) {
    return String(v ?? '')
      .trim()
      .replace(/^\s*([a-zA-Z0-9]+)\)\s*/, '$1')
      .toUpperCase();
  }

  _isPartialExam(exam) {
    return !!(exam?.vocabPersonal || exam?.personalizedExam || exam?.quickMod);
  }

  _hasSchreibenContent(exam) {
    return (exam.schreibenParts || []).some((p) => p && (p.task || p.prompt || p.instruction));
  }

  _hasSprechenContent(exam) {
    return (exam.sprechenParts || []).some(
      (p) => p && (p.situation || p.points?.length || p.prompts?.length || p.cardText || p.task),
    );
  }

  _allowsNoScorableKeys(exam) {
    if (!this._isPartialExam(exam)) return false;
    if (this._hasSchreibenContent(exam) || this._hasSprechenContent(exam)) return true;
    return false;
  }

  _hasRenderableContent(exam) {
    const hasPart = (arr, mod) => (arr || []).some((p) => this._partHasContent(p, mod));
    if (exam.goetheFormat) {
      if (this._isPartialExam(exam)) {
        return (
          hasPart(exam.lesenParts, 'lesen') ||
          hasPart(exam.horenParts, 'horen') ||
          this._hasSchreibenContent(exam) ||
          this._hasSprechenContent(exam)
        );
      }
      return hasPart(exam.lesenParts, 'lesen') && hasPart(exam.horenParts, 'horen');
    }
    if (hasPart(exam.lesenParts, 'lesen') || hasPart(exam.readingParts, 'lesen')) return true;
    if (hasPart(exam.horenParts, 'horen') || hasPart(exam.listeningParts, 'horen')) return true;
    if (exam.lesen?.text && exam.lesen?.questions?.length) return true;
    if (exam.horen?.questions?.length) return true;
    if (exam.gapfill?.sentences?.length) return true;
    return false;
  }

  _partHasContent(part, mod) {
    if (!part || typeof part !== 'object') return false;
    if (mod === 'lesen') {
      return !!(part.items?.length || part.text || part.questions?.length || part.ads?.length);
    }
    if (mod === 'horen') {
      return !!(part.segments?.length || part.questions?.length || part.transcript || part.noteFields?.length);
    }
    return false;
  }
}

if (typeof window !== 'undefined') window.ExamValidator = ExamValidator;
if (typeof module !== 'undefined') module.exports = ExamValidator;
