/**
 * Q3-B pilot on a curated pool-verified sample (NOT full pool).
 *
 *   node scripts/pilot-q3b-semantic-coherence.mjs --estimate-only
 *   node scripts/pilot-q3b-semantic-coherence.mjs --run
 *
 * Cost confirm: --estimate-only first; --run spends LLM $.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { POOL_VERIFIED_DIR } from './lib/finalizePoolReady.mjs';
import {
  runQ3bSemanticCoherence,
  buildQ3bPrompt,
  DEFAULT_HAIKU_MODEL,
} from './lib/qualityGates/semanticCoherenceGate.mjs';

loadEnvFile();

const estimateOnly = process.argv.includes('--estimate-only');
const doRun = process.argv.includes('--run');

/** Haiku 4.5 list price USD / MTok */
const PRICE_IN = 1.0;
const PRICE_OUT = 5.0;

/**
 * Curated pilot sample: known_bad + known_clean + representative per cell.
 * Hören T1 only has 1 file in pool-verified.
 */
export const PILOT_SAMPLE = [
  // —— known_bad (must detect) ——
  {
    file: 'horen-t2-gemini-001.json',
    cell: 'horen-t2',
    role: 'known_bad',
    expect: ['wrong_lexeme'],
    why: 'Akzent/Protokoll lexicon issues documented this session (F4-like)',
  },
  {
    file: 'horen-t4-gemini-003.json',
    cell: 'horen-t4',
    role: 'known_bad',
    expect: ['wrong_lexeme'],
    why: 'Reserven→Ressourcen / Protokoll→Bericht (F3 fixture)',
  },
  {
    file: 'horen-t3-gemini-003.json',
    cell: 'horen-t3',
    role: 'known_bad',
    expect: ['fabricated_quote'],
    why: 'Q7 explanation cites «Ich werde es mal probieren.» absent from dialogue (F5)',
  },
  // —— known_clean (must NOT false-positive hard) ——
  {
    file: 'lesen-t1-gemini-075.json',
    cell: 'lesen-t1',
    role: 'known_clean',
    expect: [],
    why: 'Manual review this session (Verkehrsnetz + topic Verkehr OK)',
  },
  {
    file: 'lesen-t3-auto-ma7vt8.json',
    cell: 'lesen-t3',
    role: 'known_clean',
    expect: [],
    why: 'Manual-preferred T3 fingerprint representative',
  },
  {
    file: 'horen-t1-gemini-016.json',
    cell: 'horen-t1',
    role: 'known_clean',
    expect: [],
    why: 'Only Hören T1 in verified; clean in vocab audit sample',
  },
  {
    file: 'horen-t2-gemini-013.json',
    cell: 'horen-t2',
    role: 'known_clean',
    expect: [],
    why: 'Clean vocab sample this session (pair with known_bad t2-001)',
  },
  {
    file: 'schreiben-gemini-006.json',
    cell: 'schreiben',
    role: 'known_clean',
    expect: [],
    why: 'Clean vocab sample this session',
  },
  {
    file: 'sprechen-gemini-001.json',
    cell: 'sprechen',
    role: 'known_clean',
    expect: [],
    why: 'Clean vocab sample this session',
  },
  // —— representative (2 per remaining cells) ——
  { file: 'lesen-t1-gemini-081.json', cell: 'lesen-t1', role: 'representative', expect: null, why: 'Lesen T1 normal stock' },
  { file: 'lesen-t2-gemini-055.json', cell: 'lesen-t2', role: 'representative', expect: null, why: 'Lesen T2' },
  { file: 'lesen-t2-gemini-093.json', cell: 'lesen-t2', role: 'representative', expect: null, why: 'Lesen T2' },
  { file: 'lesen-t3-auto-we7l2c.json', cell: 'lesen-t3', role: 'representative', expect: null, why: 'Lesen T3 fingerprint rep' },
  { file: 'lesen-t4-gemini-002.json', cell: 'lesen-t4', role: 'representative', expect: null, why: 'Lesen T4' },
  { file: 'lesen-t4-gemini-016.json', cell: 'lesen-t4', role: 'representative', expect: null, why: 'Lesen T4' },
  { file: 'lesen-t5-gemini-009.json', cell: 'lesen-t5', role: 'representative', expect: null, why: 'Lesen T5' },
  { file: 'lesen-t5-gemini-014.json', cell: 'lesen-t5', role: 'representative', expect: null, why: 'Lesen T5' },
  { file: 'horen-t3-gemini-001.json', cell: 'horen-t3', role: 'representative', expect: null, why: 'Hören T3 companion to known_bad' },
  { file: 'horen-t4-gemini-007.json', cell: 'horen-t4', role: 'representative', expect: null, why: 'Hören T4 (caps reprocess file)' },
  { file: 'schreiben-gemini-004.json', cell: 'schreiben', role: 'representative', expect: null, why: 'Schreiben companion' },
  { file: 'sprechen-gemini-005.json', cell: 'sprechen', role: 'representative', expect: null, why: 'Sprechen companion' },
];

