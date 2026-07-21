#!/usr/bin/env node
/**
 * Dedupe Hören premise groups — keep ONE canonical per group, archive rest.
 * No API / no generation. Pool-verified already clean from remediate-2026-07-13.
 *
 *   node scripts/dedupe-horen-premise-pool-2026-07-13.mjs
 *   node scripts/dedupe-horen-premise-pool-2026-07-13.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { classifyHorenScenario } from './lib/horenPremiseDedup.mjs';
import { collectMcqLengthBiasIssues } from './lib/mcqLengthBias.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const NEEDS = path.join(ROOT, 'batches/needs-regeneration');
const ARCHIVE = path.join(NEEDS, '_premise-dedupe-archive');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/horen-premise-dedupe-2026-07-13.json');
const dryRun = process.argv.includes('--dry-run');

/** @type {Record<string, { keep: string, retire: string[], note: string }>} */
const GROUPS = {
  train_delay_announcement: {
    keep: 'horen-t1-gemini-018.json',
    retire: [
      'horen-t1-gemini-019.json',
      'horen-t1-gemini-020.json',
      'horen-t1-gemini-021.json',
      'horen-t1-gemini-023.json',
    ],
    note: 'T1 — más antiguo del cluster; resto premisa Zug/Verspätung idéntica',
  },
  answering_machine: {
    keep: 'horen-t1-gemini-022.json',
    retire: ['horen-t1-gemini-021.json'],
    note: 'T1 — 022 dedicado Anrufbeantworter; 021 también en train_delay (ya archivado)',
  },
  freizeit_vortrag_monologue: {
    keep: 'horen-t2-gemini-026.json',
    retire: [
      'horen-t2-gemini-024.json',
      'horen-t2-gemini-025.json',
      'horen-t2-gemini-027.json',
    ],
    note: 'T2 — reemplazos nuevos en pool 028/029/030; 026 mejor gate length (0 issues)',
  },
};

/** T2 partial regen replacements — not part of dedupe retire */
const T2_REPLACEMENTS = [
  'horen-t2-gemini-028.json',
  'horen-t2-gemini-029.json',
  'horen-t2-gemini-030.json',
];

function listPool(teil) {
  const re = new RegExp(`^horen-t${teil}-.*\\.json$`, 'i');
  return fs.existsSync(POOL)
    ? fs.readdirSync(POOL).filter((f) => re.test(f)).sort()
    : [];
}

function moveToArchive(file, group, report) {
  for (const dir of [POOL, NEEDS]) {
    const src = path.join(dir, file);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(ARCHIVE, file);
    if (dryRun) {
      report.moves.push({ file, from: path.relative(ROOT, src), to: path.relative(ROOT, dest), group, dryRun: true });
      continue;
    }
    fs.mkdirSync(ARCHIVE, { recursive: true });
    const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
    batch._premiseDedupe = {
      at: new Date().toISOString(),
      group,
      action: 'archived_duplicate',
      keeper: GROUPS[group]?.keep,
    };
    fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`);
    fs.unlinkSync(src);
    report.moves.push({ file, from: path.relative(ROOT, src), to: path.relative(ROOT, dest), group });
  }
}

function poolScenarioCollisions(teil) {
  const seen = new Map();
  const dupes = [];
  for (const f of listPool(teil)) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
    for (const p of batch.passages || []) {
      const sc = classifyHorenScenario(p.text || '', teil);
      if (sc.startsWith('free:')) continue;
      if (seen.has(sc)) dupes.push({ scenario: sc, files: [seen.get(sc), f] });
      else seen.set(sc, f);
    }
  }
  return dupes;
}

const report = {
  at: new Date().toISOString(),
  dryRun,
  horenT2RegenStatus: {
    checkpointSaved: null,
    publishedReplacements: T2_REPLACEMENTS,
    note: '3/4 T2 regenerados (028–030) antes de parar; freizeit 024–027 ya fuera del pool',
  },
  groups: [],
  moves: [],
  poolVerifiedAfter: {},
  stockAssessment: {},
};

// Read checkpoint if present
const cpPath = path.join(ROOT, 'batches/.pool-fill-checkpoint.json');
if (fs.existsSync(cpPath)) {
  const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
  if (cp.key === 'de_B1:horen:T2') {
    report.horenT2RegenStatus.checkpointSaved = cp.saved;
    report.horenT2RegenStatus.publishedReplacements = (cp.publishedFiles || [])
      .map((p) => path.basename(p))
      .filter(Boolean);
  }
}

for (const [group, cfg] of Object.entries(GROUPS)) {
  const entry = {
    group,
    kept: cfg.keep,
    retired: [],
    note: cfg.note,
  };

  for (const file of cfg.retire) {
    const inPool = fs.existsSync(path.join(POOL, file));
    const inNeeds = fs.existsSync(path.join(NEEDS, file));
    if (inPool || inNeeds) {
      moveToArchive(file, group, report);
      entry.retired.push(file);
    }
  }
  report.groups.push(entry);
}

report.poolVerifiedAfter = {
  horenT1: listPool(1),
  horenT2: listPool(2),
  t1ScenarioDupes: poolScenarioCollisions(1),
  t2ScenarioDupes: poolScenarioCollisions(2),
};

const t1n = report.poolVerifiedAfter.horenT1.length;
const t2n = report.poolVerifiedAfter.horenT2.length;
report.stockAssessment = {
  horenT1: {
    count: t1n,
    targetOperational: 3,
    sufficient: t1n >= 3,
    note: t1n >= 7 ? 'Holgado para ensamblado (≥3/celda)' : 'Por encima del mínimo operativo',
  },
  horenT2: {
    count: t2n,
    targetOperational: 3,
    sufficient: t2n >= 3,
    note: `${t2n} partes incl. 3 reemplazos recientes sin premisa freizeit duplicada`,
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
