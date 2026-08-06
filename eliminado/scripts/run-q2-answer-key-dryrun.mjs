#!/usr/bin/env node
/**
 * Q2 dry-run — answerKeyCoherenceGate sobre holdout 233 + backlog 587.
 * Solo logging (mode=audit); no bloquea pipeline.
 *
 *   node scripts/run-q2-answer-key-dryrun.mjs
 *   node scripts/run-q2-answer-key-dryrun.mjs --limit 20
 *   node scripts/run-q2-answer-key-dryrun.mjs --holdout-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { runAnswerKeyCoherenceGate, collectAnswerKeyItems } from './lib/qualityGates/answerKeyCoherenceGate.mjs';

loadEnvFile();

const READY_DIR = path.join(ROOT, 'batches/ready/lesen');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const INVENTORY = path.join(LOG_DIR, 'backlog-reprocess-inventory.json');

const VALIDATION_FILES = [
  'lesen-t5-gemini-067.json', 'lesen-t5-gemini-066.json', 'lesen-t5-gemini-065.json',
  'lesen-t5-gemini-064.json', 'lesen-t5-gemini-063.json', 'lesen-t4-gemini-037.json',
  'lesen-t4-gemini-036.json', 'lesen-t3-auto-qeh7ew.json', 'lesen-t3-auto-omsq86.json',
  'lesen-t3-auto-tz7n7y.json', 'lesen-t2-gemini-093.json', 'lesen-t2-gemini-092.json',
  'lesen-t2-gemini-091.json', 'lesen-t1-gemini-177.json', 'lesen-t1-gemini-176.json',
];

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

function parseArgs() {
  const out = { limit: 0, holdoutOnly: false, resume: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (argv[i] === '--holdout-only') out.holdoutOnly = true;
    else if (argv[i] === '--no-resume') out.resume = false;
  }
  return out;
}

function listHoldoutFiles() {
  const ready = fs.readdirSync(READY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, abs: path.join(READY_DIR, f), pool: 'holdout-ready' }));
  const validation = VALIDATION_FILES.map((f) => ({
    file: f, abs: path.join(GENERATED_DIR, f), pool: 'holdout-validation',
  }));
  const pilot = PILOT_TANDA_FILES.map((f) => ({
    file: f, abs: path.join(GENERATED_DIR, f), pool: 'holdout-pilot',
  }));
  return [...ready, ...validation, ...pilot].filter((e) => fs.existsSync(e.abs));
}

function listBacklogFiles() {
  if (!fs.existsSync(INVENTORY)) return [];
  const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const files = [];
  for (const teil of Object.values(inv.byTeil || {})) {
    for (const f of teil.files || []) {
      const base = f.pool === 'ready' ? READY_DIR : GENERATED_DIR;
      files.push({ file: f.file, abs: path.join(base, f.file), pool: 'backlog' });
    }
  }
  return files.filter((e) => fs.existsSync(e.abs));
}

function relSource(abs) {
  const norm = abs.replace(/\\/g, '/');
  const idx = norm.indexOf('batches/');
  return idx >= 0 ? norm.slice(idx) : path.basename(abs);
}

function enrichMismatch(batch, item, finding) {
  const q = batch.questions?.[item?.index ?? -1] || {};
  return {
    file: finding.file,
    pool: finding.pool,
    itemId: finding.itemId,
    field: finding.field,
    teil: item?.teil,
    type: item?.type,
    question: item?.question || q.question,
    options: item?.options || q.options || [],
    explanation: item?.explanation || q.explanation,
    signText: item?.signText || q.signText || null,
    letraDeclarada: finding.letraDeclarada,
    letraInferida: finding.letraInferida,
    confidence: finding.confidence,
    motivo: finding.motivo,
    source: finding.source || 'LLM',
    detail: finding.detail,
  };
}

async function main() {
  const args = parseArgs();
  fs.mkdirSync(LOG_DIR, { recursive: true });

  let targets = listHoldoutFiles();
  if (!args.holdoutOnly) {
    const backlog = listBacklogFiles();
    const seen = new Set(targets.map((t) => t.file));
    for (const b of backlog) {
      if (!seen.has(b.file)) targets.push(b);
    }
  }

  if (args.limit > 0) targets = targets.slice(0, args.limit);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonlPath = path.join(LOG_DIR, `dryrun-Q2-answerKeyCoherence-${stamp}.jsonl`);
  const reportPath = path.join(LOG_DIR, `Q2-DRYRUN-REPORT.json`);
  const mdPath = path.join(LOG_DIR, `Q2-DRYRUN-REPORT.md`);
  const checkpointPath = path.join(LOG_DIR, 'q2-dryrun-checkpoint.json');

  let done = new Set();
  if (args.resume && fs.existsSync(checkpointPath)) {
    try {
      const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      for (const f of cp.done || []) done.add(f);
      console.log(`Resume: ${done.size} archivos ya procesados`);
    } catch { /* ignore */ }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    model: process.env.Q2_ANSWER_KEY_MODEL || process.env.CLAUDE_GEN_MODEL || 'claude-haiku-4-5',
    mode: 'audit',
    filesTotal: targets.length,
    filesProcessed: 0,
    llmCalls: 0,
    itemsChecked: 0,
    chk18bHits: 0,
    chk18bEscalated: 0,
    llmSuccessFiles: 0,
    llmParseErrors: 0,
    llmCreditErrors: 0,
    highConfidenceMismatches: [],
    wouldBlockFiles: 0,
    wouldWarnFiles: 0,
    errors: [],
  };

  console.log(`Q2 dry-run — ${targets.length} archivos (mode=audit, model=${summary.model})`);

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (done.has(t.file)) continue;

    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(t.abs, 'utf8'));
    } catch (e) {
      summary.errors.push({ file: t.file, error: e.message });
      continue;
    }

    const source = relSource(t.abs);
    let verdict;
    try {
      verdict = await runAnswerKeyCoherenceGate(batch, { file: source, mode: 'audit' });
    } catch (e) {
      summary.errors.push({ file: t.file, error: e.message });
      continue;
    }

    const logEntry = { ...verdict, pool: t.pool, mode: 'audit' };
    fs.appendFileSync(jsonlPath, `${JSON.stringify(logEntry)}\n`);

    summary.filesProcessed++;
    summary.llmCalls += verdict.stats?.llmCalls || 0;
    summary.itemsChecked += verdict.stats?.itemsChecked || 0;
    summary.chk18bHits += verdict.stats?.chk18bHits || 0;
    summary.chk18bEscalated = summary.chk18bHits;
    const llmErr = verdict.findings?.find((f) => f.rule === 'answer_key_llm_error');
    if (llmErr) {
      if (llmErr.detail?.includes('credit balance')) summary.llmCreditErrors = (summary.llmCreditErrors || 0) + 1;
      else summary.llmParseErrors = (summary.llmParseErrors || 0) + 1;
    } else if ((verdict.stats?.llmCalls || 0) > 0) {
      summary.llmSuccessFiles = (summary.llmSuccessFiles || 0) + 1;
    }
    if (verdict.wouldBlock) summary.wouldBlockFiles++;
    if (verdict.wouldWarn) summary.wouldWarnFiles++;

    const items = collectAnswerKeyItems(batch);
    const itemById = new Map(items.map((it) => [it.itemId, it]));

    for (const f of verdict.findings) {
      if (f.rule !== 'answer_key_mismatch' || f.confidence !== 'high' || f.severity !== 'block') continue;
      summary.highConfidenceMismatches.push(
        enrichMismatch(batch, itemById.get(f.itemId), { ...f, file: source, pool: t.pool }),
      );
    }

    done.add(t.file);
    if (i % 10 === 9 || i === targets.length - 1) {
      fs.writeFileSync(checkpointPath, JSON.stringify({ done: [...done], updatedAt: new Date().toISOString() }, null, 2));
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  … ${i + 1}/${targets.length} (${summary.highConfidenceMismatches.length} high mismatches)`);
    }
  }

  summary.highConfidenceMismatchCount = summary.highConfidenceMismatches.length;
  summary.generatedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);

  const md = [
    '# Q2 answerKeyCoherence — dry-run',
    '',
    `**Fecha:** ${summary.generatedAt}`,
    `**Modelo:** ${summary.model}`,
    `**Archivos:** ${summary.filesProcessed}/${summary.filesTotal}`,
    `**LLM calls:** ${summary.llmCalls}`,
    `**Ítems revisados:** ${summary.itemsChecked}`,
    `**CHK-18b hits (escalados a LLM):** ${summary.chk18bHits}`,
    `**LLM éxito (archivos):** ${summary.llmSuccessFiles ?? 0}`,
    `**LLM parse errors:** ${summary.llmParseErrors || 0}`,
    `**LLM credit errors:** ${summary.llmCreditErrors || 0}`,
    `**wouldBlock files:** ${summary.wouldBlockFiles}`,
    `**wouldWarn files:** ${summary.wouldWarnFiles}`,
    `**Mismatches confidence=high:** ${summary.highConfidenceMismatchCount}`,
    '',
    '## Mismatches high (revisión manual)',
    '',
  ];

  if (!summary.highConfidenceMismatches.length) {
    md.push('Ninguno.');
  } else {
    summary.highConfidenceMismatches.forEach((m, idx) => {
      md.push(`### ${idx + 1}. ${m.file} — ${m.itemId}`);
      md.push('');
      md.push(`- **declarada:** ${m.letraDeclarada} → **inferida:** ${m.letraInferida} (${m.source})`);
      md.push(`- **motivo:** ${m.motivo}`);
      md.push(`- **pregunta:** ${m.question}`);
      if (m.options?.length) {
        md.push('- **opciones:**');
        for (const o of m.options) md.push(`  - ${o}`);
      }
      md.push(`- **explanation:** ${m.explanation}`);
      if (m.signText) md.push(`- **signText:** ${m.signText}`);
      md.push('');
    });
  }

  md.push('', `JSONL: \`dryrun-Q2-answerKeyCoherence-${stamp}.jsonl\``);
  md.push(`JSON: \`Q2-DRYRUN-REPORT.json\``);
  fs.writeFileSync(mdPath, `${md.join('\n')}\n`);

  console.log('\n=== Q2 dry-run resumen ===');
  console.log(`Archivos: ${summary.filesProcessed}/${summary.filesTotal}`);
  console.log(`LLM calls: ${summary.llmCalls}`);
  console.log(`High mismatches: ${summary.highConfidenceMismatchCount}`);
  console.log(`wouldBlock files: ${summary.wouldBlockFiles}`);
  console.log(`Reporte: ${path.relative(ROOT, mdPath)}`);

  if (summary.highConfidenceMismatches.length) {
    console.log('\n--- High mismatches (primeros 5) ---');
    for (const m of summary.highConfidenceMismatches.slice(0, 5)) {
      console.log(`${m.file} ${m.itemId}: ${m.letraDeclarada}→${m.letraInferida} — ${m.motivo}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
