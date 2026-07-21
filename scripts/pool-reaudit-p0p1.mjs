#!/usr/bin/env node
/**
 * Re-audit pool with P0 (CHK-6 B2) + P1 (CHK-26) gates; optional jubilation.
 *
 *   node scripts/pool-reaudit-p0p1.mjs              # report only
 *   node scripts/pool-reaudit-p0p1.mjs --execute    # jubilate failures (Freizeit+Technik lesen)
 *   node scripts/pool-reaudit-p0p1.mjs --all-lesen    # include all verified lesen, not only F+T
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import { enrichRecordForAudit, isPartPoolReady } from './audit-pass-2.mjs';

const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const TOPICS = ['Freizeit', 'Technik'];
const TEILS = [1, 2, 3, 4, 5];

function isP0P1Failure(blocking) {
  return (blocking || []).some(
    (f) =>
      f.id === 'CHK-26'
      || (f.id === 'CHK-6' && String(f.message).includes('B2+')),
  );
}

function jubilate(rec, reason) {
  rec.verified = false;
  rec.jubilatedAt = new Date().toISOString();
  rec.jubilatedReason = reason;
  delete rec.sem1Ok;
  delete rec.sem1VerifiedAt;
}

function loadSourceBatch(rec) {
  if (!rec.sourceFile) return null;
  const p = path.join(ROOT, rec.sourceFile.replace(/\//g, path.sep));
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Prefer source batch (has passage topicTags) for accurate CHK-26 on legacy publishes. */
function buildAuditInput(rec) {
  const src = loadSourceBatch(rec);
  if (src) {
    return {
      ...src,
      module: rec.module,
      teil: rec.teil,
      topicTag: rec.topicTag || src.topicTag,
      _requestedTopic: rec.topicTag || src._requestedTopic || src.topicTag,
    };
  }
  return enrichRecordForAudit({
    ...rec,
    _requestedTopic: rec.topicTag || rec._requestedTopic,
  });
}

function cellKey(topic, teil) {
  return `${topic}×T${teil}`;
}

function countCells(records) {
  const counts = {};
  for (const topic of TOPICS) {
    counts[topic] = Object.fromEntries(TEILS.map((t) => [t, 0]));
  }
  for (const r of records) {
    const topic = normalizeB1Topic(r.topicTag);
    const teil = Number(r.teil);
    if (!TOPICS.includes(topic) || !TEILS.includes(teil)) continue;
    if (r.verified !== true || r.complete === false || r.disabled) continue;
    counts[topic][teil]++;
  }
  return counts;
}

function formatCellStatus(counts) {
  const lines = [];
  for (const topic of TOPICS) {
    const cells = TEILS.map((t) => {
      const n = counts[topic][t] || 0;
      const ok = n >= 1;
      return `T${t}:${n}${ok ? '' : ' ⚠'}`;
    });
    const full = TEILS.every((t) => (counts[topic][t] || 0) >= 1);
    lines.push(`  ${topic}: ${cells.join(' ')}  → ${full ? '5/5 ✓' : 'INCOMPLETO'}`);
  }
  return lines.join('\n');
}

