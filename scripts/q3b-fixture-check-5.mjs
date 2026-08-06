/**
 * Q3-B fixture check — 5 known real errors across 3 files (deep-read 2026-07-10).
 * Run BEFORE full 134 sweep.
 *
 *   NODE_OPTIONS=--use-system-ca node scripts/q3b-fixture-check-5.mjs --estimate-only
 *   NODE_OPTIONS=--use-system-ca node scripts/q3b-fixture-check-5.mjs --run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { POOL_VERIFIED_DIR } from './lib/finalizePoolReady.mjs';
import {
  runQ3bSemanticCoherence,
  Q3B_PROMPT_VERSION,
  DEFAULT_HAIKU_MODEL,
} from './lib/qualityGates/semanticCoherenceGate.mjs';

loadEnvFile();

const estimateOnly = process.argv.includes('--estimate-only');
const doRun = process.argv.includes('--run');
const PRICE_IN = 1.0;
const PRICE_OUT = 5.0;

/** Five cases → three files. Each case must match at least one finding quote/detail. */
const FIXTURES = [
  {
    file: 'lesen-t2-gemini-055.json',
    cases: [
      {
        id: 1,
        needle: /eingetreten/i,
        expectAxis: ['lexicon', 'naturalness'],
        label: 'Programm … eingetreten (wrong verb)',
      },
      {
        id: 2,
        needle: /Gärtnern im freien Stress|im freien Stress/i,
        expectAxis: ['naturalness', 'lexicon'],
        label: 'Gärtnern im freien Stress (broken syntax)',
      },
    ],
  },
  {
    file: 'horen-t2-gemini-013.json',
    cases: [
      {
        id: 3,
        needle: /verzichten/i,
        expectAxis: ['lexicon', 'naturalness'],
        label: 'zu verzichten (missing auf)',
      },
      {
        id: 4,
        needle: /Konsum von Mobilität/i,
        expectAxis: ['lexicon', 'naturalness'],
        label: 'Konsum von Mobilität (bad collocation)',
      },
    ],
  },
  {
    file: 'horen-t2-gemini-017.json',
    cases: [
      {
        id: 5,
        needle: /Zugang zu Bildung|indirekte Hürden/i,
        expectAxis: ['naturalness', 'lexicon'],
        label: 'Zugang… Hürden minimiert werden (broken syntax)',
      },
    ],
  },
];

function caseDetected(c, findings) {
  return (findings || []).some((f) => {
    const blob = `${f.quote || ''} ${f.detail || ''}`;
    if (!c.needle.test(blob)) return false;
    if (c.expectAxis?.length && !c.expectAxis.includes(f.axis)) return false;
    return true;
  });
}

async function main() {
  const files = FIXTURES.map((f) => f.file);
  console.log(`Q3-B fixture check — prompt ${Q3B_PROMPT_VERSION}`);
  console.log(`Files: ${files.join(', ')} (5 cases)`);

  if (estimateOnly || !doRun) {
    // Rough: ~2.5k in / 0.6k out per file from prior pilots
    const estIn = files.length * 2500;
    const estOut = files.length * 600;
    const usd = (estIn / 1e6) * PRICE_IN + (estOut / 1e6) * PRICE_OUT;
    console.log(`Estimate: ~$${usd.toFixed(3)} for ${files.length} files (Haiku ${DEFAULT_HAIKU_MODEL})`);
    if (!doRun) {
      console.log('Pass --run to execute (after confirming cost).');
      return;
    }
  }

  const results = [];
  let totalIn = 0;
  let totalOut = 0;
  let casesHit = 0;
  let casesTotal = 0;

  for (const fix of FIXTURES) {
    const abs = path.join(POOL_VERIFIED_DIR, fix.file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const r = await runQ3bSemanticCoherence(batch, {
      file: fix.file,
    });
    const usage = r.usage || {};
    totalIn += usage.inputTokens || usage.input_tokens || 0;
    totalOut += usage.outputTokens || usage.output_tokens || 0;
    const findings = r.findings || [];

    const caseResults = fix.cases.map((c) => {
      casesTotal++;
      const hit = caseDetected(c, findings);
      if (hit) casesHit++;
      return { id: c.id, label: c.label, hit };
    });

    results.push({
      file: fix.file,
      verdict: r.verdict,
      findings: findings.map((f) => ({
        axis: f.axis,
        reason: f.reason,
        severity: f.severity,
        quote: f.quote,
        detail: f.detail,
      })),
      cases: caseResults,
    });
    console.log(
      `\n${fix.file}: ${findings.length} findings; cases ${caseResults.filter((c) => c.hit).length}/${caseResults.length}`,
    );
    for (const c of caseResults) console.log(`  ${c.hit ? '✅' : '❌'} #${c.id} ${c.label}`);
    for (const f of findings) console.log(`  · [${f.axis}/${f.reason}] ${f.quote || f.detail}`);
  }

  const usd = (totalIn / 1e6) * PRICE_IN + (totalOut / 1e6) * PRICE_OUT;
  const report = {
    at: new Date().toISOString(),
    promptVersion: Q3B_PROMPT_VERSION,
    casesHit,
    casesTotal,
    allDetected: casesHit === casesTotal,
    costUsd: Number(usd.toFixed(4)),
    tokens: { in: totalIn, out: totalOut },
    results,
  };

  const outPath = path.join(ROOT, 'batches/ready/gate-logs/Q3B-FIXTURE-5-2026-07-10.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${casesHit}/${casesTotal} cases detected | ~$${usd.toFixed(3)} | ${outPath}`);
  if (!report.allDetected) {
    console.error('NOT ready to scale — prompt needs another adjustment.');
    process.exitCode = 1;
  } else {
    console.log('All 5 fixtures detected — OK to proceed with 134 sweep.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
