#!/usr/bin/env node
/**
 * Reproceso completo backlog Hören (batches/generated/).
 *   node scripts/reprocess-horen-backlog.mjs [--dry-run]
 *
 * Aplica: collapseIdenticalPassages → applyGermanCapsNormalize (markdown+decap+cap)
 * Q4 audit-only. Escribe reporte literal de cambios.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { collapseIdenticalPassages } from './lib/normalizeBatch.mjs';
import { runMetadataSchemaGate } from './lib/qualityGates/metadataSchemaGate.mjs';
import { runPassageCoherenceGate } from './lib/qualityGates/passageCoherenceGate.mjs';

const GEN = path.join(ROOT, 'batches/generated');
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const OUT_JSON = path.join(LOG_DIR, 'horen-backlog-reprocess-report.json');
const OUT_MD = path.join(ROOT, 'batches/ready/HOREN-BACKLOG-REPROCESS.md');

const SESSION_VERIFIED = new Set([
  'horen-t2-gemini-016.json',
  'horen-t2-gemini-017.json',
  'horen-t2-gemini-020.json',
  'horen-t2-gemini-021.json',
  'horen-t2-gemini-022.json',
  'horen-t2-gemini-023.json',
]);

const KNOWN_TOPIC_MISMATCHES = [
  { file: 'horen-t1-gemini-013.json', tag: 'Arbeit', hint: 's1' },
  { file: 'horen-t1-gemini-013.json', tag: 'Technik', hint: 's2' },
  { file: 'horen-t1-gemini-012.json', tag: 'Wohnen', hint: 's4' },
  { file: 'horen-t1-gemini-011.json', tag: 'Konsum', hint: 's1' },
  { file: 'horen-t1-gemini-011.json', tag: 'Freizeit', hint: 's4' },
];

const DRY = process.argv.includes('--dry-run');

function listHorenFiles() {
  return fs
    .readdirSync(GEN)
    .filter((f) => /^horen-t[1-4]-.*\.json$/i.test(f))
    .sort()
    .map((f) => {
      const m = f.match(/horen-t([1-4])-/i);
      return {
        file: f,
        teil: m ? Number(m[1]) : 0,
        abs: path.join(GEN, f),
        sessionVerified: SESSION_VERIFIED.has(f),
      };
    });
}

function walkStrings(batch, visitor) {
  (batch.passages || []).forEach((p, pi) => {
    const base = `passages[${pi}]`;
    for (const key of ['text', 'title', 'transcript']) {
      if (typeof p[key] === 'string') visitor(`${base}.${key}`, p[key]);
    }
    if (Array.isArray(p.audio)) {
      p.audio.forEach((turn, ti) => {
        if (turn?.text) visitor(`${base}.audio[${ti}].text`, turn.text);
      });
    }
  });
  (batch.questions || []).forEach((q, qi) => {
    const base = `questions[${qi}]`;
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

function collectMap(batch) {
  const map = new Map();
  walkStrings(batch, (p, v) => map.set(p, v));
  return map;
}

function snippet(s, max = 120) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function fieldDiffs(beforeBatch, afterBatch) {
  const before = collectMap(beforeBatch);
  const after = collectMap(afterBatch);
  const paths = new Set([...before.keys(), ...after.keys()]);
  const diffs = [];
  for (const p of [...paths].sort()) {
    const a = before.get(p);
    const b = after.get(p);
    if (a === b) continue;
    diffs.push({
      field: p,
      before: a == null ? null : snippet(a, 160),
      after: b == null ? null : snippet(b, 160),
      beforeFull: a ?? null,
      afterFull: b ?? null,
    });
  }
  return diffs;
}

function isKnownMismatch(file, finding) {
  return KNOWN_TOPIC_MISMATCHES.some(
    (k) =>
      k.file === file &&
      finding.span === k.tag &&
      (finding.detail.includes(k.hint) || finding.detail.includes(`-${k.hint}`)),
  );
}

function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const files = listHorenFiles();

  const inventory = { 1: [], 2: [], 3: [], 4: [] };
  for (const e of files) inventory[e.teil].push(e.file);

  console.log('══ Inventario Hören batches/generated/ ══');
  for (const t of [1, 2, 3, 4]) {
    const all = inventory[t];
    const verified = all.filter((f) => SESSION_VERIFIED.has(f));
    console.log(
      `T${t}: ${all.length} total · ${verified.length} session-verified · ${all.length - verified.length} resto`,
    );
  }
  console.log(`TOTAL: ${files.length}`);
  if (DRY) console.log('(dry-run — no escribe)');

  const changeRows = [];
  const byTeil = {
    1: { scanned: 0, overwritten: 0, collapse: 0, markdown: 0, decap: 0, cap: 0 },
    2: { scanned: 0, overwritten: 0, collapse: 0, markdown: 0, decap: 0, cap: 0 },
    3: { scanned: 0, overwritten: 0, collapse: 0, markdown: 0, decap: 0, cap: 0 },
    4: { scanned: 0, overwritten: 0, collapse: 0, markdown: 0, decap: 0, cap: 0 },
  };
  const literalChanges = []; // {file, field, before, after, kind}
  const collapseEvents = [];

  for (const e of files) {
    const raw = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const beforePassages = (raw.passages || []).length;
    const collapsed = collapseIdenticalPassages(structuredClone(raw));
    const afterPassages = (collapsed.passages || []).length;
    const collapsedN = beforePassages - afterPassages;
    if (collapsedN > 0) {
      collapseEvents.push({
        file: e.file,
        teil: e.teil,
        before: beforePassages,
        after: afterPassages,
        dropped: (raw.passages || [])
          .map((p) => p.id)
          .filter((id) => !(collapsed.passages || []).some((p) => p.id === id)),
      });
    }

    const { batch, stats, changes: tokenChanges } = applyGermanCapsNormalize(collapsed, {
      // Same policy as Lesen live re-pass: markdown + decap only.
      // Full capitalizeNouns introduces FPs on Hören (Rechtliche, Bisschen, Positiven…).
      decapOnly: true,
    });
    const diffs = fieldDiffs(raw, batch);
    const changed = diffs.length > 0 || collapsedN > 0;

    byTeil[e.teil].scanned++;
    byTeil[e.teil].markdown += stats.markdownFixed || 0;
    byTeil[e.teil].decap += stats.decapFixed || 0;
    byTeil[e.teil].cap += stats.capFixed || 0;
    if (collapsedN > 0) byTeil[e.teil].collapse += collapsedN;

    if (changed) {
      byTeil[e.teil].overwritten++;
      if (!DRY) {
        fs.writeFileSync(e.abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
      }
      for (const d of diffs) {
        literalChanges.push({
          file: e.file,
          teil: e.teil,
          field: d.field,
          before: d.before,
          after: d.after,
          kind: 'caps_or_markdown',
          sessionVerified: e.sessionVerified,
        });
      }
      if (collapsedN > 0) {
        literalChanges.push({
          file: e.file,
          teil: e.teil,
          field: 'passages[]',
          before: `${beforePassages} passages`,
          after: `${afterPassages} passages (collapsed identical text)`,
          kind: 'collapse_duplicate',
          sessionVerified: e.sessionVerified,
        });
      }
    }

    changeRows.push({
      file: e.file,
      teil: e.teil,
      sessionVerified: e.sessionVerified,
      overwritten: changed,
      collapsed: collapsedN,
      stats,
      fieldDiffCount: diffs.length,
      tokenChangeCount: tokenChanges.length,
    });

    if (changed) {
      console.log(
        `  ✓ ${e.file}: fields=${diffs.length} md=${stats.markdownFixed} decap=${stats.decapFixed} cap=${stats.capFixed} collapse=${collapsedN}`,
      );
    }
  }

  console.log('\n══ Q4 audit-only (backlog completo) ══');
  const q4Rows = [];
  let knownHits = 0;
  let newMismatches = [];
  let cleanQ4 = 0;
  let pendingManual = 0;

  for (const e of files) {
    const batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const q4 = runMetadataSchemaGate(batch, {
      file: `batches/generated/${e.file}`,
      profile: 'generated',
      module: 'horen',
    });
    const q3 = runPassageCoherenceGate(batch, { file: `batches/generated/${e.file}` });
    const mismatches = q4.findings.filter((f) => f.rule === 'topic_mismatch');
    const known = [];
    const novel = [];
    for (const f of mismatches) {
      if (isKnownMismatch(e.file, f)) {
        known.push(f);
        knownHits++;
      } else {
        novel.push(f);
        newMismatches.push({ file: e.file, detail: f.detail, span: f.span });
      }
    }

    const capsDirty = changeRows.find((r) => r.file === e.file)?.overwritten && false; // after write, re-check
    const { stats: postStats } = applyGermanCapsNormalize(structuredClone(batch));
    const capsClean =
      (postStats.markdownFixed || 0) + (postStats.decapFixed || 0) + (postStats.capFixed || 0) === 0;

    const hasBlockQ4 = q4.findings.some((f) => (f.severity || 'block') === 'block');
    const hasBlockQ3 = q3.findings.some((f) => (f.severity || 'block') === 'block');
    const clean = capsClean && !hasBlockQ4 && !hasBlockQ3;
    if (clean) cleanQ4++;
    else pendingManual++;

    q4Rows.push({
      file: e.file,
      teil: e.teil,
      q4Verdict: q4.verdict,
      q3Verdict: q3.verdict,
      topicMismatch: mismatches.length,
      knownMismatch: known.length,
      newMismatch: novel.length,
      q4Findings: q4.findings.length,
      q3Findings: q3.findings.length,
      capsClean,
      clean,
      mismatchDetails: mismatches.map((f) => f.detail),
      q3Details: q3.findings.map((f) => `${f.rule}: ${f.detail}`).slice(0, 5),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY,
    inventory: {
      total: files.length,
      byTeil: Object.fromEntries(
        [1, 2, 3, 4].map((t) => [
          t,
          {
            total: inventory[t].length,
            sessionVerified: inventory[t].filter((f) => SESSION_VERIFIED.has(f)).length,
            files: inventory[t],
          },
        ]),
      ),
    },
    reprocess: {
      byTeil,
      overwrittenFiles: changeRows.filter((r) => r.overwritten).map((r) => r.file),
      collapseEvents,
      literalChanges,
      rows: changeRows,
    },
    q4: {
      knownTopicMismatchHits: knownHits,
      newTopicMismatches: newMismatches,
      newTopicMismatchCount: newMismatches.length,
      filesClean: cleanQ4,
      filesPendingManual: pendingManual,
      rows: q4Rows,
    },
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, renderMd(report), 'utf8');

  console.log('\n══ Resumen ══');
  console.log('Por Teil:', byTeil);
  console.log(`Archivos sobrescritos: ${changeRows.filter((r) => r.overwritten).length}`);
  console.log(`Cambios literales (campo): ${literalChanges.length}`);
  console.log(`Collapse events: ${collapseEvents.length}`);
  console.log(`Q4 known topic_mismatch hits: ${knownHits}/5`);
  console.log(`Q4 NEW topic_mismatch: ${newMismatches.length}`);
  console.log(`Clean (caps+Q3+Q4 block-free): ${cleanQ4}`);
  console.log(`Pending manual: ${pendingManual}`);
  console.log(`Report: ${path.relative(ROOT, OUT_MD)}`);
}

function renderMd(report) {
  const lines = [];
  lines.push('# Hören backlog reprocess — 2026-07-10');
  lines.push('');
  lines.push(`**Generado:** ${report.generatedAt}`);
  lines.push(`**Dry-run:** ${report.dryRun}`);
  lines.push(`**Total archivos:** ${report.inventory.total}`);
  lines.push('');
  lines.push('## 1. Inventario');
  lines.push('');
  lines.push('| Teil | Total | Session-verified | Archivos |');
  lines.push('|---:|---:|---:|---|');
  for (const t of [1, 2, 3, 4]) {
    const b = report.inventory.byTeil[t];
    lines.push(`| T${t} | ${b.total} | ${b.sessionVerified} | ${b.files.join(', ')} |`);
  }
  lines.push('');
  lines.push('## 2. Reproceso por Teil');
  lines.push('');
  lines.push('| Teil | Scanned | Overwritten | Collapse | markdown | decap | cap |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|');
  for (const t of [1, 2, 3, 4]) {
    const x = report.reprocess.byTeil[t];
    lines.push(
      `| T${t} | ${x.scanned} | ${x.overwritten} | ${x.collapse} | ${x.markdown} | ${x.decap} | ${x.cap} |`,
    );
  }
  lines.push('');
  lines.push('## 3. Tabla literal de cambios (archivo | campo | antes | después)');
  lines.push('');
  if (!report.reprocess.literalChanges.length) {
    lines.push('_Ningún cambio._');
  } else {
    lines.push('| Archivo | Campo | Antes | Después | Kind |');
    lines.push('|---|---|---|---|---|');
    for (const c of report.reprocess.literalChanges) {
      const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(
        `| ${c.file} | \`${c.field}\` | ${esc(c.before)} | ${esc(c.after)} | ${c.kind} |`,
      );
    }
  }
  lines.push('');
  lines.push('## 4. Collapse events');
  lines.push('');
  if (!report.reprocess.collapseEvents.length) {
    lines.push('_Ningún pasaje duplicado adicional (solo el ya limpio t2-023 si aplica)._');
  } else {
    for (const e of report.reprocess.collapseEvents) {
      lines.push(
        `- **${e.file}** (T${e.teil}): ${e.before} → ${e.after} passages; dropped: ${e.dropped.join(', ')}`,
      );
    }
  }
  lines.push('');
  lines.push('## 5. Q4 audit-only');
  lines.push('');
  lines.push(`- Known topic_mismatch hits (muestra original): **${report.q4.knownTopicMismatchHits}**/5`);
  lines.push(`- **NEW** topic_mismatch: **${report.q4.newTopicMismatchCount}**`);
  lines.push(`- Files clean (caps limpios + sin block Q3/Q4): **${report.q4.filesClean}**`);
  lines.push(`- Files pending manual: **${report.q4.filesPendingManual}**`);
  lines.push('');
  if (report.q4.newTopicMismatches.length) {
    lines.push('### Nuevos topic_mismatch');
    lines.push('');
    for (const m of report.q4.newTopicMismatches) {
      lines.push(`- \`${m.file}\` [${m.span}]: ${m.detail}`);
    }
    lines.push('');
  }
  lines.push('### Por archivo (Q4/Q3)');
  lines.push('');
  lines.push('| Archivo | Q4 | Q3 | mismatch | new | capsClean | clean |');
  lines.push('|---|---|---|---:|---:|---|---|');
  for (const r of report.q4.rows) {
    lines.push(
      `| ${r.file} | ${r.q4Verdict} | ${r.q3Verdict} | ${r.topicMismatch} | ${r.newMismatch} | ${r.capsClean} | ${r.clean} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

main();
