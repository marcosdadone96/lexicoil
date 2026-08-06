/**
 * ESM façade for vocab index quality (scripts / tests).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = require(path.join(ROOT, 'netlify/functions/lib/vocabIndexQuality.js'));
const partIndex = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));

export const {
  VOCAB_INDEX_VERSION,
  MAX_VOCAB_INDEX,
  NEVER_INDEX,
  BARE_LIGHT_VERBS,
  TYPO_OR_TRUNCATED,
  qualityFilterToken,
  canonicalizeVocabQuery,
  buildVocabIndex,
  vocabEntryKeys,
  rankPartsByVocab,
  resolveConcept,
} = lib;

export const {
  applyPartIndex,
  scorePartWordCoverage,
  buscar,
  vocabEntryKey,
} = partIndex;

export default lib;
