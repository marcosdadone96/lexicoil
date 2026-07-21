import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLACKLIST } from '../blacklist.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

require(path.join(ROOT, 'js', 'engine', 'validation', 'CefrVocabLoader.js'));
require(path.join(ROOT, 'js', 'engine', 'validation', 'lemmatizer.js'));
const VocabPrefilter = require(path.join(ROOT, 'js', 'engine', 'validation', 'vocabPrefilter.js'));

/** @param {string[]} words @param {{ lang?: string, level?: string }} opts */
export function classifyUserVocab(words, opts = {}) {
  return VocabPrefilter.classifyUserVocab(words, { ...opts, blacklist: BLACKLIST });
}

export { VocabPrefilter };
