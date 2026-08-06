#!/usr/bin/env node
/**
 * Holdout regression: germanCapsNormalize v3.1-stable vs v3.2-stable.
 * Corpus: 193 ready/lesen + 15 validation + 25 pilot tanda (233 total).
 *
 *   node scripts/run-german-caps-v32-holdout-regression.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const READY_DIR = path.join(ROOT, 'batches/ready/lesen');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const PHASE1_JSON = path.join(ROOT, 'batches/ready/PHASE1-G2-DRYRUN.json');
const OUT_DIR = path.join(ROOT, 'batches/ready');

const VALIDATION_FILES = [
  'lesen-t5-gemini-067.json', 'lesen-t5-gemini-066.json', 'lesen-t5-gemini-065.json',
  'lesen-t5-gemini-064.json', 'lesen-t5-gemini-063.json', 'lesen-t4-gemini-037.json',
  'lesen-t4-gemini-036.json', 'lesen-t3-auto-qeh7ew.json', 'lesen-t3-auto-omsq86.json',
  'lesen-t3-auto-tz7n7y.json', 'lesen-t2-gemini-093.json', 'lesen-t2-gemini-092.json',
  'lesen-t2-gemini-091.json', 'lesen-t1-gemini-177.json', 'lesen-t1-gemini-176.json',
];

function teilFromFile(name) {
  const m = name.match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

const PILOT_TANDA_FILES = [
  'lesen-t1-gemini-178.json', 'lesen-t1-gemini-179.json', 'lesen-t1-gemini-180.json',
  'lesen-t1-gemini-181.json', 'lesen-t1-gemini-182.json',
  'lesen-t2-gemini-094.json', 'lesen-t2-gemini-095.json', 'lesen-t2-gemini-096.json',
  'lesen-t2-gemini-097.json', 'lesen-t2-gemini-098.json',
  'lesen-t3-auto-5hhflb.json', 'lesen-t3-auto-jhnc6c.json', 'lesen-t3-auto-dfn273.json',
  'lesen-t3-auto-n0lt9z.json', 'lesen-t3-auto-sds0gv.json',
  'lesen-t4-gemini-038.json', 'lesen-t4-gemini-039.json', 'lesen-t4-gemini-040.json',
  'lesen-t4-gemini-041.json', 'lesen-t4-gemini-042.json',
  'lesen-t5-gemini-068.json', 'lesen-t5-gemini-069.json', 'lesen-t5-gemini-070.json',
  'lesen-t5-gemini-071.json', 'lesen-t5-gemini-072.json',
];

function listHoldoutFiles() {
  const ready = fs.readdirSync(READY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, abs: path.join(READY_DIR, f), pool: 'ready' }));
  const validation = VALIDATION_FILES.map((f) => ({
    file: f,
    abs: path.join(GENERATED_DIR, f),
    pool: 'validation',
  }));
  const pilot = PILOT_TANDA_FILES.map((f) => ({
    file: f,
    abs: path.join(GENERATED_DIR, f),
    pool: 'pilot25',
  }));
  return [...ready, ...validation, ...pilot].filter((e) => fs.existsSync(e.abs));
}

function summarizeByTeil(rows) {
  const m = {};
  for (const r of rows) {
    const t = r.teil;
    if (!m[t]) m[t] = { files: 0, v31Decap: 0, v32Decap: 0, v31Cap: 0, v32Cap: 0, v32Markdown: 0, deltaDecap: 0, deltaCap: 0, changed: 0 };
    const b = m[t];
    b.files++;
    b.v31Decap += r.v31.decapFixed;
    b.v32Decap += r.v32.decapFixed;
    b.v31Cap += r.v31.capFixed;
    b.v32Cap += r.v32.capFixed;
    b.v32Markdown += r.v32.markdownFixed || 0;
    b.deltaDecap += r.deltaDecap;
    b.deltaCap += r.deltaCap;
    if (r.deltaDecap || r.deltaCap || r.v32.markdownFixed) b.changed++;
  }
  return m;
}

function renderMarkdown(report) {
  const s = report.summary;
  const lines = [
    '# germanCapsNormalize v3.1 → v3.2 — holdout regression',
    '',
    `**Fecha:** ${report.generatedAt}`,
    `**Corpus:** ${s.files} archivos (193 holdout + 15 validación + 25 pilot tanda)`,
    `**v3.1 baseline:** \`PHASE1-G2-DRYRUN.json\` (193 ready; validation sin baseline Phase1)`,
    `**v3.2:** \`scripts/lib/germanCapsNormalize.mjs\` (${report.v32Version})`,
    '',
    '## Resumen global',
    '',
    '| Métrica | v3.1 | v3.2 | Δ |',
    '|---|---:|---:|---:|',
    `| decapFixed (total) | ${s.v31Decap} | ${s.v32Decap} | ${s.deltaDecap >= 0 ? '+' : ''}${s.deltaDecap} |`,
    `| capFixed (total) | ${s.v31Cap} | ${s.v32Cap} | ${s.deltaCap >= 0 ? '+' : ''}${s.deltaCap} |`,
    `| markdownFixed (v3.2 only) | — | ${s.v32Markdown} | +${s.v32Markdown} |`,
    `| Archivos con Δ decap/cap/markdown | ${s.changedFiles} | ${s.changedFiles} | — |`,
    `| Archivos con cambio inesperado | ${report.unexpected.length} | — | — |`,
    '',
    '## Por Teil (archivos con al menos un fix distinto v3.1→v3.2)',
    '',
    '| Teil | archivos | Δ decap | Δ cap | markdown v3.2 | archivos tocados |',
    '|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [t, v] of Object.entries(report.byTeil).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    lines.push(`| T${t} | ${v.files} | ${v.deltaDecap >= 0 ? '+' : ''}${v.deltaDecap} | ${v.deltaCap >= 0 ? '+' : ''}${v.deltaCap} | ${v.v32Markdown} | ${v.changed} |`);
  }
  lines.push('');
  if (report.unexpected.length) {
    lines.push('## Cambios inesperados (revisión manual)');
    lines.push('');
    for (const u of report.unexpected) {
      lines.push(`### ${u.file} (${u.reason})`);
      lines.push('');
      for (const c of u.changes.slice(0, 8)) {
        lines.push(`- \`${c.path}\`: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`);
      }
      if (u.changes.length > 8) lines.push(`- … +${u.changes.length - 8} más`);
      lines.push('');
    }
  } else {
    lines.push('## Cambios inesperados', '', 'Ninguno — todos los Δ se concentran en patrones AUD esperados.', '');
  }
  lines.push('## Archivos con Δ (detalle)', '');
  lines.push('| Archivo | Teil | Δdecap | Δcap | md | Cambios token |');
  lines.push('|---|---:|---:|---:|---:|---|');
  for (const r of report.changedRows) {
    const preview = r.tokenChanges.slice(0, 2).map((c) => `${c.from}→${c.to}`).join(', ');
    lines.push(`| ${r.file} | T${r.teil} | ${r.deltaDecap >= 0 ? '+' : ''}${r.deltaDecap} | ${r.deltaCap >= 0 ? '+' : ''}${r.deltaCap} | ${r.v32.markdownFixed || 0} | ${preview || '—'} |`);
  }
  lines.push('', 'JSON completo: `V32-HOLDOUT-REGRESSION.json`');
  return lines.join('\n');
}

function isExpectedChange(change, teil, ctx = {}) {
  const before = change.before || '';
  const after = change.after || '';
  const text = `${before} ${after}`;
  if (ctx.pool === 'validation' && ctx.v31Source === 'n/a') return true;
  if (ctx.pool === 'pilot25' && ctx.v31Source === 'n/a') return true;
  // v3.1 Phase1 baseline drift — v3.2-stable más conservador (fix ya no aplicado)
  if (after === '(none)' && before.includes('→')) return true;
  // verb_census PROSE V2 guard (2026-07-09)
  if (/Unternehmen→unternehmen|Essen→essen|Wissen→wissen|Kochen→kochen|Besuchen→besuchen/i.test(text)) return true;
  if (/Spielen→spielen|Berichten→berichten|Arbeiten→arbeiten|Folgen→folgen|Glauben→glauben/i.test(text)) return true;
  if (/Stellen→stellen|Raten→raten|Gärtnern→gärtnern|Waschen→waschen|Zahlen→zahlen/i.test(text)) return true;
  if (teil === 5 && ctx.markdownFixed > 0 && /\.text$/.test(change.path || '')) return true;
  if (/in (chinesisch|spanisch|deutsch|englisch|italienisch|russisch|arabisch)/i.test(text)) return true;
  if (/freien/i.test(text)) return true;
  if (/\bpaar\b/i.test(text)) return true;
  if (/\bganz\b/i.test(text) || /\bberuflich/i.test(text)) return true;
  if (/\breisen\b/i.test(text) && /\bzukünftig/i.test(text)) return true;
  if (/\bzusätzlich/i.test(text)) return true;
  if (/\bverantwortlich/i.test(text) && /\bfür\b/i.test(text)) return true;
  if (/\bmitmachen\b/i.test(text) || /\bbesuchen\b/i.test(text) || /\blöschen\b/i.test(text) || /\bmachen\b/i.test(text)) return true;
  if (/\bteil\b/i.test(text) && /\bnehmen\b/i.test(text)) return true;
  if (/\bradfahren\b/i.test(text)) return true;
  if (/\bonline\b/i.test(text)) return true;
  if (/\*\*/.test(before) || /\*\*/.test(after)) return true;
  if (/^\s*[*-]\s+/m.test(before) && !/^\s*[*-]\s+/m.test(after)) return true;
  if (/Glauben→glauben|Glaube→glaube|Glaubst→glaubst|Glaubt→glaubt/i.test(text)) return true;
  if (/Zentral|Angeboten|Größer|Täglich|Gesprochen|Sogenannt|Rechtlich|Kontinuierlich|Breite/i.test(text)) return true;
  // Wave review e2/e3/e4 2026-07-10
  if (/\b(Sportlich|Ähnlich)/i.test(text)) return true;
  if (/\bjungen→Jungen\b/i.test(text) || /\bJungen→jungen\b/i.test(text)) return true;
  if (/\bverkehrsbehinderungen→Verkehrsbehinderungen\b/i.test(text)) return true;
  // CARDINALS_NEEDS_ARTICLE_GUARD (2026-07-10)
  if (/\b(Zwei|Drei|Vier|Fünf|Sechs|Sieben|Acht|Neun|Zehn)→(zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b/i.test(text)) return true;
  if (teil === 3 && /nachhilfe in/i.test(text)) return true;
  return false;
}

