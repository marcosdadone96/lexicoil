#!/usr/bin/env node
/**
 * Reproceso completo del backlog Lesen (excl. wave 2a / Prueba_2).
 *   node scripts/reprocess-full-backlog.mjs [--dry-run] [--skip-t3-regen]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { runMetadataSchemaGate } from './lib/qualityGates/metadataSchemaGate.mjs';
import { runPassageCoherenceGate } from './lib/qualityGates/passageCoherenceGate.mjs';
import { runDuplicateContentGate } from './lib/qualityGates/duplicateContentGate.mjs';
import { buildDedupCorpus, corpusExcludingSource } from './lib/qualityGates/dedupCorpus.mjs';
import { checkGermanCapsBatch } from './lib/germanCapsGate.mjs';
const GEN = path.join(ROOT, 'batches/generated');
const READY = path.join(ROOT, 'batches/ready/lesen');
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const OUT = path.join(LOG_DIR, 'backlog-reprocess-report.json');
const CHECKPOINT = path.join(LOG_DIR, 'backlog-reprocess-checkpoint.json');

/** 30 archivos wave 2a / G2-INSPECTOR-WAVE2A — ya limpios, no tocar. */
export const WAVE2A_EXCLUDE = new Set([
  'lesen-t1-gemini-178.json', 'lesen-t1-gemini-179.json', 'lesen-t1-gemini-180.json',
  'lesen-t1-gemini-181.json', 'lesen-t1-gemini-182.json',
  'lesen-t2-gemini-094.json', 'lesen-t2-gemini-095.json', 'lesen-t2-gemini-096.json',
  'lesen-t2-gemini-097.json', 'lesen-t2-gemini-098.json',
  'lesen-t3-auto-1u2l8c.json', 'lesen-t3-auto-5hhflb.json', 'lesen-t3-auto-dfn273.json',
  'lesen-t3-auto-jhnc6c.json', 'lesen-t3-auto-jja73u.json', 'lesen-t3-auto-n0lt9z.json',
  'lesen-t3-auto-sds0gv.json', 'lesen-t3-auto-u7x6w8.json',
  'lesen-t4-gemini-038.json', 'lesen-t4-gemini-039.json', 'lesen-t4-gemini-040.json',
  'lesen-t4-gemini-041.json', 'lesen-t4-gemini-042.json',
  'lesen-t5-gemini-068.json', 'lesen-t5-gemini-069.json', 'lesen-t5-gemini-070.json',
  'lesen-t5-gemini-071.json', 'lesen-t5-gemini-072.json', 'lesen-t5-gemini-073.json',
  'lesen-t5-gemini-074.json',
]);

const PROSE_TEILS = new Set([1, 2, 4, 5]);
const LANG_LOWER_RE = /\bin (chinesisch|arabisch|russisch|deutsch|spanisch|italienisch|englisch|französisch|türkisch|polnisch|japanisch|portugiesisch)\b/g;

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const SKIP_T3 = args.has('--skip-t3-regen');
const GATES_ONLY = args.has('--gates-only');

function teilFromFile(name) {
  const m = String(name).match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function listLesenJson(dir, pool) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^lesen-t\d.*\.json$/i.test(f))
    .map((f) => ({
      file: f,
      pool,
      teil: teilFromFile(f),
      abs: path.join(dir, f),
      rel: `batches/${pool === 'ready' ? 'ready/lesen' : 'generated'}/${f}`,
      wave2a: WAVE2A_EXCLUDE.has(f),
    }));
}

function groupInventory(entries) {
  const byTeil = {};
  for (const e of entries) {
    if (!byTeil[e.teil]) {
      byTeil[e.teil] = { total: 0, wave2a: 0, backlog: 0, generated: 0, ready: 0, files: [] };
    }
    const b = byTeil[e.teil];
    b.total++;
    b.files.push({ file: e.file, pool: e.pool, wave2a: e.wave2a });
    if (e.wave2a) b.wave2a++;
    else b.backlog++;
    b[e.pool]++;
  }
  return byTeil;
}

function reprocessProse(entry) {
  const raw = JSON.parse(fs.readFileSync(entry.abs, 'utf8'));
  const { batch, stats } = applyGermanCapsNormalize(raw);
  const changed = JSON.stringify(raw) !== JSON.stringify(batch);
  if (changed && !DRY) {
    fs.writeFileSync(entry.abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
  return {
    file: entry.file,
    pool: entry.pool,
    teil: entry.teil,
    overwritten: changed,
    stats,
  };
}

function grepLangLower(files) {
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f.abs, 'utf8');
    let m;
    LANG_LOWER_RE.lastIndex = 0;
    while ((m = LANG_LOWER_RE.exec(text)) !== null) {
      hits.push({ file: f.file, pool: f.pool, match: m[0] });
    }
  }
  return hits;
}

