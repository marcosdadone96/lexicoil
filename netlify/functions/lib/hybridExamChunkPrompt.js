'use strict';

/**
 * Build LexiCoil personal-exam chunks for hybrid live cells only (web path).
 */
const path = require('path');
const { resolveFromRoot } = require('./projectRoot.js');

let _engine = null;

function loadHybridChunkEngine() {
  if (_engine) return _engine;
  const root = resolveFromRoot('');
  const req = (rel) => require(path.join(root, rel));
  req('js/engine/domain/lexicoilDomain.js');
  req('js/engine/knowledge/KnowledgeLoader.js');
  req('js/engine/providers/baseProviderAdapter.js');
  req('js/engine/providers/goetheAdapter.js');
  req('js/engine/providers/cambridgeAdapter.js');
  req('js/engine/providers/deleAdapter.js');
  req('js/engine/providers/providerRegistry.js');
  req('js/engine/knowledge/KnowledgeEngine.js');
  req('js/engine/prompts/blueprintPromptBinding.js');
  req('js/engine/prompts/PromptBuilder.js');
  req('js/engine/personalLesenPoolFallback.js');
  _engine = {
    KnowledgeEngine: req('js/engine/knowledge/KnowledgeEngine.js'),
    PromptBuilder: req('js/engine/prompts/PromptBuilder.js'),
    LexiCoilDomain: req('js/engine/domain/lexicoilDomain.js'),
  };
  return _engine;
}

function loadBlueprintFile(lang, level) {
  try {
    const ExamBlueprint = require(resolveFromRoot('js', 'library', 'ExamBlueprint.js'));
    const id = ExamBlueprint.INDEX?.[`${lang}_${level}`];
    if (!id) return null;
    const file = resolveFromRoot('library', 'blueprints', `${id}.json`);
    return JSON.parse(require('fs').readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.lang
 * @param {string} opts.level
 * @param {string} opts.topic
 * @param {string[]} opts.vocabForCell — pending vocab for live cells
 * @param {number[]} opts.teilsToGenerate
 * @param {object} [opts.blueprint]
 */
async function buildHybridLesenChunks({
  lang = 'de',
  level = 'B1',
  topic,
  vocabForCell = [],
  teilsToGenerate = [],
  blueprint = null,
}) {
  const teils = [...new Set((teilsToGenerate || []).map(Number).filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
  if (!teils.length) return [];

  const { KnowledgeEngine, PromptBuilder, LexiCoilDomain } = loadHybridChunkEngine();
  const bp = blueprint || loadBlueprintFile(lang, level);
  if (!bp) throw new Error('blueprint_missing_for_hybrid_chunks');

  const language = LexiCoilDomain.languageFromSubjectCode?.(lang) || 'german';
  const spec = await KnowledgeEngine.buildSpec({
    language,
    level,
    provider: lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge',
    contentType: 'VocabularyExercise',
    targetWords: [...vocabForCell],
    topic: topic || 'Personal vocabulary review',
    skills: ['lesen'],
    vocabPolicy: {
      targetWords: [...vocabForCell],
      preferCoverage: true,
      maximizeCoverage: false,
      ensureDensePart: false,
    },
    metadata: { blueprint: bp },
  });
  spec.personalTeilFilter = teils;

  const built = PromptBuilder.buildPersonalExamChunksFromBlueprint(spec, bp);
  const want = new Set(teils);
  return (built.chunks || []).filter((c) => want.has(Number(c.teil ?? c.blueprintPart?.teil)));
}

module.exports = {
  loadHybridChunkEngine,
  loadBlueprintFile,
  buildHybridLesenChunks,
};
