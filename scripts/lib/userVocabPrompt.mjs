/**
 * Shared vocabulary-preference prompt block (terminal plantillas + web PromptBuilder).
 */

export const VOCAB_PREFERENCE_INTRO =
  'Usa de forma NATURAL estas palabras si encajan: {{WORDS}}. ' +
  'Prioriza naturalidad y nivel B1 — si una palabra no encaja, OMÍTELA, no la fuerces. ' +
  'Mejor un texto natural con algunas de estas palabras que uno forzado con todas.';

export const VOCAB_PREFERENCE_SECTION_HEADER = '## VOCABULARIO SUGERIDO (preferencia — no obligación)';

/**
 * @param {string[]} words
 * @returns {string}
 */
export function buildVocabPreferenceBlock(words) {
  const list = (words || []).map((w) => String(w).trim()).filter(Boolean);
  if (!list.length) {
    throw new Error('Lista de vocabulario sugerido vacía');
  }
  const intro = VOCAB_PREFERENCE_INTRO.replace('{{WORDS}}', list.join(', '));
  return (
    `${VOCAB_PREFERENCE_SECTION_HEADER}\n` +
    `- ${intro}\n` +
    `- Intégralas sobre todo en el **pasaje/transcript**, no en las preguntas literalmente.\n` +
    `- Si una palabra no encaja en el tema elegido, **omítela** sin forzar.\n`
  );
}

/**
 * Replace legacy PALABRAS OBJETIVO limits + <<< block in plantilla markdown.
 * @param {string} markdown
 * @param {string[]} words
 */
export function applyVocabPreferenceToTemplate(markdown, words) {
  const block = buildVocabPreferenceBlock(words);
  const limitsRe = /## PALABRAS OBJETIVO — límites[\s\S]*?## PALABRAS OBJETIVO\n<<<[^>]+>>>/;
  if (limitsRe.test(markdown)) {
    return markdown.replace(limitsRe, block);
  }
  const marker = markdown.indexOf('## PALABRAS OBJETIVO');
  if (marker >= 0) {
    const after = markdown.indexOf('\n', marker);
    const rest = markdown.slice(after + 1).replace(/^<<<[^>]+>>>\n?/, '');
    return `${markdown.slice(0, marker)}\n${block}\n${rest}`;
  }
  return `${markdown}\n\n${block}\n`;
}

export function personalExamVocabPromptLines(words) {
  const list = (words || []).map((w) => `"${w}"`).join(', ');
  return [
    'SUGGESTED LEARNER VOCABULARY (preference — not mandatory):',
    VOCAB_PREFERENCE_INTRO.replace('{{WORDS}}', list || '(none)'),
    'Integrate only words that fit naturally; omit the rest without forcing broken German.',
  ];
}
