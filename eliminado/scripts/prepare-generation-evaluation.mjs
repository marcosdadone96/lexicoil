#!/usr/bin/env node
/**
 * PASO 8 — Scaffold A/B evaluation dataset (no LLM calls).
 *
 * Creates generation-evaluation/ structure for ≥50 planned pairs across modules.
 * Optionally registers existing generated JSON as "without-feedback" baselines.
 *
 *   node scripts/prepare-generation-evaluation.mjs
 *   node scripts/prepare-generation-evaluation.mjs --scan-generated
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVAL_DIR = path.join(ROOT, 'generation-evaluation');
const PAIRS_DIR = path.join(EVAL_DIR, 'pairs');

const PLAN = [
  ...Array.from({ length: 20 }, (_, i) => ({ module: 'lesen', teil: (i % 5) + 1, id: `lesen-${String(i + 1).padStart(3, '0')}` })),
  ...Array.from({ length: 12 }, (_, i) => ({ module: 'horen', teil: (i % 4) + 1, id: `horen-${String(i + 1).padStart(3, '0')}` })),
  ...Array.from({ length: 9 }, (_, i) => ({ module: 'schreiben', teil: null, id: `schreiben-${String(i + 1).padStart(3, '0')}` })),
  ...Array.from({ length: 9 }, (_, i) => ({ module: 'sprechen', teil: null, id: `sprechen-${String(i + 1).padStart(3, '0')}` })),
];

function ensureDirs() {
  fs.mkdirSync(PAIRS_DIR, { recursive: true });
  fs.mkdirSync(path.join(EVAL_DIR, 'reports'), { recursive: true });
}

function writeManifest() {
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    goal: 'Compare Goethe B1 generation with feedbackMode=off vs active (PASO 8)',
    targetPairs: PLAN.length,
    modules: {
      lesen: PLAN.filter((p) => p.module === 'lesen').length,
      horen: PLAN.filter((p) => p.module === 'horen').length,
      schreiben: PLAN.filter((p) => p.module === 'schreiben').length,
      sprechen: PLAN.filter((p) => p.module === 'sprechen').length,
    },
    modes: {
      off: 'GENERATION_FEEDBACK_MODE=off (or unset)',
      preview: 'GENERATION_FEEDBACK_MODE=preview — prompt gets rules, metadata.usedFeedback=false',
      active: 'GENERATION_FEEDBACK_MODE=active — prompt + generationMetadata application',
    },
    pairs: PLAN.map((p) => ({
      id: p.id,
      module: p.module,
      teil: p.teil,
      status: 'planned',
      withoutFeedback: `pairs/${p.id}/without-feedback.json`,
      withFeedback: `pairs/${p.id}/with-feedback.json`,
      auditReport: `pairs/${p.id}/audit-report.json`,
    })),
    howToFill: [
      '1) Generate baseline: GENERATION_FEEDBACK_MODE=off … → copy JSON to pairs/<id>/without-feedback.json',
      '2) Generate treatment: GENERATION_FEEDBACK_MODE=active … (same topic/teil) → with-feedback.json',
      '3) node scripts/audit-generated-with-feedback.mjs --pair generation-evaluation/pairs/<id>',
      '4) node scripts/prepare-generation-evaluation.mjs --summarize',
    ],
  };
  fs.writeFileSync(path.join(EVAL_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function writePairPlaceholders(manifest) {
  for (const p of manifest.pairs) {
    const dir = path.join(PAIRS_DIR, p.id);
    fs.mkdirSync(dir, { recursive: true });
    const metaPath = path.join(dir, 'pair-meta.json');
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(
        metaPath,
        `${JSON.stringify(
          {
            id: p.id,
            module: p.module,
            teil: p.teil,
            status: 'planned',
            notes: 'Fill without-feedback.json and with-feedback.json then run audit script.',
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    }
  }
}

function writeReadme() {
  const readme = `# Generation evaluation (PASO 8)

Measurable A/B harness for generation feedback.

## Layout

- \`manifest.json\` — 50 planned pairs (Lesen/Hören/Schreiben/Sprechen)
- \`pairs/<id>/\`
  - \`without-feedback.json\` — generated with \`feedbackMode=off\`
  - \`with-feedback.json\` — generated with \`feedbackMode=active\`
  - \`audit-report.json\` — output of \`audit-generated-with-feedback.mjs\`
- \`reports/\` — aggregate summaries
- \`feedback-audit-latest.json\` — store audit snapshot

## Commands

\`\`\`bash
node scripts/audit-generation-feedback.mjs --fixture
node scripts/prepare-generation-evaluation.mjs
node scripts/audit-generated-with-feedback.mjs --pair generation-evaluation/pairs/lesen-001
\`\`\`

Do not delete or rewrite feedback rules from this folder — measurement only.
`;
  fs.writeFileSync(path.join(EVAL_DIR, 'README.md'), readme, 'utf8');
}

function writeReportTemplate() {
  const report = {
    title: 'PASO 8 — Learning system impact report',
    status: 'scaffold',
    generatedAt: new Date().toISOString(),
    sections: {
      rulesThatHelp: [],
      rulesThatDoNotHelp: [],
      rulesThatHarm: [],
      promoteToActive: [],
      demoteToCandidate: [],
      notes: [
        'Fill after running audits on ≥50 A/B pairs.',
        'No automatic promotion/demotion is performed by PASO 8 tooling.',
      ],
    },
  };
  fs.writeFileSync(
    path.join(EVAL_DIR, 'reports', 'IMPACT-REPORT-TEMPLATE.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

function scanGenerated(manifest) {
  const genDir = path.join(ROOT, 'batches', 'generated');
  if (!fs.existsSync(genDir)) return { linked: 0 };
  const files = fs.readdirSync(genDir).filter((f) => f.endsWith('.json') && !f.includes('.raw.'));
  let linked = 0;
  for (const pair of manifest.pairs) {
    const prefix =
      pair.module === 'lesen'
        ? `lesen-t${pair.teil}-`
        : pair.module === 'horen'
          ? `horen-t${pair.teil}-`
          : `${pair.module}-`;
    const match = files.find((f) => f.startsWith(prefix));
    if (!match) continue;
    const dest = path.join(PAIRS_DIR, pair.id, 'without-feedback.json');
    if (fs.existsSync(dest)) continue;
    fs.copyFileSync(path.join(genDir, match), dest);
    const metaPath = path.join(PAIRS_DIR, pair.id, 'pair-meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.status = 'baseline_only';
    meta.baselineSource = `batches/generated/${match}`;
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    linked++;
  }
  return { linked };
}

function summarize() {
  const pairs = fs.readdirSync(PAIRS_DIR).filter((d) => fs.statSync(path.join(PAIRS_DIR, d)).isDirectory());
  let complete = 0;
  let baselineOnly = 0;
  let improved = 0;
  let worsened = 0;
  for (const id of pairs) {
    const dir = path.join(PAIRS_DIR, id);
    const hasOff = fs.existsSync(path.join(dir, 'without-feedback.json'));
    const hasOn = fs.existsSync(path.join(dir, 'with-feedback.json'));
    const reportPath = path.join(dir, 'audit-report.json');
    if (hasOff && hasOn) complete++;
    else if (hasOff) baselineOnly++;
    if (fs.existsSync(reportPath)) {
      const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (r.improvedAvoid || r.improvedArtificial) improved++;
      if ((r.avoidHitsDelta || 0) < 0) worsened++;
    }
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    pairs: pairs.length,
    completeAb: complete,
    baselineOnly,
    auditsImproved: improved,
    auditsWorsenedAvoid: worsened,
  };
  fs.writeFileSync(
    path.join(EVAL_DIR, 'reports', 'summary-latest.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function main() {
  const args = process.argv.slice(2);
  ensureDirs();
  const manifest = writeManifest();
  writePairPlaceholders(manifest);
  writeReadme();
  writeReportTemplate();

  if (args.includes('--scan-generated')) {
    const r = scanGenerated(manifest);
    console.log(`Linked baselines: ${r.linked}`);
  }
  if (args.includes('--summarize')) {
    summarize();
  } else {
    console.log(`Prepared ${manifest.targetPairs} pairs under generation-evaluation/`);
    console.log('Next: fill A/B JSON files, then --summarize');
  }
}

main();
