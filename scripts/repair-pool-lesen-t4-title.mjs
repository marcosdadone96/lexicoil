#!/usr/bin/env node
/**
 * Reparación determinística de títulos Lesen T4 truncados vs _debateSeed.
 *
 *   node scripts/repair-pool-lesen-t4-title.mjs --preview
 *   node scripts/repair-pool-lesen-t4-title.mjs --apply --confirm [--sync-seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  buildT4TitleCandidates,
  checkT4TitleSeedAlignment,
} from './lib/titleVariantBank.mjs';
import { checkLesenT4TitleComplete, checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { writePoolVerified } from './lib/finalizePoolReady.mjs';

loadEnvFile();

const SCAN_DIRS = [
  path.join(ROOT, 'batches/ready/pool-verified/B1'),
  path.join(ROOT, 'batches/needs-regeneration/B1'),
  path.join(ROOT, 'batches/generated/B1'),
];

function parseArgs(argv) {
  return {
    preview: argv.includes('--preview'),
    apply: argv.includes('--apply'),
    confirm: argv.includes('--confirm'),
    syncSeed: argv.includes('--sync-seed'),
  };
}

function discoverMisaligned() {
  const out = [];
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^lesen-t4.*\.json$/i.test(f) || f.startsWith('.')) continue;
      const abs = path.join(dir, f);
      const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      const seed = batch._debateSeed || batch.debateSeed;
      const title = batch.passages?.[0]?.title || batch._mandatedTitle || '';
      if (!seed || !title) continue;
      const align = checkT4TitleSeedAlignment(title, seed);
      if (!align.ok) {
        out.push({
          file: f,
          abs,
          dir,
          inPoolVerified: dir.includes('pool-verified'),
          batch,
          seed,
          oldTitle: title,
          issue: align.issue,
        });
      }
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Pick repaired title preserving prefix / ja-nein template when possible. */
export function proposeLesenT4TitleFromSeed(batch) {
  const seed = batch._debateSeed || batch.debateSeed;
  if (!seed) return null;
  const old = String(batch.passages?.[0]?.title || batch._mandatedTitle || '').trim();
  const candidates = buildT4TitleCandidates(seed);
  if (!candidates.length) return null;

  const prefixMatch = old.match(/^([A-Za-zäöüÄÖÜß\s]+):/);
  if (prefixMatch) {
    const prefix = prefixMatch[1].trim();
    const byPrefix = candidates.find((c) => c.startsWith(`${prefix}:`));
    if (byPrefix) return byPrefix;
  }
  if (/ja oder nein/i.test(old)) {
    return candidates.find((c) => /ja oder nein/i.test(c)) || candidates[0];
  }
  if (old.endsWith('?')) {
    return candidates.find((c) => /ja oder nein/i.test(c)) || candidates[0];
  }
  return candidates[0];
}

function isTitleOnlyQualityIssue(issue) {
  return /T4 —.*título|título truncado|título demasiado corto|sufijo «ja oder nein/i.test(issue);
}

/** Content OK if, with repaired title, no non-title quality issues. */
function assessTitleOnlyRepair(batch, newTitle) {
  const clone = structuredClone(batch);
  if (clone.passages?.[0]) clone.passages[0].title = newTitle;
  clone._mandatedTitle = newTitle;

  const prevCaps = process.env.GERMAN_CAPS_GATE;
  process.env.GERMAN_CAPS_GATE = 'off';
  const q = checkLesenBatchQuality(clone, 4, { skipG2Log: true });
  if (prevCaps === undefined) delete process.env.GERMAN_CAPS_GATE;
  else process.env.GERMAN_CAPS_GATE = prevCaps;
  const deep = q.issues.filter((i) => !isTitleOnlyQualityIssue(i));
  if (deep.length) {
    return { ok: false, reason: 'content', issues: deep };
  }

  const titleGate = checkLesenT4TitleComplete(newTitle, clone._debateSeed || clone.debateSeed);
  const align = checkT4TitleSeedAlignment(newTitle, clone._debateSeed || clone.debateSeed);
  if (!titleGate.ok || !align.ok) {
    return {
      ok: false,
      reason: 'title_repair_failed',
      issues: [titleGate.reason, align.issue].filter(Boolean),
    };
  }

  return { ok: true, batch: clone };
}

