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
import { B1_TOPICS, isValidB1Topic, normalizeB1Topic } from './b1Topics.mjs';

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
 * Tema de stock por pregunta (Schreiben/Sprechen sin passage).
 * No usar solo el tema del batch: cada Aufgabe puede ser distinta (p. ej. T2 «Ihr Chef…» → Arbeit).
 */
export function detectQuestionTopicTag(q, batchFallbackTopic = null) {
  if (!q) return batchFallbackTopic || 'Freizeit';
  const mod = String(q.module || '').toLowerCase();
  const teil = Number(q.teil);
  const level = String(q.level || 'B1').trim().toUpperCase();
  if (mod === 'sprechen' && teil === 1 && q.type === 'personal_questions' && level === 'A2') {
    return 'Freizeit';
  }
  const text = [q.question, q.signText, q.transcript, q.statement].filter(Boolean).join(' ');
  const fromText = text ? detectTopic(text) : null;
  if (fromText && isValidB1Topic(fromText)) return fromText;
  const existing = q.topicTags?.[0] || q.topicTag;
  if (existing && isValidB1Topic(String(existing))) return String(existing);
  if (batchFallbackTopic && isValidB1Topic(batchFallbackTopic)) return batchFallbackTopic;
  return 'Freizeit';
}

export function inferLesenT5DominantTopic(batch, fallbackTopic) {
  const seed = String(batch._t5InstitutionSeed || batch.passages?.[0]?.title || '');
  const seedLc = seed.toLowerCase();
  const subtype = String(batch._t5TextSubtype || batch._t5Subtype || '').toLowerCase();
  if (subtype === 'wohnanlage' || /wohnanlage|mehrfamilienhaus|wohnhaus|mietshaus|wohnheim|siedlung/i.test(seedLc)) {
    return 'Wohnen';
  }
  if (/fitnessstudio|sportverein|schwimmbad|turnhalle|vitalpark/i.test(seedLc)) return 'Sport';
  if (/bibliothek|bücherei|schule|gymnasium|berufsschule/i.test(seedLc)) return 'Bildung';
  if (/kantine|mensa|markthalle|cafeteria|betriebskantine/i.test(seedLc)) return 'Ernährung';
  if (/einkaufszentrum|shopping|markthalle|wochenmarkt/i.test(seedLc)) return 'Einkaufen';
  if (/bürgerzentrum|freizeitzentrum|jugendtreff|stadthalle|computerraum|workhub/i.test(seedLc)) {
    return 'Freizeit';
  }
  const p = batch.passages?.[0];
  const blob = [p?.title, p?.text].filter(Boolean).join('\n');
  const fromPassage = blob ? detectTopic(blob) : null;
  if (fromPassage && isValidB1Topic(fromPassage)) return fromPassage;
  if (fallbackTopic && isValidB1Topic(fallbackTopic)) return fallbackTopic;
  return 'Freizeit';
}

/**
 * Root/batch topic = tema pedido; cada question usa detectQuestionTopicTag (contenido real)
 * salvo Lesen T5 / forceUniformTopic / _requestedTopic explícito (celda de generación).
 */
export function alignQuestionTopicTagsToRequestedTopic(batch) {
  if (!batch) return batch;
  const mod = String(
    batch.module || batch.questions?.[0]?.module || batch.passages?.[0]?.module || '',
  ).toLowerCase();
  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil ?? batch.passages?.[0]?.teil);
  const isLesenT5 = mod === 'lesen' && teil === 5;
  const root = normalizeB1Topic(
    isLesenT5 ? batch.topicTag : batch._requestedTopic || batch.topicTag,
  );
  if (!root || !isValidB1Topic(root)) return batch;
  batch.topicTag = root;
  if (batch.passages) {
    batch.passages = batch.passages.map((p) => ({ ...p, topicTag: root }));
  }
  if (batch.questions) {
    batch.questions = batch.questions.map((q) => ({
      ...q,
      topicTags: [root],
      ...(q.topicTag != null ? { topicTag: root } : {}),
    }));
  }
  return batch;
}

export function tagBatchWithTopic(batch, topic, opts = {}) {
  if (!batch || !topic) return batch;
  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil ?? batch.passages?.[0]?.teil);
  const mod = String(batch.module || batch.questions?.[0]?.module || batch.passages?.[0]?.module || '')
    .toLowerCase();
  const isLesenT5 = mod === 'lesen' && teil === 5;
  const effectiveTopic = isLesenT5 ? inferLesenT5DominantTopic(batch, topic) : topic;
  const requestedRoot = normalizeB1Topic(batch._requestedTopic);
  const forceUniform =
    opts.forceUniformTopic === true ||
    isLesenT5 ||
    (requestedRoot && isValidB1Topic(requestedRoot));
  const tagged = {
    ...batch,
    topicTag: effectiveTopic,
    _requestedTopic: batch._requestedTopic || topic,
  };
  tagged.passages = (batch.passages || []).map((p) => ({ ...p, topicTag: effectiveTopic }));
  tagged.questions = (batch.questions || []).map((q) => {
    const perQ = forceUniform ? effectiveTopic : detectQuestionTopicTag(q, effectiveTopic);
    return {
      ...q,
      topicTags: [perQ],
      ...(q.topicTag != null ? { topicTag: perQ } : {}),
    };
  });
  return tagged;
}
