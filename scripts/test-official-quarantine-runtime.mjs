#!/usr/bin/env node
/**
 * Runtime official quarantine — exam-part pool picks (not batch assembler).
 *   node scripts/test-official-quarantine-runtime.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  batchHasOfficialQuarantine,
  partPassesAssembleMode,
  quarantineQuestionIds,
} = require(path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'));
const { filterRows } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/official-quarantine-runtime-test.json');

function loadPoolBatches() {
  const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json') && !f.includes('.raw'));
  const batches = [];
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
    const module = String(batch.questions?.[0]?.module || file.split('-')[0]).toLowerCase();
    const teil = Number(batch.questions?.[0]?.teil);
    batches.push({
      file,
      id: file.replace(/\.json$/i, ''),
      module,
      teil: Number.isFinite(teil) ? teil : null,
      part: batch,
      hasQuarantine: batchHasOfficialQuarantine(batch),
      quarantineIds: quarantineQuestionIds(batch),
    });
  }
  return batches;
}

function allQuarantineIds(batches) {
  const set = new Set();
  for (const b of batches) {
    for (const id of b.quarantineIds) set.add(id);
  }
  return set;
}

function simulateOfficialPick(batches, module, teil) {
  const rows = batches
    .filter((b) => b.module === module && (teil == null || b.teil === teil))
    .map((b) => ({
      id: b.id,
      teil: b.teil,
      complete: true,
      verified: true,
      disabled: false,
      part: b.part,
      servedCount: 0,
    }));
  const available = filterRows(rows, { teil, assembleMode: 'official' });
  return available.map((r) => r.id);
}

function simulatePracticePick(batches, module, teil) {
  const rows = batches
    .filter((b) => b.module === module && (teil == null || b.teil === teil))
    .map((b) => ({
      id: b.id,
      teil: b.teil,
      complete: true,
      verified: true,
      disabled: false,
      part: b.part,
      servedCount: 0,
    }));
  const available = filterRows(rows, { teil, assembleMode: 'practice' });
  return available.map((r) => r.id);
}

function questionIdsInPart(part) {
  return (part.questions || []).map((q) => q.id).filter(Boolean);
}

const batches = loadPoolBatches();
const qUnion = allQuarantineIds(batches);
const quarantinedBatches = batches.filter((b) => b.hasQuarantine);

const officialLesenT2 = simulateOfficialPick(batches, 'lesen', 2);
const practiceLesenT2 = simulatePracticePick(batches, 'lesen', 2);
const officialHorenT2 = simulateOfficialPick(batches, 'horen', 2);
const practiceHorenT2 = simulatePracticePick(batches, 'horen', 2);

const officialPicksAll = [];
const practicePicksAll = [];
for (const mod of ['lesen', 'horen']) {
  for (const teil of [1, 2, 3, 4, 5]) {
    officialPicksAll.push(...simulateOfficialPick(batches, mod, teil));
    practicePicksAll.push(...simulatePracticePick(batches, mod, teil));
  }
}

function hitsQuarantine(pickIds) {
  const hits = [];
  for (const id of pickIds) {
    const b = batches.find((x) => x.id === id);
    if (!b) continue;
    for (const qid of questionIdsInPart(b.part)) {
      if (qUnion.has(qid)) hits.push({ batch: id, questionId: qid });
    }
  }
  return hits;
}

const officialHits = hitsQuarantine(officialPicksAll);
const practiceQuarantinedAvailable = quarantinedBatches.filter((b) =>
  practicePicksAll.includes(b.id),
).length;

const result = {
  generatedAt: new Date().toISOString(),
  quarantineUnionSize: qUnion.size,
  quarantinedBatchFiles: quarantinedBatches.length,
  officialLesenT2: { count: officialLesenT2.length, ids: officialLesenT2.slice(0, 5) },
  practiceLesenT2: { count: practiceLesenT2.length, ids: practiceLesenT2.slice(0, 5) },
  officialHorenT2: { count: officialHorenT2.length, ids: officialHorenT2.slice(0, 5) },
  practiceHorenT2: { count: practiceHorenT2.length, ids: practiceHorenT2.slice(0, 5) },
  officialQuarantineHits: officialHits.length,
  officialHitSample: officialHits.slice(0, 5),
  practiceIncludesQuarantinedBatches: practiceQuarantinedAvailable,
  pass: {
    union198: qUnion.size === 198,
    officialExcludesQuarantineBatches:
      officialLesenT2.every((id) => !batches.find((b) => b.id === id)?.hasQuarantine) &&
      officialHorenT2.every((id) => !batches.find((b) => b.id === id)?.hasQuarantine),
    officialZeroQuarantineQuestions: officialHits.length === 0,
    practiceStockGteOfficial:
      practiceLesenT2.length >= officialLesenT2.length &&
      practiceHorenT2.length >= officialHorenT2.length,
    practiceStillAllowsQuarantine: practiceQuarantinedAvailable > 0,
    partPassesAssembleModeOfficial: quarantinedBatches.every(
      (b) => !partPassesAssembleMode(b.part, 'official'),
    ),
    partPassesAssembleModePractice: quarantinedBatches.every(
      (b) => partPassesAssembleMode(b.part, 'practice'),
    ),
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify(result.pass, null, 2));
console.log(`quarantine union: ${qUnion.size} · official hits: ${officialHits.length}`);
console.log(
  `lesen T2 official=${officialLesenT2.length} practice=${practiceLesenT2.length} · ` +
    `horen T2 official=${officialHorenT2.length} practice=${practiceHorenT2.length}`,
);

const failed = Object.entries(result.pass).filter(([, v]) => !v);
if (failed.length) {
  console.error('FAIL', failed.map(([k]) => k));
  process.exit(1);
}
console.log('ALL TESTS PASS');
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
