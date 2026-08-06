#!/usr/bin/env node
/**
 * Rescata partes atascadas en batches/generated/{level}/ por el bug inMemory+writeFile
 * (Lesen pool-fill). Simula pool-ready y promueve las que pasan.
 *
 *   node scripts/rescue-generated-stuck.mjs
 *   node scripts/rescue-generated-stuck.mjs --dry-run
 *   node scripts/rescue-generated-stuck.mjs --level B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { finalizePoolReady } from './lib/finalizePoolReady.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';
import { poolReadyCheckWithRepair, resetPoolReadyCaches } from './lib/poolReadyCheck.mjs';

loadEnvFile();

const PART_RE = /^(lesen|horen|schreiben|sprechen)-/i;

function parseArgs(argv) {
  const opts = { dryRun: false, levels: ['B1', 'A2'] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--level') opts.levels = [String(argv[++i] || 'B1').toUpperCase()];
  }
  return opts;
}

function listStuckFiles(level) {
  const dir = path.join(ROOT, 'batches/generated', level);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && PART_RE.test(f) && !f.includes('-report'))
    .sort()
    .map((f) => path.join(dir, f));
}

function classifyVerdict(result) {
  if (result.verdict === 'READY') return 'pool-verified';
  if (result.q1OnlyReject) return 'pool-content-ok-lesen';
  const reasons = result.rejectReasons || result.reasons || [];
  return reasons.length ? `reject:${reasons.slice(0, 2).join('+')}` : 'reject';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  resetPoolReadyCaches();

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    levels: {},
    totals: { stuck: 0, rescued: 0, genuineBad: 0 },
  };

  for (const level of opts.levels) {
    const files = listStuckFiles(level);
    const levelReport = {
      stuck: files.length,
      rescued: [],
      genuineBad: [],
      byDest: {},
    };

    for (const absPath of files) {
      const file = path.basename(absPath);
      let batch;
      try {
        batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      } catch (err) {
        levelReport.genuineBad.push({ file, dest: 'parse_error', reasons: [err.message] });
        continue;
      }

      const enriched = enrichBatchMetadata(batch).batch;
      const check = await poolReadyCheckWithRepair(enriched, { file, level });
      const simDest = classifyVerdict(check);

      if (check.verdict === 'READY' || check.q1OnlyReject) {
        levelReport.byDest[simDest] = (levelReport.byDest[simDest] || 0) + 1;
        if (opts.dryRun) {
          levelReport.rescued.push({ file, simDest, reasons: [] });
        } else {
          try {
            const promo = await finalizePoolReady(absPath, batch);
            const dest =
              promo.verdict === 'READY'
                ? 'pool-verified'
                : promo.q1OnlyReject
                  ? 'pool-content-ok-lesen'
                  : classifyVerdict({ verdict: promo.verdict, reasons: promo.reasons });
            levelReport.rescued.push({ file, simDest, dest, poolPath: promo.poolPath });
          } catch (err) {
            levelReport.genuineBad.push({ file, dest: 'promote_error', reasons: [err.message] });
          }
        }
      } else {
        levelReport.genuineBad.push({
          file,
          dest: simDest,
          reasons: check.rejectReasons || check.reasons || [],
        });
        if (!opts.dryRun) {
          try {
            await finalizePoolReady(absPath, batch);
          } catch (_) {
            /* moves to needs-regeneration inside finalizePoolReady */
          }
        }
      }
    }

    levelReport.rescuedCount = levelReport.rescued.length;
    levelReport.genuineBadCount = levelReport.genuineBad.length;
    summary.levels[level] = levelReport;
    summary.totals.stuck += levelReport.stuck;
    summary.totals.rescued += levelReport.rescuedCount;
    summary.totals.genuineBad += levelReport.genuineBadCount;
  }

  const reportPath = path.join(ROOT, 'batches/ready/RESCUE-GENERATED-REPORT.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log('\n=== Rescue generated/ stuck content ===');
  console.log(`Dry run: ${opts.dryRun}`);
  for (const [lv, rep] of Object.entries(summary.levels)) {
    console.log(`\n${lv}: ${rep.stuck} atascados → ${rep.rescuedCount} rescatados, ${rep.genuineBadCount} genuinamente malos`);
    if (rep.rescued.length) {
      console.log('  Rescatados:');
      for (const r of rep.rescued.slice(0, 20)) {
        console.log(`    · ${r.file} → ${r.dest || r.simDest}`);
      }
      if (rep.rescued.length > 20) console.log(`    … +${rep.rescued.length - 20} más`);
    }
    if (rep.genuineBad.length) {
      console.log('  Genuinamente malos (muestra):');
      for (const b of rep.genuineBad.slice(0, 15)) {
        console.log(`    · ${b.file}: ${(b.reasons || []).slice(0, 2).join(', ') || b.dest}`);
      }
      if (rep.genuineBad.length > 15) console.log(`    … +${rep.genuineBad.length - 15} más`);
    }
  }
  console.log(`\nTOTAL: ${summary.totals.stuck} atascados | ${summary.totals.rescued} rescatados | ${summary.totals.genuineBad} malos`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
