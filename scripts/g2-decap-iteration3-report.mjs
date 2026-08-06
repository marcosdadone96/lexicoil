#!/usr/bin/env node
/**
 * G2 decap-only iteration 3 — dry-run report vs baseline + iteration 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';

const GATE_VERSION = 'v6.1-B-G2 (frozen)';
const POOL_DIR = path.join(ROOT, 'batches/ready/lesen');
const ITER2_JSON = path.join(ROOT, 'batches/ready/G2-DECAP-ONLY-IMPACT.json');
const OUT_JSON = path.join(ROOT, 'batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.json');
const OUT_MD = path.join(ROOT, 'batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.md');

const MODAL_RE = /\b(kann|könnte|könnten|können|muss|müsste|müssten|müssen|soll|sollte|sollten|sollen|will|wollte|wollten|wollen|darf|dürfte|dürften|dürfen|möchte|möchten|mögen|mag)\s+([Kk]osten)\b/g;

const REGRESSION_WORDS = new Set(['alter', 'sorgen', 'kosten']);
const KEEP_FIX_SNIPPETS = [
  { label: 'Ganzen', pattern: /den Ganzen Tag/i, expectDecap: 'ganzen' },
  { label: 'Bessere', pattern: /in Bessere Fahrradwege/i, expectDecap: 'bessere' },
  { label: 'Junge', pattern: /besonders Junge Menschen/i, expectDecap: 'junge' },
  { label: 'Spät', pattern: /zu Spät zurück/i, expectDecap: 'spät' },
];

function listJsonFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.') && /lesen-t\d/i.test(f))
    .map((f) => path.join(dir, f));
}

function teilFromFile(name) {
  const m = name.match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function countBy(arr, fn) {
  const m = {};
  for (const x of arr) m[fn(x)] = (m[fn(x)] || 0) + 1;
  return m;
}

function buildItems(batch, file) {
  return collectStringsFromBatch(batch).map((f, i) => ({
    id: `${file}::${f.field}::${i}`,
    file,
    field: f.field,
    text: f.text,
  }));
}

function runBulk(items) {
  const bulk = runPosCapsBulk(items, { timeoutMs: 300_000 });
  if (bulk.skipped) throw new Error(bulk.warning || 'caps gate skipped');
  return (bulk.findings || []).map((f) => ({ ...f, file: f.file || items.find((it) => it.id === f.id)?.file }));
}

function diffFindings(before, after) {
  const removed = before.filter(
    (bf) => !after.some((af) => af.word === bf.word && af.reason === bf.reason && af.field === bf.field),
  );
  const added = after.filter(
    (af) => !before.some((bf) => bf.word === af.word && bf.reason === bf.reason && bf.field === bf.field),
  );
  return { removed, added };
}

function summarize(findings, fileCount) {
  const byReason = countBy(findings, (f) => f.reason);
  const byTeil = {};
  for (const f of findings) {
    const t = teilFromFile(f.file);
    byTeil[t] = (byTeil[t] || 0) + 1;
  }
  return {
    totalFindings: findings.length,
    avgPerFile: findings.length / fileCount,
    filesWithFindings: new Set(findings.map((f) => f.file)).size,
    byTeil,
    byReason,
  };
}

function collectAllTexts(batch) {
  const texts = [];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(batch);
  return texts;
}

function scanModalKosten(entries) {
  const hits = [];
  for (const { file, batch } of entries) {
    for (const text of collectAllTexts(batch)) {
      MODAL_RE.lastIndex = 0;
      let m;
      while ((m = MODAL_RE.exec(text)) !== null) {
        const ctxStart = Math.max(0, m.index - 30);
        const ctxEnd = Math.min(text.length, m.index + m[0].length + 40);
        const { result } = decapitalizeMidSentence(text);
        const decapChangedKosten = result !== text
          && /kosten\b/i.test(result.slice(m.index, m.index + m[1].length + 8))
          && /Kosten\b/.test(m[0]);
        hits.push({
          file,
          modal: m[1],
          kostenForm: m[2],
          context: text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' '),
          decapWouldLowercaseKosten: decapChangedKosten,
          textUnchangedByDecap: !decapChangedKosten,
        });
      }
    }
  }
  return hits;
}

function mdTable3Col(rows) {
  return [
    '| Métrica | Baseline | Iteration2 | Iteration3 |',
    '|---|---:|---:|---:|',
    ...rows.map(([k, b, i2, i3]) => `| ${k} | ${b} | ${i2} | ${i3} |`),
  ].join('\n');
}

function mdReasonTable(baseline, iter2, iter3) {
  const keys = [...new Set([
    ...Object.keys(baseline || {}),
    ...Object.keys(iter2 || {}),
    ...Object.keys(iter3 || {}),
  ])].sort();
  const lines = ['| Reason | Baseline | Iteration2 | Iteration3 | Δ I2→I3 |', '|---|---:|---:|---:|---:|'];
  for (const k of keys) {
    const b = baseline[k] || 0;
    const i2 = iter2[k] || 0;
    const i3 = iter3[k] || 0;
    lines.push(`| \`${k}\` | ${b} | ${i2} | ${i3} | ${i3 - i2 >= 0 ? '+' : ''}${i3 - i2} |`);
  }
  return lines.join('\n');
}

function mdTeilTable(baseline, iter2, iter3) {
  const teils = [...new Set([
    ...Object.keys(baseline || {}),
    ...Object.keys(iter2 || {}),
    ...Object.keys(iter3 || {}),
  ])].map(Number).sort((a, b) => a - b);
  const lines = ['| Teil | Baseline | Iteration2 | Iteration3 | Δ I2→I3 |', '|---:|---:|---:|---:|---:|'];
  for (const t of teils) {
    const b = baseline[String(t)] ?? baseline[t] ?? 0;
    const i2 = iter2[String(t)] ?? iter2[t] ?? 0;
    const i3 = iter3[String(t)] ?? iter3[t] ?? 0;
    lines.push(`| T${t} | ${b} | ${i2} | ${i3} | ${i3 - i2 >= 0 ? '+' : ''}${i3 - i2} |`);
  }
  return lines.join('\n');
}

async function main() {
  const iter2 = JSON.parse(fs.readFileSync(ITER2_JSON, 'utf8'));
  const filePaths = listJsonFiles(POOL_DIR);
  if (filePaths.length !== 193) console.warn(`Expected 193 files, got ${filePaths.length}`);

  console.log(`Loading ${filePaths.length} batches…`);
  const entries = filePaths.sort().map((abs) => {
    const file = path.basename(abs);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return { file, abs, batch, repaired: applyGermanCapsNormalize(batch, { decapOnly: true }).batch };
  });

  console.log('Running caps gate baseline (bulk)…');
  const beforeItems = entries.flatMap(({ batch, file }) => buildItems(batch, file));
  const allBefore = runBulk(beforeItems);

  console.log('Running caps gate after decap-only (bulk)…');
  const afterItems = entries.flatMap(({ repaired, file }) => buildItems(repaired, file));
  const allAfter = runBulk(afterItems);

  const { removed: removedAll, added: addedAll } = diffFindings(allBefore, allAfter);
  const iter3 = summarize(allAfter, filePaths.length);
  const iter2After = iter2.afterDecapOnly;

  const keepFixChecks = [];
  for (const { file, batch } of entries) {
    for (const check of KEEP_FIX_SNIPPETS) {
      for (const text of collectAllTexts(batch)) {
        if (!check.pattern.test(text)) continue;
        const { result } = decapitalizeMidSentence(text);
        keepFixChecks.push({ label: check.label, file, ok: result.includes(check.expectDecap) });
      }
    }
  }

  const regressionAdded = addedAll.filter((f) => REGRESSION_WORDS.has(String(f.word).toLowerCase()));
  const iter2Added = iter2.findingsAdded || [];
  const iter2Regression = iter2Added.filter((f) => REGRESSION_WORDS.has(String(f.word).toLowerCase()));

  const newReasonCodes = Object.keys(iter3.byReason).filter(
    (k) => !(k in (iter2After.byReason || {})) && iter3.byReason[k] > 0,
  );

  const modalKostenHits = scanModalKosten(entries);
  const modalKostenBroken = modalKostenHits.filter((h) => !h.textUnchangedByDecap);

  const newVsIter2 = addedAll.filter(
    (f) => !iter2Added.some((i2) => i2.word === f.word && i2.reason === f.reason && i2.file === f.file),
  );

  const checks = {
    regressionCasesGone: regressionAdded.length === 0,
    totalFindingsDecreasedVsIter2: iter3.totalFindings < iter2After.totalFindings,
    noNewReasonCodes: newReasonCodes.length === 0,
    keepFixesOk: keepFixChecks.every((c) => c.ok),
    keepFixFailures: keepFixChecks.filter((c) => !c.ok),
    modalKostenBroken,
    unexpectedNewFindings: newVsIter2.filter((f) => !REGRESSION_WORDS.has(String(f.word).toLowerCase())),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    gateVersion: GATE_VERSION,
    poolDir: 'batches/ready/lesen',
    fileCount: filePaths.length,
    baseline: iter2.baseline,
    iteration2: {
      totalFindings: iter2After.totalFindings,
      avgPerFile: iter2After.avgPerFile,
      filesWithFindings: iter2After.filesWithFindings,
      eliminated: (iter2.findingsEliminated || []).length,
      added: iter2Added.length,
      byTeil: iter2After.byTeil,
      byReason: iter2After.byReason,
    },
    iteration3: {
      ...iter3,
      eliminated: removedAll.length,
      added: addedAll.length,
      findingsEliminated: removedAll,
      findingsAdded: addedAll,
    },
    comparison: { deltaIter2ToIter3: iter3.totalFindings - iter2After.totalFindings, checks },
    modalKostenScan: modalKostenHits,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const modalTable = modalKostenHits.length
    ? [
      '| archivo | modal | forma | decap baja Kosten? | contexto |',
      '|---|---|---|---|---|',
      ...modalKostenHits.map((h) => `| \`${h.file}\` | ${h.modal} | ${h.kostenForm} | ${h.decapWouldLowercaseKosten ? 'SÍ ⚠' : 'no ✓'} | ${h.context.slice(0, 80)} |`),
    ].join('\n')
    : '_Sin ocurrencias._';

  const md = [
    '# G2 decap-only — Iteration 3 results',
    '',
    `**Gate:** ${GATE_VERSION} (sin modificar)`,
    '**Pool:** `batches/ready/lesen` · 193 archivos',
    `**Generado:** ${report.generatedAt}`,
    '',
    '## Comparación global',
    '',
    mdTable3Col([
      ['Findings totales', iter2.baseline.totalFindings, iter2After.totalFindings, iter3.totalFindings],
      ['Eliminados (vs baseline)', '—', (iter2.findingsEliminated || []).length, removedAll.length],
      ['Nuevos (vs baseline)', '—', iter2Added.length, addedAll.length],
      ['avg/file', iter2.baseline.avgPerFile.toFixed(3), iter2After.avgPerFile.toFixed(3), iter3.avgPerFile.toFixed(3)],
      ['Archivos con findings', iter2.baseline.filesWithFindings, iter2After.filesWithFindings, iter3.filesWithFindings],
    ]),
    '',
    '## Por Teil',
    '',
    mdTeilTable(iter2.baseline.byTeil, iter2After.byTeil, iter3.byTeil),
    '',
    '## Reason codes',
    '',
    mdReasonTable(iter2.baseline.byReason, iter2After.byReason, iter3.byReason),
    '',
    '## Iteration2 vs Iteration3 — verificación',
    '',
    '| Check | Resultado |',
    '|---|---|',
    `| Desaparecen Alter/Sorgen/Kosten en findingsAdded | ${checks.regressionCasesGone ? '✓ PASS' : '✗ FAIL'} (${regressionAdded.length} restantes) |`,
    `| Findings totales < Iteration2 (${iter2After.totalFindings} → ${iter3.totalFindings}, Δ ${report.comparison.deltaIter2ToIter3}) | ${checks.totalFindingsDecreasedVsIter2 ? '✓ PASS' : '✗ FAIL'} |`,
    `| Sin nuevos reason codes vs Iter2 | ${checks.noNewReasonCodes ? '✓ PASS' : '✗ FAIL'} |`,
    `| Ganzen/Bessere/Junge/Spät siguen decapándose | ${checks.keepFixesOk ? '✓ PASS' : '✗ FAIL'} |`,
    '',
    '### Regresiones Iter2 corregidas',
    '',
    iter2Regression.map((f) => {
      const still = regressionAdded.some((r) => r.file === f.file && r.word.toLowerCase() === f.word.toLowerCase());
      return `- \`${f.file}\`: \`${f.word}\` / \`${f.reason}\` → ${still ? 'AÚN presente ✗' : 'ausente ✓'}`;
    }).join('\n'),
    '',
    '### Fixes conservados',
    '',
    ...KEEP_FIX_SNIPPETS.map(({ label }) => {
      const rows = keepFixChecks.filter((c) => c.label === label);
      return `- **${label}**: ${rows.every((r) => r.ok) ? '✓' : '✗'} (${rows.length} ocurrencia(s))`;
    }),
    '',
    '## Escaneo modal + Kosten/kosten (193 archivos)',
    '',
    `Ocurrencias: **${modalKostenHits.length}**`,
    '',
    modalTable,
    '',
    modalKostenBroken.length
      ? `⚠ **${modalKostenBroken.length}** caso(s) con decap incorrecta sobre Kosten.`
      : '✓ Ningún modal+Kosten capitalizado fue incorrectamente decapitalizado.',
    '',
    newReasonCodes.length ? `## ⚠ Nuevos reason codes\n\n${newReasonCodes.map((r) => `- \`${r}\``).join('\n')}` : '',
    checks.unexpectedNewFindings.length
      ? `## Findings nuevos vs Iter2 (no esperados)\n\n${checks.unexpectedNewFindings.map((f) => `- \`${f.file}\`: \`${f.word}\` / \`${f.reason}\``).join('\n')}`
      : '',
    '',
    '## Patch aplicado (Iteration 3)',
    '',
    '1. Carga de `german-noun-supplement.json` en `buildLexicon()`',
    "2. Eliminación de `'alter'` de `ADJ_NEEDS_ARTICLE_GUARD`",
    '3. Guard modal: `isKnownGermanNoun(word) && nextWord ∈ MODAL_NOUN_OBJECT_PREPS` → no decap',
    '',
    '## Artefactos',
    '',
    '- `G2-DECAP-ONLY-ITERATION3-RESULTS.json`',
    '- `G2-DECAP-ONLY-IMPACT.json` (Iteration 2 ref)',
  ].filter(Boolean).join('\n');

  fs.writeFileSync(OUT_MD, `${md}\n`, 'utf8');

  console.log('\n── Iteration 3 ──');
  console.log(`Findings: baseline ${iter2.baseline.totalFindings} · iter2 ${iter2After.totalFindings} · iter3 ${iter3.totalFindings}`);
  console.log(`Added vs baseline: iter2 ${iter2Added.length} · iter3 ${addedAll.length}`);
  console.log(`Regression words in added: ${regressionAdded.length}`);
  console.log(`Report: ${OUT_MD}`);

  if (!checks.regressionCasesGone || !checks.totalFindingsDecreasedVsIter2 || !checks.noNewReasonCodes || !checks.keepFixesOk || modalKostenBroken.length) {
    console.error('\n⚠ CHECKS FAILED');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