function estimateCost(sample) {
  let estIn = 0;
  for (const row of sample) {
    const abs = path.join(POOL_VERIFIED_DIR, row.file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const prompt = buildQ3bPrompt(batch, row.file);
    estIn += Math.ceil(prompt.length / 4);
  }
  const estOut = sample.length * 700;
  const usd = (estIn * PRICE_IN + estOut * PRICE_OUT) / 1e6;
  return { estIn, estOut, usd, n: sample.length };
}

function usdFromUsage(usage) {
  if (!usage) return null;
  return (usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT) / 1e6;
}

if (!estimateOnly && !doRun) {
  console.log('Usage: --estimate-only | --run');
  process.exit(1);
}

const est = estimateCost(PILOT_SAMPLE);
console.log(
  JSON.stringify(
    {
      model: process.env.Q2_ANSWER_KEY_MODEL || DEFAULT_HAIKU_MODEL,
      sampleSize: est.n,
      estimate: {
        inputTokens: est.estIn,
        outputTokens: est.estOut,
        usd: Number(est.usd.toFixed(4)),
        extrapolate289usd: Number(((est.usd / est.n) * 289).toFixed(2)),
      },
      note: 'Haiku 4.5 list $1/$5 per MTok. Confirm before --run.',
    },
    null,
    2,
  ),
);

if (estimateOnly) process.exit(0);

// ——— RUN ———
const results = [];
let totalIn = 0;
let totalOut = 0;
let totalUsd = 0;

for (const row of PILOT_SAMPLE) {
  const abs = path.join(POOL_VERIFIED_DIR, row.file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  process.stdout.write(`Q3-B ${row.file} (${row.role})… `);
  try {
    const r = await runQ3bSemanticCoherence(batch, { file: row.file, maxTokens: 2048 });
    const cost = usdFromUsage(r.usage);
    if (r.usage) {
      totalIn += r.usage.inputTokens;
      totalOut += r.usage.outputTokens;
      totalUsd += cost || 0;
    }
    const reasons = [...new Set(r.findings.map((f) => f.reason).filter(Boolean))];
    let expectHit = null;
    if (row.role === 'known_bad' && Array.isArray(row.expect)) {
      expectHit = row.expect.some((e) => reasons.includes(e) || r.findings.some((f) => (f.detail || '').toLowerCase().includes(e.replace('_', ' '))));
      // Also soft-match: any finding on known_bad counts as partial detection
      if (!expectHit && r.findings.length) expectHit = 'partial';
      if (!expectHit) expectHit = false;
    }
    let cleanFp = null;
    if (row.role === 'known_clean') {
      cleanFp = r.findings.filter((f) => f.severity === 'block');
    }
    console.log(
      `${r.findings.length} findings` +
        (r.usage ? ` in=${r.usage.inputTokens} out=${r.usage.outputTokens}` : '') +
        (cost != null ? ` $${cost.toFixed(4)}` : ''),
    );
    results.push({
      ...row,
      ok: r.ok,
      findings: r.findings,
      reasons,
      expectHit,
      cleanBlockFindings: cleanFp,
      model: r.model,
      provider: r.provider,
      usage: r.usage || null,
      costUsd: cost,
    });
  } catch (err) {
    console.log('ERROR', err.message);
    results.push({ ...row, error: err.message, findings: [], expectHit: false });
  }
}

const knownBad = results.filter((r) => r.role === 'known_bad');
const knownClean = results.filter((r) => r.role === 'known_clean');
const errored = results.filter((r) => r.error);
const detectedBad = knownBad.filter((r) => r.expectHit === true || r.expectHit === 'partial');
const missedBad = knownBad.filter((r) => r.expectHit === false || r.error);
const cleanWithBlocks = knownClean.filter((r) => (r.cleanBlockFindings || []).length > 0);
const cleanWithAny = knownClean.filter((r) => !r.error && (r.findings || []).length > 0);

const verdict = {
  detectedKnownBad: `${detectedBad.length}/${knownBad.length}`,
  missedKnownBad: missedBad.map((r) => r.file),
  erroredFiles: errored.map((r) => ({ file: r.file, error: r.error })),
  cleanFilesWithBlockFindings: cleanWithBlocks.map((r) => r.file),
  cleanFilesWithAnyFindings: cleanWithAny.map((r) => ({
    file: r.file,
    n: r.findings.length,
    reasons: r.reasons,
  })),
  readyToScale: false,
  notes: [],
};

if (errored.length) {
  verdict.notes.push(`TLS/API errors on ${errored.length}/${results.length} files — pilot incomplete`);
  verdict.readyToScale = false;
} else {
  verdict.readyToScale = missedBad.length === 0 && cleanWithBlocks.length === 0;
  if (missedBad.length) verdict.notes.push('Prompt missed ≥1 known_bad — adjust before scale');
  if (cleanWithBlocks.length) verdict.notes.push('Block FP on known_clean — adjust before scale');
  if (!missedBad.length && !cleanWithBlocks.length && cleanWithAny.length) {
    verdict.notes.push('Warn-only findings on known_clean — review before treating warns as block');
  }
  if (verdict.readyToScale && !verdict.notes.length) {
    verdict.notes.push('Pilot OK to scale (warn-first recommended)');
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  model: results[0]?.model || DEFAULT_HAIKU_MODEL,
  sampleSize: PILOT_SAMPLE.length,
  cost: {
    estimateUsd: Number(est.usd.toFixed(4)),
    realInputTokens: totalIn,
    realOutputTokens: totalOut,
    realUsd: Number(totalUsd.toFixed(4)),
    extrapolate289usd: Number(((totalUsd / PILOT_SAMPLE.length) * 289).toFixed(2)),
    priceAssumed: { inputPerMTok: PRICE_IN, outputPerMTok: PRICE_OUT },
  },
  verdict,
  sample: PILOT_SAMPLE,
  results,
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/Q3B-PILOT-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/Q3B-PILOT-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const findingRows = [];
for (const r of results) {
  for (const f of r.findings || []) {
    findingRows.push(
      `| \`${r.file}\` | ${r.role} | ${f.questionId || f.passageId || '—'} | \`${f.field || '—'}\` | ${f.axis}/${f.reason} | ${f.severity} | «${(f.quote || '').replace(/\|/g, '/')}» | ${f.detail || ''} |`,
    );
  }
}

const md = [
  '# Q3-B pilot — 2026-07-10',
  '',
  `**Modelo:** \`${report.model}\` · **n=${report.sampleSize}** · solo \`pool-verified/\``,
  '',
  '## Coste',
  '',
  `| | USD | Tokens |`,
  `|---|----:|-------:|`,
  `| Estimado (antes) | $${report.cost.estimateUsd} | in~${est.estIn} / out~${est.estOut} |`,
  `| **Real gastado** | **$${report.cost.realUsd}** | in=${totalIn} / out=${totalOut} |`,
  `| Extrapolación ×289 | **$${report.cost.extrapolate289usd}** | — |`,
  '',
  '## Muestra',
  '',
  '| Archivo | Celda | Rol | Por qué |',
  '|---------|-------|-----|---------|',
  ...PILOT_SAMPLE.map((s) => `| \`${s.file}\` | ${s.cell} | ${s.role} | ${s.why} |`),
  '',
  '## Findings (accionables)',
  '',
  '| Archivo | Rol | ID | Campo | Eje/reason | Sev | Fragmento | Detalle |',
  '|---------|-----|----|-------|------------|-----|-----------|---------|',
  ...(findingRows.length ? findingRows : ['| — | — | — | — | — | — | sin findings | — |']),
  '',
  '## Verificación cruzada',
  '',
  `| Check | Resultado |`,
  `|-------|-----------|`,
  `| Known-bad detectados | **${verdict.detectedKnownBad}** |`,
  `| Known-bad fallidos | ${verdict.missedKnownBad.length ? verdict.missedKnownBad.map((f) => `\`${f}\``).join(', ') : '—'} |`,
  `| Known-clean con block | ${verdict.cleanFilesWithBlockFindings.length ? verdict.cleanFilesWithBlockFindings.map((f) => `\`${f}\``).join(', ') : '**0**'} |`,
  `| Known-clean con cualquier finding | ${verdict.cleanFilesWithAnyFindings.length} |`,
  `| **¿Listo para escalar?** | **${verdict.readyToScale ? 'SÍ (warn-first)' : 'NO — ajustar prompt'}** |`,
  '',
  ...verdict.notes.map((n) => `- ${n}`),
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));
console.log(JSON.stringify({ cost: report.cost, verdict: report.verdict, out: outMd }, null, 2));
