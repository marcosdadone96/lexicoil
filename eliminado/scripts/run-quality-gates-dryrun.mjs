#!/usr/bin/env node
/**
 * Dry-run bulk para gates Q4 / Q1a / Q3-A.
 *
 *   node scripts/run-quality-gates-dryrun.mjs
 *   node scripts/run-quality-gates-dryrun.mjs --pool ready --validation
 *   node scripts/run-quality-gates-dryrun.mjs --file batches/generated/lesen-t3-auto-qeh7ew.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { runMetadataSchemaGate } from './lib/qualityGates/metadataSchemaGate.mjs';
import { runDuplicateContentGate } from './lib/qualityGates/duplicateContentGate.mjs';
import { runPassageCoherenceGate } from './lib/qualityGates/passageCoherenceGate.mjs';
import { buildDedupCorpus, corpusExcludingSource } from './lib/qualityGates/dedupCorpus.mjs';
import { saveDedupIndex } from './lib/qualityGates/dedupIndex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const READY_DIR = path.join(ROOT, 'batches/ready/lesen');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const BANK_PATH = path.join(ROOT, 'library/de/B1/questions.json');
const GATE_LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const VALIDATION_FILES = [
  'lesen-t5-gemini-067.json', 'lesen-t5-gemini-066.json', 'lesen-t5-gemini-065.json',
  'lesen-t5-gemini-064.json', 'lesen-t5-gemini-063.json', 'lesen-t4-gemini-037.json',
  'lesen-t4-gemini-036.json', 'lesen-t3-auto-qeh7ew.json', 'lesen-t3-auto-omsq86.json',
  'lesen-t3-auto-tz7n7y.json', 'lesen-t2-gemini-093.json', 'lesen-t2-gemini-092.json',
  'lesen-t2-gemini-091.json', 'lesen-t1-gemini-177.json', 'lesen-t1-gemini-176.json',
];

/** Expectativas humanas para tabla de validación (subset con ground truth claro). */
const EXPECTED = {
  'lesen-t3-auto-qeh7ew.json': {
    'Q1-duplicateContent': 'block',
    'Q3-passageCoherence': 'pass',
    note: 'dup con tz7n7y',
  },
  'lesen-t3-auto-tz7n7y.json': {
    'Q1-duplicateContent': 'block',
    'Q3-passageCoherence': 'pass',
    note: 'dup con qeh7ew',
  },
  'lesen-t5-gemini-063.json': {
    'Q3-passageCoherence': 'block',
    note: 'markdown ** + sentence case warn',
  },
  'lesen-t5-gemini-065.json': {
    'Q3-passageCoherence': 'block',
    note: 'markdown ** + sentence case warn',
  },
  'lesen-t1-gemini-177.json': {
    'Q1-duplicateContent': 'block|warn',
    note: 'dup exacto Theaterverein (si en bank/generated)',
  },
  'lesen-t2-gemini-091.json': {
    'Q1-duplicateContent': 'block|warn',
    note: 'dup exacto Familienzeit',
  },
};

function parseArgs(argv) {
  const out = {
    pool: 'ready',
    validation: false,
    file: null,
    rebuildIndex: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pool') out.pool = argv[++i] || 'ready';
    else if (a === '--validation') out.validation = true;
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--no-rebuild-index') out.rebuildIndex = false;
  }
  return out;
}

function listPoolFiles(pool) {
  if (pool === 'ready') {
    return fs.readdirSync(READY_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ file: f, abs: path.join(READY_DIR, f), profile: 'servible' }));
  }
  if (pool === 'generated') {
    return fs.readdirSync(GENERATED_DIR)
      .filter((f) => /^lesen-t.*\.json$/i.test(f))
      .map((f) => ({ file: f, abs: path.join(GENERATED_DIR, f), profile: 'generated' }));
  }
  return [];
}

function relSource(abs) {
  const norm = abs.replace(/\\/g, '/');
  const idx = norm.indexOf('batches/');
  return idx >= 0 ? norm.slice(idx) : path.basename(abs);
}

function summarize(verdicts) {
  const byGate = {};
  for (const v of verdicts) {
    if (!byGate[v.gate]) {
      byGate[v.gate] = { pass: 0, warn: 0, block: 0, findings: 0, files: 0 };
    }
    const g = byGate[v.gate];
    g[v.verdict]++;
    g.findings += v.findings.length;
    g.files++;
  }
  return byGate;
}

