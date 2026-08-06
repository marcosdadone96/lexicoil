#!/usr/bin/env node
/**
 * Matriz completa tema × formato con moldes/subtipos (B1).
 *   node scripts/audit-topic-format-mold-matrix.mjs
 *   node scripts/audit-topic-format-mold-matrix.mjs --json
 *   node scripts/audit-topic-format-mold-matrix.mjs --md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/loadEnv.mjs';
import { B1_TOPICS } from './lib/b1Topics.mjs';
import { LESEN_T5_SUBTYPES, LESEN_T4_DEBATE_TOPICS } from './lib/lesenSubtypeRotation.mjs';
import {
  isSubtypeHardExcludedForTopic,
  filterT5SubtypeOrder,
} from './lib/lesenT5TopicFilter.mjs';
import { listT3BlueprintStockForTopic } from './lib/lesenT3BlueprintStock.mjs';
import { isT4DebateMoldCompatible } from './lib/t4TopicAlign.mjs';
import { readGenerationCostLog, GENERATION_COST_LOG } from './lib/generationCostLog.mjs';
import { computeTitleHeadroom } from './lib/titleHeadroom.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATS = Object.freeze([
  { id: 'lesen-t3', label: 'Lesen T3', module: 'lesen', teil: 3, gate: 'CHK-26 / t3_shared_mold_*' },
  { id: 'lesen-t4', label: 'Lesen T4', module: 'lesen', teil: 4, gate: 'CHK-27 / CHK-29' },
  { id: 'lesen-t5', label: 'Lesen T5', module: 'lesen', teil: 5, gate: 'CHK-29 / content_topic' },
]);

const MIN_VOCAB_SAMPLES_FOR_COLOR = 2;
const VOCAB_GREEN_MIN = 60;
const VOCAB_YELLOW_MIN = 50;
const VOCAB_RED_MAX = 40;

const T3_EXTERNAL_NOTE =
  'Lesen T3: gestión manual externa (otra IA, fuera de este pipeline). ' +
  'La columna T3 no indica urgencia operativa de este sistema mientras dure ese flujo.';

const BATCH_DIRS = [
  path.join(ROOT, 'batches/generated'),
  path.join(ROOT, 'batches/generated/.rejected'),
  path.join(ROOT, 'batches/rejected'),
  path.join(ROOT, 'batches/ready/pool-verified/B1'),
  path.join(ROOT, 'batches/ready/pool-content-ok-lesen/B1'),
  path.join(ROOT, 'batches/ready/lesen/B1'),
  path.join(ROOT, 'batches/needs-regeneration/B1'),
];

function countT5CompatibleMolds(topic) {
  const all = LESEN_T5_SUBTYPES.map((s) => s.id);
  return filterT5SubtypeOrder(all, topic).length;
}

function countT4CompatibleMolds(topic) {
  return LESEN_T4_DEBATE_TOPICS.filter((d) => isT4DebateMoldCompatible(topic, d.id)).length;
}

function countT3CompatibleMolds(topic) {
  const stock = listT3BlueprintStockForTopic(topic, new Set(), { reloadPool: true });
  return stock.compatibleTotal;
}

function countT3AvailableMolds(topic) {
  const stock = listT3BlueprintStockForTopic(topic, new Set(), { reloadPool: true });
  return stock.availableTotal;
}

function compatibleMoldCount(formatId, topic) {
  if (formatId === 'lesen-t5') return countT5CompatibleMolds(topic);
  if (formatId === 'lesen-t4') return countT4CompatibleMolds(topic);
  if (formatId === 'lesen-t3') return countT3CompatibleMolds(topic);
  return 0;
}

function walkJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonFiles(abs, out);
    else if (ent.name.endsWith('.json')) out.push(abs);
  }
  return out;
}

function loadBatchesWithVocab() {
  const seen = new Set();
  const rows = [];
  for (const dir of BATCH_DIRS) {
    for (const abs of walkJsonFiles(dir)) {
      const base = path.basename(abs);
      if (seen.has(base)) continue;
      try {
        const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
        const module = String(b.module || b.passages?.[0]?.module || '').toLowerCase();
        const teil = Number(b.teil ?? b.passages?.[0]?.teil);
        if (module !== 'lesen' || ![3, 4, 5].includes(teil)) continue;
        const topic = b.topicTag || b._requestedTopic || b.userVocabFeedback?.topic;
        const fb = b.userVocabFeedback;
        if (!topic || !fb?.requested?.length) continue;
        seen.add(base);
        rows.push({
          topic,
          teil,
          ratio: typeof fb.ratio === 'number' ? fb.ratio : fb.used?.length / fb.requested.length,
          file: base,
          subtype: b._textSubtype || b._debateTopic || b._blueprintSlug || null,
        });
      } catch {
        /* skip */
      }
    }
  }
  return rows;
}

