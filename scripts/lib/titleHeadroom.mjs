/**
 * Métricas titleHeadroom por celda topic×Teil (T4/T5).
 * Usado en audit-topic-format-mold-matrix y diagnósticos CHK-29.
 */
import { filterT5SubtypeOrder } from './lesenT5TopicFilter.mjs';
import { LESEN_T5_SUBTYPES } from './lesenSubtypeRotation.mjs';
import { listT5VariantProfiles } from './lesenT5InstitutionSeeds.mjs';
import { listT4SeedStockForTopic } from './lesenT4SeedStock.mjs';
import { loadPersistedCellMolds } from './persistedCellPool.mjs';
import { normTitle } from './structuralMoldDedup.mjs';
import { estimateCellTitleNamespace } from './titleVariantBank.mjs';

const MOLD_UTIL_WARNING = 0.5;
const MOLD_UTIL_CRITICAL = 0.75;
const TITLE_RATIO_WARNING = 0.35;
const TITLE_RATIO_CRITICAL = 0.55;

function classifyHeadroomStatus({ moldUtilization, freshSlots, titleToNamespaceRatio, generatable }) {
  if (generatable === false || freshSlots === 0) return 'critical';
  if (moldUtilization >= MOLD_UTIL_CRITICAL) return 'critical';
  if (titleToNamespaceRatio != null && titleToNamespaceRatio >= TITLE_RATIO_CRITICAL) return 'critical';
  if (moldUtilization >= MOLD_UTIL_WARNING) return 'warning';
  if (titleToNamespaceRatio != null && titleToNamespaceRatio >= TITLE_RATIO_WARNING) return 'warning';
  if (freshSlots > 0 && moldUtilization < MOLD_UTIL_WARNING) return 'healthy';
  return 'mixed';
}

/**
 * @param {string} topic
 * @param {4|5} teil
 * @param {{ lang?: string, level?: string }} [opts]
 */
export function computeTitleHeadroom(topic, teil, opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const persisted = loadPersistedCellMolds({ lang, level, topicTag: topic, teil });
  const uniqueTitles = [...new Set(persisted.titles.map(normTitle).filter((t) => t.length >= 8))];

  if (Number(teil) === 5) {
    const compatible = filterT5SubtypeOrder(LESEN_T5_SUBTYPES.map((s) => s.id), topic);
    let moldCapacity = 0;
    for (const id of compatible) moldCapacity += listT5VariantProfiles(id).length;
    const freshSubtypes = compatible.filter((id) => {
      const profiles = listT5VariantProfiles(id);
      const usedForSubtype = persisted.moldKeys.filter((k) => k === id || k.startsWith(`${id}:`));
      return usedForSubtype.length < profiles.length;
    }).length;
    const institutionNamespace = estimateCellTitleNamespace(topic, 5, compatible) || 0;
    const moldUtilization = moldCapacity > 0 ? persisted.moldKeys.length / moldCapacity : 0;
    const titleToNamespaceRatio =
      institutionNamespace > 0 ? uniqueTitles.length / institutionNamespace : null;

    return {
      teil: 5,
      topic,
      moldCapacity,
      usedMoldKeys: persisted.moldKeys.length,
      moldUtilization: Math.round(moldUtilization * 1000) / 1000,
      freshSlots: freshSubtypes,
      compatibleSlots: compatible.length,
      uniqueTitles: uniqueTitles.length,
      institutionNamespaceEstimate: institutionNamespace,
      titleToNamespaceRatio:
        titleToNamespaceRatio != null ? Math.round(titleToNamespaceRatio * 1000) / 1000 : null,
      persistedBatchCount: persisted.persistedBatchCount,
      status: classifyHeadroomStatus({
        moldUtilization,
        freshSlots: freshSubtypes,
        titleToNamespaceRatio,
      }),
    };
  }

  const t4Stock = listT4SeedStockForTopic(topic, { lang, level });
  const seedUtil =
    t4Stock.totalSeeds > 0 ? (t4Stock.totalSeeds - t4Stock.freshCount) / t4Stock.totalSeeds : 0;
  const titleNamespace = t4Stock.totalSeeds * 6;
  const titleToNamespaceRatio = titleNamespace > 0 ? uniqueTitles.length / titleNamespace : null;

  return {
    teil: 4,
    topic,
    moldCapacity: t4Stock.totalSeeds,
    usedMoldKeys: t4Stock.totalSeeds - t4Stock.freshCount,
    moldUtilization: Math.round(seedUtil * 1000) / 1000,
    freshSlots: t4Stock.freshCount,
    compatibleSlots: t4Stock.preflightOkCount,
    uniqueTitles: uniqueTitles.length,
    institutionNamespaceEstimate: titleNamespace,
    titleToNamespaceRatio:
      titleToNamespaceRatio != null ? Math.round(titleToNamespaceRatio * 1000) / 1000 : null,
    persistedBatchCount: persisted.persistedBatchCount,
    generatable: t4Stock.generatable,
    status: classifyHeadroomStatus({
      moldUtilization: seedUtil,
      freshSlots: t4Stock.freshCount,
      titleToNamespaceRatio,
      generatable: t4Stock.generatable,
    }),
  };
}