function isKnownG2Noise(finding, teil) {
  const word = String(finding.word || '').toLowerCase();
  const reason = String(finding.reason || '');
  const regime = String(finding.regime || '');
  if (word === 'online' && reason === 'lexicon_nn') return true;
  if (teil === 3 && regime === 'TELEGRAPHIC_AD' && reason === 'verb_census_no_finite') return true;
  return false;
}

function runGatesOnFile(entry, corpus, g2ByFile) {
  const batch = JSON.parse(fs.readFileSync(entry.abs, 'utf8'));
  const rel = entry.rel;
  const q4 = runMetadataSchemaGate(batch, { file: rel, profile: entry.pool === 'ready' ? 'ready' : 'generated' });
  const q3 = runPassageCoherenceGate(batch, { file: rel });
  const excl = corpusExcludingSource(corpus, rel);
  const q1 = runDuplicateContentGate(batch, {
    file: rel,
    selfSource: rel,
    corpus: excl,
    index: excl.index,
    mode: 'shadow',
  });
  const rawFindings = g2ByFile.get(entry.file) || [];
  const g2Filtered = rawFindings.filter((f) => !isKnownG2Noise(f, entry.teil));
  return {
    file: entry.file,
    pool: entry.pool,
    teil: entry.teil,
    Q4: q4.verdict,
    Q4_findings: q4.findings?.length ?? 0,
    Q4_block: q4.findings?.some((x) => x.rule === 'topic_mismatch' && (x.severity || 'block') === 'block') ?? false,
    Q3: q3.verdict,
    Q3_findings: q3.findings?.length ?? 0,
    Q1: q1.verdict,
    Q1_wouldReject: q1.wouldReject ?? q1.verdict === 'block',
    Q1_findings: q1.findings?.length ?? 0,
    g2_skipped: false,
    g2_findings: g2Filtered,
    g2_findings_raw: rawFindings.length,
  };
}

function runG2All(entries) {
  const byFile = new Map();
  let n = 0;
  for (const e of entries) {
    n++;
    const batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const caps = checkGermanCapsBatch(batch, { timeoutMs: 30_000 });
    if (!caps.skipped) byFile.set(e.file, caps.findings || []);
    if (n % 50 === 0) console.log(`  G2 ${n}/${entries.length}…`);
  }
  return byFile;
}

