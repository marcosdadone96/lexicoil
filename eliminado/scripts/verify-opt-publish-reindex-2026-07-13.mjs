#!/usr/bin/env node
/**
 * Publish 55 pool-verified parts reindexed today → library/reusable-seed/de_B1.json
 * (same record shape + appendLesenRecordToPool as publish-lesen-generated / pool-fill --publish)
 *
 * Run: node scripts/verify-opt-publish-reindex-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { buildLesenSeedRecordFromBatch, appendLesenRecordToPool, defaultPoolFile } from './lib/publishToPool.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';

const require = createRequire(import.meta.url);
const { applyPartIndex } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));

loadEnvFile();

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const poolFile = defaultPoolFile('de', 'B1');
const REINDEX_AT = new Date('2026-07-13T20:33:18.041Z').getTime();

function listReindexedFiles() {
  return fs
    .readdirSync(POOL)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => Math.abs(fs.statSync(path.join(POOL, f)).mtimeMs - REINDEX_AT) < 120000)
    .sort();
}

function extractTopic(batch) {
  return (
    batch?.topicTag ||
    batch?.passages?.[0]?.topicTag ||
    (batch?.questions || []).flatMap((q) => q.topicTags || [])[0] ||
    null
  );
}

function batchToRecord(batch, file, { module, teil, id } = {}) {
  const mod = module || file.split('-')[0].toLowerCase();
  const t = Number(teil ?? batch.questions?.[0]?.teil ?? file.match(/-t(\d+)/)?.[1] ?? 0);
  const topicTag = extractTopic(batch);
  const recordId = id || file.replace(/\.json$/i, '');

  let rec;
  if (mod === 'lesen') {
    rec = buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level: 'B1',
      teil: t,
      topicTag,
      idPrefix: 'pv',
    });
    rec.id = recordId;
  } else if (mod === 'horen') {
    const passages = batch.passages || [];
    rec = {
      id: recordId,
      module: 'horen',
      teil: t,
      lang: 'de',
      level: 'B1',
      questions: batch.questions || [],
      topicTag: topicTag ? normalizeB1Topic(topicTag) : null,
      complete: true,
      verified: true,
    };
    if (passages.length > 1) {
      rec.segments = passages.map((p, i) => ({
        passageId: p.id,
        label: p.title || `Aufnahme ${i + 1}`,
        text: p.text || p.transcript || '',
        transcript: p.transcript || p.text || '',
        questions: (batch.questions || []).filter((q) => q.passageId === p.id),
      }));
    }
    rec.passage = passages[0]
      ? {
          title: passages[0].title,
          text: passages[0].text,
          transcript: passages[0].transcript || passages[0].text,
          topicTag: passages[0].topicTag,
        }
      : null;
  } else {
    const qs = (batch.questions || []).filter((q) => Number(q.teil) === t);
    rec = {
      id: recordId,
      module: mod,
      teil: t,
      lang: 'de',
      level: 'B1',
      questions: qs,
      instruction: batch.instruction || qs[0]?.question || '',
      task: qs[0]?.question || '',
      topicTag: topicTag ? normalizeB1Topic(topicTag) : null,
      complete: true,
      verified: true,
      ...(mod === 'schreiben'
        ? { minWords: t === 3 ? 40 : 80, maxWords: t === 3 ? 60 : 120 }
        : {}),
    };
  }

  if (Array.isArray(batch.vocabIndex) && batch.vocabIndex.length) {
    rec.vocabIndex = batch.vocabIndex;
    rec.vocabIndexVersion = batch.vocabIndexVersion || 'v3-quality';
  }
  rec.sourceFile = `batches/ready/pool-verified/${file.replace(/-t\d+\.json$/i, '.json')}`;
  rec.complete = true;
  rec.verified = true;
  rec.publishedAt = new Date().toISOString();
  rec.sem1Ok = true;
  rec.sem1VerifiedAt = rec.publishedAt;
  rec.contributor = 'verify-opt-publish-reindex-2026-07-13';

  applyPartIndex(rec, { lang: 'de', level: 'B1', topicTag: rec.topicTag });
  return rec;
}

function backupSeed() {
  if (!fs.existsSync(poolFile)) return null;
  const dir = path.join(path.dirname(poolFile), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `de_B1.pre-publish-reindex-55.${stamp}.json`);
  fs.copyFileSync(poolFile, dest);
  return dest;
}

function upsertRecord(rec) {
  if (!partPassesPublishGate(rec)) {
    return { ok: false, error: 'publish_gate_fail' };
  }
  const pub = appendLesenRecordToPool(rec, { lang: 'de', level: 'B1', poolFile });
  if (pub.ok) return { ok: true, id: pub.id, duplicate: pub.duplicate, replaced: pub.replaced };
  return { ok: false, error: pub.error || pub.message, reason: pub.reason };
}

const files = listReindexedFiles();
const backup = backupSeed();
const results = { fileCount: files.length, backup: backup ? path.relative(ROOT, backup) : null, ok: [], fail: [], skip: [] };

for (const file of files) {
  const abs = path.join(POOL, file);
  if (!fs.existsSync(abs)) {
    results.fail.push({ file, error: 'missing' });
    continue;
  }
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    results.fail.push({ file, error: err.message });
    continue;
  }

  const mod = file.split('-')[0].toLowerCase();

  if (mod === 'schreiben' || mod === 'sprechen') {
    for (const teil of [1, 2, 3]) {
      const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
      if (!qs.length) continue;
      const rec = batchToRecord(batch, file, {
        module: mod,
        teil,
        id: `${file.replace(/\.json$/i, '')}-t${teil}`,
      });
      const pub = upsertRecord(rec);
      if (pub.ok) {
        if (pub.duplicate) results.skip.push({ file: rec.id, duplicate: true });
        else results.ok.push({ file: rec.id, id: pub.id });
      } else results.fail.push({ file: rec.id, ...pub });
    }
    continue;
  }

  const rec = batchToRecord(batch, file, { module: mod });
  const pub = upsertRecord(rec);
  if (pub.ok) {
    if (pub.duplicate) results.skip.push({ file, duplicate: true });
    else results.ok.push({ file, id: pub.id });
  } else results.fail.push({ file, ...pub });
}

const out = path.join(ROOT, 'batches/ready/gate-logs/verify-opt-publish-reindex-2026-07-13.json');
fs.writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...results }, null, 2)}\n`);
console.log(JSON.stringify({ ...results, report: path.relative(ROOT, out) }, null, 2));
process.exit(results.fail.length ? 1 : 0);
