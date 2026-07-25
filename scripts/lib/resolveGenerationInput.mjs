import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { isValidB1Topic, normalizeB1Topic, B1_TOPICS } from './b1Topics.mjs';
import { classifyUserVocab } from './vocabPrefilter.mjs';
import { pickTargetWords, loadWeakLemmas, pickRandomWords } from './lesenTemplatePrompt.mjs';
import { pickNextTopic } from './topicRotation.mjs';

const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');

/**
 * Resolve closed B1 topic: explicit --topic or rotation fallback.
 */
export function resolveGenerationTopic(args, { module = 'lesen', teil = 1 } = {}) {
  if (args.topic) {
    const t = normalizeB1Topic(args.topic);
    if (!t) {
      throw new Error(
        `Tema inválido: "${args.topic}". Usa uno de: ${B1_TOPICS.join(', ')}`,
      );
    }
    return t;
  }
  return pickNextTopic(GENERATED_DIR, { module, teil });
}

/**
 * User-provided vocab with CEFR pre-filter, or pool/coverage fallback.
 * @returns {{ words: string[], userVocab: object|null, topic: string }}
 */
export function resolveGenerationVocab(args, topicCtx = {}) {
  const topic = resolveGenerationTopic(args, topicCtx);

  if (args.words?.length) {
    const cap = Math.max(1, Number(args.wordCount) || 20);
    const raw = args.words.slice(0, cap);
    const userVocab = classifyUserVocab(raw, { lang: args.lang, level: args.level });
    for (const w of userVocab.warnings) {
      console.warn(`  ⚠ vocab "${w.word}": ${w.message}`);
    }
    for (const ex of userVocab.excluded) {
      console.warn(`  ⊘ vocab excluida (${ex.band}): ${ex.word} — ${ex.reason}`);
    }
    if (!userVocab.prompted.length) {
      throw new Error(
        'Tras el filtro CEFR no quedan palabras para el generador. Elige palabras B1 o corrige la lista.',
      );
    }
    return { words: userVocab.prompted, userVocab, topic };
  }

  let words;
  if (args.fromBank) {
    words = pickTargetWords({
      lang: args.lang,
      level: args.level,
      count: args.wordCount,
      source: 'bank',
    });
  } else if (args.fromCoverage) {
    const weak = loadWeakLemmas(args.lang, args.level);
    if (!weak?.length) {
      throw new Error(
        `No hay data/coverage/weak-${args.lang}_${args.level}.json — ejecuta vocab-coverage-report.mjs`,
      );
    }
    words = pickRandomWords(weak, args.wordCount, args.wordCount);
    if (!words.length) throw new Error('No se pudieron elegir palabras del reporte de cobertura');
  } else {
    throw new Error('Pasa --words a,b,c, --from-bank o --from-coverage');
  }

  return { words, userVocab: null, topic };
}

/**
 * Mutates args with _resolvedTopic / _userVocab and returns prompted words.
 */
export function resolveTargetWordsForArgs(args, topicCtx = {}) {
  const resolved = resolveGenerationVocab(args, topicCtx);
  args._resolvedTopic = resolved.topic;
  args._userVocab = resolved.userVocab;
  return resolved.words;
}

export { isValidB1Topic, B1_TOPICS };
