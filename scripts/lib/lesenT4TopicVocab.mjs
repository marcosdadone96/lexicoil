/**
 * lesenT4TopicVocab.mjs — Vocab prompt para Lesen T4 (foro Ja/Nein).
 * Filtra meta-lemas genéricos del pool de cobertura y prioriza léxico del tema.
 */
import { foldLemma } from './vocabBank.mjs';
import { normalizeB1Topic } from './b1Topics.mjs';

/** Meta-lemas que encajan mal en opiniones de foro (mismo criterio parcial que T5). */
export const T4_DEBATE_META_LEMMAS = new Set(
  [
    'aufgabe',
    'situation',
    'aktuell',
    'vorteil',
    'zukunft',
    'direkt',
    'bedeutung',
    'positiv',
    'negativ',
    'wichtig',
    'problem',
    'meinung',
    'diskutieren',
  ].map(foldLemma),
);

/** Léxico B1 alineado al debate por tema (formas flexionadas OK en generación). */
export const T4_TOPIC_DEBATE_VOCAB_POOL = Object.freeze({
  Sport: ['training', 'mannschaft', 'turnier', 'verein', 'wettkampf', 'sportler', 'fitness', 'spiel'],
  Gesundheit: ['vorsorge', 'arzt', 'impfung', 'therapie', 'krankenkasse', 'medikament', 'fitness', 'prävention'],
  Freizeit: ['hobby', 'kurs', 'ausflug', 'verein', 'wochenende', 'freizeit', 'spaziergang', 'treffen'],
  Bildung: ['schule', 'unterricht', 'lehrer', 'schüler', 'kurs', 'lernen', 'prüfung', 'studium'],
  Arbeit: ['kollege', 'büro', 'gehalt', 'praktikum', 'homeoffice', 'beruf', 'arbeitgeber', 'stelle'],
});

/**
 * @param {string[]} words
 * @param {string|null} topicTag
 * @returns {{ words: string[], swapped: string[], kept: string[] }}
 */
export function adaptT4WordsForDebate(words, topicTag) {
  const topic = normalizeB1Topic(topicTag);
  const input = (words || []).map(String).filter(Boolean);
  if (!input.length) return { words: input, swapped: [], kept: input };

  const pool = T4_TOPIC_DEBATE_VOCAB_POOL[topic] || [];
  const used = new Set();
  const kept = [];
  const swapped = [];
  const out = [];

  for (const w of input) {
    const f = foldLemma(w);
    if (T4_DEBATE_META_LEMMAS.has(f)) {
      const replacement = pool.find((p) => !used.has(foldLemma(p)));
      if (replacement) {
        out.push(replacement);
        swapped.push(`${w}→${replacement}`);
        used.add(foldLemma(replacement));
        continue;
      }
    }
    out.push(w);
    kept.push(w);
    used.add(f);
  }

  let i = 0;
  while (out.length < input.length && pool.length) {
    const pick = pool[i % pool.length];
    i += 1;
    const f = foldLemma(pick);
    if (used.has(f)) continue;
    out.push(pick);
    swapped.push(`+${pick}`);
    used.add(f);
  }

  return { words: out.slice(0, Math.max(input.length, out.length)), swapped, kept };
}