function verdictMatches(expected, actual) {
  if (!expected) return null;
  const alts = String(expected).split('|');
  return alts.includes(actual);
}

async function main() {
  const args = parseArgs(process.argv);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.mkdirSync(GATE_LOG_DIR, { recursive: true });

  let targets = [];
  if (args.file) {
    const abs = path.isAbsolute(args.file) ? args.file : path.join(ROOT, args.file);
    targets = [{ file: path.basename(abs), abs, profile: abs.includes('ready/lesen') ? 'servible' : 'generated' }];
  } else {
    targets = listPoolFiles(args.pool);
    if (args.validation) {
      for (const f of VALIDATION_FILES) {
        const abs = path.join(GENERATED_DIR, f);
        if (fs.existsSync(abs) && !targets.some((t) => t.file === f)) {
          targets.push({ file: f, abs, profile: 'generated' });
        }
      }
    }
  }

  console.log(`Quality gates dry-run — ${targets.length} archivos`);

  const corpusDirs = [GENERATED_DIR, READY_DIR];
  let fullCorpus = null;
  if (args.rebuildIndex) {
    fullCorpus = buildDedupCorpus({ dirs: corpusDirs, bankPath: BANK_PATH });
    saveDedupIndex(fullCorpus.index);
    console.log(`Dedup index: ${fullCorpus.entries.length} entradas → batches/ready/.dedup-index.json`);
  }

  const allVerdicts = [];
  const validationRows = [];

  for (const t of targets) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(t.abs, 'utf8'));
    } catch (e) {
      console.warn(`SKIP ${t.file}: ${e.message}`);
      continue;
    }
    const source = relSource(t.abs);

    const corpusExcl = corpusExcludingSource(fullCorpus, source);

    const gates = [
      runMetadataSchemaGate(batch, { file: source, profile: t.profile }),
      runDuplicateContentGate(batch, {
        file: source,
        selfSource: source,
        corpus: corpusExcl,
        index: corpusExcl.index,
      }),
      runPassageCoherenceGate(batch, { file: source }),
    ];

    for (const v of gates) {
      allVerdicts.push(v);
      const logPath = path.join(GATE_LOG_DIR, `${v.gate}-${stamp}.jsonl`);
      fs.appendFileSync(logPath, `${JSON.stringify(v)}\n`);

      const exp = EXPECTED[t.file]?.[v.gate];
      if (exp !== undefined) {
        const match = verdictMatches(exp, v.verdict);
        validationRows.push({
          gate: v.gate,
          file: t.file,
          expected: exp,
          actual: v.verdict,
          match: match ? 'sí' : 'no',
          findings: v.findings.map((f) => f.rule).join(', '),
          note: EXPECTED[t.file]?.note || '',
        });
      }
    }
  }

  const summary = summarize(allVerdicts);
  const reportPath = path.join(GATE_LOG_DIR, `dryrun-summary-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    files: targets.length,
    summary,
    validationRows,
  }, null, 2));

  console.log('\n=== Resumen por gate ===');
  for (const [gate, s] of Object.entries(summary)) {
    console.log(`${gate}: pass=${s.pass} warn=${s.warn} block=${s.block} findings=${s.findings}`);
  }

  if (validationRows.length) {
    console.log('\n=== Validación humana (subset) ===');
    console.log('gate | archivo | esperado | obtenido | coincide | findings');
    for (const r of validationRows) {
      console.log(`${r.gate} | ${r.file} | ${r.expected} | ${r.actual} | ${r.match} | ${r.findings}`);
    }
  }

  // Caso referencia qeh7ew↔tz7n7y
  const dupQeh = allVerdicts.find((v) => v.file.endsWith('qeh7ew.json') && v.gate === 'Q1-duplicateContent');
  const dupTz = allVerdicts.find((v) => v.file.endsWith('tz7n7y.json') && v.gate === 'Q1-duplicateContent');
  if (dupQeh || dupTz) {
    console.log('\n=== Caso referencia T3 qeh7ew↔tz7n7y ===');
    for (const v of [dupQeh, dupTz].filter(Boolean)) {
      console.log(`${v.file}: ${v.verdict} — ${v.findings.map((f) => `${f.rule}: ${f.detail}`).join('; ')}`);
    }
  }

  console.log(`\nReporte: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
