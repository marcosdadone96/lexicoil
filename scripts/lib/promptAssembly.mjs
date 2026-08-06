/**
 * Prompt assembly for implicit Gemini context caching.
 * STATIC_CORE (identical per module/teil) + VARIABLE_SUFFIX (topic, vocab, IDs, …).
 */

import { buildVocabPreferenceBlock } from './userVocabPrompt.mjs';

/** Marker between cacheable static prefix and per-request variable tail. */
export const VARIABLE_SUFFIX_MARKER = '\n\n---\n\n## CONTEXTO DE ESTA GENERACIÓN (variable — no afecta caché)\n';

/**
 * Remove PALABRAS OBJETIVO placeholder block from plantilla markdown.
 * @param {string} markdown
 * @returns {string}
 */
export function stripVocabSectionFromTemplate(markdown) {
  const limitsRe = /## PALABRAS OBJETIVO — límites[\s\S]*?## PALABRAS OBJETIVO\n<<<[^>]+>>>/;
  if (limitsRe.test(markdown)) {
    return markdown.replace(limitsRe, '');
  }
  const marker = markdown.indexOf('## PALABRAS OBJETIVO');
  if (marker >= 0) {
    const after = markdown.indexOf('\n', marker);
    const rest = markdown.slice(after + 1).replace(/^<<<[^>]+>>>\n?/, '');
    return markdown.slice(0, marker) + rest;
  }
  return markdown;
}

/**
 * Extract ## AUTORREVISIÓN section from raw template (optional per generation).
 * @param {string} markdown — full template body (human header stripped)
 * @returns {string}
 */
export function extractAutorrevisionSection(markdown) {
  const m = markdown.match(/\n## AUTORREVISIÓN[\s\S]*?(?=\n## Formato de salida|\n## EJEMPLO|$)/);
  return m ? `${m[0].trim()}\n` : '';
}

/**
 * Remove ## AUTORREVISIÓN from template body (moved to variable suffix when used).
 * @param {string} markdown
 * @returns {string}
 */
export function stripAutorrevisionSection(markdown) {
  return markdown.replace(/\n## AUTORREVISIÓN[\s\S]*?(?=\n## Formato de salida|\n## EJEMPLO|$)/, '\n');
}

/**
 * @param {string} staticCore
 * @param {string} variableSuffix
 * @returns {string}
 */
export function assemblePrompt(staticCore, variableSuffix) {
  const tail = String(variableSuffix || '').trim();
  if (!tail) return String(staticCore || '').trim();
  return `${String(staticCore || '').trim()}${VARIABLE_SUFFIX_MARKER}${tail}`;
}

/**
 * @param {string[]} words
 * @param {{ oral?: boolean, horen?: boolean }} [opts]
 * @returns {string}
 */
export function buildVocabVariableBlock(words, opts = {}) {
  return buildVocabPreferenceBlock(words, opts);
}