function regenT3(count, outDir) {
  if (count <= 0) return { generated: [], stderr: '', status: 0 };
  const relOut = path.relative(ROOT, outDir).replace(/\\/g, '/');
  const beforeSet = new Set(
    fs.existsSync(outDir)
      ? fs.readdirSync(outDir).filter((f) => f.startsWith('lesen-t3-auto-') && f.endsWith('.json'))
      : [],
  );
  const proc = spawnSync(process.execPath, ['scripts/make-t3.mjs', '--count', String(count), '--out', relOut], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60 * 60 * 1000,
  });
  const after = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).filter((f) => f.startsWith('lesen-t3-auto-') && f.endsWith('.json'))
    : [];
  const newFiles = after.filter((f) => !beforeSet.has(f));
  return { generated: newFiles, stdout: proc.stdout, stderr: proc.stderr, status: proc.status ?? 1 };
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const all = [...listLesenJson(GEN, 'generated'), ...listLesenJson(READY, 'ready')];
  const inventory = {
    generatedAt: new Date().toISOString(),
    wave2aExclude: [...WAVE2A_EXCLUDE],
    totals: {
      all: all.length,
      wave2a: all.filter((e) => e.wave2a).length,
      backlog: all.filter((e) => !e.wave2a).length,
    },
    byTeil: groupInventory(all),
  };
  const invPath = path.join(LOG_DIR, 'backlog-reprocess-inventory.json');
  fs.writeFileSync(invPath, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Inventario: ${path.relative(ROOT, invPath)} (${inventory.totals.backlog} backlog / ${inventory.totals.wave2a} wave2a)`);

  const backlog = all.filter((e) => !e.wave2a);
  const proseBacklog = backlog.filter((e) => PROSE_TEILS.has(e.teil));
  const t3Backlog = backlog.filter((e) => e.teil === 3);

  let reprocessRows = [];
  let reprocessByTeil = {};
  let t3Deleted = [];
  let t3Regen = { generated: [], ready: [] };

  if (!GATES_ONLY) {
  console.log(`\n=== Reproceso PROSE (T1/T2/T4/T5): ${proseBacklog.length} archivos ===`);
  for (const e of proseBacklog) {
    const row = reprocessProse(e);
    reprocessRows.push(row);
    if (!reprocessByTeil[e.teil]) reprocessByTeil[e.teil] = { scanned: 0, overwritten: 0 };
    reprocessByTeil[e.teil].scanned++;
    if (row.overwritten) reprocessByTeil[e.teil].overwritten++;
  }
  console.log('Por Teil:', reprocessByTeil);

  if (!SKIP_T3) {
    console.log(`\n=== T3: eliminar ${t3Backlog.length} backlog + regenerar ===`);
    const t3GenCount = t3Backlog.filter((e) => e.pool === 'generated').length;
    const t3ReadyCount = t3Backlog.filter((e) => e.pool === 'ready').length;

    for (const e of t3Backlog) {
      if (!DRY && fs.existsSync(e.abs)) {
        fs.unlinkSync(e.abs);
        t3Deleted.push({ file: e.file, pool: e.pool });
      } else if (DRY) {
        t3Deleted.push({ file: e.file, pool: e.pool, dryRun: true });
      }
    }

    if (!DRY) {
      if (t3GenCount > 0) {
        console.log(`Regenerando ${t3GenCount} T3 → generated/…`);
        const r = regenT3(t3GenCount, GEN);
        if (r.status !== 0) {
          console.error(r.stderr || r.stdout);
          throw new Error(`make-t3 generated failed exit ${r.status}`);
        }
        t3Regen.generated = r.generated;
        console.log(`  creados: ${r.generated.length}`);
      }
      if (t3ReadyCount > 0) {
        console.log(`Regenerando ${t3ReadyCount} T3 → ready/lesen/…`);
        const r = regenT3(t3ReadyCount, READY);
        if (r.status !== 0) {
          console.error(r.stderr || r.stdout);
          throw new Error(`make-t3 ready failed exit ${r.status}`);
        }
        t3Regen.ready = r.generated;
        console.log(`  creados: ${r.generated.length}`);
      }
    }
  }
  } else {
    console.log('\n=== --gates-only: omitiendo reproceso/regeneración ===');
  }

  const finalAll = [...listLesenJson(GEN, 'generated'), ...listLesenJson(READY, 'ready')];
  const t3Final = finalAll.filter((e) => e.teil === 3);
  const langHits = grepLangLower(t3Final);
  console.log(`\nT3 lang lowercase grep: ${langHits.length} hits`);

  if (!GATES_ONLY) {
    fs.writeFileSync(CHECKPOINT, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      inventory,
      reprocessByTeil,
      reprocessChanged: reprocessRows.filter((r) => r.overwritten),
      t3: { deleted: t3Deleted.length, regen: t3Regen, langLowerHits: langHits },
    }, null, 2)}\n`);
  }

  let checkpoint = null;
  if (GATES_ONLY && fs.existsSync(CHECKPOINT)) {
    checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    reprocessByTeil = checkpoint.reprocessByTeil || reprocessByTeil;
    reprocessRows = checkpoint.reprocessChanged || reprocessRows;
    t3Deleted = Array(checkpoint.t3?.deleted || 0).fill({});
    t3Regen = checkpoint.t3?.regen || t3Regen;
  }

  console.log('\n=== Gates Q1a/Q3-A/Q4 + G2 (conjunto final) ===');
  const corpus = buildDedupCorpus({ dirs: [GEN, READY], bankPath: BANK });
  const gateTargets = finalAll;
  console.log(`G2 por archivo sobre ${gateTargets.length} archivos…`);
  const g2ByFile = runG2All(gateTargets);
  const gateRows = [];
  const g2Actionable = [];
  for (const e of gateTargets) {
    const row = runGatesOnFile(e, corpus, g2ByFile);
    gateRows.push(row);
    for (const f of row.g2_findings) {
      g2Actionable.push({ file: e.file, pool: e.pool, teil: e.teil, ...f });
    }
    if (gateRows.length % 100 === 0) console.log(`  gates ${gateRows.length}/${gateTargets.length}…`);
  }

  const promotion = analyzePromotion(gateRows, finalAll);

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY,
    inventory,
    inventoryPath: path.relative(ROOT, invPath),
    reprocess: { byTeil: reprocessByTeil, rows: reprocessRows.filter((r) => r.overwritten) },
    t3: { deleted: t3Deleted.length, regen: t3Regen, langLowerHits: langHits },
    gates: {
      files: gateRows.length,
      q4_block: gateRows.filter((r) => r.Q4_block).length,
      q3_fail: gateRows.filter((r) => r.Q3 !== 'pass').length,
      q1_wouldReject: gateRows.filter((r) => r.Q1_wouldReject).length,
      rows: gateRows,
    },
    g2: {
      rawTotal: gateRows.reduce((s, r) => s + r.g2_findings_raw, 0),
      actionableTotal: g2Actionable.length,
      actionable: g2Actionable,
      knownNoiseExcluded: ['online+lexicon_nn', 'T3+TELEGRAPHIC_AD+verb_census_no_finite'],
    },
    promotion,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  const mdPath = path.join(LOG_DIR, 'BACKLOG-REPROCESS-REPORT.md');
  fs.writeFileSync(mdPath, renderMd(report, reprocessByTeil));
  console.log(`\nReporte: ${path.relative(ROOT, OUT)}`);
  console.log(`Markdown: ${path.relative(ROOT, mdPath)}`);
}

