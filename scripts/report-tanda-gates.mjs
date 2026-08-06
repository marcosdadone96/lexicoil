#!/usr/bin/env node
/**
 * Informe consolidado de una tanda de generación (gates Q4/Q3/Q1).
 *
 *   node scripts/report-tanda-gates.mjs --marker batches/ready/gate-logs/.tanda-prueba-25.json
 *   node scripts/report-tanda-gates.mjs --since 2026-07-09T09:16:08Z
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { runMetadataSchemaGate } from './lib/qualityGates/metadataSchemaGate.mjs';
import { runPassageCoherenceGate } from './lib/qualityGates/passageCoherenceGate.mjs';
import { runDuplicateContentGate } from './lib/qualityGates/duplicateContentGate.mjs';
import { buildDedupCorpus, corpusExcludingSource } from './lib/qualityGates/dedupCorpus.mjs';
import { READY_LESEN_DIR } from './lib/batchPaths.mjs';

const GEN = path.join(ROOT, 'batches/generated');
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const REJECTED_DIR = path.join(GEN, '.rejected');

function parseArgs(argv) {
  const out = { marker: null, since: null, until: null, exportMd: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--marker') out.marker = argv[++i];
    else if (argv[i] === '--since') out.since = argv[++i];
    else if (argv[i] === '--until') out.until = argv[++i];
    else if (argv[i] === '--out') out.exportMd = argv[++i];
  }
  return out;
}

function parseDate(s) {
  if (!s) return null;
  return new Date(s.includes('T') ? s : `${s}T00:00:00.000Z`);
}

function inferTeil(f) {
  const m = String(f).match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function listTandaFiles(since, until) {
  const sinceMs = parseDate(since)?.getTime() ?? 0;
  const untilMs = until ? parseDate(until).getTime() + 86400000 : Infinity;
  const dirs = [GEN, REJECTED_DIR];
  const out = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^lesen-t\d.*\.json$/i.test(f)) continue;
      const abs = path.join(dir, f);
      const mtime = fs.statSync(abs).mtimeMs;
      if (mtime < sinceMs || mtime > untilMs) continue;
      out.push({
        file: f,
        rel: `batches/generated/${f}`,
        abs,
        teil: inferTeil(f),
        mtime,
        iso: new Date(mtime).toISOString(),
        rejected: dir.includes('.rejected'),
      });
    }
  }
  return out.sort((a, b) => a.teil - b.teil || a.mtime - b.mtime);
}

function readAuditLogs(sinceMs) {
  const q4 = [];
  const q3 = [];
  const q1 = [];
  if (!fs.existsSync(LOG_DIR)) return { q4, q3, q1 };
  for (const name of fs.readdirSync(LOG_DIR)) {
    const full = path.join(LOG_DIR, name);
    if (fs.statSync(full).mtimeMs < sinceMs - 60000) continue;
    if (name.startsWith('audit-Q4-') && name.endsWith('.jsonl')) {
      for (const line of fs.readFileSync(full, 'utf8').trim().split('\n').filter(Boolean)) {
        q4.push(JSON.parse(line));
      }
    } else if (name.startsWith('audit-Q3-') && name.endsWith('.jsonl')) {
      for (const line of fs.readFileSync(full, 'utf8').trim().split('\n').filter(Boolean)) {
        q3.push(JSON.parse(line));
      }
    } else if (name.startsWith('shadow-q1-') && name.endsWith('.jsonl')) {
      for (const line of fs.readFileSync(full, 'utf8').trim().split('\n').filter(Boolean)) {
        q1.push(JSON.parse(line));
      }
    }
  }
  return { q4, q3, q1 };
}

function extractSpan(batch, finding) {
  if (finding.span && finding.span.length > 20) return finding.span;
  const field = finding.detail?.match(/^(passages|questions)[^:]+/)?.[0];
  if (!field) return finding.span || '';
  return finding.span || '';
}

function formatBatchHuman(batch, teil) {
  const lines = [];
  if (batch._requestedTopic) lines.push(`_requestedTopic: ${batch._requestedTopic}`);
  if (batch.topicTag) lines.push(`topicTag: ${batch.topicTag}`);
  for (const p of batch.passages || []) {
    lines.push(`\n### Passage ${p.id || ''} — ${p.title || '(sin título)'}`);
    if (p.topicTag) lines.push(`topicTag: ${p.topicTag}`);
    lines.push(p.text || '');
  }
  for (let i = 0; i < (batch.questions || []).length; i++) {
    const q = batch.questions[i];
    lines.push(`\n### Pregunta ${i + 1} [${q.id}]`);
    lines.push(q.question || '');
    if (q.signText) lines.push(`signText: ${q.signText}`);
    for (const opt of q.options || []) lines.push(`  - ${opt}`);
    lines.push(`correct: ${q.correct ?? q.correctAnswer}`);
    if (q.explanation) lines.push(`explanation: ${q.explanation}`);
    if (q.topicTags?.length) lines.push(`topicTags: ${q.topicTags.join(', ')}`);
  }
  return lines.join('\n');
}

const args = parseArgs(process.argv);
let since = args.since;
if (args.marker) {
  const marker = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.marker), 'utf8'));
  since = marker.startedAt;
}
if (!since) {
  console.error('Usa --marker o --since');
  process.exit(1);
}

const sinceMs = parseDate(since).getTime();
const files = listTandaFiles(since, args.until);
const logs = readAuditLogs(sinceMs);
const corpus = buildDedupCorpus({
  dirs: [GEN, READY_LESEN_DIR],
  bankPath: path.join(ROOT, 'library/de/B1/questions.json'),
});

const byFile = new Map();
for (const f of files) {
  let batch = JSON.parse(fs.readFileSync(f.abs, 'utf8'));
  batch = applyGermanCapsNormalize(batch, { decapOnly: true, log: false }).batch;
  const rel = f.rejected ? f.rel.replace('batches/generated/', 'batches/generated/.rejected/') : f.rel;
  const q4log = logs.q4.find((e) => e.file?.endsWith(f.file));
  const q3log = logs.q3.find((e) => e.file?.endsWith(f.file));
  const q1log = logs.q1.find((e) => e.file?.endsWith(f.file));

  const q4 = q4log || runMetadataSchemaGate(batch, { file: rel, profile: 'generated' });
  const q3 = q3log || runPassageCoherenceGate(batch, { file: rel });
  const excl = corpusExcludingSource(corpus, rel);
  const q1 = q1log || runDuplicateContentGate(batch, {
    file: rel,
    selfSource: rel,
    corpus: excl,
    index: excl.index,
  });

  const q4Blocked = q4.findings?.some((x) => x.rule === 'topic_mismatch' && (x.severity || 'block') === 'block');
  byFile.set(f.file, {
    ...f,
    q4: { verdict: q4.verdict, findings: q4.findings, blocked: q4Blocked },
    q3: { verdict: q3.verdict, findings: q3.findings },
    q1: { verdict: q1.verdict, wouldReject: q1.wouldReject ?? q1.verdict === 'block', findings: q1.findings },
    batch,
    human: formatBatchHuman(batch, f.teil),
  });
}

const q4Rejected = [...byFile.values()].filter((x) => x.q4.blocked);
const passed = [...byFile.values()].filter((x) => !x.q4.blocked);

const report = {
  since,
  fileCount: files.length,
  byTeil: [1, 2, 3, 4, 5].map((t) => ({
    teil: t,
    count: files.filter((f) => f.teil === t).length,
    q4Rejected: q4Rejected.filter((x) => x.teil === t).length,
  })),
  q4Rejected: q4Rejected.map((x) => ({ file: x.file, findings: x.q4.findings })),
  rows: [...byFile.values()].map((x) => ({
    file: x.file,
    teil: x.teil,
    iso: x.iso,
    q4: x.q4.verdict,
    q4Blocked: x.q4.blocked,
    q3: x.q3.verdict,
    q1: x.q1.verdict,
    wouldReject: x.q1.wouldReject,
  })),
  issues: [...byFile.values()]
    .filter((x) => x.q4.verdict !== 'pass' || x.q3.verdict !== 'pass' || x.q1.wouldReject)
    .map((x) => ({
      file: x.file,
      teil: x.teil,
      q4: x.q4,
      q3: x.q3,
      q1: x.q1,
      human: x.human,
    })),
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outJson = path.join(LOG_DIR, `tanda-report-${stamp}.json`);
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

let md = `# Tanda prueba — informe gates\n\n`;
md += `**Desde:** ${since} · **Archivos:** ${files.length}\n\n`;
md += `## Q4 topic_mismatch rechazados: ${q4Rejected.length}\n\n`;
for (const x of q4Rejected) {
  md += `- **${x.file}**: ${x.q4.findings.filter((f) => f.rule === 'topic_mismatch').map((f) => f.detail).join('; ')}\n`;
}
md += `\n## Tabla por archivo\n\n`;
md += `| Teil | archivo | Q4 | Q3 | Q1 | wouldReject |\n`;
md += `|------|---------|----|----|-----|-------------|\n`;
for (const r of report.rows) {
  md += `| ${r.teil} | ${r.file} | ${r.q4}${r.q4Blocked ? ' (BLOCK)' : ''} | ${r.q3} | ${r.q1} | ${r.wouldReject} |\n`;
}

const outMd = args.exportMd || path.join(LOG_DIR, `tanda-report-${stamp}.md`);
fs.writeFileSync(outMd, md);

console.log(JSON.stringify({ outJson, outMd, fileCount: files.length, q4Rejected: q4Rejected.length }, null, 2));
for (const r of report.rows) {
  console.log(`T${r.teil} ${r.file} Q4=${r.q4} Q3=${r.q3} Q1=${r.q1} wouldReject=${r.wouldReject}`);
}
