import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { isValidB1Topic, normalizeB1Topic, B1_TOPICS } from './b1Topics.mjs';
import { classifyUserVocab } from './vocabPrefilter.mjs';
import { pickTargetWords, loadWeakLemmas, pickRandomWords } from './lesenTemplatePrompt.mjs';
import { pickNextTopic } from './topicRotation.mjs';
import { filterPromptTargetWords, isBlacklistedLemma } from './lexicalCheck.mjs';

const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');

/** Léxico B1 seguro — derivado de plantillas lesen-teil*.md y TOPIC_KEYWORDS. */
const TEMPLATE_SAFE_B1_WORDS = Object.freeze([
  'stadt', 'transport', 'auto', 'nachhaltigkeit', 'kinder', 'besucher', 'organisation',
  'nachbar', 'familie', 'erfahrung', 'meinung', 'problem', 'vorteil', 'plan', 'regel',
  'bewohner', 'termin', 'kurs', 'projekt', 'freizeit', 'bericht', 'arbeit', 'firma',
  'kollege', 'programm', 'anmeldung', 'gebühr', 'ruhe', 'raum', 'parkplatz', 'müll',
  'reparieren', 'hausbesuch', 'wohnung', 'schule', 'unterricht', 'urlaub', 'reise',
  'gesundheit', 'sport', 'hobby', 'wochenende', 'freund', 'bus', 'bahn', 'fahrrad',
]);

const require = createRequire(import.meta.url);
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

const SAFE_B1_BY_TOPIC = Object.freeze(
  Object.fromEntries(
    B1_TOPICS.map((topic) => {
      const topicWords = (TOPIC_KEYWORDS[topic] || []).map((w) => w.toLowerCase());
      return [topic, [...new Set([...topicWords, ...TEMPLATE_SAFE_B1_WORDS])]];
    }),
  ),
);

/**
 * Filtra blacklist C1/C2 y rellena desde pool seguro si quedan <3 palabras.
 * @param {string[]} words
 * @param {string|null} topicTag
 * @param {number} [targetCount]
 */
export function sanitizePromptTargetWords(words, topicTag, targetCount = 8) {
  const goal = Math.max(3, Number(targetCount) || 8);
  let filtered = filterPromptTargetWords(words);
  if (filtered.length >= goal) return filtered.slice(0, goal);

  const topic = normalizeB1Topic(topicTag);
  const pool = (topic && SAFE_B1_BY_TOPIC[topic]) || TEMPLATE_SAFE_B1_WORDS;
  const used = new Set(filtered.map((w) => w.toLowerCase()));
  const candidates = pool.filter(
    (w) => w.length >= 4 && !used.has(w) && !isBlacklistedLemma(w),
  );

  while (filtered.length < goal && candidates.length) {
    const i = Math.floor(Math.random() * candidates.length);
    const pick = candidates.splice(i, 1)[0];
    filtered.push(pick);
    used.add(pick);
  }

  if (filtered.length < 3) {
    throw new Error(
      `Tras filtrar registro C1/C2 quedan ${filtered.length} palabras objetivo (<3). ` +
      `Revisa coverage o el topicTag «${topic || '—'}».`,
    );
  }
  return filtered;
}

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
  const targetCount = Math.max(1, Number(args.wordCount) || 10);
  return sanitizePromptTargetWords(resolved.words, resolved.topic, targetCount);
}

export { isValidB1Topic, B1_TOPICS };
