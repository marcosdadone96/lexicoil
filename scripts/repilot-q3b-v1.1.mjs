/**
 * Q3-B re-pilot after prompt v1.1 adjustments (≤8 files).
 *
 *   NODE_OPTIONS=--use-system-ca node scripts/repilot-q3b-v1.1.mjs --estimate-only
 *   NODE_OPTIONS=--use-system-ca node scripts/repilot-q3b-v1.1.mjs --run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { POOL_VERIFIED_DIR } from './lib/finalizePoolReady.mjs';
import {
  runQ3bSemanticCoherence,
  buildQ3bPrompt,
  Q3B_PROMPT_VERSION,
  DEFAULT_HAIKU_MODEL,
} from './lib/qualityGates/semanticCoherenceGate.mjs';

loadEnvFile();

const estimateOnly = process.argv.includes('--estimate-only');
const doRun = process.argv.includes('--run');
const PRICE_IN = 1.0;
const PRICE_OUT = 5.0;

/**
 * ≤8 files:
 * - ma7vt8: prior FP (T3 correct=0) — must NOT get non_sequitur/block on Ott/Portugal
 * - t4-003: Reserven miss — must detect Reserven→Ressourcen
 * - t3-003: prior true positive quote — must still detect fabricated quote
 * - t2-001: prior true positive Akzent — must still detect
 * - 075, t2-013, schreiben-006: prior clean OK — must stay clean (no new blocks)
 * - we7l2c: new T3 with correct=0 pattern — must not FP on unmatched item
 */
const SAMPLE = [
  {
    file: 'lesen-t3-auto-ma7vt8.json',
    role: 'prior_fp',
    check: 'no_t3_zero_non_sequitur',
    why: 'FP v1: Ott/Portugal correct=0 marked non_sequitur — must be clean on that',
  },
  {
    file: 'horen-t4-gemini-003.json',
    role: 'prior_miss',
    check: 'detect_reserven',
    why: 'Missed Reserven in v1 — must flag wrong_lexeme Reserven',
  },
  {
    file: 'horen-t3-gemini-003.json',
    role: 'prior_tp',
    check: 'detect_fabricated_quote',
    why: 'True positive v1 — must still flag Ich werde es mal probieren',
  },
  {
    file: 'horen-t2-gemini-001.json',
    role: 'prior_tp',
    check: 'detect_akzent_or_protokoll',
    why: 'True positive v1 — must still flag Akzent and/or Protokoll',
  },
  {
    file: 'lesen-t1-gemini-075.json',
    role: 'prior_clean',
    check: 'no_block',
    why: 'Was warn-only; must not gain block findings from prompt tweak',
  },
  {
    file: 'horen-t2-gemini-013.json',
    role: 'prior_clean',
    check: 'no_findings',
    why: 'Was fully clean — regression guard',
  },
  {
    file: 'schreiben-gemini-006.json',
    role: 'prior_clean',
    check: 'no_findings',
    why: 'Was fully clean — regression guard',
  },
  {
    file: 'lesen-t3-auto-we7l2c.json',
    role: 'new_t3_zero',
    check: 'no_t3_zero_non_sequitur',
    why: 'Unseen in clean set; has correct=0 Krankenversicherung — must not FP',
  },
];

function usd(usage) {
  if (!usage) return 0;
  return (usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT) / 1e6;
}

function estimate() {
  let estIn = 0;
  for (const row of SAMPLE) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL_VERIFIED_DIR, row.file), 'utf8'));
    estIn += Math.ceil(buildQ3bPrompt(batch, row.file).length / 4);
  }
  const estOut = SAMPLE.length * 700;
  return {
    n: SAMPLE.length,
    estIn,
    estOut,
    usd: (estIn * PRICE_IN + estOut * PRICE_OUT) / 1e6,
  };
}

function evalCheck(row, result, batch) {
  const findings = result.findings || [];
  const blob = JSON.stringify(findings).toLowerCase();
  const zeroQ = (batch.questions || []).find(
    (q) => String(q.correctAnswer ?? q.correct ?? '').trim() === '0',
  );
  const zeroFindings = zeroQ
    ? findings.filter((f) => f.questionId === zeroQ.id)
    : [];

  switch (row.check) {
    case 'no_t3_zero_non_sequitur': {
      const bad = zeroFindings.filter(
        (f) =>
          f.reason === 'non_sequitur' ||
          f.reason === 'register_break' ||
          f.axis === 'naturalness',
      );
      const blocks = findings.filter((f) => f.severity === 'block' && zeroQ && f.questionId === zeroQ.id);
      return {
        pass: bad.length === 0 && blocks.length === 0,
        detail:
          bad.length || blocks.length
            ? `still flagged zero-item: ${JSON.stringify(bad.concat(blocks).slice(0, 2))}`
            : 'no naturalness/non_sequitur on correct=0',
      };
    }
    case 'detect_reserven': {
      const hit =
        /reserven/.test(blob) ||
        findings.some(
          (f) =>
            f.reason === 'wrong_lexeme' &&
            (/reserv/i.test(f.quote || '') || /reserv/i.test(f.detail || '') || /ressourcen/i.test(f.detail || '')),
        );
      return { pass: hit, detail: hit ? 'Reserven/Ressourcen flagged' : 'Reserven NOT detected' };
    }
    case 'detect_fabricated_quote': {
      const hit = findings.some(
        (f) =>
          f.reason === 'fabricated_quote' ||
          /probieren/i.test(f.quote || '') ||
          /probieren/i.test(f.detail || ''),
      );
      return { pass: hit, detail: hit ? 'fabricated quote still detected' : 'quote TP LOST' };
    }
    case 'detect_akzent_or_protokoll': {
      const hit =
        /akzent|protokoll/.test(blob) ||
        findings.some((f) => f.reason === 'wrong_lexeme' || f.reason === 'register_break');
      return { pass: hit, detail: hit ? 'Akzent/Protokoll-class issue still detected' : 'TP LOST' };
    }
    case 'no_block': {
      const blocks = findings.filter((f) => f.severity === 'block');
      return { pass: blocks.length === 0, detail: blocks.length ? `${blocks.length} block(s)` : 'no blocks' };
    }
    case 'no_findings': {
      return {
        pass: findings.length === 0,
        detail: findings.length ? `${findings.length} findings (regression)` : 'still clean',
      };
    }
    default:
      return { pass: false, detail: 'unknown check' };
  }
}

