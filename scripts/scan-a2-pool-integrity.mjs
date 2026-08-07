#!/usr/bin/env node
/**
 * Escaneo determinista pool-verified/A2 — Fases 1–4 (integridad + nombres + cosmética).
 *   node scripts/scan-a2-pool-integrity.mjs [--json] [--apply-mcq]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/loadEnv.mjs';
import { normalizeOptions } from './lib/normalizeBatch.mjs';
import { tallyNameFrequency } from './lib/dialogueNamesBank.mjs';
import { countTopicStock, loadPoolRecords } from './lib/poolGapPlanner.mjs';

const require = createRequire(import.meta.url);
const { normalizeB1Topic, B1_TOPIC_ALIASES } = require(path.join(ROOT, 'js/data/b1Topics.js'));
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

/** Slugs en *-cur-*.json (eje curated A2); society no está en B1_TOPIC_ALIASES. */
const A2_CURATED_SLUG_TO_TOPIC = Object.freeze({
  health: 'Gesundheit',
  work: 'Arbeit',
  education: 'Bildung',
  society: 'Stadtleben',
});

const MCQ_TYPES = new Set([
  'multiple',
  'multiple_choice',
  'mcq',
  'mc',
  'mc_question',
  'multiple-choice',
]);

const OPTION_PREFIX_RE = /^[a-c]\)\s/i;

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(abs, out);
    else if (ent.name.endsWith('.json') && !ent.name.startsWith('.')) out.push(abs);
  }
  return out;
}