function analyzePromotion(gateRows, allFiles) {
  const byPool = { generated: [], ready: [] };
  for (const r of gateRows) {
    const clean = !r.Q4_block && r.Q3 === 'pass' && !r.Q1_wouldReject && r.g2_findings.length === 0;
    if (clean) byPool[r.pool].push(r.file);
  }
  return {
    ready_promote_to_bank_candidates: byPool.ready.length,
    ready_clean_files: byPool.ready.slice(0, 20),
    generated_pool_keep: byPool.generated.length,
    generated_clean_sample: byPool.generated.slice(0, 20),
    notes: [
      'No promover a library/de/B1/questions.json en esta tarea (banco publicado fuera de scope).',
      'ready/lesen limpio → candidato a ingesta futura tras resolver AUD servido + re-ingesta selectiva.',
      'generated/ limpio → pool operativo normal de la app / futura promoción a ready/.',
      'Archivos con Q4 topic_mismatch, Q3 fail, Q1 wouldReject o G2 actionable → revisión antes de promover.',
    ],
  };
}

function renderMd(report, reprocessByTeil) {
  const lines = [
    '# Backlog reproceso completo',
    '',
    `**Fecha:** ${report.generatedAt}`,
    `**Inventario previo:** ${report.inventory.totals.backlog} backlog + ${report.inventory.totals.wave2a} wave2a (excluidos)`,
    '',
    '## 1. Inventario por Teil (antes)',
    '',
    '| Teil | total | wave2a | backlog | generated | ready |',
    '|---:|---:|---:|---:|---:|---:|',
  ];
  for (const t of [1, 2, 3, 4, 5]) {
    const b = report.inventory.byTeil?.[t] || {};
    lines.push(`| T${t} | ${b.total ?? '—'} | ${b.wave2a ?? '—'} | ${b.backlog ?? '—'} | ${b.generated ?? '—'} | ${b.ready ?? '—'} |`);
  }
  lines.push('', '## 2. Reproceso PROSE (T1/T2/T4/T5)', '', '| Teil | escaneados | sobrescritos |', '|---:|---:|---:|');
  for (const t of [1, 2, 4, 5]) {
    const x = reprocessByTeil[t] || { scanned: 0, overwritten: 0 };
    lines.push(`| T${t} | ${x.scanned} | ${x.overwritten} |`);
  }
  lines.push(
    '',
    '## 3. T3 regenerado',
    '',
    `- Eliminados backlog: ${report.t3.deleted}`,
    `- Regenerados generated: ${typeof report.t3.regen?.generated === 'number' ? report.t3.regen.generated : (report.t3.regen?.generated || []).length}`,
    `- Regenerados ready: ${typeof report.t3.regen?.ready === 'number' ? report.t3.regen.ready : (report.t3.regen?.ready || []).length}`,
    `- Idiomas en minúscula (grep): **${report.t3.langLowerHits.length}**`,
    '',
    '## 4. Gates (conjunto final)',
    '',
    `| Métrica | N |`,
    `|---------|---:|`,
    `| Archivos | ${report.gates.files} |`,
    `| Q4 topic_mismatch block | ${report.gates.q4_block} |`,
    `| Q3 ≠ pass | ${report.gates.q3_fail} |`,
    `| Q1 wouldReject | ${report.gates.q1_wouldReject} |`,
    '',
    '## 5. G2 actionable (sin ruido conocido)',
    '',
    `Raw: ${report.g2.rawTotal} · Actionable: ${report.g2.actionableTotal}`,
    '',
  );
  const sample = report.g2.actionable.slice(0, 40);
  if (sample.length) {
    lines.push('| archivo | word | reason | field |', '|---------|------|--------|-------|');
    for (const f of sample) {
      lines.push(`| ${f.file} | ${f.word} | ${f.reason} | ${f.field || ''} |`);
    }
    if (report.g2.actionable.length > 40) lines.push(`\n… +${report.g2.actionable.length - 40} más`);
  } else {
    lines.push('_Ninguno actionable tras excluir ruido conocido._');
  }
  lines.push('', '## 6. Promoción', '', ...report.promotion.notes.map((n) => `- ${n}`));
  lines.push(
    '',
    `- **ready limpio (gates+G2):** ${report.promotion.ready_promote_to_bank_candidates}`,
    `- **generated limpio:** ${report.promotion.generated_pool_keep}`,
  );
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