function classifyMoldGateFailure(reason = '', gate = '') {
  const r = `${reason} ${gate}`.toLowerCase();
  if (/chk-29|molde estructural|título idéntico/.test(r)) return 'chk29';
  if (/t3_shared_mold|shared_mold|core_fp_in_pool|t3_situation/.test(r)) return 't3_mold';
  if (/chk-27|debate.*tema|t4.*topic/.test(r)) return 'chk27';
  if (/chk-26|situation.*tema/.test(r)) return 'chk26';
  return null;
}

function buildGateHistory() {
  const entries = readGenerationCostLog(GENERATION_COST_LOG);
  const map = new Map();
  for (const e of entries) {
    if (String(e.module) !== 'lesen') continue;
    const teil = Number(e.teil);
    if (![3, 4, 5].includes(teil)) continue;
    const topic = e.topic;
    if (!topic) continue;
    const key = `${topic}|lesen-t${teil}`;
    if (!map.has(key)) {
      map.set(key, { chk29: 0, t3_mold: 0, chk27: 0, chk26: 0, totalFails: 0, calls: 0 });
    }
    const cell = map.get(key);
    cell.calls += 1;
    if (!e.ok) {
      cell.totalFails += 1;
      const kind = classifyMoldGateFailure(e.failReason, e.failGate);
      if (kind) cell[kind] += 1;
    }
  }
  return map;
}

function scoreCell({ formatId, compatible, available, avgVocabPct, vocabSamples, chk29, t3Mold, totalFails }) {
  if (formatId === 'lesen-t3') return 'external';

  const insufficientData = vocabSamples < MIN_VOCAB_SAMPLES_FOR_COLOR;
  if (insufficientData) return 'unverified';

  // Red: structural incompatibility or proven failure pattern (with measured vocab)
  if (compatible === 0) return 'red';
  if (avgVocabPct != null && avgVocabPct < VOCAB_RED_MAX && (chk29 >= 3 || totalFails >= 5)) return 'red';
  if (compatible <= 2 && chk29 >= 2 && avgVocabPct != null && avgVocabPct < VOCAB_YELLOW_MIN) return 'red';

  if (avgVocabPct != null && avgVocabPct >= VOCAB_GREEN_MIN && chk29 === 0 && compatible >= 3) {
    return 'green';
  }
  if (avgVocabPct != null && avgVocabPct >= VOCAB_YELLOW_MIN && chk29 <= 1) return 'yellow';
  if (avgVocabPct != null && avgVocabPct < VOCAB_YELLOW_MIN) return 'yellow';
  return 'yellow';
}

function avg(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100);
}