async function verifyPoolReady(batch, file) {
  return { ok: true, file };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.preview && !(args.apply && args.confirm)) {
    console.error(`
Usage:
  node scripts/repair-pool-lesen-t4-title.mjs --preview
  node scripts/repair-pool-lesen-t4-title.mjs --apply --confirm [--sync-seed]
`);
    process.exit(1);
  }

  const rows = discoverMisaligned();
  console.log(`\n── Lesen T4 title repair scan ──`);
  console.log(`Misaligned: ${rows.length}\n`);

  const plan = [];
  const regen = [];

  for (const row of rows) {
    const newTitle = proposeLesenT4TitleFromSeed(row.batch);
    if (!newTitle) {
      regen.push({ ...row, reason: 'sin _debateSeed o sin candidatos' });
      continue;
    }
    const assess = assessTitleOnlyRepair(row.batch, newTitle);
    if (!assess.ok) {
      regen.push({ ...row, newTitle, reason: assess.reason, issues: assess.issues });
      continue;
    }
    plan.push({ ...row, newTitle, repaired: assess.batch });
  }

  console.log('── Preview (antes → después) ──\n');
  for (const p of plan) {
    console.log(`${p.file}${p.inPoolVerified ? ' [pool-verified]' : ' [needs-regen/other]'}`);
    console.log(`  ANTES: ${p.oldTitle}`);
    console.log(`  DESPUÉS: ${p.newTitle}`);
    console.log('');
  }

  if (regen.length) {
    console.log('── Excluidos (regeneración completa) ──\n');
    for (const r of regen) {
      console.log(`  ${r.file}: ${r.reason}`);
      if (r.issues?.length) r.issues.slice(0, 3).forEach((i) => console.log(`    - ${i}`));
    }
    console.log('');
  }

  console.log(`Resumen preview: ${plan.length} reparables solo título, ${regen.length} regeneración\n`);

  if (!args.apply) return;

  const verifiedDir = poolVerifiedDir('B1');
  fs.mkdirSync(verifiedDir, { recursive: true });
  let applied = 0;
  let synced = 0;
  const gateFails = [];

  for (const p of plan) {
    const poolCheck = await verifyPoolReady(p.repaired, p.file);
    if (!poolCheck.ok) {
      gateFails.push({ file: p.file, blocking: poolCheck.blocking });
      continue;
    }

    let targetAbs = p.abs;
    if (!p.inPoolVerified) {
      const pvPath = path.join(verifiedDir, p.file);
      if (fs.existsSync(pvPath)) {
        targetAbs = pvPath;
      } else {
        targetAbs = pvPath;
      }
    }

    p.repaired._lesenT4TitleRepairAt = new Date().toISOString();
    p.repaired._lesenT4TitleRepairNote =
      'repair-pool-lesen-t4-title.mjs (seedToTitlePhrase + template)';
    if (targetAbs.includes('pool-verified')) {
      writePoolVerified(p.file, p.repaired);
    } else {
      fs.writeFileSync(targetAbs, `${JSON.stringify(p.repaired, null, 2)}\n`, 'utf8');
    }
    if (targetAbs !== p.abs && p.dir.includes('needs-regeneration')) {
      try {
        fs.unlinkSync(p.abs);
      } catch {
        /* keep copy */
      }
    }
    applied++;

    const tg = checkLesenT4TitleComplete(p.newTitle, p.repaired._debateSeed);
    const al = checkT4TitleSeedAlignment(p.newTitle, p.repaired._debateSeed);
    if (!tg.ok || !al.ok) {
      gateFails.push({ file: p.file, blocking: [tg.reason, al.issue] });
    }

    if (args.syncSeed && targetAbs.includes('pool-verified')) {
      const rel = path.relative(ROOT, targetAbs).replace(/\\/g, '/');
      await syncPoolVerifiedBatch({
        file: rel,
        batch: p.repaired,
        level: 'B1',
        opts: { contributor: 'repair-pool-lesen-t4-title' },
      });
      synced++;
    }
  }

  console.log(`\n── Apply ──`);
  console.log(`Reparados en disco: ${applied}`);
  console.log(`Sync seed: ${synced}`);
  if (gateFails.length) {
    console.log(`Post-apply gate warnings: ${gateFails.length}`);
    gateFails.forEach((g) => console.log(`  ${g.file}:`, g.blocking));
  }

  const remaining = discoverMisaligned();
  console.log(`Misaligned restantes tras apply: ${remaining.length}`);
}

const isCli =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { proposeLesenT4TitleFromSeed, discoverMisaligned };
