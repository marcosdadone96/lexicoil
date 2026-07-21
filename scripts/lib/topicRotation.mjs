/**
 * topicRotation.mjs — Variedad temática para generación masiva.
 *
 * Proporciona:
 *  - TOPICS: lista canónica de 15 temas B1
 *  - detectTopic(text): detecta el tema de un pasaje por palabras clave
 *  - pickNextTopic(generatedDir, module, teil): devuelve el tema menos usado en el banco
 *  - getTopicStats(generatedDir): estadísticas de uso por tema
 *  - injectTopicIntoPrompt(prompt, topic): añade la línea de tema obligatorio al prompt
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { B1_TOPICS, isValidB1Topic } from './b1Topics.mjs';

const require = createRequire(import.meta.url);
const { detectTopic } = require('../../js/engine/partTopicDetect.js');

/** @deprecated alias — use B1_TOPICS from b1Topics.mjs */
export const TOPICS = B1_TOPICS;
export { B1_TOPICS, isValidB1Topic, detectTopic };

/**
 * Lee todos los archivos generados y cuenta cuántas veces aparece cada topic.
 * Filtra por module y teil si se proporcionan.
 */
export function getTopicStats(generatedDir, { module = null, teil = null } = {}) {
  const counts = Object.fromEntries(TOPICS.map(t => [t, 0]));
  if (!fs.existsSync(generatedDir)) return counts;

  for (const filename of fs.readdirSync(generatedDir)) {
    if (!filename.endsWith('.json') || filename.startsWith('.')) continue;
    if (module) {
      const modMatch = filename.toLowerCase().startsWith(module.toLowerCase());
      if (!modMatch) continue;
    }
    if (teil != null) {
      const teilMatch = new RegExp(`-t${teil}-`).test(filename);
      if (!teilMatch) continue;
    }
    try {
      const batch = JSON.parse(fs.readFileSync(path.join(generatedDir, filename), 'utf8'));
      let counted = false;
      for (const p of batch.passages || []) {
        const tag = p.topicTag || detectTopic(p.text || p.title || '');
        if (tag && counts[tag] !== undefined) {
          counts[tag]++;
          counted = true;
        }
      }
      // Sprechen/Schreiben: passages vacíos — contar topicTags de questions / root
      if (!counted) {
        const root = batch.topicTag || batch._requestedTopic;
        const qTag = batch.questions?.[0]?.topicTags?.[0] || batch.questions?.[0]?.topicTag;
        const tag = root || qTag;
        if (tag && counts[tag] !== undefined) counts[tag]++;
      }
    } catch (_) { /* skip corrupt files */ }
  }
  return counts;
}

/**
 * Devuelve el tema menos usado en el banco para el módulo/teil dado.
 * En caso de empate, escoge aleatoriamente entre los menos usados.
 */
export function pickNextTopic(generatedDir, { module = null, teil = null } = {}) {
  const stats = getTopicStats(generatedDir, { module, teil });
  const minCount = Math.min(...Object.values(stats));
  const candidates = TOPICS.filter(t => stats[t] === minCount);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Bloque de tema obligatorio (sufijo variable — va después del STATIC_CORE cacheable).
 * @param {string} topic
 * @returns {string}
 */
export function buildTopicPromptBlock(topic) {
  if (!topic) return '';
  return (
    `\n## TEMA OBLIGATORIO\nDesarrolla el contenido EXCLUSIVAMENTE en torno a: **${topic}**\n` +
    `El pasaje, los personajes y las preguntas deben girar en torno a este tema.\n` +
    `- En **Lesen T2**: los **DOS** textos de prensa deben tratar **${topic}** (no mezclar Bildung/Reisen/Ernährung en el segundo texto).\n` +
    `- El campo \`topicTag\` de **cada** passage debe ser exactamente «${topic}».\n`
  );
}

/**
 * @deprecated Prefer passing `topic` into buildLesenPrompt / buildExamPrompt options.
 * Appends topic block to the variable suffix (end of prompt).
 */
export function injectTopicIntoPrompt(prompt, topic) {
  const block = buildTopicPromptBlock(topic);
  if (!block) return prompt;
  const marker = prompt.indexOf('## CONTEXTO DE ESTA GENERACIÓN');
  if (marker >= 0) {
    const insertAt = prompt.indexOf('\n', marker) + 1;
    return prompt.slice(0, insertAt) + block + prompt.slice(insertAt);
  }
  return prompt + block;
}

/**
 * Añade topicTag al batch, a cada passage y a questions[].topicTags.
 * Fuerza el tema pedido (ignora topicTag del LLM / detectTopic).
 * Crítico para Sprechen/Schreiben (passages: []): sin esto las questions
 * quedan con fallback daily_life / sin tema.
 */
export function tagBatchWithTopic(batch, topic) {
  if (!batch || !topic) return batch;
  const tagged = {
    ...batch,
    topicTag: topic,
    _requestedTopic: batch._requestedTopic || topic,
  };
  tagged.passages = (batch.passages || []).map((p) => ({ ...p, topicTag: topic }));
  tagged.questions = (batch.questions || []).map((q) => ({
    ...q,
    topicTags: [topic],
    ...(q.topicTag != null ? { topicTag: topic } : {}),
  }));
  return tagged;
}
