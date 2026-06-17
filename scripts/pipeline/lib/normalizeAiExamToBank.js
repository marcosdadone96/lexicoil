'use strict';

/**
 * Convierte un exam object generado por IA (formato lesenParts/horenParts)
 * al formato del banco de preguntas (array de passage + question objects).
 *
 * Solo extrae preguntas con tipo reconocido: richtig_falsch, multiple, matching, ja_nein, gap_fill.
 * Requiere que el exam tenga lang y level.
 */

function normalizeType(type) {
  const map = {
    richtig_falsch: 'richtig_falsch',
    rf: 'richtig_falsch',
    rfn: 'richtig_falsch',
    multiple: 'multiple',
    multiple_choice: 'multiple',
    abcd: 'multiple',
    matching: 'matching',
    match: 'matching',
    ja_nein: 'ja_nein',
    yn: 'ja_nein',
    gap_fill: 'gap_fill',
  };
  return map[String(type || '').toLowerCase()] || null;
}

function extractPassagesFromPart(part, module, lang, level, examId) {
  const passages = [];
  const text = part.text || part.passage;
  if (text && text.trim().length > 50) {
    passages.push({
      id: `p-${module}-ai-${examId}-t${part.teil || 1}`,
      module,
      teil: part.teil || 1,
      title: part.textTitle || part.title || '',
      text: text.trim(),
      source: 'ai_generated',
      examId,
      lang,
      level,
    });
  }
  return passages;
}

function extractQuestionsFromPart(part, module, passageId, lang, level, examId) {
  const questions = [];
  const items = part.questions || part.items || [];
  items.forEach((q, idx) => {
    const type = normalizeType(q.type || q.questionType);
    if (!type) return;
    const id = q.id || `q-${module}-ai-${examId}-t${part.teil || 1}-${idx + 1}`;
    const question = {
      id,
      module,
      type,
      teil: part.teil || 1,
      question: q.question || q.text || '',
      correct: q.correct || q.correctAnswer || '',
      correctAnswer: q.correctAnswer || q.correct || '',
      explanation: q.explanation || '',
      grammarTags: q.grammarTags || [],
      topicTags: q.topicTags || [],
      vocabularyTags: q.vocabularyTags || [],
      difficulty: q.difficulty || 3,
      lang,
      level,
      source: 'ai_generated',
      examId,
    };
    if (passageId) question.passageId = passageId;
    if (q.options) question.options = q.options;
    if (q.signText) question.signText = q.signText;
    if (q.transcript) question.transcript = q.transcript;
    if (q.segmentLabel) question.segmentLabel = q.segmentLabel;
    if (q.inferenceLevel) question.inferenceLevel = q.inferenceLevel;
    questions.push(question);
  });
  return questions;
}

function normalizeAiExamToBank(exam) {
  if (!exam || !exam.lang || !exam.level) {
    throw new Error('exam.lang and exam.level are required');
  }
  const { lang, level } = exam;
  const examId = exam._flightId || exam.poolId || exam.id || Date.now().toString(36);
  const passages = [];
  const questions = [];

  const processParts = (parts, module) => {
    (parts || []).forEach((part) => {
      const extractedPassages = extractPassagesFromPart(part, module, lang, level, examId);
      passages.push(...extractedPassages);
      const passageId = extractedPassages[0]?.id || null;

      if (part.segments?.length) {
        part.segments.forEach((seg, si) => {
          const segPassages = [];
          if (seg.transcript) {
            const segPassage = {
              id: `p-${module}-ai-${examId}-t${part.teil || 1}-seg${si + 1}`,
              module,
              teil: part.teil || 1,
              title: seg.label || seg.segmentLabel || `Aufnahme ${si + 1}`,
              text: seg.transcript.trim(),
              source: 'ai_generated',
              examId,
              lang,
              level,
            };
            segPassages.push(segPassage);
            passages.push(segPassage);
          }
          const segPassageId = segPassages[0]?.id || passageId;
          const segQs = extractQuestionsFromPart(
            { ...seg, teil: part.teil },
            module,
            segPassageId,
            lang,
            level,
            examId,
          );
          questions.push(...segQs);
        });
        return;
      }

      const partQs = extractQuestionsFromPart(part, module, passageId, lang, level, examId);
      questions.push(...partQs);
    });
  };

  processParts(exam.lesenParts || exam.readingParts, 'lesen');
  processParts(exam.horenParts || exam.listeningParts, 'horen');
  processParts(exam.grammatikParts, 'grammatik');

  return { passages, questions, examId, lang, level };
}

module.exports = { normalizeAiExamToBank };