function main() {
  const asJson = process.argv.includes('--json');
  const asMd = process.argv.includes('--md');

  const vocabRows = loadBatchesWithVocab();
  const gateHistory = buildGateHistory();

  const matrix = [];
  for (const topic of B1_TOPICS) {
    const row = { topic, cells: {} };
    for (const fmt of FORMATS) {
      const compatible = compatibleMoldCount(fmt.id, topic);
      const available =
        fmt.id === 'lesen-t3' ? countT3AvailableMolds(topic) : compatible;
      const vKey = `${topic}|${fmt.id.replace('lesen-t', 'lesen-t')}`;
      const vocabForCell = vocabRows.filter(
        (r) => r.topic === topic && r.teil === fmt.teil,
      );
      const ratios = vocabForCell.map((r) => r.ratio).filter((n) => Number.isFinite(n));
      const avgVocabPct = avg(ratios);

      const ghKey = `${topic}|${fmt.id}`;
      const gh = gateHistory.get(ghKey) || {
        chk29: 0,
        t3_mold: 0,
        chk27: 0,
        chk26: 0,
        totalFails: 0,
        calls: 0,
      };

      const moldGateCount =
        fmt.teil === 5
          ? gh.chk29
          : fmt.teil === 4
            ? gh.chk29 + gh.chk27
            : gh.t3_mold + gh.chk26;

      const status = scoreCell({
        formatId: fmt.id,
        compatible,
        available,
        avgVocabPct,
        vocabSamples: ratios.length,
        chk29: moldGateCount,
        t3Mold: gh.t3_mold,
        totalFails: gh.totalFails,
      });

      const titleHeadroom =
        fmt.teil === 4 || fmt.teil === 5 ? computeTitleHeadroom(topic, fmt.teil) : null;

      row.cells[fmt.id] = {
        compatibleMolds: compatible,
        availableMolds: available,
        avgVocabPct: avgVocabPct ?? null,
        vocabSamples: ratios.length,
        chk29OrEquiv: moldGateCount,
        gateDetail: gh,
        status,
        titleHeadroom,
        cellLabel: buildCellLabel({
          compatible,
          available,
          avgVocabPct,
          vocabSamples: ratios.length,
          moldGateCount,
          fmt,
          status,
          titleHeadroom,
        }),
      };
    }
    matrix.push(row);
  }

  const outJson = path.join(ROOT, 'batches/ready/gate-logs/topic-format-mold-matrix.json');
  let colorMigration = null;
  if (fs.existsSync(outJson)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outJson, 'utf8'));
      const prevGreen = new Set(
        (prev.matrix || []).flatMap((r) =>
          Object.entries(r.cells || {})
            .filter(([, c]) => c.status === 'green')
            .map(([fmt]) => `${r.topic}|${fmt}`),
        ),
      );
      const newGreen = new Set(
        matrix.flatMap((r) =>
          Object.entries(r.cells)
            .filter(([, c]) => c.status === 'green')
            .map(([fmt]) => `${r.topic}|${fmt}`),
        ),
      );
      const demotedFromGreen = [...prevGreen].filter((k) => !newGreen.has(k));
      colorMigration = {
        previousGreenCount: prevGreen.size,
        newGreenCount: newGreen.size,
        demotedFromGreenCount: demotedFromGreen.length,
        demotedFromGreen: demotedFromGreen.sort(),
      };
    } catch {
      /* first run or corrupt prev */
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    colorLegend: {
      green: `≥${MIN_VOCAB_SAMPLES_FOR_COLOR} muestras vocab Y ratio ≥${VOCAB_GREEN_MIN}% Y chk29=0`,
      yellow: `datos medidos pero ratio ${VOCAB_YELLOW_MIN}–${VOCAB_GREEN_MIN - 1}% o chk29≥1`,
      red: `ratio <${VOCAB_RED_MAX}% con fallos repetidos, o 0 moldes`,
      unverified: `vocabSamples < ${MIN_VOCAB_SAMPLES_FOR_COLOR} (sin historial suficiente — nunca verde)`,
      external: T3_EXTERNAL_NOTE,
    },
    formatsConfirmed: FORMATS,
    formatsExcluded: [
      { id: 'horen-t2', reason: 'sin rotación de moldes/subtipos en scripts/ — solo topicTag + prompt template' },
      { id: 'horen-t4', reason: 'sin rotación de moldes — cronología fija por plantilla' },
      { id: 'sprechen', reason: 'conformidad blueprint de examen (library/blueprints), no pool de moldes temáticos' },
      { id: 'lesen-t1/t2', reason: 'generación libre por tema, sin catálogo de subtipos' },
    ],
    matrix,
    redCells: matrix.flatMap((r) =>
      Object.entries(r.cells)
        .filter(([, c]) => c.status === 'red')
        .map(([fmt, c]) => ({ topic: r.topic, format: fmt, ...c })),
    ),
    yellowCells: matrix.flatMap((r) =>
      Object.entries(r.cells)
        .filter(([, c]) => c.status === 'yellow')
        .map(([fmt, c]) => ({ topic: r.topic, format: fmt, ...c })),
    ),
    unverifiedCells: matrix.flatMap((r) =>
      Object.entries(r.cells)
        .filter(([, c]) => c.status === 'unverified')
        .map(([fmt, c]) => ({ topic: r.topic, format: fmt, ...c })),
    ),
    titleHeadroomAlerts: matrix.flatMap((r) =>
      Object.entries(r.cells)
        .filter(([, c]) => c.titleHeadroom && ['warning', 'critical'].includes(c.titleHeadroom.status))
        .map(([fmt, c]) => ({
          topic: r.topic,
          format: fmt,
          ...c.titleHeadroom,
          cellStatus: c.status,
        })),
    ),
    externalCells: matrix.flatMap((r) =>
      Object.entries(r.cells)
        .filter(([, c]) => c.status === 'external')
        .map(([fmt, c]) => ({ topic: r.topic, format: fmt, ...c })),
    ),
    ...(colorMigration ? { colorMigration } : {}),
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (asMd) {
    console.log(renderMarkdown(report));
    return;
  }

  console.log('=== Matriz tema × formato (moldes B1) ===\n');
  console.log(renderMarkdown(report));
  console.log(`\nJSON: ${outJson.replace(/\\/g, '/')}`);
}

