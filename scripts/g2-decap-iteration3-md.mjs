#!/usr/bin/env node
/** Generate G2-DECAP-ONLY-ITERATION3-RESULTS.md from dry-run JSON + Iter2 ref. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';

const ITER2 = path.join(ROOT, 'batches/ready/G2-DECAP-ONLY-IMPACT.json');
const ITER3 = path.join(ROOT, 'batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.json');
const OUT_MD = path.join(ROOT, 'batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.md');
const POOL = path.join(ROOT, 'batches/ready/lesen');

const MODAL_RE = /\b(kann|könnte|könnten|können|muss|müsste|müssten|müssen|soll|sollte|sollten|sollen|will|wollte|wollten|wollen|darf|dürfte|dürften|dürfen|möchte|möchten|mögen|mag)\s+([Kk]osten)\b/g;
const REGRESSION = new Set(['alter', 'sorgen', 'kosten']);

function md3(rows) {
  return ['| Métrica | Baseline | Iteration2 | Iteration3 |', '|---|---:|---:|---:|',
    ...rows.map(([k, b, i2, i3]) => `| ${k} | ${b} | ${i2} | ${i3} |`)].join('\n');
}

function mdReason(b, i2, i3) {
  const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(i2 || {}), ...Object.keys(i3 || {})])].sort();
  return ['| Reason | Baseline | Iteration2 | Iteration3 | Δ I2→I3 |', '|---|---:|---:|---:|---:|',
    ...keys.map((k) => {
      const bv = b[k] || 0; const v2 = i2[k] || 0; const v3 = i3[k] || 0;
      return `| \`${k}\` | ${bv} | ${v2} | ${v3} | ${v3 - v2 >= 0 ? '+' : ''}${v3 - v2} |`;
    })].join('\n');
}

function mdTeil(b, i2, i3) {
  const teils = [...new Set([...Object.keys(b || {}), ...Object.keys(i2 || {}), ...Object.keys(i3 || {})])].map(Number).sort((a, c) => a - c);
  return ['| Teil | Baseline | Iteration2 | Iteration3 | Δ I2→I3 |', '|---:|---:|---:|---:|---:|',
    ...teils.map((t) => {
      const bv = b[String(t)] ?? b[t] ?? 0; const v2 = i2[String(t)] ?? i2[t] ?? 0; const v3 = i3[String(t)] ?? i3[t] ?? 0;
      return `| T${t} | ${bv} | ${v2} | ${v3} | ${v3 - v2 >= 0 ? '+' : ''}${v3 - v2} |`;
    })].join('\n');
}

function scanModalKosten() {
  const hits = [];
  for (const f of fs.readdirSync(POOL).filter((x) => /lesen-t\d.*\.json$/i.test(x))) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
    const walk = (v) => {
      if (typeof v === 'string') {
        MODAL_RE.lastIndex = 0;
        let m;
        while ((m = MODAL_RE.exec(v)) !== null) {
          const { result } = decapitalizeMidSentence(v);
          const broken = result !== v && /kosten\b/.test(result.slice(m.index, m.index + 20)) && /Kosten/.test(m[0]);
          hits.push({ file: f, modal: m[1], kostenForm: m[2], broken, ctx: v.slice(Math.max(0, m.index - 25), m.index + m[0].length + 35).replace(/\s+/g, ' ') });
        }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(batch);
  }
  return hits;
}

function main() {
  const iter2 = JSON.parse(fs.readFileSync(ITER2, 'utf8'));
  const iter3raw = JSON.parse(fs.readFileSync(ITER3, 'utf8'));
  const s = iter3raw.summary;
  const b = iter2.baseline;
  const i2 = iter2.afterDecapOnly;

  const added = iter3raw.files.flatMap((f) => f.addedFindings || f.removedFindings && [] || []);
  // repair script uses removedFindings/addedFindings
  const allAdded = [];
  const allRemoved = [];
  for (const fr of iter3raw.files || []) {
    allAdded.push(...(fr.addedFindings || []));
    allRemoved.push(...(fr.removedFindings || []));
  }

  const addedFromSummary = iter3raw.files?.reduce((n, f) => n + (f.addedFindings?.length || 0), 0) ?? 0;
  const removedFromSummary = iter3raw.files?.reduce((n, f) => n + (f.removedFindings?.length || 0), 0) ?? 0;

  const iter3Added = allAdded.length ? allAdded : (iter3raw.findingsAdded || []);
  const iter3Removed = allRemoved.length ? allRemoved : (iter3raw.findingsEliminated || []);
  const iter3Total = s?.afterFindings ?? iter3raw.iteration3?.totalFindings ?? 0;
  const iter3ByReason = s?.afterByReason ?? iter3raw.iteration3?.byReason ?? {};
  const iter3ByTeil = {};
  for (const [t, v] of Object.entries(iter3raw.byTeil || {})) {
    iter3ByTeil[t] = v.after;
  }

  const iter2Added = iter2.findingsAdded || [];
  const regressionIter3 = iter3Added.filter((f) => REGRESSION.has(String(f.word).toLowerCase()));
  const iter2Regression = iter2Added.filter((f) => REGRESSION.has(String(f.word).toLowerCase()));
  const newReasons = Object.keys(iter3ByReason).filter((k) => !(k in (i2.byReason || {})) && iter3ByReason[k] > 0);
  const modalHits = scanModalKosten();
  const modalBroken = modalHits.filter((h) => h.broken);

  const KEEP = [
    { label: 'Ganzen', pattern: /den Ganzen Tag/i, expect: 'ganzen' },
    { label: 'Bessere', pattern: /in Bessere Fahrradwege/i, expect: 'bessere' },
    { label: 'Junge', pattern: /besonders Junge Menschen/i, expect: 'junge' },
    { label: 'Spät', pattern: /zu Spät zurück/i, expect: 'spät' },
  ];
  const keepFixChecks = [];
  for (const f of fs.readdirSync(POOL).filter((x) => /lesen-t\d.*\.json$/i.test(x))) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
    const walk = (v) => {
      if (typeof v === 'string') {
        for (const c of KEEP) {
          if (!c.pattern.test(v)) continue;
          const { result } = decapitalizeMidSentence(v);
          keepFixChecks.push({ label: c.label, file: f, ok: result.includes(c.expect) });
        }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(batch);
  }

  const checks = {
    regressionGone: regressionIter3.length === 0,
    totalDown: iter3Total < i2.totalFindings,
    noNewReasons: newReasons.length === 0,
    modalOk: modalBroken.length === 0,
    keepFixesOk: keepFixChecks.every((c) => c.ok),
  };

  const md = [
    '# G2 decap-only — Iteration 3 results',
    '',
    '**Gate:** v6.1-B-G2 (frozen)',
    '**Pool:** `batches/ready/lesen` · 193 archivos',
    `**Generado:** ${new Date().toISOString()}`,
    '',
    '## Comparación global',
    '',
    md3([
      ['Findings totales', b.totalFindings, i2.totalFindings, iter3Total],
      ['Eliminados (vs baseline)', '—', (iter2.findingsEliminated || []).length, iter3Removed.length || removedFromSummary],
      ['Nuevos (vs baseline)', '—', iter2Added.length, iter3Added.length || addedFromSummary],
      ['avg/file', b.avgPerFile.toFixed(3), i2.avgPerFile.toFixed(3), (iter3Total / 193).toFixed(3)],
      ['Archivos con findings', b.filesWithFindings, i2.filesWithFindings, s?.afterFilesWithFindings ?? '—'],
    ]),
    '',
    '## Por Teil',
    '',
    mdTeil(b.byTeil, i2.byTeil, Object.keys(iter3ByTeil).length ? iter3ByTeil : iter3raw.iteration3?.byTeil),
    '',
    '## Reason codes',
    '',
    mdReason(b.byReason, i2.byReason, iter3ByReason),
    '',
    '## Verificación Iter2 → Iter3',
    '',
    '| Check | Resultado |',
    '|---|---|',
    `| Alter/Sorgen/Kosten ausentes en added | ${checks.regressionGone ? '✓ PASS' : '✗ FAIL'} (${regressionIter3.length} restantes) |`,
    `| Findings totales bajan (${i2.totalFindings} → ${iter3Total}) | ${checks.totalDown ? '✓ PASS' : '✗ FAIL'} |`,
    `| Sin nuevos reason codes | ${checks.noNewReasons ? '✓ PASS' : '✗ FAIL'} |`,
    `| Modal+Kosten no decapitalizados | ${checks.modalOk ? '✓ PASS' : '✗ FAIL'} |
| Ganzen/Bessere/Junge/Spät siguen decapándose | ${checks.keepFixesOk ? '✓ PASS' : '✗ FAIL'} |`,
    '',
    '### Regresiones Iter2 corregidas',
    '',
    ...iter2Regression.map((f) => {
      const still = regressionIter3.some((r) => r.file === f.file && r.word.toLowerCase() === f.word.toLowerCase());
      return `- \`${f.file}\`: \`${f.word}\` / \`${f.reason}\` → ${still ? 'AÚN ✗' : 'ausente ✓'}`;
    }),
    '',
    '### Fixes conservados (Ganzen, Bessere, Junge, Spät)',
    '',
    ...KEEP.map(({ label }) => {
      const rows = keepFixChecks.filter((c) => c.label === label);
      return `- **${label}**: ${rows.every((r) => r.ok) ? '✓' : '✗'} (${rows.length} ocurrencia(s) en corpus)`;
    }),
    '',
    iter3Added.length === 0
      ? '_Iteration3: **0 findings nuevos** vs baseline (los 2 swaps de Iter2 ya no cuentan como added)._'
      : '',
    '',
    '## Escaneo modal + Kosten/kosten',
    '',
    `Ocurrencias: **${modalHits.length}**`,
    '',
    modalHits.length ? ['| archivo | modal | forma | decap incorrecta? | contexto |', '|---|---|---|---|---|',
      ...modalHits.map((h) => `| \`${h.file}\` | ${h.modal} | ${h.kostenForm} | ${h.broken ? 'SÍ ✗' : 'no ✓'} | ${h.ctx.slice(0, 70)} |`)].join('\n') : '_Sin ocurrencias._',
    '',
    '## Patch Iteration 3',
    '',
    '1. `german-noun-supplement.json` cargado en `buildLexicon()`',
    "2. `'alter'` eliminado de `ADJ_NEEDS_ARTICLE_GUARD`",
    '3. Guard modal: known noun + prep objeto → no decap',
  ].join('\n');

  fs.writeFileSync(OUT_MD, `${md}\n`, 'utf8');
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Iter3 findings: ${iter3Total} (iter2: ${i2.totalFindings})`);
  console.log(`Regression in added: ${regressionIter3.length}`);
  if (!checks.regressionGone || !checks.totalDown) process.exitCode = 1;
}

main();
