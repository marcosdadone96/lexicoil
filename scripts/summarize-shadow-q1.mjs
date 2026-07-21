#!/usr/bin/env node
/**
 * Resumen shadow Q1 — métricas para decisión block real.
 *
 *   node scripts/summarize-shadow-q1.mjs
 *   node scripts/summarize-shadow-q1.mjs --since 2026-07-09 --until 2026-07-23
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const DEFAULT_SINCE = '2026-07-09';
const OBSERVATION_START = '2026-07-09';

const THRESHOLDS = {
  wouldRejectGlobal: { ok: 15, warn: 30 },
  wouldRejectT3: { ok: 40, warn: 60 },
  mirrorPair: { ok: 0, warn: 0.01 },
};

function parseArgs(argv) {
  const out = { since: DEFAULT_SINCE, until: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--since') out.since = argv[++i];
    else if (argv[i] === '--until') out.until = argv[++i];
  }
  return out;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferTeilFromFile(file) {
  const m = String(file).match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function logicalIdFromPath(filePath) {
  return path.basename(String(filePath || '')).replace(/\.json$/i, '');
}

function extractMatchRef(detail) {
  const m = String(detail || '').match(/«([^»]+)»/);
  return m ? m[1] : '';
}

function classifyFinding(file, finding) {
  const srcId = logicalIdFromPath(file);
  const matchRef = extractMatchRef(finding.detail);
  const matchId = logicalIdFromPath(matchRef.split('::')[0]);
  if (!matchRef) return 'unknown';
  if (matchRef.startsWith('library/')) return 'bank_match';
  if (matchId === srcId) return 'mirror_pair';
  return 'cross_id_match';
}

function listShadowLogs(since, until) {
  if (!fs.existsSync(LOG_DIR)) return [];
  const sinceD = parseDate(since);
  const untilD = parseDate(until);
  return fs.readdirSync(LOG_DIR)
    .filter((f) => f.startsWith('shadow-q1-') && f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(LOG_DIR, f);
      const mtime = fs.statSync(full).mtime;
      const stampMatch = f.match(/shadow-q1-(\d{4}-\d{2}-\d{2})/);
      const fileDate = stampMatch
        ? parseDate(stampMatch[1])
        : mtime;
      return { file: f, full, mtime, fileDate };
    })
    .filter(({ fileDate, mtime }) => {
      const d = fileDate || mtime;
      if (sinceD && d < sinceD) return false;
      if (untilD) {
        const end = new Date(untilD);
        end.setUTCHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
}

function readEntries(logFiles) {
  const entries = [];
  for (const { full, file } of logFiles) {
    const lines = fs.readFileSync(full, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        entries.push({ ...row, _logFile: file });
      } catch { /* skip */ }
    }
  }
  return entries;
}

function isNewGenerated(file) {
  const f = String(file || '').replace(/\\/g, '/');
  return f.includes('batches/generated/') && !f.includes('/ready/');
}

function trafficLight(value, { ok, warn }, higherIsBad = true) {
  if (higherIsBad) {
    if (value <= ok) return 'green';
    if (value <= warn) return 'yellow';
    return 'red';
  }
  if (value >= ok) return 'green';
  if (value >= warn) return 'yellow';
  return 'red';
}

function overallSemaphore(lights) {
  if (lights.includes('red')) return 'red';
  if (lights.includes('yellow')) return 'yellow';
  return 'green';
}

function emoji(light) {
  return { green: '🟢', yellow: '🟡', red: '🔴' }[light] || '⚪';
}

function pct(n, d) {
  return d === 0 ? 0 : Number(((n / d) * 100).toFixed(1));
}

