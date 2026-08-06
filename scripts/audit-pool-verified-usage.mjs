#!/usr/bin/env node
/**
 * Audit pool-verified usage: official catalog vs personal (seed/blobs) vs orphan.
 *   node scripts/audit-pool-verified-usage.mjs
 *   node scripts/audit-pool-verified-usage.mjs --level A2
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir, normalizeLevel } from './lib/batchPaths.mjs';

const require = createRequire(import.meta.url);
const { partPassesAssembleMode, batchHasOfficialQuarantine } = require(
  path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'),
);
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));

function parseArgs(argv) {
  let level = 'B1';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--level') level = String(argv[++i] || 'B1').toUpperCase();
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: node scripts/audit-pool-verified-usage.mjs [--level B1|A2]');
      process.exit(0);
    }
  }
  return { level: normalizeLevel(level) };
}

const args = parseArgs(process.argv.slice(2));
const LEVEL = args.level;
const PV_DIR = path.join(ROOT, 'batches/ready/pool-verified', LEVEL);
const CATALOG_DIR = path.join(ROOT, 'library/published-exams/de', LEVEL);
const SEED_FILE = path.join(ROOT, 'library/reusable-seed', `de_${LEVEL}.json`);
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs',
  `pool-verified-usage-audit-${LEVEL.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`,
);

function listLevelPoolVerified(level) {
  const dir = poolVerifiedDir(level);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

function partIdToPvFile(partId) {
  const m = String(partId).match(/^(schreiben|sprechen)-gemini-(\d+)-t\d+$/i);
  if (m) return `${m[1].toLowerCase()}-gemini-${m[2]}.json`;
  return `${partId}.json`;
}

function teilKeyFromFile(file) {
  const base = path.basename(file);
  const m = base.match(/^(lesen|horen)-t(\d+)/i);
  if (m) return `${m[1].toLowerCase()}_t${m[2]}`;
  if (/^schreiben/i.test(base)) return 'schreiben';
  if (/^sprechen/i.test(base)) return 'sprechen';
  return 'other';
}

function loadOfficialExamIds() {
  const catalogPath = path.join(CATALOG_DIR, '_catalog.json');
  if (!fs.existsSync(catalogPath)) return [];
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return (catalog.exams || [])
    .map((e) => e.examId)
    .filter(Boolean);
}

function loadOfficialPvFiles() {
  const exams = loadOfficialExamIds();
  const files = new Map();
  for (const examId of exams) {
    const examPath = path.join(CATALOG_DIR, `${examId}.json`);
    if (!fs.existsSync(examPath)) continue;
    const j = JSON.parse(fs.readFileSync(examPath, 'utf8'));
    for (const p of j.parts || []) {
      const f = partIdToPvFile(p.partId);
      const row = files.get(f) || { partIds: [], exams: new Set(), cells: [] };
      row.partIds.push(p.partId);
      row.exams.add(examId);
      row.cells.push(p.cell);
      files.set(f, row);
    }
  }
  return files;
}

function loadPersonalPvFiles(pvSet) {
  if (!fs.existsSync(SEED_FILE)) return new Map();
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const linked = new Map();

  function link(pvFile, seedId, via) {
    if (!pvSet.has(pvFile)) return;
    const row = linked.get(pvFile) || { seedIds: [], via: new Set() };
    row.seedIds.push(seedId);
    row.via.add(via);
    linked.set(pvFile, row);
  }

  for (const r of seed.records || []) {
    const id = String(r.id || '');
    const idFile = `${id}.json`;
    if (pvSet.has(idFile)) link(idFile, id, 'seed-id-match');

    const bundle = id.match(/^(schreiben|sprechen)-gemini-(\d+)-t\d+$/i);
    if (bundle) {
      const f = `${bundle[1].toLowerCase()}-gemini-${bundle[2]}.json`;
      link(f, id, 'seed-bundle-teil-id');
    }

    const sf = String(r.sourceFile || '').replace(/\\/g, '/');
    const m = sf.match(new RegExp(`pool-verified/(?:${LEVEL}/)?([^/]+\\.json)`, 'i'));
    if (m) link(m[1], id, 'seed-sourceFile');
  }

  return linked;
}

function batchToPartRecord(batch, file) {
  const base = path.basename(file, '.json');
  const m = base.match(/^(lesen|horen)-t(\d+)/i);
  if (m) {
    return { id: base, module: m[1].toLowerCase(), teil: Number(m[2]), ...batch };
  }
  if (/^schreiben/i.test(base)) return { id: base, module: 'schreiben', teil: 1, ...batch };
  if (/^sprechen/i.test(base)) return { id: base, module: 'sprechen', teil: 1, ...batch };
  return { id: base, ...batch };
}

function classifyOrphanReason(batch, file, inOfficial, inPersonal) {
  const reasons = [];
  const quarantine = batchHasOfficialQuarantine(batch);
  const publishOk = partPassesPublishGate(batchToPartRecord(batch, file));
  const officialOk = partPassesAssembleMode(batchToPartRecord(batch, file), 'official');

  if (!inOfficial && !inPersonal) {
    if (!publishOk) reasons.push('not-in-seed-and-fails-partPublishGate');
    else if (!inPersonal) reasons.push('not-synced-to-reusable-seed-or-blobs');
  }
  if (quarantine && !inOfficial) reasons.push('official-quarantine-blocks-catalog');
  if (!officialOk && inPersonal) reasons.push('personal-only-practice-mode-ok');
  if (quarantine && inPersonal) reasons.push('servable-personal-practice-despite-quarantine');
  return reasons;
}

const pvPaths = listLevelPoolVerified(LEVEL);
const pvFiles = pvPaths.map((abs) => path.basename(abs));
const pvSet = new Set(pvFiles);

const officialMap = loadOfficialPvFiles();
const personalMap = loadPersonalPvFiles(pvSet);

const byTeil = {};
const rows = [];

for (const abs of pvPaths) {
  const file = path.basename(abs);
  const teil = teilKeyFromFile(file);
  if (!byTeil[teil]) {
    byTeil[teil] = { total: 0, official: 0, personal: 0, both: 0, orphan: 0, quarantine: 0 };
  }
  byTeil[teil].total++;

  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const inOfficial = officialMap.has(file);
  const inPersonal = personalMap.has(file);
  const quarantine = batchHasOfficialQuarantine(batch);
  if (quarantine) byTeil[teil].quarantine++;

  let usage = 'orphan';
  if (inOfficial && inPersonal) {
    usage = 'both';
    byTeil[teil].both++;
    byTeil[teil].official++;
    byTeil[teil].personal++;
  } else if (inOfficial) {
    usage = 'official-only';
    byTeil[teil].official++;
  } else if (inPersonal) {
    usage = 'personal-only';
    byTeil[teil].personal++;
  } else {
    byTeil[teil].orphan++;
  }

  rows.push({
    file,
    teil,
    usage,
    quarantine,
    officialExams: inOfficial ? [...officialMap.get(file).exams] : [],
    officialPartIds: inOfficial ? officialMap.get(file).partIds : [],
    seedIds: inPersonal ? personalMap.get(file).seedIds.slice(0, 5) : [],
    orphanReasons: usage === 'orphan' ? classifyOrphanReason(batch, file, inOfficial, inPersonal) : [],
  });
}

const totals = {
  total: pvFiles.length,
  official: rows.filter((r) => r.usage === 'official-only' || r.usage === 'both').length,
  personal: rows.filter((r) => r.usage === 'personal-only' || r.usage === 'both').length,
  both: rows.filter((r) => r.usage === 'both').length,
  usedAny: rows.filter((r) => r.usage !== 'orphan').length,
  orphan: rows.filter((r) => r.usage === 'orphan').length,
  quarantine: rows.filter((r) => r.quarantine).length,
};

const officialMissing = [];
for (const [file, meta] of officialMap) {
  if (!pvSet.has(file)) {
    officialMissing.push({ file, partIds: meta.partIds, exams: [...meta.exams] });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  level: LEVEL,
  poolVerifiedDir: `batches/ready/pool-verified/${LEVEL}`,
  personalPathNote:
    `exam-part.js → pickReusablePartByVocab reads Netlify Blobs (reusable_part_idx) + local seed de_${LEVEL}.json in dev; NEVER reads pool-verified/ directly.`,
  seedRecords: fs.existsSync(SEED_FILE)
    ? JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')).records?.length ?? 0
    : 0,
  seedLinkedToPv: personalMap.size,
  officialCatalogFiles: officialMap.size,
  officialPartRefs: [...officialMap.values()].reduce((s, v) => s + v.partIds.length, 0),
  officialMissingInPoolVerified: officialMissing,
  totals,
  byTeil,
  rows,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  level: LEVEL,
  total: totals.total,
  usedAny: totals.usedAny,
  orphan: totals.orphan,
  official: totals.official,
  personal: totals.personal,
  both: totals.both,
  byTeil,
  officialMissing: officialMissing.length,
  out: path.relative(ROOT, OUT),
}, null, 2));
