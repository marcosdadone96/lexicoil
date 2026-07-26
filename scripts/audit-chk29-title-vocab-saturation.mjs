#!/usr/bin/env node
/**
 * Eje de saturación CHK-29: celdas con vocabulario disponible pero títulos/moldes agotados.
 *
 *   node scripts/audit-chk29-title-vocab-saturation.mjs
 *   node scripts/audit-chk29-title-vocab-saturation.mjs --json
 *
 * Salida: batches/ready/gate-logs/chk29-title-vocab-saturation.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/loadEnv.mjs';
import { B1_TOPICS } from './lib/b1Topics.mjs';
import { filterT5SubtypeOrder } from './lib/lesenT5TopicFilter.mjs';
import { LESEN_T5_SUBTYPES, loadPoolRecords, filterCellRecords, collectCellMolds } from './lib/lesenSubtypeRotation.mjs';
import { listT5VariantProfiles, pickT5InstitutionSeed } from './lib/lesenT5InstitutionSeeds.mjs';
import { listT4SeedStockForTopic } from './lib/lesenT4SeedStock.mjs';
import { topicKeywordPool, loadCoverageRegistry } from './lib/coverageRegistry.mjs';
import { readGenerationCostLog, GENERATION_COST_LOG } from './lib/generationCostLog.mjs';
import { extractStructuralMold, structuralMoldKey } from './lib/structuralMoldDedup.mjs';

const VOCAB_RICH_MIN = 60;
const VOCAB_OK_MIN = 50;
const MOLD_UTIL_SATURATED = 0.75;

const SCAN_DIRS = [
  path.join(ROOT, 'batches/generated'),
  path.join(ROOT, 'batches/generated/.rejected'),
  path.join(ROOT, 'batches/rejected'),
  path.join(ROOT, 'batches/ready/pool-verified/B1'),
  path.join(ROOT, 'batches/ready/pool-content-ok-lesen/B1'),
];

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(abs, out);
    else if (ent.name.endsWith('.json')) out.push(abs);
  }
  return out;
}

function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim();
}

function loadLesenBatches() {
  const seen = new Set();
  const rows = [];
  for (const dir of SCAN_DIRS) {
    for (const abs of walkJson(dir)) {
      const base = path.basename(abs);
      if (seen.has(base)) continue;
      try {
        const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
        const teil = Number(b.teil ?? b.passages?.[0]?.teil ?? b.questions?.[0]?.teil);
        if (![4, 5].includes(teil)) continue;
        const module = String(b.module || b.passages?.[0]?.module || 'lesen').toLowerCase();
        if (module !== 'lesen') continue;
        seen.add(base);
        rows.push({
          ...b,
          _file: base,
          _path: abs,
          _inPool: abs.includes('pool-verified') || abs.includes('pool-content-ok'),
          _rejected: abs.includes('rejected') || abs.includes('.rejected'),
        });
      } catch {
        /* skip */
      }
    }
  }
  return rows;
}

function t5MoldCapacity(topic) {
  const subtypes = filterT5SubtypeOrder(LESEN_T5_SUBTYPES.map((s) => s.id), topic);
  let moldSlots = 0;
  let institutionNames = 0;
  const bySubtype = [];
  for (const id of subtypes) {
    const profiles = listT5VariantProfiles(id);
    const sample = pickT5InstitutionSeed(id, 'audit-capacity-estimate');
    const parts = pickT5InstitutionSeed(id, { entropy: 'x', topicTag: topic });
    // Re-estimate namespace via double pick with known structure
    const seedBlock = pickT5InstitutionSeed(id, 'ns-est');
    void seedBlock;
    // Use institution seed picker internals via repeated picks — approximate from subtype def
    const profCount = profiles.length;
    moldSlots += profCount;
    // Institution namespace: read from pickT5InstitutionSeed source sizes — infer from institution name patterns
    const instSample = pickT5InstitutionSeed(id, `${topic}:${id}:0`);
    institutionNames += estimateInstitutionNamespace(id);
    bySubtype.push({ id, profiles: profCount, institutionNamespace: estimateInstitutionNamespace(id) });
  }
  return { moldSlots, institutionNames, subtypes: subtypes.length, bySubtype };
}

