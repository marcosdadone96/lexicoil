/**
 * Shared vocabulary-preference prompt block (terminal plantillas + web PromptBuilder).
 */

export const VOCAB_PREFERENCE_INTRO =
  'Usa de forma NATURAL estas palabras si encajan: {{WORDS}}. ' +
  'Prioriza naturalidad y nivel B1 — si una palabra no encaja, OMÍTELA, no la fuerces. ' +
  'Mejor un texto natural con algunas de estas palabras que uno forzado con todas.';

export const VOCAB_PREFERENCE_SECTION_HEADER = '## VOCABULARIO SUGERIDO (preferencia — no obligación)';

export const VOCAB_OPTIONAL_REINFORCEMENT =
  '**Estas palabras son OPCIONALES.** Integra solo las que suenen 100% naturales en un foro/reglamento B1. ' +
  'Forzar una palabra que no encaja es motivo de rechazo.';

/** Sprechen / consignas orales B1 (SP-2.1). */
export const VOCAB_OPTIONAL_REINFORCEMENT_ORAL =
  '**Estas palabras son OPCIONALES.** Intégralas solo si suenan 100% naturales en una consigna de examen oral B1. ' +
  'Una frase forzada es motivo de rechazo.';

/** Hören transcripts (anuncios / radio / telefonate) — same omit-over-force rule + concrete anti-patterns. */
export const VOCAB_OPTIONAL_REINFORCEMENT_HOREN =
  '**Estas palabras son OPCIONALES.** Intégralas solo si suenan 100% naturales en alemán **hablado** B1 (Ansage, Telefonat, Radio-Tipp). ' +
  '**PROHIBIDO** insertar una palabra objetivo si no encaja de forma natural. ' +
  'Ejemplo INCORRECTO: «die Ontologie des Stresses» en un consejo de salud coloquial; ' +
  'o meter «Klimawandel» en una Durchsage de farmacia sobre un Hustenmittel; ' +
  'o un comentario meta-gramatical («So ein Konjunktiv hilft…») solo para colar la palabra. ' +
  'Ejemplo CORRECTO: si no encaja, **OMÍTELA** — menos palabras objetivo es mejor que forzar una que rompa la coherencia. ' +
  'REGLA DISTRACTORES (Hören MCQ a/b/c — T1 y T2): las opciones incorrectas (distractores) deben ser semánticamente coherentes con el tema del pasaje/segmento, aunque sean falsas — NUNCA insertes una palabra objetivo en un distractor si el resultado no tiene relación con el tema. ' +
  'Ejemplo INCORRECTO: en un pasaje sobre gestión del estrés, la opción «Die Notwendigkeit, einen Dolmetscher zu konsultieren» (necesidad de un intérprete) es un non-sequitur — no tiene nada que ver con el tema, aunque la palabra en sí exista en alemán correcto. ' +
  'Ejemplo CORRECTO: si la palabra objetivo no encaja de forma natural en un distractor temáticamente coherente, OMÍTELA del distractor — usa vocabulario del propio campo semántico del pasaje en su lugar.';

/**
 * @param {string[]} words
 * @param {{ oral?: boolean }} [opts]
 * @returns {string}
 */
export function buildVocabPreferenceBlock(words, opts = {}) {
  const list = (words || []).map((w) => String(w).trim()).filter(Boolean);
  if (!list.length) {
    throw new Error('Lista de vocabulario sugerido vacía');
  }
  const intro = VOCAB_PREFERENCE_INTRO.replace('{{WORDS}}', list.join(', '));
  const optional = opts.horen
    ? VOCAB_OPTIONAL_REINFORCEMENT_HOREN
    : opts.oral
      ? VOCAB_OPTIONAL_REINFORCEMENT_ORAL
      : VOCAB_OPTIONAL_REINFORCEMENT;
  const where = opts.oral
    ? '- Intégralas solo en las **consignas** si encajan; nunca inventes viñetas rotas solo para meter una palabra.\n'
    : '- Intégralas sobre todo en el **pasaje/transcript**, no en las preguntas literalmente.\n';
  return (
    `${VOCAB_PREFERENCE_SECTION_HEADER}\n` +
    `- ${intro}\n` +
    `- ${optional}\n` +
    where +
    `- Si una palabra no encaja en el tema elegido, **omítela** sin forzar.\n`
  );
}

/** Refuerza el bloque de vocab sugerido en prompts ya construidos (p. ej. buildLesenPrompt). */
export function reinforceVocabOptionalBlock(markdown, opts = {}) {
  const optional = opts.horen
    ? VOCAB_OPTIONAL_REINFORCEMENT_HOREN
    : opts.oral
      ? VOCAB_OPTIONAL_REINFORCEMENT_ORAL
      : VOCAB_OPTIONAL_REINFORCEMENT;
  if (markdown.includes('PROHIBIDO insertar una palabra objetivo') || markdown.includes('Estas palabras son OPCIONALES')) {
    return markdown;
  }
  if (!markdown.includes(VOCAB_PREFERENCE_SECTION_HEADER)) return markdown;
  const anchorOral = '- Intégralas solo en las **consignas**';
  const anchor = '- Intégralas sobre todo en el **pasaje/transcript**';
  if (markdown.includes(anchorOral)) {
    return markdown.replace(anchorOral, `- ${optional}\n${anchorOral}`);
  }
  if (markdown.includes(anchor)) {
    return markdown.replace(anchor, `- ${optional}\n${anchor}`);
  }
  return markdown.replace(
    VOCAB_PREFERENCE_SECTION_HEADER,
    `${VOCAB_PREFERENCE_SECTION_HEADER}\n- ${optional}`,
  );
}

/**
 * Replace legacy PALABRAS OBJETIVO limits + <<< block in plantilla markdown.
 * @param {string} markdown
 * @param {string[]} words
 * @param {{ oral?: boolean }} [opts]
 */
export function applyVocabPreferenceToTemplate(markdown, words, opts = {}) {
  const block = buildVocabPreferenceBlock(words, opts);
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

export const MIN_BG_ANCHOR_INTEGRATED = 2;

export function buildVocabBgMandatoryAnchorBlock(anchorWords, topic, opts = {}) {
  const anchors = (anchorWords || []).map((w) => String(w).trim()).filter(Boolean);
  const min = Math.min(MIN_BG_ANCHOR_INTEGRATED, anchors.length);
  if (!anchors.length || min < 1) return '';
  const where = opts.horen
    ? 'Integra las anclas en los **transcripts/pasajes** (Ansagen, Telefonate, Radio), no solo en metadatos.'
    : 'Integra las anclas en el **pasaje/texto principal**, no solo en preguntas.';
  return (
    `## VOCABULARIO DEL USUARIO (OBLIGATORIO — generación de fondo)\n` +
    `Debes integrar **al menos ${min}** de estas palabras del usuario de forma natural y verificable en alemán B1: **${anchors.join(', ')}**.\n` +
    `Tema del examen: **${topic || 'B1'}**. ${where}\n` +
    `No publiques un texto donde omitas todas las anclas del usuario. Reformula el escenario si hace falta para que encajen.\n`
  );
}

export function personalExamVocabPromptLines(words) {
  const list = (words || []).map((w) => `"${w}"`).join(', ');
  return [
    'SUGGESTED LEARNER VOCABULARY (preference — not mandatory):',
    VOCAB_PREFERENCE_INTRO.replace('{{WORDS}}', list || '(none)'),
    'Integrate only words that fit naturally; omit the rest without forcing broken German.',
  ];
}