function loadRows(poolDir) {
  return walkJson(poolDir).map((abs) => {
    try {
      const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      return { batch, file: path.basename(abs), abs };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function batchMeta(row) {
  const b = row.batch;
  const mod = String(b.module || b.passages?.[0]?.module || b.questions?.[0]?.module || '').toLowerCase();
  const teil = Number(b.teil ?? b.passages?.[0]?.teil ?? b.questions?.[0]?.teil);
  const level = String(b.level || b.passages?.[0]?.level || 'A2').toUpperCase();
  return { mod, teil, level };
}

function parseCurSlug(filename) {
  const m = filename.match(/-cur-([a-z]+)\.json$/i);
  return m ? m[1].toLowerCase() : null;
}

function topicFromCurSlug(slug) {
  if (!slug) return null;
  if (A2_CURATED_SLUG_TO_TOPIC[slug]) return A2_CURATED_SLUG_TO_TOPIC[slug];
  return normalizeB1Topic(slug);
}

function declaredTopic(batch) {
  const raw =
    batch.topicTag ||
    batch._requestedTopic ||
    batch.passages?.[0]?.topicTag ||
    batch.passage?.topicTag;
  return normalizeB1Topic(raw);
}

function batchTextForTopic(batch) {
  const parts = [];
  for (const p of batch.passages || []) parts.push(p.text || p.transcript || '');
  if (batch.passage?.text) parts.push(batch.passage.text);
  for (const q of batch.questions || []) {
    parts.push(q.question || '');
    for (const o of q.options || []) parts.push(typeof o === 'string' ? o : o?.text || '');
  }
  return parts.join('\n');
}

function isMcqQuestion(q) {
  const t = String(q.type || '').toLowerCase();
  if (MCQ_TYPES.has(t)) return true;
  if (Array.isArray(q.options) && q.options.length >= 2 && t !== 'matching' && t !== 'richtig_falsch') {
    return true;
  }
  return false;
}

function scanMcqOptions(rows) {
  const brokenFiles = [];
  const details = [];

  for (const row of rows) {
    let badQuestions = 0;
    const samples = [];
    for (const q of row.batch.questions || []) {
      if (!isMcqQuestion(q)) continue;
      const opts = q.options || [];
      if (opts.length < 2) continue;
      let bad = false;
      for (let i = 0; i < opts.length; i += 1) {
        const o = opts[i];
        const s = typeof o === 'string' ? o.trim() : String(o?.text ?? o?.label ?? '').trim();
        if (!OPTION_PREFIX_RE.test(s)) {
          bad = true;
          break;
        }
      }
      if (bad) {
        badQuestions += 1;
        if (samples.length < 3) {
          samples.push({ qId: q.id, optionsPreview: opts.slice(0, 3).map((x) => String(x).slice(0, 60)) });
        }
      }
    }
    if (badQuestions) {
      brokenFiles.push(row.file);
      details.push({ file: row.file, badQuestions, samples });
    }
  }
  return { brokenFileCount: brokenFiles.length, brokenFiles, details };
}

function applyMcqFix(rows) {
  const fixed = [];
  for (const row of rows) {
    let changed = false;
    const batch = JSON.parse(JSON.stringify(row.batch));
    for (const q of batch.questions || []) {
      if (!isMcqQuestion(q)) continue;
      const before = JSON.stringify(q.options);
      const type = String(q.type || 'multiple_choice').toLowerCase();
      q.options = normalizeOptions(q.options, type);
      if (JSON.stringify(q.options) !== before) changed = true;
    }
    if (changed) {
      fs.writeFileSync(row.abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
      fixed.push(row.file);
    }
  }
  return fixed;
}

function scanFilenameTopic(rows) {
  const mismatches = [];
  for (const row of rows) {
    const slug = parseCurSlug(row.file);
    if (!slug) continue;
    const expected = topicFromCurSlug(slug);
    const declared = declaredTopic(row.batch);
    const detected = detectTopic(batchTextForTopic(row.batch));

    const issues = [];
    if (expected && declared && expected !== declared) {
      issues.push({ kind: 'filename_vs_declared', expected, declared });
    }
    if (expected && detected && expected !== detected) {
      issues.push({ kind: 'filename_vs_content', expected, detected });
    }
    if (declared && detected && declared !== detected) {
      issues.push({ kind: 'declared_vs_content', declared, detected });
    }
    if (issues.length) {
      mismatches.push({ file: row.file, slug, expected, declared, detected, issues });
    }
  }
  const fileSet = new Set(mismatches.map((m) => m.file));
  return { mismatchFileCount: fileSet.size, mismatches };
}

function scanHorenT1Segments(rows) {
  const affected = [];
  for (const row of rows) {
    const { mod, teil } = batchMeta(row);
    if (mod !== 'horen' || teil !== 1) continue;
    const passages = row.batch.passages || [];
    if (passages.length < 2) continue;

    const slug = parseCurSlug(row.file);
    const anchor = topicFromCurSlug(slug) || declaredTopic(row.batch);
    if (!anchor) continue;

    const offSegments = [];
    for (const p of passages) {
      const text = p.text || p.transcript || '';
      const detected = detectTopic(text);
      const segDeclared = normalizeB1Topic(p.topicTag);
      const ref = segDeclared || anchor;
      if (detected && ref && detected !== ref) {
        offSegments.push({
          passageId: p.id,
          refTopic: ref,
          detected,
          textPreview: text.slice(0, 80).replace(/\s+/g, ' '),
        });
      }
    }
    if (offSegments.length) {
      affected.push({ file: row.file, anchor, offSegmentCount: offSegments.length, offSegments });
    }
  }
  return { offTopicFileCount: affected.length, affected };
}

function scanCosmetic(rows) {
  const lowerNounTags = [];
  const grammarB1Files = new Set();

  for (const row of rows) {
    let fileHasB1Grammar = false;
    for (const q of row.batch.questions || []) {
      for (const g of q.grammarTags || []) {
        if (/^g-de-b1-/.test(String(g))) fileHasB1Grammar = true;
      }
      for (const t of q.vocabularyTags || []) {
        const s = String(t);
        if (/^[a-zäöüß-]{4,}$/.test(s) && /[aeiouäöü]/.test(s)) {
          lowerNounTags.push({ file: row.file, qId: q.id, tag: s });
        }
      }
    }
    if (fileHasB1Grammar) grammarB1Files.add(row.file);
  }

  return {
    lowercaseVocabTagHits: lowerNounTags.length,
    lowercaseVocabSamples: lowerNounTags.slice(0, 20),
    filesWithGrammarB1Prefix: grammarB1Files.size,
  };
}

function scanNames(rows) {
  const horen = rows.filter((r) => {
    const { mod, teil } = batchMeta(r);
    return mod === 'horen' && [1, 2, 3].includes(teil);
  });
  const tally = tallyNameFrequency(horen.map((r) => r.batch));
  const topNames = [...tally.nameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  const topPairs = [...tally.pairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pair, count]) => ({ pair, count }));
  return {
    horenDialogueFiles: horen.length,
    topNames,
    topPairs,
  };
}

function stockCountingNote(level = 'A2') {
  const records = loadPoolRecords('de', level);
  const sample = records.slice(0, 3).map((r) => ({
    id: r.id,
    topicTag: r.topicTag,
    module: r.module,
    teil: r.teil,
  }));
  const healthFromFilename = records.filter((r) =>
    String(r.sourceFile || r.id || '').includes('cur-health'),
  ).length;
  const healthFromTag = countTopicStock(records, 'lesen', 1, level).counts.Gesundheit || 0;

  return {
    mechanism:
      'poolGapPlanner.countTopicStock / loadPoolRecords usan r.topicTag del reusable-seed (de_A2.json), NO el slug del filename.',
    persistedCellPool:
      'persistedCellPool.loadPersistedCellBatches filtra por batchTopicTag() interno del JSON, no por nombre de archivo.',
    sampleRecords: sample,
    sanityCurHealthInSourcePaths: healthFromFilename,
    lesenT1GesundheitCountFromTopicTag: healthFromTag,
    conclusion:
      'Un archivo horen-t4-cur-health.json con topicTag Verkehr cuenta como Verkehr en stock/celdas; el slug del filename es solo convención editorial.',
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# A2 pool-verified — revisión de raíz (escaneo determinista)');
  lines.push('');
  lines.push(`Generado: ${report.scannedAt}`);
  lines.push(`Archivos: ${report.totalFiles} en \`${report.poolDir}\``);
  lines.push('');
  lines.push('## Resumen ejecutivo');
  lines.push('');
  lines.push(`| Métrica | Archivos afectados |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| MCQ sin prefijo \`a)/b)/c)\` en todas las opciones | **${report.mcq.brokenFileCount}** |`);
  lines.push(`| Discrepancia slug \`*-cur-*\` ↔ topicTag/contenido | **${report.filenameTopic.mismatchFileCount}** |`);
  lines.push(`| Hören T1 — segmentos off-topic (detección keywords) | **${report.horenT1.offTopicFileCount}** |`);
  lines.push(`| Cosmética: \`g-de-b1-*\` en grammarTags (pool entero) | ${report.cosmetic.filesWithGrammarB1Prefix} archivos |`);
  lines.push(`| Cosmética: vocabularyTags sustantivos en minúscula (hits) | ${report.cosmetic.lowercaseVocabTagHits} |`);
  lines.push('');
  lines.push('## Stock por celda (crítico)');
  lines.push('');
  lines.push(report.stockCounting.mechanism);
  lines.push('');
  lines.push(report.stockCounting.conclusion);
  lines.push('');
  lines.push(
    `- Registros con \`cur-health\` en source/id: ${report.stockCounting.sanityCurHealthInSourcePaths}`,
  );
  lines.push(
    `- Lesen×T1×Gesundheit (conteo por topicTag): ${report.stockCounting.lesenT1GesundheitCountFromTopicTag}`,
  );
  lines.push('');
  lines.push('## Fase 2 — Nombres de diálogo (Hören T1–T3)');
  lines.push('');
  lines.push(
    'Generación A2 Hören T1/T2/T3 ya usa `pickDialogueNameCast` + `sessionExcludeCasts` en `generatePartGeminiLib.mjs`. ' +
      'El pool existente no se reescribe solo; conviene alimentar `data/dialogue-names-usage.json` desde el pool si se quiere exclusión estricta en regen.',
  );
  lines.push('');
  lines.push(`Archivos Hören con diálogo escaneados: ${report.names.horenDialogueFiles}`);
  lines.push('');
  lines.push('### Frecuencia de nombres (A2)');
  lines.push('');
  lines.push('| Nombre | Apariciones |');
  lines.push('| --- | ---: |');
  for (const { name, count } of report.names.topNames.slice(0, 25)) {
    lines.push(`| ${name} | ${count} |`);
  }
  lines.push('');
  lines.push('### Parejas más repetidas');
  lines.push('');
  lines.push('| Pareja | Apariciones |');
  lines.push('| --- | ---: |');
  for (const { pair, count } of report.names.topPairs.slice(0, 15)) {
    lines.push(`| ${pair} | ${count} |`);
  }
  lines.push('');
  lines.push('## Fase 3 — grammarTags `g-de-b1-*`');
  lines.push('');
  lines.push(
    '**Artefacto aceptable:** catálogo gramatical compartido (`enrichBatchMetadata.mjs`, `VALID_GRAMMAR_TAG_RE = /^g-de-b1-[a-z]+$/`). ' +
      'El prefijo indica familia de etiquetas del motor de enriquecimiento, no el CEFR del ítem. No renombrar por nivel salvo migración global del catálogo.',
  );
  lines.push('');
  lines.push('## Recomendación operador');
  lines.push('');
  lines.push(
    `- **MCQ prefijos (${report.mcq.brokenFileCount} archivos):** fix en lote con \`node scripts/scan-a2-pool-integrity.mjs --apply-mcq\` (usa \`normalizeOptions\`).`,
  );
  lines.push(
    `- **Topic/slug/segmentos (${report.filenameTopic.mismatchFileCount} + ${report.horenT1.offTopicFileCount}):** revisión caso a caso o regen bancaria; no auto-cambiar topicTag sin validar dedup/celda.`,
  );
  lines.push(
    `- **Nombres:** wiring gen OK; opcional script de backfill de casts desde pool + regen Hören donde parejas > umbral.`,
  );
  lines.push(
    `- **Cosmética vocab minúsculas:** bajo volumen → lote con backfill metadata; grammarTags B1-prefix → documentado, no acción.`,
  );
  if (report.mcqApply?.length) {
    lines.push('');
    lines.push(`## MCQ reparados en esta ejecución (${report.mcqApply.length})`);
    lines.push('');
    for (const f of report.mcqApply) lines.push(`- ${f}`);
  }
  lines.push('');
  lines.push('## Detalle — MCQ (muestra)');
  lines.push('');
  for (const d of report.mcq.details.slice(0, 15)) {
    lines.push(`- \`${d.file}\`: ${d.badQuestions} preguntas`);
  }
  lines.push('');
  lines.push('## Detalle — topic slug (muestra)');
  lines.push('');
  for (const m of report.filenameTopic.mismatches.slice(0, 20)) {
    lines.push(
      `- \`${m.file}\` slug=${m.slug} expected=${m.expected} declared=${m.declared} detected=${m.detected}`,
    );
  }
  lines.push('');
  lines.push('## Detalle — Hören T1 segmentos');
  lines.push('');
  for (const a of report.horenT1.affected) {
    lines.push(`- \`${a.file}\` (${a.offSegmentCount}/${(a.offSegments?.length || 0)} flagged): anchor=${a.anchor}`);
    for (const s of a.offSegments.slice(0, 3)) {
      lines.push(`  - ${s.passageId}: ref=${s.refTopic} detected=${s.detected}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const asJson = process.argv.includes('--json');
  const applyMcq = process.argv.includes('--apply-mcq');
  const level = process.argv.find((a, i) => process.argv[i - 1] === '--level') || 'A2';
  const poolDir = path.join(ROOT, 'batches/ready/pool-verified', level);

  const rows = loadRows(poolDir);
  const mcq = scanMcqOptions(rows);
  const filenameTopic = scanFilenameTopic(rows);
  const horenT1 = scanHorenT1Segments(rows);
  const cosmetic = scanCosmetic(rows);
  const names = scanNames(rows);
  const stockCounting = stockCountingNote(level);

  let mcqApply = [];
  if (applyMcq) {
    mcqApply = applyMcqFix(rows);
    // re-scan counts after fix
    const rows2 = loadRows(poolDir);
    Object.assign(mcq, scanMcqOptions(rows2));
  }

  const report = {
    scannedAt: new Date().toISOString(),
    poolDir: path.relative(ROOT, poolDir).replace(/\\/g, '/'),
    totalFiles: rows.length,
    curatedSlugMap: A2_CURATED_SLUG_TO_TOPIC,
    b1AliasesUsedForSlugs: Object.keys(B1_TOPIC_ALIASES).filter((k) =>
      ['health', 'work', 'education', 'society'].includes(k),
    ),
    mcq,
    filenameTopic,
    horenT1,
    cosmetic,
    names,
    stockCounting,
    mcqApply,
  };

  const outJson = path.join(ROOT, 'batches/ready/gate-logs/a2-pool-root-review-report.json');
  const outMd = path.join(ROOT, 'batches/ready/gate-logs/a2-pool-root-review-report.md');
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outMd, renderMarkdown(report), 'utf8');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Scanned ${rows.length} files → ${path.relative(ROOT, outMd)}`);
    console.log(
      `MCQ broken: ${mcq.brokenFileCount} | topic mismatch: ${filenameTopic.mismatchFileCount} | Horen T1 off-topic: ${horenT1.offTopicFileCount}`,
    );
    if (applyMcq) console.log(`MCQ fixed files: ${mcqApply.length}; remaining broken: ${mcq.brokenFileCount}`);
  }
}

main();
