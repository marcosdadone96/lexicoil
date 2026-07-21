#!/usr/bin/env node
/**
 * run-pool-ready-check.mjs — Triage completo de batches/generated/.
 *
 *   node scripts/run-pool-ready-check.mjs
 *   node scripts/run-pool-ready-check.mjs --dry-run
 *   node scripts/run-pool-ready-check.mjs --no-move
 *   node scripts/run-pool-ready-check.mjs --skip-metadata
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import {
  poolReadyCheckWithRepair,
  getDiscardCache,
  getDedupCorpusCache,
  loadQ2EvaluationCache,
  resetPoolReadyCaches,
  inferModuleTeilFromName,
} from './lib/poolReadyCheck.mjs';
import { writePoolVerified } from './lib/finalizePoolReady.mjs';

loadEnvFile();

const GENERATED = path.join(ROOT, 'batches/generated');
const POOL_VERIFIED = path.join(ROOT, 'batches/ready/pool-verified');
const POOL_CONTENT_OK = path.join(ROOT, 'batches/ready/pool-content-ok');
const POOL_CONTENT_OK_LESEN = path.join(ROOT, 'batches/ready/pool-content-ok-lesen');
const NEEDS_REGEN = path.join(ROOT, 'batches/needs-regeneration');
const REPORT_JSON = path.join(ROOT, 'batches/ready/POOL-READY-REPORT.json');
const REPORT_MD = path.join(ROOT, 'batches/ready/POOL-READY-REPORT.md');

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    noMove: false,
    q2Llm: false,
    skipMetadata: false,
    skipQ1: false,
    skipQ2: false,
    limit: null,
    dir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--no-move') opts.noMove = true;
    else if (a === '--q2-llm') opts.q2Llm = true;
    else if (a === '--skip-metadata') opts.skipMetadata = true;
    else if (a === '--skip-q1') opts.skipQ1 = true;
    else if (a === '--skip-q2') opts.skipQ2 = true;
    else if (a === '--limit') opts.limit = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--dir') opts.dir = argv[++i];
  }
  return opts;
}

function listPartFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .filter((f) => /^(lesen|horen|schreiben|sprechen)-/i.test(f))
    .sort();
}

function ensureDirs() {
  fs.mkdirSync(POOL_VERIFIED, { recursive: true });
  fs.mkdirSync(POOL_CONTENT_OK, { recursive: true });
  fs.mkdirSync(POOL_CONTENT_OK_LESEN, { recursive: true });
  fs.mkdirSync(NEEDS_REGEN, { recursive: true });
}

function moveOrCopy(src, destDir) {
  const dest = path.join(destDir, path.basename(src));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(src, dest);
  return dest;
}

function bump(map, key, field) {
  if (!map[key]) map[key] = { READY: 0, REPAIRABLE_FIXED: 0, REJECT: 0, total: 0 };
  map[key][field]++;
  map[key].total++;
}

function cellKey(module, teil) {
  if (teil == null || Number.isNaN(teil)) return `${module}`;
  return `${module}-t${teil}`;
}

function renderMarkdown(report) {
  const s = report.summary;
  const cs = report.contentSummary || {};
  const lines = [
    '# Pool ready — reporte ejecutivo',
    '',
    `**Fecha:** ${report.generatedAt}`,
    `**Analizados:** ${s.total}`,
    '',
    '## Totales (veredicto oficial = gates 1–8)',
    '',
    '| Estado | N |',
    '|--------|--:|',
    `| READY | ${s.READY} |`,
    `| REPAIRABLE → READY (tras fix) | ${s.REPAIRABLE_FIXED} |`,
    `| REJECT | ${s.REJECT} |`,
    `| **Listos para pool** (READY + fixed) | **${s.READY + s.REPAIRABLE_FIXED}** |`,
    '',
    '## Contenido solo (gates 1–7, sin grammarTags/vocabularyTags/topic)',
    '',
    '| Estado | N |',
    '|--------|--:|',
    `| READY | ${cs.READY ?? 0} |`,
    `| REPAIRABLE | ${cs.REPAIRABLE ?? 0} |`,
    `| REJECT | ${cs.REJECT ?? 0} |`,
    '',
    '## Por módulo / Teil',
    '',
    '| Celda | Total | READY | Fixed | REJECT |',
    '|-------|------:|------:|------:|-------:|',
  ];
  for (const k of Object.keys(report.byCell).sort()) {
    const c = report.byCell[k];
    lines.push(`| ${k} | ${c.total} | ${c.READY} | ${c.REPAIRABLE_FIXED} | ${c.REJECT} |`);
  }
  lines.push('', '## Por módulo', '', '| Módulo | Total | READY | Fixed | REJECT |', '|--------|------:|------:|------:|-------:|');
  for (const k of Object.keys(report.byModule).sort()) {
    const c = report.byModule[k];
    lines.push(`| ${k} | ${c.total} | ${c.READY} | ${c.REPAIRABLE_FIXED} | ${c.REJECT} |`);
  }
  lines.push('', '## Motivos REJECT (top)', '', '| Motivo | Archivos |', '|--------|--------:|');
  for (const [r, n] of Object.entries(report.rejectReasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    lines.push(`| ${r} | ${n} |`);
  }
  lines.push(
    '',
    '## Carpetas',
    '',
    `- Listos: \`batches/ready/pool-verified/\` (${s.READY + s.REPAIRABLE_FIXED})`,
    `- Regenerar: \`batches/needs-regeneration/\` (${s.REJECT})`,
  );
  if (report.notes?.length) {
    lines.push('', '## Notas', '', ...report.notes.map((n) => `- ${n}`));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  resetPoolReadyCaches();
  ensureDirs();

  console.log('Cargando discard lists, corpus Q1, cache Q2…');
  const discard = getDiscardCache();
  const corpus = args.skipQ1 ? null : getDedupCorpusCache();
  const q2Cache = args.skipQ2 ? new Map() : loadQ2EvaluationCache();
  console.log(
    `  discard ids=${discard.blockedIds.size} · q2 cache=${q2Cache.size} · q1=${corpus ? 'ok' : 'skip'}`,
  );

  let sourceDir = args.dir
    ? path.isAbsolute(args.dir)
      ? args.dir
      : path.join(ROOT, args.dir)
    : GENERATED;
  if (!fs.existsSync(sourceDir)) {
    console.error(`No existe --dir: ${sourceDir}`);
    process.exit(1);
  }

  let files = listPartFiles(sourceDir);
  if (args.limit) files = files.slice(0, args.limit);
  console.log(`Analizando ${files.length} archivos en ${path.relative(ROOT, sourceDir)}…\n`);

  const summary = { total: 0, READY: 0, REPAIRABLE_FIXED: 0, REJECT: 0 };
  const contentSummary = { READY: 0, REPAIRABLE: 0, REJECT: 0 };
  const byCell = {};
  const byModule = {};
  const rejectReasonCounts = {};
  const results = [];
  const notes = [];

  if (args.skipMetadata) notes.push('Corrido con --skip-metadata (gates 1–7).');
  if (!args.q2Llm) {
    notes.push('Q2: cache dry-run + CHK-18b en no evaluados (sin LLM). Usa --q2-llm para forzar LLM.');
  }

  let i = 0;
  for (const file of files) {
    i++;
    const abs = path.join(sourceDir, file);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      summary.total++;
      summary.REJECT++;
      contentSummary.REJECT++;
      const { module, teil } = inferModuleTeilFromName(file);
      bump(byCell, cellKey(module, teil), 'REJECT');
      bump(byModule, module, 'REJECT');
      rejectReasonCounts.parse_error = (rejectReasonCounts.parse_error || 0) + 1;
      results.push({ file, verdict: 'REJECT', reasons: ['parse_error'], module, teil });
      continue;
    }

    let result;
    try {
      result = await poolReadyCheckWithRepair(batch, {
        file,
        sourcePath: path.relative(ROOT, abs).replace(/\\/g, '/'),
        discard,
        corpus,
        q2Cache,
        q2Llm: args.q2Llm,
        skipQ1: args.skipQ1,
        skipQ2: args.skipQ2,
        skipMetadata: args.skipMetadata,
      });
    } catch (err) {
      const mt = inferModuleTeilFromName(file);
      result = {
        file,
        verdict: 'REJECT',
        contentVerdict: 'REJECT',
        reasons: ['check_error'],
        rejectReasons: ['check_error'],
        module: mt.module,
        teil: mt.teil,
        batch,
        repaired: false,
        details: [{ rule: 'check_error', detail: err.message }],
      };
    }

    summary.total++;
    const { module, teil } = result;
    const cell = cellKey(module, teil);

    const cv = result.contentVerdict || result.verdict;
    if (cv === 'READY') contentSummary.READY++;
    else if (cv === 'REPAIRABLE') contentSummary.REPAIRABLE++;
    else contentSummary.REJECT++;

    if (result.verdict === 'READY') {
      const field = result.repaired ? 'REPAIRABLE_FIXED' : 'READY';
      summary[field]++;
      bump(byCell, cell, field);
      bump(byModule, module, field);

      if (!args.noMove && !args.dryRun) {
        const dest = writePoolVerified(file, result.batch);
        if (path.resolve(abs) !== path.resolve(dest)) {
          try { fs.unlinkSync(abs); } catch { /* */ }
        }
        // Remove stale content-ok copy
        const okCopy = path.join(POOL_CONTENT_OK, file);
        if (fs.existsSync(okCopy)) {
          try { fs.unlinkSync(okCopy); } catch { /* */ }
        }
      } else if (result.repaired && !args.dryRun && args.noMove) {
        fs.writeFileSync(abs, `${JSON.stringify(result.batch, null, 2)}\n`);
      }
    } else {
      summary.REJECT++;
      bump(byCell, cell, 'REJECT');
      bump(byModule, module, 'REJECT');
      for (const r of result.rejectReasons || result.reasons || []) {
        rejectReasonCounts[r] = (rejectReasonCounts[r] || 0) + 1;
      }
      if (!args.noMove && !args.dryRun) {
        // Lesen blocked only by Q1 (shadow) → interim assembly pool
        if (result.q1OnlyReject && String(module).toLowerCase() === 'lesen') {
          const { _poolRejectReason, _poolRejectAt, _poolRejectDetails, ...clean } = result.batch;
          fs.writeFileSync(
            path.join(POOL_CONTENT_OK_LESEN, file),
            `${JSON.stringify({
              ...clean,
              _poolContentOkLesenAt: new Date().toISOString(),
              _poolContentOkLesenNote:
                'gates pass except Q1; shadow until 2026-07-23 — accepted duplicate risk',
              _poolRejectReason: (result.rejectReasons || []).join(', '),
              _poolRejectDetails: (result.details || []).slice(0, 8),
            }, null, 2)}\n`,
          );
          if (path.resolve(abs) !== path.resolve(path.join(POOL_CONTENT_OK_LESEN, file))) {
            try { fs.unlinkSync(abs); } catch { /* */ }
          }
        } else {
          const tagged = {
            ...result.batch,
            _poolRejectReason: (result.rejectReasons || result.reasons || []).join(', '),
            _poolRejectAt: new Date().toISOString(),
            _poolRejectDetails: (result.details || []).slice(0, 12),
          };
          const dest = path.join(NEEDS_REGEN, file);
          fs.writeFileSync(dest, `${JSON.stringify(tagged, null, 2)}\n`);
          if (path.resolve(abs) !== path.resolve(dest)) {
            try { fs.unlinkSync(abs); } catch { /* */ }
          }
          // Content-ok interim (metadata only)
          if (result.contentVerdict === 'READY') {
            const { _poolRejectReason, _poolRejectAt, _poolRejectDetails, ...clean } = tagged;
            fs.writeFileSync(
              path.join(POOL_CONTENT_OK, file),
              `${JSON.stringify({
                ...clean,
                _poolContentOkAt: new Date().toISOString(),
                _poolContentOkNote: 'gates 1-7 pass; not pool-verified',
              }, null, 2)}\n`,
            );
          }
        }
      }
    }

    results.push({
      file: result.file,
      verdict: result.verdict === 'READY' && result.repaired ? 'REPAIRABLE_FIXED' : result.verdict,
      contentVerdict: result.contentVerdict,
      reasons: result.reasons,
      rejectReasons: result.rejectReasons,
      applied: result.applied || [],
      module,
      teil,
    });

    if (i % 25 === 0 || i === files.length) {
      process.stdout.write(
        `  ${i}/${files.length} · pool ${summary.READY + summary.REPAIRABLE_FIXED} · REJECT ${summary.REJECT}\r`,
      );
    }
  }

  console.log('\n');
  notes.push(
    `Sin metadata retrieval (gates 1–7): READY ${contentSummary.READY} · REPAIRABLE ${contentSummary.REPAIRABLE} · REJECT ${contentSummary.REJECT}.`,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    options: args,
    summary,
    contentSummary,
    byCell,
    byModule,
    rejectReasonCounts,
    notes,
    results,
  };
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(REPORT_MD, renderMarkdown(report));
  console.log(renderMarkdown(report));
  console.log(`JSON: ${path.relative(ROOT, REPORT_JSON)}`);
  if (args.dryRun) console.log('(dry-run: no se movieron archivos)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
