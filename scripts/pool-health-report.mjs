#!/usr/bin/env node
/**
 * pool-health-report.mjs — POOL-1: salud del pool (calidad, no solo cobertura)
 *
 * Por cada celda (module, teil, theme) mide partes limpias vs sucias usando auditExam.
 * Solo lectura — no modifica datos.
 *
 * Uso:
 *   node scripts/pool-health-report.mjs --lang de --level B1
 *   node scripts/pool-health-report.mjs --lang de --level B1 --target 3 --json
 *   node scripts/pool-health-report.mjs --lang de --level B1 --source blobs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { auditExam, partToExamWrapper, chk23, filterPartPoolFindings } from './audit-pass-2.mjs';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();


function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', target: 3, source: 'seed', json: false, semantic: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--target') o.target = Math.max(0, Number(argv[++i]) || 3);
    else if (a === '--source') o.source = String(argv[++i]);
    else if (a === '--json') o.json = true;
    // V-11: opt-in semantic layer — LLM call per record, expensive, disabled by default.
    else if (a === '--semantic') o.semantic = true;
  }
  return o;
}

/** Extrae theme de contributor (curated:technology → technology). */
function partTheme(record) {
  const c = String(record.contributor || record.theme || '');
  const m = /^curated:(.+)$/i.exec(c);
  if (m) return m[1];
  if (record.theme) return String(record.theme);
  return '_untagged';
}

// recordToExamWrapper is now the canonical partToExamWrapper from audit-pass-2.mjs.
// This ensures pool-health-report uses the exact same conversion logic as isPartPoolReady,
// including all CHK-8 fixes (p.passageId fallback, H4 transcript passageId propagation).
function recordToExamWrapper(record) {
  return partToExamWrapper(record);
}

// filterPartPoolFindings imported from audit-pass-2.mjs — single source of truth (V-19).

async function auditPartRecord(record, { semantic = false } = {}) {
  // CHK-23 must run on the raw record before normalization (flattenExam collapses
  // segments[].questions and rec.questions via ID-dedup, hiding the key conflict).
  const rawFindings = chk23(record, record.id || 'part');

  const wrapper = recordToExamWrapper(record);
  if (!wrapper) {
    return { clean: false, important: 1, critical: 0, minor: 0, byChk: { 'CHK-?': 1 } };
  }
  const audit = auditExam(wrapper, record.id || 'part');
  const findings = [...rawFindings, ...filterPartPoolFindings(audit.findings)];

  // V-11: optional SEM-1 layer (--semantic, opt-in due to LLM cost).
  if (semantic) {
    try {
      const { validatePartSemantics } = await import('./lib/semanticValidator.mjs');
      const semResult = await validatePartSemantics(record);
      for (const iss of semResult.issues || []) {
        const sev = ['correctness', 'ambiguity'].includes(iss.kind) ? 'CRITICAL' : 'IMPORTANT';
        findings.push({ id: `SEM-${iss.kind.toUpperCase()}`, severity: sev, message: iss.detail });
      }
    } catch (err) {
      process.stderr.write(`[pool-health] SEM-1 error for ${record.id}: ${err?.message || err}\n`);
    }
  }

  const criticalFindings   = findings.filter((f) => f.severity === 'CRITICAL');
  const importantFindings  = findings.filter((f) => f.severity === 'IMPORTANT');
  // clean = 0 CRITICAL AND 0 IMPORTANT — same gate as POOL-2 / isPartPoolReady
  const byChk = {};
  for (const f of [...criticalFindings, ...importantFindings]) {
    byChk[f.id] = (byChk[f.id] || 0) + 1;
  }
  return {
    clean: criticalFindings.length === 0 && importantFindings.length === 0,
    important: importantFindings.length,
    critical: criticalFindings.length,
    minor: findings.filter((f) => f.severity === 'MINOR').length,
    byChk,
  };
}

function loadPartsFromSeed(lang, level) {
  const file = path.join(ROOT, 'library', 'reusable-seed', `${lang}_${level}.json`);
  if (!fs.existsSync(file)) return [];
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(d) ? d : (d.records || []);
  return arr.map((r) => ({ ...r, lang: r.lang || lang, level: r.level || level }));
}

async function loadPartsFromBlobs(lang, level) {
  const { getStore } = require('@netlify/blobs');
  const { listPartsIndex } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
  const siteID = process.env.NETLIFY_SITE_ID || '';
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || '';
  if (!siteID || !token) {
    throw new Error(
      'Falta NETLIFY_SITE_ID y NETLIFY_API_TOKEN (o NETLIFY_AUTH_TOKEN) en .env para --source blobs',
    );
  }
  const store = getStore({ name: 'lexicoil-data', siteID, token });
  const out = [];
  for (const module of ['lesen', 'horen', 'schreiben', 'sprechen']) {
    const idx = await listPartsIndex(store, lang, level, module);
    for (const row of idx) {
      const part = await store.get(row.partKey, { type: 'json' });
      if (part) out.push({ ...part, module, lang, level });
    }
  }
  return out;
}

