#!/usr/bin/env node
/**
 * One-off: validate germanCapsNormalize v3.0-stable on last 15 generated batches.
 * Does NOT modify source files or production code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../../scripts/lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from '../../scripts/lib/germanCapsGate.mjs';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from '../../scripts/lib/germanCapsNormalize.mjs';
import {
  ADJ_NEEDS_ARTICLE_GUARD,
  SUBSTANTIVISING_ARTICLES,
  HOMOGRAPH_RISK,
  DECAP_TRIGGER_PREV,
  MODAL_VERBS,
  isModalInfinitiveOvercapitalized,
  isHeuristicAdjAdvOvercapitalized,
  isKnownGermanNoun,
  fixZuInfinitiveCapitals,
} from '../../scripts/lib/capitalizeNouns.mjs';

const GATE = 'v6.1-B-G2 (frozen)';
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const OUT_JSON = path.join(ROOT, 'batches/ready/V3-PRODUCTION-15-GENERATED.json');
const OUT_MD = path.join(ROOT, 'batches/ready/V3-PRODUCTION-15-GENERATED.md');
const V3_DATE = new Date('2026-07-08T14:00:00.000Z'); // consolidation ~15:43 local; files before this

const TOKEN_RE = /([A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*)|([^A-Za-zÄÖÜäöüß]+)/g;

function tokenLemma(w) {
  return String(w || '').toLowerCase().replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/gi, '');
}

function tokenize(text) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out.push({ token: m[0], isWord: /[A-Za-zÄÖÜäöüß]/.test(m[0]) });
  }
  return out;
}

function nextWordFrom(chunks, idx) {
  for (let j = idx + 1; j < chunks.length; j++) {
    if (chunks[j].isWord) return chunks[j].token;
  }
  return '';
}

function inferDecapRule(text, fromToken) {
  const chunks = tokenize(text);
  for (let idx = 0; idx < chunks.length; idx++) {
    const { token, isWord } = chunks[idx];
    if (!isWord || token !== fromToken) continue;
    const lastWord = (() => {
      for (let j = idx - 1; j >= 0; j--) {
        if (chunks[j].isWord) return chunks[j].token;
      }
      return '';
    })();
    const nextWord = nextWordFrom(chunks, idx);
    if (SUBSTANTIVISING_ARTICLES.has(tokenLemma(lastWord)) && ADJ_NEEDS_ARTICLE_GUARD.has(tokenLemma(token))) {
      return 'decap_adj_after_article';
    }
    if (isModalInfinitiveOvercapitalized(token, lastWord, nextWord)) return 'decap_modal_infinitive';
    if (isHeuristicAdjAdvOvercapitalized(token, lastWord)) return 'decap_heuristic_adj_adv';
    const lc = tokenLemma(token);
    if (HOMOGRAPH_RISK.has(lc) && DECAP_TRIGGER_PREV.has(tokenLemma(lastWord)) && !isKnownGermanNoun(token)) {
      return 'decap_homograph';
    }
    const zu = fixZuInfinitiveCapitals(text);
    if (zu.result !== text && zu.result.includes(`${fromToken.toLowerCase()}`)) return 'decap_zu_infinitive';
    return 'decap_other';
  }
  return 'cap_noun_or_other';
}

function inferRule(textOriginal, fromToken, toToken) {
  if (fromToken === toToken) return 'unchanged';
  if (fromToken.toLowerCase() === toToken && fromToken !== toToken) {
    return inferDecapRule(textOriginal, fromToken);
  }
  if (toToken[0] === toToken[0].toUpperCase() && fromToken === fromToken.toLowerCase()) return 'cap_noun';
  return 'other';
}

function countBy(arr, fn) {
  const m = {};
  for (const x of arr) m[fn(x)] = (m[fn(x)] || 0) + 1;
  return m;
}

function runGate(batch, file) {
  const fields = collectStringsFromBatch(batch);
  const items = fields.map((f, i) => ({
    id: `${file}::${f.field}::${i}`,
    file,
    field: f.field,
    text: f.text,
  }));
  const bulk = runPosCapsBulk(items, { timeoutMs: 300_000 });
  if (bulk.skipped) throw new Error(bulk.warning || 'gate skipped');
  return bulk.findings || [];
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

function walkBatch(batch, visitor, prefix = '') {
  (batch.passages || []).forEach((p, pi) => {
    const base = `${prefix}passages[${pi}]`;
    if (typeof p.text === 'string') visitor(`${base}.text`, p.text);
    if (typeof p.title === 'string') visitor(`${base}.title`, p.title);
    if (typeof p.transcript === 'string') visitor(`${base}.transcript`, p.transcript);
    if (Array.isArray(p.ads)) p.ads.forEach((ad, ai) => { if (typeof ad === 'string') visitor(`${base}.ads[${ai}]`, ad); });
    if (Array.isArray(p.audio)) {
      p.audio.forEach((turn, ti) => {
        if (turn?.text) visitor(`${base}.audio[${ti}].text`, turn.text);
      });
    }
  });
  (batch.questions || []).forEach((q, qi) => {
    const base = `${prefix}questions[${qi}]`;
    for (const key of ['question', 'signText', 'explanation', 'statement']) {
      if (typeof q[key] === 'string') visitor(`${base}.${key}`, q[key]);
    }
    if (Array.isArray(q.options)) {
      q.options.forEach((opt, oi) => {
        if (typeof opt === 'string') visitor(`${base}.options[${oi}]`, opt);
        else if (opt?.text) visitor(`${base}.options[${oi}].text`, opt.text);
      });
    }
  });
}

function diffFieldTokens(before, after) {
  const bt = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(before)) !== null) bt.push(m[0]);
  const at = [];
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(after)) !== null) at.push(m[0]);
  const changes = [];
  if (bt.length === at.length) {
    for (let i = 0; i < bt.length; i++) {
      if (bt[i] !== at[i]) changes.push({ from: bt[i], to: at[i] });
    }
  } else {
    changes.push({ from: before.slice(0, 80), to: after.slice(0, 80), rewrite: true });
  }
  return changes;
}

function classifyChange(change, removed, added, field) {
  const fieldRemoved = removed.filter((f) => f.field === field);
  const fieldAdded = added.filter((f) => f.field === field);
  if (fieldAdded.length && !fieldRemoved.length) return 'posible regresión';
  if (fieldRemoved.length && !fieldAdded.length) return 'corrección esperada';
  if (fieldRemoved.length && fieldAdded.length) return 'cambio neutro';
  if (change.rewrite) return 'cambio neutro';
  return 'cambio neutro';
}

function selectLast15BeforeV3() {
  const files = fs.readdirSync(GENERATED_DIR)
    .filter((f) => /^lesen-t\d.*\.json$/i.test(f))
    .map((f) => {
      const abs = path.join(GENERATED_DIR, f);
      const st = fs.statSync(abs);
      return { file: f, abs, mtime: st.mtimeMs, mtimeIso: st.mtime.toISOString() };
    })
    .filter((x) => x.mtime < V3_DATE.getTime())
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15);
  return files;
}

function mdReasonTable(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return ['| Reason | Antes | Después | Δ |', '|---|---:|---:|---:|',
    ...keys.map((k) => {
      const b = before[k] || 0;
      const a = after[k] || 0;
      return `| \`${k}\` | ${b} | ${a} | ${a - b >= 0 ? '+' : ''}${a - b} |`;
    })].join('\n');
}

async function main() {
  const selected = selectLast15BeforeV3();
  if (selected.length < 15) console.warn(`Only ${selected.length} files before v3 cutoff`);

  const allBefore = [];
  const allAfter = [];
  const fileReports = [];
  const allChanges = [];

  console.log(`Validating ${selected.length} files · ${GERMAN_CAPS_NORMALIZE_VERSION}`);

  for (const { file, abs, mtimeIso } of selected) {
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const beforeF = runGate(batch, file);
    const { batch: normalized, stats, changes } = applyGermanCapsNormalize(batch);
    const afterF = runGate(normalized, file);
    const { removed, added } = diffFindings(beforeF, afterF);

    allBefore.push(...beforeF);
    allAfter.push(...afterF);

    const beforeMap = new Map();
    walkBatchStringsCollect(batch, beforeMap);
    const fieldChanges = [];
    walkBatch(normalized, (p, afterText) => {
      const beforeText = beforeMap.get(p);
      if (beforeText == null || beforeText === afterText) return;
      const tokenChanges = diffFieldTokens(beforeText, afterText);
      for (const tc of tokenChanges) {
        const rule = tc.rewrite ? 'rewrite' : inferRule(beforeText, tc.from, tc.to);
        const classification = classifyChange(tc, removed, added, p);
        const entry = {
          file,
          field: p,
          textOriginal: beforeText.length > 200 ? `${beforeText.slice(0, 200)}…` : beforeText,
          textCorrected: afterText.length > 200 ? `${afterText.slice(0, 200)}…` : afterText,
          tokenFrom: tc.from,
          tokenTo: tc.to,
          ruleApplied: rule,
          classification,
        };
        fieldChanges.push(entry);
        allChanges.push(entry);
      }
    });

    fileReports.push({
      file,
      mtime: mtimeIso,
      beforeFindings: beforeF.length,
      afterFindings: afterF.length,
      delta: afterF.length - beforeF.length,
      normalize: stats,
      removedFindings: removed,
      addedFindings: added,
      changes: fieldChanges,
    });
    console.log(`  ${file}: ${beforeF.length}→${afterF.length} · fields=${stats.fieldsChanged}`);
  }

  const removedAll = diffFindings(allBefore, allAfter).removed;
  const addedAll = diffFindings(allBefore, allAfter).added;

  const report = {
    generatedAt: new Date().toISOString(),
    normalizeVersion: GERMAN_CAPS_NORMALIZE_VERSION,
    gateVersion: GATE,
    selectionCriteria: '15 most recent lesen-t*.json in batches/generated with mtime before v3.0-stable consolidation',
    v3Cutoff: V3_DATE.toISOString(),
    sourceDir: 'batches/generated',
    files: selected.map((s) => ({ file: s.file, mtime: s.mtimeIso })),
    summary: {
      fileCount: selected.length,
      beforeFindings: allBefore.length,
      afterFindings: allAfter.length,
      deltaFindings: allAfter.length - allBefore.length,
      eliminated: removedAll.length,
      added: addedAll.length,
      beforeByReason: countBy(allBefore, (f) => f.reason),
      afterByReason: countBy(allAfter, (f) => f.reason),
      filesWithChanges: fileReports.filter((f) => f.normalize.fieldsChanged > 0).length,
      changesByClassification: countBy(allChanges, (c) => c.classification),
      changesByRule: countBy(allChanges, (c) => c.ruleApplied),
    },
    findingsEliminated: removedAll,
    findingsAdded: addedAll,
    fileReports,
    simulatedChanges: allChanges,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const regressions = addedAll;
  const md = [
    '# v3.0-stable — validación producción (15 generados)',
    '',
    `**Normalización:** \`${GERMAN_CAPS_NORMALIZE_VERSION}\` (full pipeline, dry-run)`,
    `**Gate:** ${GATE}`,
    `**Origen:** \`batches/generated\` · 15 archivos más recientes **antes** de v3 (${V3_DATE.toISOString().slice(0, 10)})`,
    `**Generado:** ${report.generatedAt}`,
    '',
    '## Archivos seleccionados',
    '',
    '| # | archivo | mtime |',
    '|---:|---|---|',
    ...selected.map((s, i) => `| ${i + 1} | \`${s.file}\` | ${s.mtimeIso} |`),
    '',
    '## Resumen antes / después',
    '',
    '| Métrica | Antes | Después | Δ |',
    '|---|---:|---:|---:|',
    `| Findings totales | ${report.summary.beforeFindings} | ${report.summary.afterFindings} | ${report.summary.deltaFindings >= 0 ? '+' : ''}${report.summary.deltaFindings} |`,
    `| Findings eliminados | — | — | ${report.summary.eliminated} |`,
    `| Findings nuevos | — | — | ${report.summary.added} |`,
    `| Archivos con cambios de texto | — | — | ${report.summary.filesWithChanges} |`,
    '',
    '## Reason codes',
    '',
    mdReasonTable(report.summary.beforeByReason, report.summary.afterByReason),
    '',
    '## Clasificación de cambios',
    '',
    '| Clasificación | Token changes |',
    '|---|---:|',
    ...Object.entries(report.summary.changesByClassification).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Reglas aplicadas',
    '',
    '| Regla | Cambios |',
    '|---|---:|',
    ...Object.entries(report.summary.changesByRule).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} |`),
    '',
    regressions.length
      ? `## ⚠ Findings nuevos (${regressions.length})\n\n${regressions.map((f) => `- \`${f.file}\` · \`${f.word}\` / \`${f.reason}\` · ${f.field}`).join('\n')}`
      : '## Findings nuevos\n\n_Ninguno._',
    '',
    '## Findings eliminados',
    '',
    removedAll.length
      ? removedAll.map((f) => `- \`${f.file}\`: \`${f.word}\` / \`${f.reason}\` (${f.field})`).join('\n')
      : '_Ninguno._',
    '',
    '## Ejemplos de cambios (muestra)',
    '',
    '| archivo | clasificación | regla | original (extracto) | corregido (extracto) |',
    '|---|---|---|---|---|',
    ...allChanges.slice(0, 25).map((c) =>
      `| \`${c.file}\` | ${c.classification} | \`${c.ruleApplied}\` | ${c.tokenFrom}→${c.tokenTo} en \`${c.field}\` | ${String(c.textCorrected).slice(0, 60).replace(/\|/g, '/')} |`),
    '',
    '## Por archivo',
    '',
    ...fileReports.filter((f) => f.delta !== 0 || f.normalize.fieldsChanged > 0).map((f) =>
      `### \`${f.file}\` — caps ${f.beforeFindings}→${f.afterFindings} · ${f.normalize.fieldsChanged} campo(s)\n${
        f.changes.slice(0, 5).map((c) =>
          `- **${c.classification}** · \`${c.ruleApplied}\`: \`${c.tokenFrom}\`→\`${c.tokenTo}\` (${c.field})`).join('\n') || '_sin cambios token_'
      }`),
    '',
    `JSON: \`V3-PRODUCTION-15-GENERATED.json\``,
  ].join('\n');

  fs.writeFileSync(OUT_MD, `${md}\n`, 'utf8');
  console.log(`\nFindings: ${report.summary.beforeFindings} → ${report.summary.afterFindings}`);
  console.log(`Eliminados: ${report.summary.eliminated} · Nuevos: ${report.summary.added}`);
  console.log(`Report: ${OUT_MD}`);
}

function walkBatchStringsCollect(batch, map) {
  walkBatch(batch, (p, v) => map.set(p, v));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
