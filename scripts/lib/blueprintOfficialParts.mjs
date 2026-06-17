/**
 * Official exam part targets (Phase 2) — vinculante para upgrade de blueprints.
 * itemsTotal = preguntas por parte; wordsPerPassage donde aplica.
 */

const TASK_FORMAT_BY_SLOT = {
  mcq_gap_fill: 'multiple_choice_cloze',
  open_cloze: 'open_cloze',
  word_formation: 'word_formation',
  sentence_transformation: 'key_word_transformation',
  key_word_transformation: 'key_word_transformation',
  richtig_falsch_texts: 'richtig_falsch_texts',
  mcq_texts: 'mcq_texts',
  matching: 'matching',
  gap_article: 'gap_article',
  short_monologues: 'short_monologues',
  discussion: 'discussion',
  micro_texts: 'short_text_mcq',
  article: 'long_text_mcq',
  short_dialogues: 'short_dialogue_mcq',
  long_audio: 'long_listening_mcq',
  grammar_block: 'grammar_mcq',
  writing_task: 'writing_prompt',
  speaking_task: 'speaking_prompt',
  short_texts: 'short_text_mcq',
  long_article: 'long_text_mcq',
  short_audio: 'short_listening_mcq',
};

import { GOETHE_B1_INSTRUCTIONS } from './goethe-b1-modellsatz.mjs';