function cellKey(module, teil, theme) {
  return `${module}:T${teil}:${theme}`;
}

function emptyCell(module, teil, theme) {
  return {
    module,
    teil,
    theme,
    total: 0,
    clean: 0,
    dirty: 0,
    deficit: 0,
    cleanRemaining: 0,
    dirtyByChk: {},
  };
}

async function buildReport(parts, target, { semantic = false } = {}) {
  const cellsMap = new Map();

  for (const part of parts) {
    const module = String(part.module || '').toLowerCase();
    const teil = Number(part.teil);
    if (!module || !Number.isFinite(teil)) continue;

    const theme = partTheme(part);
    const key = cellKey(module, teil, theme);
    if (!cellsMap.has(key)) cellsMap.set(key, emptyCell(module, teil, theme));

    const cell = cellsMap.get(key);
    cell.total += 1;

    const verdict = await auditPartRecord(part, { semantic });
    if (verdict.clean) {
      cell.clean += 1;
    } else {
      cell.dirty += 1;
      for (const [chk, n] of Object.entries(verdict.byChk)) {
        cell.dirtyByChk[chk] = (cell.dirtyByChk[chk] || 0) + n;
      }
    }
  }

  const cells = [...cellsMap.values()].map((c) => {
    c.cleanRemaining = c.clean;
    c.deficit = Math.max(0, target - c.clean);
    return c;
  });

  cells.sort((a, b) => {
    const mod = a.module.localeCompare(b.module);
    if (mod) return mod;
    if (a.teil !== b.teil) return a.teil - b.teil;
    return a.theme.localeCompare(b.theme);
  });

  const deficitCells = cells
    .filter((c) => c.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || a.module.localeCompare(b.module) || a.teil - b.teil);

  return { cells, deficitCells };
}

function printMatrix(cells, target, lang, level, source) {
  console.log(`\n=== Salud del pool · ${lang}/${level} · fuente: ${source} · objetivo: ${target} partes limpias/celda ===`);
  console.log(`Partes auditadas: ${cells.reduce((s, c) => s + c.total, 0)} | celdas: ${cells.length}`);

  const byModuleTeil = new Map();
  for (const c of cells) {
    const k = `${c.module}:T${c.teil}`;
    if (!byModuleTeil.has(k)) byModuleTeil.set(k, []);
    byModuleTeil.get(k).push(c);
  }

  for (const [mt, rows] of [...byModuleTeil.entries()].sort()) {
    console.log(`\n${mt}`);
    console.log(`  ${'theme'.padEnd(16)} ${'total'.padStart(5)} ${'clean'.padStart(5)} ${'dirty'.padStart(5)} ${'deficit'.padStart(7)} ${'clean↔'.padStart(6)}  dirtyByChk`);
    for (const r of rows) {
      const chkSummary = Object.entries(r.dirtyByChk)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, n]) => `${k}:${n}`)
        .join(' ');
      console.log(
        `  ${r.theme.padEnd(16)} ${String(r.total).padStart(5)} ${String(r.clean).padStart(5)} ${String(r.dirty).padStart(5)} ${String(r.deficit).padStart(7)} ${String(r.cleanRemaining).padStart(6)}  ${chkSummary}`,
      );
    }
  }

  const withDeficit = cells.filter((c) => c.deficit > 0);
  if (withDeficit.length) {
    console.log(`\nCeldas deficitarias (${withDeficit.length}):`);
    for (const c of withDeficit.sort((a, b) => b.deficit - a.deficit)) {
      console.log(`  ${c.module} T${c.teil} · ${c.theme}: clean=${c.clean}/${target} deficit=${c.deficit}`);
    }
  } else {
    console.log('\nSin déficit en ninguna celda.');
  }
  console.log('');
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const parts = opts.source === 'blobs'
    ? await loadPartsFromBlobs(opts.lang, opts.level)
    : loadPartsFromSeed(opts.lang, opts.level);

  if (!parts.length) {
    console.error('No hay partes que auditar. ¿Has sembrado el pool (library/reusable-seed/)?');
    process.exit(1);
  }

  if (opts.semantic) {
    process.stderr.write('[pool-health] --semantic activo: llamadas LLM por registro (lento y costoso)\n');
  }
  const { cells, deficitCells } = await buildReport(parts, opts.target, { semantic: opts.semantic });

  if (!opts.json) {
    printMatrix(cells, opts.target, opts.lang, opts.level, opts.source);
  }

  const payload = {
    lang: opts.lang,
    level: opts.level,
    source: opts.source,
    target: opts.target,
    partsAudited: parts.length,
    cells,
    deficitCells: deficitCells.map(({ module, teil, theme, clean, dirty, deficit, total, cleanRemaining, dirtyByChk }) => ({
      module,
      teil,
      theme,
      total,
      clean,
      dirty,
      deficit,
      cleanRemaining,
      dirtyByChk,
    })),
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  }
})().catch((err) => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});
