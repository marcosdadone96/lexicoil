'use strict';

/**
 * Minimal exam-parts → staging candidate conversion for Netlify functions (CJS).
 * Mirrors scripts/pipeline/lib/candidateBuilder.mjs for runtime ingest.
 */

const { extractPassageVocab } = require('./passageVocab');

const BANK_QUESTION_KEYS = [
  'id', 'module', 'teil', 'type', 'questionType', 'question', 'options',
  'correct', 'correctAnswer', 'explanation', 'grammarTags', 'topicTags',
  'vocabularyTags', 'difficulty', 'skills', 'language', 'level', 'examType', 'passageId',
];

const BANK_PASSAGE_KEYS = ['id', 'module', 'teil', 'title', 'text', 'passageVocab'];

function examTypeForLang(lang) {
  if (lang === 'de') return 'goethe';
  if (lang === 'en') return 'cambridge';
  if (lang === 'es') return 'dele';
  return 'goethe';
}

function slugId(prefix, text) {
  const crypto = require('crypto');
  return `${prefix}-${crypto.createHash('sha256').update(String(text || '').slice(0, 200)).digest('hex').slice(0, 10)}`;
}

function pickBankKeys(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

function normalizeQuestion(q, ctx) {
  const { lang, level, module, teil, examType } = ctx;
  const correct = q.correct ?? q.correctAnswer ?? '';
  const filled = {
    id: q.id || slugId(`lb-${lang}-${level}-${module}-t${teil}`, q.question),
    module: q.module ?? module,
    teil: q.teil ?? teil,
    type: q.type || 'multiple',
    questionType: q.questionType || q.type || 'multiple',
    question: q.question || '',
    options: q.options ?? [],
    correct,
    correctAnswer: q.correctAnswer ?? correct,
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 4,
    skills: q.skills || [module],
    language: q.language || lang,
    level: q.level || level,
    examType: q.examType || examType,
    passageId: q.passageId,
  };
  return pickBankKeys(filled, BANK_QUESTION_KEYS);
}

function normalizePassage(p, ctx) {
  const { lang, level, module, teil } = ctx;
  const filled = {
    id: p.id,
    module: p.module ?? module,
    teil: p.teil ?? teil,
    title: p.title || '',
    text: p.text || '',
    passageVocab: p.passageVocab?.length
      ? p.passageVocab
      : extractPassageVocab(p.text, lang, level),
  };
  return pickBankKeys(filled, BANK_PASSAGE_KEYS);
}

function schemaMatchesBank(part) {
  const ctx = {
    lang: part.lang,
    level: part.level,
    module: part.module,
    teil: part.teil ?? 1,
    examType: examTypeForLang(part.lang),
  };

  part.questions = (part.questions || []).map((q) => normalizeQuestion(q, ctx));

  if (part.passage) {
    part.passage = normalizePassage(part.passage, ctx);
  }

  return part;
}

function mapQuestion(q, lang, level, module, teil, passageId) {
  const correct = q.correct ?? q.correctAnswer ?? '';
  return {
    id: q.id || slugId(`lb-${lang}-${level}-${module}-t${teil}`, q.question),
    module,
    teil,
    type: q.type || 'multiple',
    questionType: q.questionType || q.type || 'multiple',
    question: q.question || '',
    options: q.options,
    correct,
    correctAnswer: correct,
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 4,
    skills: q.skills || [module],
    language: lang,
    level,
    examType: examTypeForLang(lang),
    passageId: passageId || q.passageId || undefined,
    lang,
  };
}

function partRecord(module, part, { lang, level, source, batchId }) {
  const teil = part.teil ?? 1;
  const text = part.text || part.transcript || (part.segments || []).map((s) => s.transcript).filter(Boolean).join('\n');
  const passageId = text ? slugId(`p-${module}-t${teil}`, text.slice(0, 80)) : null;
  const passage = text
    ? {
        id: passageId,
        module,
        teil,
        title: part.textTitle || part.context || `${module} Teil ${teil}`,
        text,
        passageVocab: part.passageVocab || extractPassageVocab(text, lang, level),
      }
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
  if (Array.isArray(part.items)) {
    part.items.forEach((item, i) => {
      const stem = item.question || item.statement || item.signText;
      if (!stem) return;
      questions.push(
        mapQuestion(
          {
            ...item,
            id: item.id || `${module}-t${teil}-i${i + 1}`,
            question: item.question || item.statement || stem,
            type: item.type || (item.signText ? 'matching' : 'multiple'),
          },
          lang,
          level,
          module,
          teil,
          passageId,
        ),
      );
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

  const record = {
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

  return schemaMatchesBank(record);
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

module.exports = {
  examPartsToStagingRecords,
  mapQuestion,
  partRecord,
  schemaMatchesBank,
  BANK_QUESTION_KEYS,
  BANK_PASSAGE_KEYS,
  examTypeForLang,
};