function buildReport(args) {
  const logFiles = listShadowLogs(args.since, args.until);
  const raw = readEntries(logFiles);
  const generated = raw.filter((e) => isNewGenerated(e.file));

  const byFile = new Map();
  for (const e of generated) {
    byFile.set(e.file, e);
  }
  const unique = [...byFile.values()];

  const byTeil = { 1: [], 2: [], 3: [], 4: [], 5: [], 0: [] };
  for (const e of unique) {
    const t = inferTeilFromFile(e.file);
    (byTeil[t] || byTeil[0]).push(e);
  }

  const wouldRejectGlobal = unique.filter((e) => e.wouldReject === true).length;
  const t3 = byTeil[3] || [];
  const wouldRejectT3 = t3.filter((e) => e.wouldReject === true).length;

  const ruleCounts = {
    exact_duplicate: 0,
    near_duplicate: 0,
    possible_duplicate: 0,
    bank_match: 0,
    mirror_pair: 0,
    cross_id_match: 0,
    unknown: 0,
  };

  const verdictCounts = { pass: 0, warn: 0, block: 0 };

  for (const e of unique) {
    verdictCounts[e.verdict] = (verdictCounts[e.verdict] || 0) + 1;
    for (const f of e.findings || []) {
      if (ruleCounts[f.rule] !== undefined) {
        ruleCounts[f.rule] += 1;
      }
      const cat = classifyFinding(e.file, f);
      ruleCounts[cat] = (ruleCounts[cat] || 0) + 1;
    }
  }

  const mirrorFindings = ruleCounts.mirror_pair || 0;
  const totalFindings = Object.values(ruleCounts).reduce((a, b) => a + b, 0);
  const mirrorPct = pct(mirrorFindings, totalFindings || 1);

  const globalRejectPct = pct(wouldRejectGlobal, unique.length);
  const t3RejectPct = pct(wouldRejectT3, t3.length);

  const lights = {
    wouldRejectGlobal: trafficLight(globalRejectPct, THRESHOLDS.wouldRejectGlobal),
    wouldRejectT3: trafficLight(t3RejectPct, THRESHOLDS.wouldRejectT3),
    mirrorPair: mirrorFindings > 0 ? 'red' : 'green',
  };
  const semaphore = overallSemaphore(Object.values(lights));

  const teilRows = [1, 2, 3, 4, 5].map((t) => {
    const rows = byTeil[t] || [];
    const wr = rows.filter((e) => e.wouldReject).length;
    return {
      teil: t,
      files: rows.length,
      pass: rows.filter((e) => e.verdict === 'pass').length,
      warn: rows.filter((e) => e.verdict === 'warn').length,
      block: rows.filter((e) => e.verdict === 'block').length,
      wouldReject: wr,
      wouldRejectPct: pct(wr, rows.length),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    period: { since: args.since, until: args.until || 'now' },
    observationStart: OBSERVATION_START,
    logFiles: logFiles.map((x) => x.file),
    rawEntries: raw.length,
    uniqueGeneratedFiles: unique.length,
    wouldRejectGlobal,
    globalRejectPct,
    wouldRejectT3,
    t3RejectPct,
    mirrorFindings,
    mirrorPct,
    ruleCounts,
    verdictCounts,
    teilRows,
    lights,
    semaphore,
  };
}

function formatMarkdown(r) {
  const lines = [
    '# Shadow Q1 — resumen',
    '',
    `**Generado:** ${r.generatedAt}`,
    `**Periodo:** ${r.period.since} → ${r.period.until}`,
    `**Observación desde:** ${r.observationStart}`,
    `**Logs leídos:** ${r.logFiles.length} archivo(s) · ${r.rawEntries} entradas · ${r.uniqueGeneratedFiles} archivos únicos en \`batches/generated/\``,
    '',
    `## Semáforo decisión: ${emoji(r.semaphore)} **${r.semaphore.toUpperCase()}**`,
    '',
    '| Métrica | Valor | Umbral OK | Umbral preocupante | Estado |',
    '|---------|-------|-----------|-------------------|--------|',
    `| wouldReject global | ${r.globalRejectPct}% (${r.wouldRejectGlobal}/${r.uniqueGeneratedFiles}) | < 15% | > 30% | ${emoji(r.lights.wouldRejectGlobal)} ${r.lights.wouldRejectGlobal} |`,
    `| wouldReject Teil 3 | ${r.t3RejectPct}% (${r.wouldRejectT3}/${r.teilRows.find((x) => x.teil === 3)?.files || 0}) | < 40% | > 60% | ${emoji(r.lights.wouldRejectT3)} ${r.lights.wouldRejectT3} |`,
    `| mirror_pair findings | ${r.mirrorFindings} (${r.mirrorPct}% de findings) | 0 | > 0 | ${emoji(r.lights.mirrorPair)} ${r.lights.mirrorPair} |`,
    '',
    '## Veredictos shadow (archivos únicos)',
    '',
    `| pass | warn | block |`,
    `|------|------|-------|`,
    `| ${r.verdictCounts.pass || 0} | ${r.verdictCounts.warn || 0} | ${r.verdictCounts.block || 0} |`,
    '',
    '## Por Teil',
    '',
    '| Teil | archivos | pass | warn | block | wouldReject | % wouldReject |',
    '|------|----------|------|------|-------|-------------|-----------------|',
  ];

  for (const row of r.teilRows) {
    lines.push(
      `| ${row.teil} | ${row.files} | ${row.pass} | ${row.warn} | ${row.block} | ${row.wouldReject} | ${row.wouldRejectPct}% |`,
    );
  }

  lines.push(
    '',
    '## Findings por regla / categoría',
    '',
    '| Regla / categoría | Conteo |',
    '|-------------------|--------|',
    `| exact_duplicate | ${r.ruleCounts.exact_duplicate || 0} |`,
    `| near_duplicate | ${r.ruleCounts.near_duplicate || 0} |`,
    `| possible_duplicate | ${r.ruleCounts.possible_duplicate || 0} |`,
    `| bank_match | ${r.ruleCounts.bank_match || 0} |`,
    `| cross_id_match | ${r.ruleCounts.cross_id_match || 0} |`,
    `| mirror_pair | ${r.ruleCounts.mirror_pair || 0} |`,
    '',
    '## Interpretación',
    '',
    `- **Verde:** todas las métricas automáticas en umbral OK → candidato a promover Q1 a block (confirmar FP manual ≥20 si amarillo).`,
    `- **Amarillo:** alguna métrica entre OK y preocupante → revisar muestra manual antes de decidir.`,
    `- **Rojo:** alguna métrica supera umbral preocupante → no promover; investigar (ver [PENDING-REVIEWS.md](../PENDING-REVIEWS.md)).`,
    '',
    '**Comando:** `node scripts/summarize-shadow-q1.mjs`',
    '',
  );

  return lines.join('\n');
}

function printConsole(r) {
  console.log('=== Shadow Q1 summary ===');
  console.log(`Periodo: ${r.period.since} → ${r.period.until}`);
  console.log(`Logs: ${r.logFiles.length} · archivos generated únicos: ${r.uniqueGeneratedFiles}`);
  console.log(`\nSemáforo: ${emoji(r.semaphore)} ${r.semaphore.toUpperCase()}\n`);
  console.log('| Métrica | Valor | Estado |');
  console.log('|---------|-------|--------|');
  console.log(`| wouldReject global | ${r.globalRejectPct}% | ${emoji(r.lights.wouldRejectGlobal)} |`);
  console.log(`| wouldReject T3 | ${r.t3RejectPct}% | ${emoji(r.lights.wouldRejectT3)} |`);
  console.log(`| mirror_pair | ${r.mirrorFindings} | ${emoji(r.lights.mirrorPair)} |`);
  console.log('\n| Teil | files | pass | warn | block | wouldReject | % |');
  for (const row of r.teilRows) {
    console.log(
      `| ${row.teil} | ${row.files} | ${row.pass} | ${row.warn} | ${row.block} | ${row.wouldReject} | ${row.wouldRejectPct}% |`,
    );
  }
  console.log('\nFindings:', JSON.stringify({
    exact_duplicate: r.ruleCounts.exact_duplicate,
    near_duplicate: r.ruleCounts.near_duplicate,
    possible_duplicate: r.ruleCounts.possible_duplicate,
    bank_match: r.ruleCounts.bank_match,
    cross_id_match: r.ruleCounts.cross_id_match,
    mirror_pair: r.ruleCounts.mirror_pair,
  }));
}

const args = parseArgs(process.argv);
const report = buildReport(args);
printConsole(report);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outMd = path.join(LOG_DIR, `shadow-q1-summary-${stamp}.md`);
const outJson = path.join(LOG_DIR, `shadow-q1-summary-${stamp}.json`);
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(outMd, formatMarkdown(report), 'utf8');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
console.log(`\nGuardado: ${outMd}`);
console.log(`Guardado: ${outJson}`);