/** Replace module.parts entirely when listed here (blueprint file id). */
export const OFFICIAL_MODULE_PARTS = {
  goethe_B1: {
    lesen: [
      {
        teil: 1,
        slotType: 'richtig_falsch_texts',
        label: 'Teil 1 — Blog / Forum (Richtig/Falsch)',
        itemsTotal: 6,
        layout: 'passage_questions',
        questionTypes: ['richtig_falsch', 'true_false'],
        wordsPerPassage: { min: 120, max: 200 },
        instruction: GOETHE_B1_INSTRUCTIONS.lesen[0],
        taskFormat: 'richtig_falsch_texts',
        plays: null,
      },
      {
        teil: 2,
        slotType: 'mcq_texts',
        label: 'Teil 2 — Presseartikel (MCQ)',
        itemsTotal: 6,
        layout: 'passage_questions',
        questionTypes: ['multiple_choice', 'multiple'],
        wordsPerPassage: { min: 150, max: 250 },
        instruction: GOETHE_B1_INSTRUCTIONS.lesen[1],
        taskFormat: 'mcq_texts',
      },
      {
        teil: 3,
        slotType: 'matching',
        label: 'Teil 3 — Anzeigen zuordnen',
        itemsTotal: 7,
        layout: 'items',
        questionTypes: ['matching', 'multiple_choice'],
        wordsPerPassage: { min: 40, max: 90 },
        instruction: GOETHE_B1_INSTRUCTIONS.lesen[2],
        taskFormat: 'matching',
        adCount: 6,
      },
      {
        teil: 4,
        slotType: 'matching',
        label: 'Teil 4 — Meinungen / Überschriften',
        itemsTotal: 7,
        layout: 'items',
        questionTypes: ['matching', 'multiple_choice'],
        wordsPerPassage: { min: 80, max: 180 },
        instruction: GOETHE_B1_INSTRUCTIONS.lesen[3],
        taskFormat: 'matching',
        headlineCount: 7,
      },
      {
        teil: 5,
        slotType: 'mcq_texts',
        label: 'Teil 5 — Hausordnung (MCQ)',
        itemsTotal: 4,
        layout: 'passage_questions',
        questionTypes: ['multiple_choice', 'multiple'],
        wordsPerPassage: { min: 120, max: 220 },
        instruction: GOETHE_B1_INSTRUCTIONS.lesen[4],
        taskFormat: 'mcq_texts',
      },
    ],
    horen: [
      {
        teil: 1,
        slotType: 'short_dialogues',
        label: 'Teil 1 — Kurze Texte (2×)',
        itemsTotal: 6,
        layout: 'segments',
        questionTypes: ['richtig_falsch', 'true_false', 'multiple_choice', 'multiple'],
        instruction: GOETHE_B1_INSTRUCTIONS.horen[0],
        taskFormat: 'short_dialogue_mcq',
        plays: 2,
        segmentCount: 2,
        questionsPerSegment: 3,
      },
      {
        teil: 2,
        slotType: 'short_monologues',
        label: 'Teil 2 — Monolog (MCQ)',
        itemsTotal: 6,
        layout: 'segments',
        questionTypes: ['multiple_choice', 'multiple'],
        instruction: GOETHE_B1_INSTRUCTIONS.horen[1],
        taskFormat: 'short_monologues',
        plays: 1,
      },
      {
        teil: 3,
        slotType: 'long_audio',
        label: 'Teil 3 — Gespräch (Richtig/Falsch)',
        itemsTotal: 7,
        layout: 'segments',
        questionTypes: ['richtig_falsch', 'true_false'],
        instruction: GOETHE_B1_INSTRUCTIONS.horen[2],
        taskFormat: 'long_listening_mcq',
        plays: 1,
      },
      {
        teil: 4,
        slotType: 'discussion',
        label: 'Teil 4 — Diskussion (Zuordnung)',
        itemsTotal: 8,
        layout: 'segments',
        questionTypes: ['matching', 'multiple_choice'],
        instruction: GOETHE_B1_INSTRUCTIONS.horen[3],
        taskFormat: 'discussion',
        plays: 2,
      },
    ],
  },
  goethe_B2: {
    lesen: [
      { teil: 1, slotType: 'article', label: 'Teil 1 — Text', itemsTotal: 6, layout: 'passage_questions', questionTypes: ['multiple_choice'], wordsPerPassage: { min: 200, max: 350 } },
      { teil: 2, slotType: 'article', label: 'Teil 2 — Text', itemsTotal: 6, layout: 'passage_questions', questionTypes: ['multiple_choice'], wordsPerPassage: { min: 200, max: 350 } },
      { teil: 3, slotType: 'matching', label: 'Teil 3 — Zuordnung', itemsTotal: 6, layout: 'items', questionTypes: ['matching'] },
      { teil: 4, slotType: 'gap_article', label: 'Teil 4 — Lückentext', itemsTotal: 6, layout: 'passage_questions', questionTypes: ['gap_fill'], wordsPerPassage: { min: 180, max: 300 } },
      { teil: 5, slotType: 'mcq_texts', label: 'Teil 5 — Sachtexte', itemsTotal: 6, layout: 'items', questionTypes: ['multiple_choice'] },
    ],
    horen: [
      { teil: 1, slotType: 'short_dialogues', label: 'Teil 1', itemsTotal: 8, layout: 'segments', questionTypes: ['multiple_choice'] },
      { teil: 2, slotType: 'short_monologues', label: 'Teil 2', itemsTotal: 6, layout: 'segments', questionTypes: ['multiple_choice'] },
      { teil: 3, slotType: 'long_audio', label: 'Teil 3', itemsTotal: 8, layout: 'segments', questionTypes: ['multiple_choice'] },
      { teil: 4, slotType: 'discussion', label: 'Teil 4', itemsTotal: 8, layout: 'segments', questionTypes: ['multiple_choice', 'richtig_falsch'] },
    ],
  },
  dele_C1: {
    lesen: [
      { teil: 1, slotType: 'short_texts', label: 'Tarea 1 — Textos breves', itemsTotal: 4, layout: 'items', questionTypes: ['multiple_choice', 'true_false'], wordsPerText: { min: 80, max: 150 } },
      { teil: 2, slotType: 'long_article', label: 'Tarea 2 — Texto extenso', itemsTotal: 6, layout: 'passage_questions', questionTypes: ['multiple_choice', 'true_false'], wordsPerPassage: { min: 400, max: 600 }, requiresInference: true },
      { teil: 3, slotType: 'matching', label: 'Tarea 3 — Vinculación', itemsTotal: 6, layout: 'items', questionTypes: ['matching', 'multiple_choice'] },
      { teil: 4, slotType: 'gap_article', label: 'Tarea 4 — Organización', itemsTotal: 6, layout: 'passage_questions', questionTypes: ['gap_fill', 'multiple_choice'], wordsPerPassage: { min: 300, max: 500 } },
    ],
    horen: [
      { teil: 1, slotType: 'short_audio', label: 'Tarea 1 — Avisos y diálogos', itemsTotal: 4, layout: 'segments', questionTypes: ['multiple_choice', 'true_false'] },
      { teil: 2, slotType: 'long_audio', label: 'Tarea 2 — Entrevista', itemsTotal: 4, layout: 'segments', questionTypes: ['multiple_choice', 'true_false'], requiresInference: true },
      { teil: 3, slotType: 'long_audio', label: 'Tarea 3 — Conferencia', itemsTotal: 4, layout: 'segments', questionTypes: ['multiple_choice'] },
    ],
    schreiben: [
      { teil: 1, slotType: 'writing_task', label: 'Tarea 1 — Texto argumentativo', itemsTotal: 1, layout: 'writing', questionTypes: ['short_answer'], wordsTarget: { min: 180, max: 220 }, taskFormat: 'argumentative_essay' },
      { teil: 2, slotType: 'writing_task', label: 'Tarea 2 — Carta formal', itemsTotal: 1, layout: 'writing', questionTypes: ['short_answer'], wordsTarget: { min: 180, max: 220 }, taskFormat: 'formal_letter' },
    ],
    sprechen: [
      { teil: 1, slotType: 'speaking_task', label: 'Tarea 1 — Presentación', itemsTotal: 1, layout: 'speaking', questionTypes: ['short_answer'], taskFormat: 'presentation' },
      { teil: 2, slotType: 'speaking_task', label: 'Tarea 2 — Conversación', itemsTotal: 1, layout: 'speaking', questionTypes: ['short_answer'], taskFormat: 'discussion' },
      { teil: 3, slotType: 'speaking_task', label: 'Tarea 3 — Debate', itemsTotal: 1, layout: 'speaking', questionTypes: ['short_answer'], taskFormat: 'debate' },
    ],
  },
};

export function taskFormatForPart(part) {
  if (part.taskFormat) return part.taskFormat;
  return TASK_FORMAT_BY_SLOT[part.slotType] || part.slotType || 'unknown';
}

export function enrichPart(part, defaults = {}) {
  const items = part.itemsTotal ?? part.questionsTotal?.max ?? part.questionsTotal?.min ?? 1;
  const out = {
    ...defaults,
    ...part,
    itemsTotal: items,
    questionsTotal: { min: items, max: items },
    taskFormat: taskFormatForPart(part),
  };
  if (part.wordsPerPassage && !out.wordsPerPassage) out.wordsPerPassage = part.wordsPerPassage;
  if (part.wordsPerText && !out.wordsPerPassage) out.wordsPerPassage = part.wordsPerText;
  if (part.wordsTarget && !out.wordsPerPassage) out.wordsPerPassage = part.wordsTarget;
  return out;
}
