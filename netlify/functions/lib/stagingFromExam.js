'use strict';

/**
 * Minimal exam-parts → staging candidate conversion for Netlify functions (CJS).
 * Mirrors scripts/pipeline/lib/candidateBuilder.mjs for runtime ingest.
 */

function slugId(prefix, text) {
  const crypto = require('crypto');
  return `${prefix}-${crypto.createHash('sha256').update(String(text || '').slice(0, 200)).digest('hex').slice(0, 10)}`;
}

function mapQuestion(q, lang, level, module, teil, passageId) {
  const correct = q.correct ?? q.correctAnswer ?? '';
  return {
    id: q.id || slugId(`lb-${lang}-${level}-${module}-t${teil}`, q.question),
    module,
    teil,
    type: q.type || 'multiple',
    question: q.question || '',
    options: q.options,
    correct,
    correctAnswer: correct,
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 4,
    passageId: passageId || q.passageId || undefined,
    lang,
    level,
  };
}

function partRecord(module, part, { lang, level, source, batchId }) {
  const teil = part.teil ?? 1;
  const text = part.text || part.transcript || (part.segments || []).map((s) => s.transcript).filter(Boolean).join('\n');
  const passageId = text ? slugId(`p-${module}-t${teil}`, text.slice(0, 80)) : null;
  const passage = text
    ? { id: passageId, module, title: part.textTitle || part.context || `${module} Teil ${teil}`, text }
    : null;

  const questions = [];
  if (Array.isArray(part.questions)) {
    part.questions.forEach((q) => questions.push(mapQuestion(q, lang, level, module, teil, passageId)));
  }
  if (Array.isArray(part.segments)) {
    part.segments.forEach((seg) => {
      (seg.questions || []).forEach((q) => questions.push(mapQuestion(q, lang, level, module, teil, passageId)));
    });
  }
  if (module === 'schreiben' && !questions.length && (part.task || part.prompt)) {
    questions.push(mapQuestion({ question: part.task || part.prompt, type: 'short_answer', correct: 'rubric' }, lang, level, module, teil, null));
  }
  if (module === 'sprechen' && !questions.length && part.situation) {
    questions.push(mapQuestion({ question: part.situation, type: 'short_answer', correct: 'rubric' }, lang, level, module, teil, null));
  }

  if (!questions.length) return null;

  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(`${batchId}-${module}-${teil}-${Date.now()}`).digest('hex').slice(0, 8);

  return {
    id: `stg-${lang}-${level}-${module}-t${teil}-${hash}`,
    status: 'pending',
    lang,
    level,
    module,
    teil,
    passage,
    questions,
    provenance: { generatedBy: source, batchId, createdAt: new Date().toISOString() },
    validation: { valid: questions.length >= 1, errors: questions.length ? [] : ['no_questions'] },
  };
}

function examPartsToStagingRecords(exam, opts) {
  const { lang, level, source, batchId } = opts;
  const out = [];
  const modules = [
    ['lesen', exam.lesenParts],
    ['horen', exam.horenParts],
    ['schreiben', exam.schreibenParts],
    ['sprechen', exam.sprechenParts],
  ];
  for (const [mod, parts] of modules) {
    for (const part of parts || []) {
      const rec = partRecord(mod, part, { lang, level, source, batchId });
      if (rec) out.push(rec);
    }
  }
  return out;
}

module.exports = { examPartsToStagingRecords };
