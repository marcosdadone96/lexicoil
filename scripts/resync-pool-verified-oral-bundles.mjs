#!/usr/bin/env node
/**
 * Resync schreiben/sprechen bundle batches → all reusable-seed records sharing sourceFile (per Teil).
 * appendLesenRecordToPool skips duplicates; this forces in-place update by record id.
 *
 *   node scripts/resync-pool-verified-oral-bundles.mjs A2 schreiben-cur-education.json ...
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { buildExamSeedRecordFromBatch, defaultPoolFile } from './lib/publishToPool.mjs';
import { parsePoolVerifiedMeta } from './lib/autoSyncPersonalPoolLib.mjs';
import { oralTeilsForLevel } from './lib/examLevelCells.mjs';

const level = (process.argv[2] || 'A2').toUpperCase();
const files = process.argv.slice(3);
if (!files.length) {
  console.error('Usage: node scripts/resync-pool-verified-oral-bundles.mjs A2 file.json ...');
  process.exit(1);
}

function teilsForBundle(module, lv) {
  return oralTeilsForLevel(module, lv);
}

const poolDir = path.join(ROOT, 'batches/ready/pool-verified', level);
const poolFile = defaultPoolFile('de', level);
const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
const report = { at: new Date().toISOString(), level, updates: [], verify: [] };

function qFingerprint(q) {
  const tag = q.topicTags?.[0] || q.topicTag || '';
  return {
    id: q.id,
    topicTag: tag,
    explanation: String(q.explanation || ''),
    question: String(q.question || ''),
  };
}

function recordFingerprint(rec) {
  const qs = rec.questions || [];
  return qs.map(qFingerprint);
}

for (const file of files) {
  const base = path.basename(file);
  const abs = path.join(poolDir, base);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const sourceFile = `batches/ready/pool-verified/${level}/${base}`.replace(/\\/g, '/');
  const meta = parsePoolVerifiedMeta(base);
  const mod = String(
    batch.questions?.[0]?.module || meta.module || 'schreiben',
  ).toLowerCase();
  if (!meta.bundle) {
    report.updates.push({ file: base, ok: false, error: 'not an oral bundle filename' });
    continue;
  }
  const teils = teilsForBundle(mod, level);
  const fileUpdates = [];

  for (const teil of teils) {
    const expectedId = `${meta.recordId}-t${teil}`;
    let idx = pool.records.findIndex((r) => r.id === expectedId);
    if (idx < 0) {
      idx = pool.records.findIndex(
        (r) =>
          String(r.sourceFile || '').replace(/\\/g, '/') === sourceFile &&
          Number(r.teil) === teil &&
          String(r.module || '').toLowerCase() === mod,
      );
    }
    if (idx < 0) {
      fileUpdates.push({ teil, ok: false, error: 'no seed record', expectedId });
      continue;
    }
    const existing = pool.records[idx];
    const fresh = buildExamSeedRecordFromBatch(batch, {
      lang: 'de',
      level,
      module: mod,
      teil,
      id: existing.id,
      idPrefix: 'pv',
    });
    fresh.id = existing.id;
    fresh.sourceFile = sourceFile;
    fresh.contributor = existing.contributor || 'resync-pool-verified-oral-bundles';
    fresh.complete = existing.complete !== false;
    fresh.verified = existing.verified !== false;
    fresh.disabled = existing.disabled === true;
    fresh.sem1Ok = existing.sem1Ok;
    fresh.sem1VerifiedAt = existing.sem1VerifiedAt;
    fresh.publishedAt = existing.publishedAt;
    fresh.createdAt = existing.createdAt;
    fresh.vocabIndex = existing.vocabIndex;
    fresh.vocabIndexVersion = existing.vocabIndexVersion;
    fresh._resyncedAt = report.at;

    pool.records[idx] = { ...existing, ...fresh };

    const poolFp = recordFingerprint({ questions: (batch.questions || []).filter((q) => Number(q.teil) === teil) });
    const seedFp = recordFingerprint(pool.records[idx]);
    const fieldsMatch =
      poolFp.length === seedFp.length &&
      poolFp.every((p, i) => {
        const s = seedFp[i];
        return (
          p.id === s.id &&
          p.topicTag === s.topicTag &&
          p.explanation === s.explanation &&
          p.question === s.question
        );
      });

    fileUpdates.push({
      teil,
      ok: true,
      seedId: existing.id,
      fieldsMatch,
      poolQuestions: poolFp,
      seedQuestions: seedFp,
    });
  }

  const allOk = fileUpdates.every((u) => u.ok && u.fieldsMatch);
  report.updates.push({ file: base, sourceFile, module: mod, teils: fileUpdates, allOk });
  for (const u of fileUpdates) {
    if (u.ok) {
      report.verify.push({
        file: base,
        teil: u.teil,
        seedId: u.seedId,
        fieldsMatch: u.fieldsMatch,
      });
    }
  }
}

pool._updatedAt = report.at;
fs.writeFileSync(poolFile, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
const out = path.join(ROOT, 'batches/ready/gate-logs/a2-schreiben-sprechen-seed-resync-evidence.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ updates: report.updates.length, allOk: report.updates.every((u) => u.allOk) }, null, 2));
console.log('Wrote', path.relative(ROOT, out));
if (!report.updates.every((u) => u.allOk)) process.exit(1);