/** prefixes × suffixes per subtype (institution name space). */
function estimateInstitutionNamespace(textSubtype) {
  const samples = new Set();
  for (let i = 0; i < 48; i++) {
    const s = pickT5InstitutionSeed(textSubtype, `ns:${textSubtype}:${i}`);
    samples.add(s.institutionName);
  }
  return samples.size;
}

function t5TotalInstitutionNamespace(topic) {
  const subtypes = filterT5SubtypeOrder(LESEN_T5_SUBTYPES.map((s) => s.id), topic);
  let total = 0;
  for (const id of subtypes) total += estimateInstitutionNamespace(id);
  return total;
}

function loadVocabByCell(batches) {
  const map = new Map();
  for (const b of batches) {
    const topic = b.topicTag || b._requestedTopic || b.userVocabFeedback?.topic;
    const teil = Number(b.teil ?? b.passages?.[0]?.teil);
    if (!topic || ![4, 5].includes(teil)) continue;
    const fb = b.userVocabFeedback;
    if (!fb?.requested?.length) continue;
    const ratio = typeof fb.ratio === 'number' ? fb.ratio : fb.used?.length / fb.requested.length;
    const key = `${topic}|T${teil}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      ratio,
      file: b._file,
      inPool: b._inPool,
      rejected: b._rejected,
      subtype: b._textSubtype || b._debateTopic,
    });
  }
  return map;
}

function loadChk29Evidence(batches, costEntries) {
  const byCell = new Map();
  const highVocabChk29 = [];

  for (const e of costEntries) {
    if (String(e.module) !== 'lesen') continue;
    const teil = Number(e.teil);
    if (![4, 5].includes(teil) || !e.topic) continue;
    const reason = String(e.failReason || '');
    if (!/chk-29|título idéntico|molde estructural/i.test(reason)) continue;
    const key = `${e.topic}|T${teil}`;
    if (!byCell.has(key)) byCell.set(key, { count: 0, titles: [], moldKeys: [] });
    const cell = byCell.get(key);
    cell.count++;
    const titleMatch = reason.match(/«([^»]+)»/);
    if (titleMatch) cell.titles.push(titleMatch[1]);
    const moldMatch = reason.match(/molde estructural «([^»]+)»/i);
    if (moldMatch) cell.moldKeys.push(moldMatch[1]);
  }

  for (const b of batches) {
    const topic = b.topicTag || b._requestedTopic;
    const teil = Number(b.teil ?? b.passages?.[0]?.teil);
    const fb = b.userVocabFeedback;
    if (!topic || !fb || b._inPool) continue;
    const ratio = typeof fb.ratio === 'number' ? fb.ratio : fb.used?.length / fb.requested.length;
    if (ratio < VOCAB_OK_MIN / 100) continue;
    const title = b.passages?.[0]?.title;
    const mold = extractStructuralMold(b, teil);
    const mk = structuralMoldKey(mold);
    // Rejected with high vocab — check if likely CHK-29 path (has duplicate title in pool)
    const records = loadPoolRecords({ lang: 'de', level: 'B1' });
    const cellRecs = filterCellRecords(records, { lang: 'de', level: 'B1', teil, topicTag: topic });
    const { titles: poolTitles, moldKeys: poolMolds } = collectCellMolds(cellRecs, { teil });
    const norm = normTitle(title);
    const titleDup = poolTitles.some((t) => normTitle(t) === norm && norm.length >= 12);
    const moldDup = mk && poolMolds.includes(mk);
    if (titleDup || moldDup) {
      highVocabChk29.push({
        topic,
        teil,
        ratio: Math.round(ratio * 100),
        file: b._file,
        title: title?.slice(0, 80),
        moldKey: mk,
        titleDup,
        moldDup,
      });
    }
  }

  return { byCell, highVocabChk29 };
}

function topicWeakFirstCount(topic) {
  const reg = loadCoverageRegistry('de', 'B1');
  const pool = new Set(topicKeywordPool(topic, 'de', 'B1'));
  return (reg.weakDetail || []).filter((w) => pool.has(w.lemma)).length;
}

function avg(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 10;
}

function classifyT5Cell(metrics) {
  const {
    avgVocabPct,
    vocabSamples,
    moldUtilization,
    freshSubtypes,
    compatibleSubtypes,
    chk29Fails,
    highVocabRejections,
    poolCount,
  } = metrics;

  if (compatibleSubtypes === 0) return 'blocked';
  if (poolCount === 0 && freshSubtypes === compatibleSubtypes) return 'empty_fresh';

  const vocabRich = avgVocabPct != null && avgVocabPct >= VOCAB_RICH_MIN;
  const vocabOk = avgVocabPct != null && avgVocabPct >= VOCAB_OK_MIN;
  const titleSaturated =
    moldUtilization >= MOLD_UTIL_SATURATED ||
    freshSubtypes === 0 ||
    chk29Fails >= 2 ||
    highVocabRejections >= 1;

  if ((vocabRich || (vocabOk && vocabSamples >= 2)) && titleSaturated) {
    return 'vocab_rich_title_saturated';
  }
  if (titleSaturated && poolCount >= 3) return 'title_saturated_mature';
  if (avgVocabPct != null && avgVocabPct < VOCAB_OK_MIN && poolCount >= 2) return 'vocab_poor';
  if (freshSubtypes > 0 && moldUtilization < 0.5) return 'healthy_headroom';
  return 'mixed';
}

function classifyT4Cell(metrics) {
  const { avgVocabPct, freshSeeds, totalSeeds, poolCount, chk29Fails, highVocabRejections, generatable } = metrics;
  if (totalSeeds === 0) return 'blocked';
  if (poolCount === 0 && freshSeeds === totalSeeds) return 'empty_fresh';

  const vocabRich = avgVocabPct != null && avgVocabPct >= VOCAB_RICH_MIN;
  const vocabOk = avgVocabPct != null && avgVocabPct >= VOCAB_OK_MIN;
  const titleSaturated = !generatable || freshSeeds === 0 || chk29Fails >= 2 || highVocabRejections >= 1;

  if ((vocabRich || vocabOk) && titleSaturated && poolCount >= 2) {
    return 'vocab_rich_title_saturated';
  }
  if (titleSaturated && poolCount >= 3) return 'title_saturated_mature';
  if (!generatable && poolCount >= 5) return 'title_saturated_mature';
  if (freshSeeds > 0) return 'healthy_headroom';
  return 'mixed';
}

function analyzeCell(topic, teil, batches, vocabMap, chk29Data, records) {
  const key = `${topic}|T${teil}`;
  const cellBatches = batches.filter((b) => {
    const t = b.topicTag || b._requestedTopic;
    const tl = Number(b.teil ?? b.passages?.[0]?.teil);
    return t === topic && tl === teil;
  });
  const poolBatches = cellBatches.filter((b) => b._inPool);
  const vocabRows = vocabMap.get(key) || [];
  const poolVocab = vocabRows.filter((v) => v.inPool).map((v) => v.ratio);
  const allVocab = vocabRows.map((v) => v.ratio);
  const avgVocabPct = avg(allVocab);
  const avgPoolVocabPct = avg(poolVocab);

  const cellRecs = filterCellRecords(records, { lang: 'de', level: 'B1', teil, topicTag: topic });
  const { moldKeys, titles, subtypes } = collectCellMolds(cellRecs, { teil });
  const uniqueTitles = [...new Set(titles.map(normTitle).filter((t) => t.length >= 8))];
  const chk29 = chk29Data.byCell.get(key) || { count: 0, titles: [], moldKeys: [] };
  const highVocabRejections = chk29Data.highVocabChk29.filter((h) => h.topic === topic && h.teil === teil);

  const base = {
    topic,
    teil,
    poolCount: poolBatches.length,
    recordCount: cellRecs.length,
    avgVocabPct,
    avgPoolVocabPct,
    vocabSamples: vocabRows.length,
    topicWeakFirst: topicWeakFirstCount(topic),
    topicKeywordPoolSize: topicKeywordPool(topic, 'de', 'B1').length,
    usedMoldKeys: moldKeys.length,
    uniqueTitles: uniqueTitles.length,
    chk29Fails: chk29.count,
    chk29SampleTitles: [...new Set(chk29.titles)].slice(0, 4),
    highVocabChk29Rejections: highVocabRejections,
  };

  if (teil === 5) {
    const compatible = filterT5SubtypeOrder(LESEN_T5_SUBTYPES.map((s) => s.id), topic);
    let moldCapacity = 0;
    for (const id of compatible) moldCapacity += listT5VariantProfiles(id).length;
    const usedSubtypes = new Set(subtypes);
    const freshSubtypes = compatible.filter((id) => {
      const profiles = listT5VariantProfiles(id);
      const usedForSubtype = moldKeys.filter((k) => k === id || k.startsWith(`${id}:`));
      return usedForSubtype.length < profiles.length;
    }).length;
    const institutionNamespace = t5TotalInstitutionNamespace(topic);
    const moldUtilization = moldCapacity > 0 ? moldKeys.length / moldCapacity : 0;

    return {
      ...base,
      compatibleSubtypes: compatible.length,
      moldCapacity,
      moldUtilization: Math.round(moldUtilization * 1000) / 1000,
      freshSubtypes,
      saturatedSubtypes: compatible.length - freshSubtypes,
      institutionNamespaceEstimate: institutionNamespace,
      titleToNamespaceRatio:
        institutionNamespace > 0
          ? Math.round((uniqueTitles.length / institutionNamespace) * 1000) / 1000
          : null,
      status: classifyT5Cell({
        avgVocabPct,
        vocabSamples: vocabRows.length,
        moldUtilization,
        freshSubtypes,
        compatibleSubtypes: compatible.length,
        chk29Fails: chk29.count,
        highVocabRejections: highVocabRejections.length,
        poolCount: poolBatches.length,
      }),
    };
  }

  const t4Stock = listT4SeedStockForTopic(topic);
  const seedUtil = t4Stock.totalSeeds > 0 ? (t4Stock.totalSeeds - t4Stock.freshCount) / t4Stock.totalSeeds : 0;

  return {
    ...base,
    totalSeeds: t4Stock.totalSeeds,
    freshSeeds: t4Stock.freshCount,
    preflightOkSeeds: t4Stock.preflightOkCount,
    generatable: t4Stock.generatable,
    seedUtilization: Math.round(seedUtil * 1000) / 1000,
    pickTier: t4Stock.pickTier,
    status: classifyT4Cell({
      avgVocabPct,
      freshSeeds: t4Stock.freshCount,
      totalSeeds: t4Stock.totalSeeds,
      poolCount: poolBatches.length,
      chk29Fails: chk29.count,
      highVocabRejections: highVocabRejections.length,
      generatable: t4Stock.generatable,
    }),
  };
}

function main() {
  const asJson = process.argv.includes('--json');
  const batches = loadLesenBatches();
  const records = loadPoolRecords({ lang: 'de', level: 'B1' });
  const vocabMap = loadVocabByCell(batches);
  const costEntries = readGenerationCostLog(GENERATION_COST_LOG);
  const chk29Data = loadChk29Evidence(batches, costEntries);

  const cells = [];
  for (const topic of B1_TOPICS) {
    cells.push(analyzeCell(topic, 4, batches, vocabMap, chk29Data, records));
    cells.push(analyzeCell(topic, 5, batches, vocabMap, chk29Data, records));
  }

  const vocabRichTitleSaturated = cells.filter((c) => c.status === 'vocab_rich_title_saturated');
  const titleSaturatedMature = cells.filter((c) => c.status === 'title_saturated_mature');
  const healthy = cells.filter((c) => c.status === 'healthy_headroom' || c.status === 'empty_fresh');

  const report = {
    generatedAt: new Date().toISOString(),
    axis: 'title_mold_saturation_vs_vocab_availability',
    thresholds: {
      vocabRichMinPct: VOCAB_RICH_MIN,
      vocabOkMinPct: VOCAB_OK_MIN,
      moldUtilSaturated: MOLD_UTIL_SATURATED,
    },
    summary: {
      totalCells: cells.length,
      vocabRichTitleSaturated: vocabRichTitleSaturated.length,
      titleSaturatedMature: titleSaturatedMature.length,
      healthyHeadroom: healthy.length,
      highVocabChk29Rejections: chk29Data.highVocabChk29.length,
      patternIsExtended:
        vocabRichTitleSaturated.length >= 3 || vocabRichTitleSaturated.length + titleSaturatedMature.length >= 6,
    },
    vocabRichTitleSaturated: vocabRichTitleSaturated.sort(
      (a, b) => (b.avgVocabPct || 0) - (a.avgVocabPct || 0) || b.poolCount - a.poolCount,
    ),
    titleSaturatedMature: titleSaturatedMature.sort((a, b) => b.poolCount - a.poolCount),
    highVocabChk29Rejections: chk29Data.highVocabChk29,
    cells: cells.sort((a, b) => {
      const order = {
        vocab_rich_title_saturated: 0,
        title_saturated_mature: 1,
        mixed: 2,
        vocab_poor: 3,
        healthy_headroom: 4,
        empty_fresh: 5,
        blocked: 6,
      };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.poolCount - a.poolCount;
    }),
    recommendation: null,
  };

  if (report.summary.patternIsExtended) {
    report.recommendation =
      'Patrón extendido: priorizar generador general de variantes de título / espacio de nombres ' +
      '(institutionName + título normativo desacoplado del molde CHK-29), no ampliar seeds por celda aislada.';
  } else {
    report.recommendation =
      'Patrón acotado a pocas celdas maduras: ampliación targeted puede bastar, pero conviene diseñar API de títulos reutilizable.';
  }

  const outPath = path.join(ROOT, 'batches/ready/gate-logs/chk29-title-vocab-saturation.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n══ CHK-29 · saturación título/molde vs vocabulario ══\n');
  console.log(`Celdas Lesen T4+T5: ${report.summary.totalCells} (${B1_TOPICS.length} temas × 2)`);
  console.log(
    `vocab_rich_title_saturated: ${report.summary.vocabRichTitleSaturated} · ` +
      `title_saturated_mature: ${report.summary.titleSaturatedMature} · ` +
      `healthy/empty: ${report.summary.healthyHeadroom}`,
  );
  console.log(`Rechazos evidenciados vocab≥${VOCAB_OK_MIN}% + colisión título/molde: ${report.summary.highVocabChk29Rejections}`);
  console.log(`Patrón extendido: ${report.summary.patternIsExtended ? 'SÍ' : 'no'}\n`);

  if (vocabRichTitleSaturated.length) {
    console.log('── vocab_rich_title_saturated (vocab OK, títulos/moldes agotados) ──');
    for (const c of vocabRichTitleSaturated) {
      const teilLabel = `T${c.teil}`;
      const extra =
        c.teil === 5
          ? ` moldes ${c.usedMoldKeys}/${c.moldCapacity} (${Math.round(c.moldUtilization * 100)}%) freshSub=${c.freshSubtypes}`
          : ` seeds frescas ${c.freshSeeds}/${c.totalSeeds} generatable=${c.generatable}`;
      console.log(
        `  ${c.topic.padEnd(14)} ${teilLabel}  pool=${String(c.poolCount).padStart(2)}  ` +
          `vocab=${c.avgVocabPct ?? '—'}% (n=${c.vocabSamples})  chk29=${c.chk29Fails}${extra}`,
      );
      if (c.chk29SampleTitles.length) console.log(`    títulos CHK-29: ${c.chk29SampleTitles.join(' | ')}`);
    }
    console.log('');
  }

  if (chk29Data.highVocabChk29.length) {
    console.log('── Evidencia directa: alto vocab + colisión pool ──');
    for (const h of chk29Data.highVocabChk29.slice(0, 12)) {
      console.log(
        `  ${h.topic}×T${h.teil} ${h.ratio}% · ${h.file} · «${h.title || h.moldKey}»`,
      );
    }
    console.log('');
  }

  console.log(`Recomendación: ${report.recommendation}`);
  console.log(`\nJSON: ${outPath.replace(/\\/g, '/')}\n`);
}

main();
