/**
 * Recheck Lesen in needs-regeneration after Q1 mirror-index fix.
 * Promotes: READY → pool-verified | Q1-only → pool-content-ok-lesen
 * Redundant copies already in ready/lesen are removed from needs-regen.
 *
 *   node scripts/recheck-lesen-q1-mirror-fix.mjs
 *   node scripts/recheck-lesen-q1-mirror-fix.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  poolReadyCheckWithRepair,
  resetPoolReadyCaches,
  getDedupCorpusCache,
  getDiscardCache,
  loadQ2EvaluationCache,
} from './lib/poolReadyCheck.mjs';
import {
  POOL_VERIFIED_DIR,
  POOL_CONTENT_OK_LESEN_DIR,
  NEEDS_REGENERATION_DIR,
  writePoolVerified,
} from './lib/finalizePoolReady.mjs';

const READY_LESEN = path.join(ROOT, 'batches/ready/lesen');
const POOL_CONTENT_OK = path.join(ROOT, 'batches/ready/pool-content-ok');
const dryRun = process.argv.includes('--dry-run');

fs.mkdirSync(POOL_CONTENT_OK_LESEN_DIR, { recursive: true });
fs.mkdirSync(POOL_VERIFIED_DIR, { recursive: true });

resetPoolReadyCaches();
const corpus = getDedupCorpusCache({ reload: true });
const discard = getDiscardCache({ reload: true });
const q2Cache = loadQ2EvaluationCache({ reload: true });

const files = fs
  .readdirSync(NEEDS_REGENERATION_DIR)
  .filter((f) => /^lesen-.*\.json$/i.test(f))
  .sort();

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  totalLesen: files.length,
  outcomes: {
    ready: [],
    q1Only: [],
    stillReject: [],
    redundantReadyLesen: [],
    redundantPoolContentOk: [],
  },
  byTeil: {},
  stillQ1Reasons: {},
};

function bumpTeil(file, field) {
  const m = file.match(/lesen-t(\d)/i);
  const t = m ? `t${m[1]}` : 't?';
  if (!report.byTeil[t]) report.byTeil[t] = { ready: 0, q1Only: 0, reject: 0, redundant: 0 };
  report.byTeil[t][field]++;
}

for (const file of files) {
  const abs = path.join(NEEDS_REGENERATION_DIR, file);
  const inReady = fs.existsSync(path.join(READY_LESEN, file));
  const inPco = fs.existsSync(path.join(POOL_CONTENT_OK, file));

  // Same stem already canonical in ready/lesen → drop needs-regen copy (hygiene)
  if (inReady) {
    report.outcomes.redundantReadyLesen.push(file);
    bumpTeil(file, 'redundant');
    if (!dryRun) {
      try { fs.unlinkSync(abs); } catch { /* */ }
    }
    continue;
  }

  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const sourcePath = `batches/needs-regeneration/${file}`;
  const result = await poolReadyCheckWithRepair(batch, {
    file,
    sourcePath,
    corpus,
    discard,
    q2Cache,
  });

  if (result.verdict === 'READY') {
    report.outcomes.ready.push(file);
    bumpTeil(file, 'ready');
    if (!dryRun) {
      writePoolVerified(file, result.batch || batch);
      try { fs.unlinkSync(abs); } catch { /* */ }
      const pco = path.join(POOL_CONTENT_OK, file);
      if (fs.existsSync(pco)) {
        try { fs.unlinkSync(pco); } catch { /* */ }
      }
    }
    continue;
  }

  if (result.q1OnlyReject) {
    report.outcomes.q1Only.push({
      file,
      reasons: result.rejectReasons,
      sample: (result.details || []).slice(0, 2).map((d) => d.detail),
    });
    bumpTeil(file, 'q1Only');
    for (const r of result.rejectReasons || []) {
      report.stillQ1Reasons[r] = (report.stillQ1Reasons[r] || 0) + 1;
    }
    if (!dryRun) {
      const { _poolRejectReason, _poolRejectAt, _poolRejectDetails, ...clean } = result.batch || batch;
      const tagged = {
        ...clean,
        _poolContentOkLesenAt: new Date().toISOString(),
        _poolContentOkLesenNote:
          'gates pass except Q1; shadow until 2026-07-23 — accepted duplicate risk',
        _poolRejectReason: (result.rejectReasons || []).join(', '),
        _poolRejectDetails: (result.details || []).slice(0, 8),
      };
      fs.writeFileSync(
        path.join(POOL_CONTENT_OK_LESEN_DIR, file),
        `${JSON.stringify(tagged, null, 2)}\n`,
      );
      try { fs.unlinkSync(abs); } catch { /* */ }
    }
    continue;
  }

  report.outcomes.stillReject.push({
    file,
    reasons: result.rejectReasons || result.reasons,
    alsoInPoolContentOk: inPco,
  });
  bumpTeil(file, 'reject');
  if (!dryRun && result.batch) {
    const tagged = {
      ...result.batch,
      _poolRejectReason: (result.rejectReasons || result.reasons || []).join(', '),
      _poolRejectAt: new Date().toISOString(),
      _poolRejectDetails: (result.details || []).slice(0, 12),
    };
    fs.writeFileSync(abs, `${JSON.stringify(tagged, null, 2)}\n`);
  }
}

report.summary = {
  readyPromoted: report.outcomes.ready.length,
  q1OnlyToPool: report.outcomes.q1Only.length,
  stillReject: report.outcomes.stillReject.length,
  redundantDropped: report.outcomes.redundantReadyLesen.length,
  // Already available for assembly without this backlog:
  alreadyInReadyLesen: report.outcomes.redundantReadyLesen.length,
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/lesen-q1-mirror-fix-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/LESEN-Q1-MIRROR-FIX-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Lesen Q1 mirror fix — 2026-07-10',
  '',
  `**Dry-run:** ${dryRun}`,
  '',
  '## Causa',
  '',
  '`poolReadyCheck` pasaba `corpusExcludingSource(...)` pero **`index: corpus.index`** (índice completo),',
  'anulando la exclusión por ID lógico. Mismo stem en `ready/lesen` / `pool-content-ok` / `needs-regeneration`',
  'se reportaba como `exact_duplicate` (falso mirror).',
  '',
  '## Resultado',
  '',
  `| Cubo | N |`,
  `|------|--:|`,
  `| READY → pool-verified | ${report.summary.readyPromoted} |`,
  `| Solo Q1 → pool-content-ok-lesen | ${report.summary.q1OnlyToPool} |`,
  `| Sigue REJECT (contenido/otro) | ${report.summary.stillReject} |`,
  `| Redundante (ya en ready/lesen) — eliminado de needs-regen | ${report.summary.redundantDropped} |`,
  '',
  '### Por Teil',
  '',
  '| Teil | ready | q1-only | reject | redundant |',
  '|------|------:|--------:|-------:|----------:|',
  ...Object.keys(report.byTeil)
    .sort()
    .map((t) => {
      const c = report.byTeil[t];
      return `| ${t} | ${c.ready} | ${c.q1Only} | ${c.reject} | ${c.redundant} |`;
    }),
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));

console.log(JSON.stringify(report.summary, null, 2));
console.log('byTeil', report.byTeil);
console.log(`\nWrote ${outMd}`);