async function main() {
  const execute = process.argv.includes('--execute');
  const allLesen = process.argv.includes('--all-lesen');

  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const records = pool.records || [];

  const candidates = records.filter((r) => {
    if (r.verified !== true || r.complete === false || r.disabled) return false;
    if (String(r.module).toLowerCase() !== 'lesen') return false;
    if (allLesen) return true;
    return TOPICS.includes(normalizeB1Topic(r.topicTag));
  });

  const beforeCounts = countCells(records);

  const report = {
    generatedAt: new Date().toISOString(),
    scope: allLesen ? 'all-verified-lesen' : 'Freizeit+Technik-lesen',
    candidates: candidates.length,
    ok: 0,
    failPool2: 0,
    failP0P1: 0,
    jubilated: 0,
    byTopic: {},
    byCell: {},
    failures: [],
  };

  for (const topic of TOPICS) {
    report.byTopic[topic] = { ok: 0, failP0P1: 0, jubilated: 0 };
  }

  for (const rec of candidates) {
    const topic = normalizeB1Topic(rec.topicTag) || '_none';
    const teil = Number(rec.teil);
    const ck = cellKey(topic, teil);

    const input = buildAuditInput(rec);
    const gate = await isPartPoolReady(input, { semantic: false });
    const p0p1 = !gate.ok && isP0P1Failure(gate.blocking);
    const p0 = (gate.blocking || []).filter(
      (f) => f.id === 'CHK-6' && String(f.message).includes('B2+'),
    );
    const p1 = (gate.blocking || []).filter((f) => f.id === 'CHK-26');

    if (gate.ok) {
      report.ok++;
      if (TOPICS.includes(topic)) report.byTopic[topic].ok++;
      continue;
    }

    report.failPool2++;
    if (p0p1) {
      report.failP0P1++;
      if (TOPICS.includes(topic)) report.byTopic[topic].failP0P1++;
    }

    const entry = {
      id: rec.id,
      topicTag: topic,
      teil,
      sourceFile: rec.sourceFile || null,
      p0p1,
      chk6B2: p0.length,
      chk26: p1.length,
      blocking: (gate.blocking || []).slice(0, 5).map((f) => ({
        id: f.id,
        message: String(f.message).slice(0, 100),
      })),
    };
    report.failures.push(entry);
    if (!report.byCell[ck]) report.byCell[ck] = [];
    report.byCell[ck].push(rec.id);

    if (execute && p0p1 && TOPICS.includes(topic)) {
      const chks = [...new Set((gate.blocking || []).map((f) => f.id))].join(',');
      jubilate(rec, `p0p1-reaudit:${chks}`);
      report.jubilated++;
      report.byTopic[topic].jubilated++;
    }
  }

  if (execute && report.jubilated > 0) {
    const backupDir = path.join(ROOT, 'library/reusable-seed/backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `de_B1.pre-p0p1-jubilate-${stamp}.json`);
    fs.copyFileSync(POOL_FILE, backupPath);
    pool.p0p1JubilatedAt = new Date().toISOString();
    pool.p0p1JubilateStats = {
      jubilated: report.jubilated,
      scope: report.scope,
    };
    fs.writeFileSync(POOL_FILE, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
    console.log('Backup:', path.relative(ROOT, backupPath));
  }

  const afterCounts = countCells(records);

  console.log('=== POOL RE-AUDIT P0+P1 (CHK-6 B2 + CHK-26) ===\n');
  console.log(`Scope: ${report.scope}`);
  console.log(`Candidates: ${report.candidates}`);
  console.log(`OK: ${report.ok}  FAIL POOL-2: ${report.failPool2}  FAIL P0+P1: ${report.failP0P1}`);
  if (execute) console.log(`Jubilated: ${report.jubilated}`);

  console.log('\n--- Freizeit / Technik (P0+P1 fails) ---');
  for (const t of TOPICS) {
    const b = report.byTopic[t];
    console.log(`  ${t}: ok=${b.ok} failP0P1=${b.failP0P1}${execute ? ` jubilated=${b.jubilated}` : ''}`);
  }

  console.log('\n--- Celdas con fallos P0+P1 ---');
  const cellKeys = Object.keys(report.byCell).sort();
  if (!cellKeys.length) console.log('  (ninguna)');
  for (const ck of cellKeys) {
    console.log(`  ${ck}: ${report.byCell[ck].length} parte(s)`);
  }

  console.log('\n--- Stock ANTES (verified por celda) ---');
  console.log(formatCellStatus(beforeCounts));
  if (execute) {
    console.log('\n--- Stock DESPUÉS (verified por celda) ---');
    console.log(formatCellStatus(afterCounts));
  }

  const outPath = path.join(ROOT, 'scripts/pool-reaudit-p0p1-report.json');
  fs.writeFileSync(outPath, `${JSON.stringify({ ...report, beforeCounts, afterCounts: execute ? afterCounts : null }, null, 2)}\n`, 'utf8');
  console.log(`\nReport: ${path.relative(ROOT, outPath)}`);

  if (execute && report.jubilated > 0) {
    console.log('\nRegenerando manifest…');
    const { spawnSync } = await import('node:child_process');
    spawnSync(process.execPath, ['scripts/build-pool-stock-manifest.mjs'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
