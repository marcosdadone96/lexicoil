#!/usr/bin/env node
/**
 * Imports library/banks/{lang}_{level}.json (canonical exam-bank schema)
 * into library/{lang}/{level}/questions.json (ExamBuilder format).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BANKS = ['de_B1', 'de_B2', 'en_B2', 'en_C1'];

function mapModule(mod) {
  const m = String(mod || '').toLowerCase();
  if (m === 'hören' || m === 'horen' || m === 'listening') return 'horen';
  if (m === 'reading' || m === 'lesen') return 'lesen';
  if (m === 'grammatik' || m === 'grammar' || m === 'use_of_english' || m === 'use of english') return 'grammatik';
  if (m === 'schreiben' || m === 'writing') return 'schreiben';
  return m;
}

function mapQuestionType(qt, lang) {
  const t = String(qt || '').toLowerCase();
  if (t === 'multiple_choice') return lang === 'de' ? 'multiple' : 'multiple';
  if (t === 'true_false' || t === 'richtig_falsch') return lang === 'de' ? 'richtig_falsch' : 'true_false';
  if (t === 'gap_fill') return 'gap_fill';
  if (t === 'matching') return 'match';
  return 'multiple';
}

function mapCorrect(q, lang) {
  const letter = String(q.correctAnswer || q.correct || '').trim();
  if (lang === 'de' && (q.questionType === 'true_false' || q.type === 'richtig_falsch')) {
    return letter === 'A' || letter.toLowerCase() === 'richtig' ? 'Richtig' : 'Falsch';
  }
  if (q.questionType === 'true_false' || q.type === 'true_false') {
    return letter === 'A' || letter.toLowerCase() === 'true' ? 'True' : 'False';
  }
  const opts = q.options || [];
  const idx = letter.charCodeAt(0) - 65;
  if (opts[idx]) {
    const o = opts[idx];
    if (/^[a-d]\)/i.test(o)) return o.charAt(0).toLowerCase();
    return letter.toLowerCase();
  }
  return letter.toLowerCase();
}

function formatOptions(options, lang) {
  if (!options?.length) return undefined;
  return options.map((o, i) => {
    const letter = String.fromCharCode(65 + i);
    const text = String(o).replace(/^[A-D]\)\s*/i, '').trim();
    if (lang === 'de') return `${String.fromCharCode(97 + i)}) ${text}`;
    return `${letter}) ${text}`;
  });
}

function importBank(bankPath) {
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const lang = bank.language;
  const level = bank.level;
  const passages = [];
  const questions = [];
  const vocabulary = { ...(bank.vocabulary || {}) };
  const passageIndex = new Map();

  function ensurePassage(ctx) {
    if (!ctx?.passageId || !ctx?.passageText) return null;
    if (passageIndex.has(ctx.passageId)) return ctx.passageId;
    passageIndex.set(ctx.passageId, true);
    passages.push({
      id: ctx.passageId,
      module: mapModule(ctx.passageModule || ctx.module),
      title: ctx.passageTitle || '',
      text: ctx.passageText,
    });
    return ctx.passageId;
  }

  for (const part of bank.parts || []) {
    const module = mapModule(part.module);
    for (const q of part.questions || []) {
      const passageId = ensurePassage(q.context);
      const opts = formatOptions(q.options, lang);
      const correct = mapCorrect(q, lang);
      const out = {
        id: q.id,
        module,
        type: mapQuestionType(q.questionType, lang),
        question: q.question,
        correct,
        correctAnswer: correct,
        explanation: q.explanation || '',
        grammarTags: q.grammarTags || [],
        topicTags: q.topicTags || [],
        vocabularyTags: q.vocabularyTags || [],
        difficulty: q.difficulty,
        teil: q.part || part.part || 1,
        skills: q.skills || [],
        language: q.language || lang,
        level: q.level || level,
        examType: q.examType || bank.examType,
        questionType: q.questionType,
      };
      if (passageId) out.passageId = passageId;
      if (opts) out.options = opts;
      if (q.context?.transcript) out.transcript = q.context.transcript;
      if (q.context?.segmentLabel) out.segmentLabel = q.context.segmentLabel;
      questions.push(out);
      (q.vocabularyTags || []).forEach((tag) => {
        if (!vocabulary[tag] && q.vocabularyHints?.[tag]) vocabulary[tag] = q.vocabularyHints[tag];
      });
    }
  }

  const outPath = path.join(ROOT, 'library', lang, level, 'questions.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: {
          language: lang,
          level,
          version: 2,
          generatedAt: new Date().toISOString().slice(0, 10),
          examId: bank.examId,
          examType: bank.examType,
          mode: bank.mode || 'library',
          sourceBank: path.basename(bankPath),
        },
        passages,
        questions,
        vocabulary,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log('Imported', path.basename(bankPath), '→', path.relative(ROOT, outPath), `(${questions.length} questions)`);
}

for (const id of BANKS) {
  const p = path.join(ROOT, 'library', 'banks', `${id}.json`);
  if (!fs.existsSync(p)) {
    console.error('Missing bank:', p);
    process.exit(1);
  }
  importBank(p);
}
console.log('Import complete.');