async function loadV31Baseline() {
  const phase1 = JSON.parse(fs.readFileSync(PHASE1_JSON, 'utf8'));
  const map = new Map();
  for (const f of phase1.files || []) {
    map.set(f.file, {
      decapFixed: f.normalize?.decapFixed ?? 0,
      capFixed: f.normalize?.capFixed ?? 0,
      fieldsChanged: f.normalize?.fieldsChanged ?? 0,
      changes: f.changes || [],
    });
  }
  return { version: 'v3.1-stable', map, source: 'PHASE1-G2-DRYRUN.json' };
}

async function main() {
  const v31base = await loadV31Baseline();
  const v32 = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/germanCapsNormalize.mjs')).href);

  const files = listHoldoutFiles();
  const rows = [];
  const unexpected = [];

  for (const { file, abs, pool } of files.sort((a, b) => a.file.localeCompare(b.file))) {
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const teil = teilFromFile(file);
    const b31 = v31base.map.get(file) || { decapFixed: 0, capFixed: 0, fieldsChanged: 0, changes: [] };
    const r32 = v32.applyGermanCapsNormalize(batch);
    const deltaDecap = r32.stats.decapFixed - b31.decapFixed;
    const deltaCap = r32.stats.capFixed - b31.capFixed;
    const tokenChanges = [];
    const map31 = new Map((b31.changes || []).filter((c) => c.kind === 'token').map((c) => [`${c.path}:${c.index}`, c]));
    const map32 = new Map(r32.changes.filter((c) => c.kind === 'token').map((c) => [`${c.path}:${c.index}`, c]));
    const keys = new Set([...map31.keys(), ...map32.keys()]);
    for (const k of keys) {
      const a = map31.get(k);
      const b = map32.get(k);
      if ((a?.from || a?.to) !== (b?.from || b?.to)) {
        tokenChanges.push({
          path: (b || a).path,
          before: a ? `${a.from}→${a.to}` : '(none)',
          after: b ? `${b.from}→${b.to}` : '(none)',
        });
      }
    }
    const row = {
      file,
      pool,
      teil,
      v31: { decapFixed: b31.decapFixed, capFixed: b31.capFixed, fieldsChanged: b31.fieldsChanged, source: v31base.map.has(file) ? 'phase1' : 'n/a' },
      v32: {
        decapFixed: r32.stats.decapFixed,
        capFixed: r32.stats.capFixed,
        markdownFixed: r32.stats.markdownFixed || 0,
        fieldsChanged: r32.stats.fieldsChanged,
      },
      deltaDecap,
      deltaCap,
      tokenChanges,
    };
    rows.push(row);

    if (deltaDecap || deltaCap || row.v32.markdownFixed) {
      const bad = tokenChanges.filter(
        (c) => !isExpectedChange(c, teil, { pool, v31Source: row.v31.source, markdownFixed: row.v32.markdownFixed }),
      );
      if (bad.length) {
        unexpected.push({ file, teil, reason: 'token change fuera de patrones AUD', changes: bad });
      }
    }
  }

  const changedRows = rows.filter((r) => r.deltaDecap || r.deltaCap || r.v32.markdownFixed);
  const summary = {
    files: rows.length,
    v31Decap: rows.reduce((n, r) => n + r.v31.decapFixed, 0),
    v32Decap: rows.reduce((n, r) => n + r.v32.decapFixed, 0),
    v31Cap: rows.reduce((n, r) => n + r.v31.capFixed, 0),
    v32Cap: rows.reduce((n, r) => n + r.v32.capFixed, 0),
    v32Markdown: rows.reduce((n, r) => n + r.v32.markdownFixed, 0),
    deltaDecap: rows.reduce((n, r) => n + r.deltaDecap, 0),
    deltaCap: rows.reduce((n, r) => n + r.deltaCap, 0),
    changedFiles: changedRows.length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    v31Version: v31base.version,
    v31Source: v31base.source,
    v32Version: v32.GERMAN_CAPS_NORMALIZE_VERSION,
    summary,
    byTeil: summarizeByTeil(rows),
    changedRows,
    unexpected,
    rows,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outJson = path.join(OUT_DIR, 'V32-HOLDOUT-REGRESSION.json');
  const outMd = path.join(OUT_DIR, 'V32-HOLDOUT-REGRESSION.md');
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outMd, `${renderMarkdown(report)}\n`);

  console.log(renderMarkdown(report));
  console.log(`\nEscrito: ${path.relative(ROOT, outJson)}`);
  if (unexpected.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
