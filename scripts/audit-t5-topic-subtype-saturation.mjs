#!/usr/bin/env node
/**
 * Mapa de saturación Lesen T5: 16 temas × 7 subtipos (+ subtipos solo-Konsum).
 * Clasifica celdas permitidas, stock pool/seed, molde CHK-29 y margen real.
 *
 *   node scripts/audit-t5-topic-subtype-saturation.mjs
 *   node scripts/audit-t5-topic-subtype-saturation.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/loadEnv.mjs';
import { B1_TOPICS } from './lib/b1Topics.mjs';
import {
  LESEN_T5_SUBTYPES,
  loadPoolRecords,
} from './lib/lesenSubtypeRotation.mjs';
import {
  isSubtypeHardExcludedForTopic,
  TOPIC_SUBTYPE_PREFERENCE,
} from './lib/lesenT5TopicFilter.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { extractStructuralMold, structuralMoldKey } from './lib/structuralMoldDedup.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_PER_TOPIC = 3;

function loadVerifiedT5Batches() {
  const out = [];
  for (const abs of listPoolVerifiedJson('B1')) {
    if (!/lesen-t5/i.test(abs)) continue;
    try {
      const b = JSON.parse(fs.readFileSync(abs, 'utf8'));
      out.push({ ...b, _file: path.basename(abs) });
    } catch {
      /* skip */
    }
  }
  return out;
}

function classifyCell({ allowed, stock, moldKeys }) {
  if (!allowed) return 'blocked';
  if (stock === 0) return 'empty';
  if (moldKeys.length >= 1) return 'chk29_saturated';
  return 'has_stock';
}

function main() {
  const asJson = process.argv.includes('--json');
  const records = loadPoolRecords({ lang: 'de', level: 'B1' });
  const verified = loadVerifiedT5Batches();

  const cells = [];
  for (const topic of B1_TOPICS) {
    for (const st of LESEN_T5_SUBTYPES) {
      const allowed = !isSubtypeHardExcludedForTopic(topic, st.id);
      cells.push({
        topic,
        subtype: st.id,
        allowed,
        pool: 0,
        seed: 0,
        moldKeys: [],
        titles: [],
        profiles: [],
      });
    }
  }

  const index = new Map(cells.map((c) => [`${c.topic}|${c.subtype}`, c]));

  for (const r of records.filter((x) => x.module === 'lesen' && x.teil === 5 && x.verified)) {
    const topic = normalizeB1Topic(r.topicTag);
    const st = r.textSubtype || '?';
    const cell = index.get(`${topic}|${st}`);
    if (cell) cell.seed++;
  }

  for (const b of verified) {
    const topic = normalizeB1Topic(b.topicTag || b._requestedTopic);
    const st = b._textSubtype || '?';
    const cell = index.get(`${topic}|${st}`);
    if (!cell) continue;
    cell.pool++;
    const title = b.passages?.[0]?.title || '';
    if (title) cell.titles.push(title.slice(0, 70));
    const mold = extractStructuralMold(b, 5);
    const mk = structuralMoldKey(mold);
    if (mk) cell.moldKeys.push(mk);
    if (b._t5VariantProfile) cell.profiles.push(b._t5VariantProfile);
  }

  for (const c of cells) {
    c.stock = c.pool + c.seed;
    c.status = classifyCell(c);
    c.chk29BlocksSecond = c.stock >= 1;
  }

  const topicSummaries = B1_TOPICS.map((topic) => {
    const row = cells.filter((c) => c.topic === topic && c.allowed);
    const stock = row.reduce((s, c) => s + c.stock, 0);
    const usedSubtypes = row.filter((c) => c.stock > 0).length;
    const freeSubtypes = row.filter((c) => c.stock === 0).length;
    const saturatedSubtypes = row.filter((c) => c.chk29BlocksSecond).length;
    const need = Math.max(0, TARGET_PER_TOPIC - stock);
    const pref = TOPIC_SUBTYPE_PREFERENCE[topic] || [];
    const prefFree = pref.filter((id) => {
      const c = row.find((x) => x.subtype === id);
      return c && c.stock === 0;
    });
    return {
      topic,
      stock,
      need,
      allowedSubtypes: row.length,
      usedSubtypes,
      freeSubtypes,
      saturatedSubtypes,
      prefFree,
      bottleneck: need > 0 && freeSubtypes <= need,
    };
  }).sort((a, b) => b.need - a.need || a.freeSubtypes - b.freeSubtypes);

  const report = {
    generatedAt: new Date().toISOString(),
    targetPerTopic: TARGET_PER_TOPIC,
    totalSubtypes: LESEN_T5_SUBTYPES.length,
    allowedCells: cells.filter((c) => c.allowed).length,
    blockedCells: cells.filter((c) => !c.allowed).length,
    cellsWithStock: cells.filter((c) => c.allowed && c.stock > 0).length,
    chk29SaturatedCells: cells.filter((c) => c.status === 'chk29_saturated').length,
    topicSummaries,
    cells: cells.filter((c) => c.allowed),
    konsum: {
      cells: cells.filter((c) => c.topic === 'Konsum'),
      need: topicSummaries.find((t) => t.topic === 'Konsum')?.need ?? 0,
    },
  };

  const outPath = path.join(ROOT, 'batches/ready/gate-logs/t5-topic-subtype-saturation.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== Lesen T5 — saturación topic×subtipo ===');
  console.log(`Objetivo: ${TARGET_PER_TOPIC} partes/tema · ${report.allowedCells} celdas permitidas (de ${B1_TOPICS.length}×${LESEN_T5_SUBTYPES.length})`);
  console.log(`Con stock: ${report.cellsWithStock} · CHK-29 saturadas (≥1 parte, bloquea 2º mismo molde): ${report.chk29SaturatedCells}`);
  console.log(`\nJSON: ${outPath.replace(/\\/g, '/')}\n`);

  console.log('--- Prioridad hacia 12 exámenes (need>0) ---');
  console.log('Tema           Stock  Faltan  Subtipos libres  Cuello');
  for (const t of topicSummaries.filter((x) => x.need > 0)) {
    console.log(
      `${t.topic.padEnd(14)} ${String(t.stock).padStart(5)}  ${String(t.need).padStart(6)}  ` +
        `${String(t.freeSubtypes).padStart(15)}  ${t.bottleneck ? 'SÍ' : 'no'}`,
    );
  }

  console.log('\n--- Konsum×T5 (caso inmediato) ---');
  for (const c of report.konsum.cells) {
    console.log(
      `  ${c.subtype.padEnd(16)} allowed=${c.allowed} stock=${c.stock} status=${c.status}` +
        (c.titles[0] ? ` «${c.titles[0]}»` : ''),
    );
  }
}

main();