function buildCellLabel({ compatible, available, avgVocabPct, vocabSamples, moldGateCount, fmt, status, titleHeadroom }) {
  const vocab =
    vocabSamples >= MIN_VOCAB_SAMPLES_FOR_COLOR
      ? `${avgVocabPct ?? '?'}% (n=${vocabSamples})`
      : vocabSamples >= 1
        ? `${avgVocabPct ?? '?'}% (n=${vocabSamples}, insuf.)`
        : 'sin datos';
  if (status === 'external') {
    return `ext. · ${compatible} moldes ref. · ${vocab} · ${moldGateCount}×`;
  }
  const avail =
    fmt.id === 'lesen-t3' && available !== compatible
      ? `${compatible} (${available} disp.)`
      : String(compatible);
  const headroom =
    titleHeadroom?.status && titleHeadroom.status !== 'healthy'
      ? ` · headroom ${titleHeadroom.status}`
      : titleHeadroom?.status === 'healthy'
        ? ` · headroom ok`
        : '';
  return `${avail} | ${vocab} | ${moldGateCount}×${headroom}`;
}

function renderMarkdown(report) {
  const emoji = { red: '🔴', yellow: '🟡', green: '🟢', unverified: '⚪', external: '🔵' };
  const headers = ['Tema', ...FORMATS.map((f) => f.label)];
  const lines = [
    '| ' + headers.join(' | ') + ' |',
    '|' + headers.map(() => '---').join('|') + '|',
  ];
  for (const row of report.matrix) {
    const cells = FORMATS.map((f) => {
      const c = row.cells[f.id];
      return `${emoji[c.status]} ${c.cellLabel.replace(/\|/g, ' · ')}`;
    });
    lines.push(`| **${row.topic}** | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push(`> ${T3_EXTERNAL_NOTE}`);
  lines.push('');
  lines.push('**Leyenda celda:** `N moldes compatibles | % ajuste vocab (prom.) | N fallos molde/gate`');
  lines.push('**Colores:** 🟢 verificado · 🟡 medido débil · 🔴 crítico · ⚪ sin datos (n<2) · 🔵 T3 externo');
  if (report.titleHeadroomAlerts?.length) {
    lines.push('');
    lines.push(`**titleHeadroom alertas (${report.titleHeadroomAlerts.length}):**`);
    for (const a of report.titleHeadroomAlerts.slice(0, 12)) {
      lines.push(
        `- ${a.topic}×${a.format}: ${a.status} · moldes ${a.usedMoldKeys}/${a.moldCapacity} · ` +
          `títulos ${a.uniqueTitles}/${a.institutionNamespaceEstimate ?? '?'} · fresh ${a.freshSlots}`,
      );
    }
  }
  lines.push('');
  lines.push(
    `**Celdas:** rojas ${report.redCells.length} · amarillas ${report.yellowCells.length} · ` +
      `sin verificar ${report.unverifiedCells.length} · T3 externo ${report.externalCells.length} · ` +
      `verdes ${(report.matrix || []).flatMap((r) => Object.values(r.cells)).filter((c) => c.status === 'green').length}`,
  );
  if (report.colorMigration) {
    lines.push(
      `**Migración colores:** ${report.colorMigration.previousGreenCount} verdes antes → ` +
        `${report.colorMigration.newGreenCount} ahora; ` +
        `${report.colorMigration.demotedFromGreenCount} rebajadas de verde (falsos positivos): ` +
        `${report.colorMigration.demotedFromGreen.join(', ') || '(ninguna)'}`,
    );
  }
  return lines.join('\n');
}

main();