if (!estimateOnly && !doRun) {
  console.log('Usage: --estimate-only | --run');
  process.exit(1);
}

const est = estimate();
console.log(
  JSON.stringify(
    {
      promptVersion: Q3B_PROMPT_VERSION,
      model: process.env.Q2_ANSWER_KEY_MODEL || DEFAULT_HAIKU_MODEL,
      sampleSize: est.n,
      estimateUsd: Number(est.usd.toFixed(4)),
      estTokens: { in: est.estIn, out: est.estOut },
    },
    null,
    2,
  ),
);
if (estimateOnly) process.exit(0);

const results = [];
let totalIn = 0;
let totalOut = 0;
let totalUsd = 0;

for (const row of SAMPLE) {
  const abs = path.join(POOL_VERIFIED_DIR, row.file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  process.stdout.write(`re-pilot ${row.file}… `);
  try {
    const r = await runQ3bSemanticCoherence(batch, { file: row.file });
    const cost = usd(r.usage);
    if (r.usage) {
      totalIn += r.usage.inputTokens;
      totalOut += r.usage.outputTokens;
      totalUsd += cost;
    }
    const check = evalCheck(row, r, batch);
    console.log(
      `${check.pass ? 'PASS' : 'FAIL'} · ${r.findings.length} findings` +
        (r.filteredT3Zero ? ` (filtered ${r.filteredT3Zero} t3-zero)` : '') +
        ` $${cost.toFixed(4)} — ${check.detail}`,
    );
    results.push({
      ...row,
      pass: check.pass,
      checkDetail: check.detail,
      findings: r.findings,
      filteredT3Zero: r.filteredT3Zero || 0,
      usage: r.usage,
      costUsd: cost,
      model: r.model,
    });
  } catch (err) {
    console.log('ERROR', err.message);
    results.push({ ...row, pass: false, error: err.message, findings: [] });
  }
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
const ready =
  results.every((r) => r.pass) &&
  !results.some((r) => r.error);

const report = {
  generatedAt: new Date().toISOString(),
  promptVersion: Q3B_PROMPT_VERSION,
  sampleSize: SAMPLE.length,
  cost: {
    estimateUsd: Number(est.usd.toFixed(4)),
    realUsd: Number(totalUsd.toFixed(4)),
    realInputTokens: totalIn,
    realOutputTokens: totalOut,
  },
  score: `${passed}/${results.length}`,
  readyToScaleWarnFirst: ready,
  failed: failed.map((r) => ({ file: r.file, check: r.check, detail: r.checkDetail || r.error })),
  results,
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/Q3B-REPILOT-V1.1-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/Q3B-REPILOT-V1.1-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Q3-B re-piloto v1.1 — 2026-07-10',
  '',
  `**Prompt:** \`${Q3B_PROMPT_VERSION}\``,
  '',
  '## Ajustes aplicados',
  '',
  '1. Regla T3 `correct="0"` + ejemplo negativo ma7vt8 (Ott/Portugal) + filtro safety-net',
  '2. `quote_fidelity`: cita literal inventada vs parafraseo legítimo (ejemplos ±)',
  '3. Lexicon: Reserven→Ressourcen / Akzent / Protokoll como ejemplos de casi-sinónimos',
  '',
  '## Coste',
  '',
  `| | USD |`,
  `|---|----:|`,
  `| Estimado | $${report.cost.estimateUsd} |`,
  `| **Real** | **$${report.cost.realUsd}** |`,
  `| Tokens | in=${totalIn} / out=${totalOut} |`,
  '',
  '## Resultados',
  '',
  `| Archivo | Rol | Check | Pass | Detalle |`,
  `|---------|-----|-------|:----:|---------|`,
  ...results.map(
    (r) =>
      `| \`${r.file}\` | ${r.role} | ${r.check} | ${r.pass ? '✅' : '❌'} | ${(r.checkDetail || r.error || '').slice(0, 100)} |`,
  ),
  '',
  `**Score:** ${report.score}`,
  '',
  `## Veredicto: **${ready ? 'SÍ — listo para warn-first sobre ~289' : 'NO — otra vuelta de ajuste'}**`,
  '',
  ready
    ? '- Los 3 ajustes se confirman en re-piloto; escalar solo en modo warn/detección.'
    : `- Fallos: ${failed.map((f) => f.file).join(', ') || '—'}`,
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));
console.log(JSON.stringify({ cost: report.cost, score: report.score, readyToScaleWarnFirst: ready, failed: report.failed, out: outMd }, null, 2));
