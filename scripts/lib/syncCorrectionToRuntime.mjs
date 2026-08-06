/**
 * syncCorrectionToRuntime.mjs — PASO 13 P0-1
 *
 * After a correction is applied to pool-verified (or other disk JSON), locate and
 * optionally update runtime consumers: reusable-seed → Blobs → published exams.
 *
 * Default is dry-run. Writes require confirm:true (and confirmPublish:true for published).
 *
 * syncStatus (on correction record) is separate from correction.status.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildUpdatedPayload } from './mergeSeedBlobPayload.mjs';
import {
  canonicalPartHash,
  normalizePartSnapshot,
} from './partContentHash.mjs';
import {
  readPublishedCatalog,
  readPublishedExam,
  writePublishedExam,
  upsertPublishedCatalog,
  getBlobStore,
} from './publishedExamLib.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const {
  resolveFieldKey,
  findTargetObject,
  writeBackup,
} = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));
const {
  normalizeSourceFile,
  SYNC_STATUSES,
} = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionSchema.js'));
const {
  saveCorrection,
  historyEntry,
  tryLoadSourceBatch,
  loadCorrection,
} = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));
const {
  getReusablePart,
  partPayloadKey,
} = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { applyPartIndex } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));

function readField(obj, leaf) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (leaf === 'correctAnswer' && obj.correct != null && obj.correctAnswer == null) return obj.correct;
  if (leaf === 'correct' && obj.correct == null && obj.correctAnswer != null) return obj.correctAnswer;
  return obj[leaf];
}

function writeField(obj, leaf, value) {
  obj[leaf] = value;
  if (leaf === 'correct') obj.correctAnswer = value;
  if (leaf === 'correctAnswer') obj.correct = value;
}

function basenameSource(sf) {
  return normalizeSourceFile(String(sf || '').split(/[/\\]/).pop());
}

function defaultPoolFile(root, lang, level) {
  return path.join(
    root || ROOT,
    'library',
    'reusable-seed',
    `${String(lang).toLowerCase()}_${String(level).toUpperCase()}.json`,
  );
}

function localPublishedDir(root, lang, level) {
  return path.join(root, 'library', 'published-exams', String(lang).toLowerCase(), String(level).toUpperCase());
}

function localCatalogPath(root, lang, level) {
  return path.join(localPublishedDir(root, lang, level), '_catalog.json');
}

function localPublishedPath(root, lang, level, examId) {
  return path.join(localPublishedDir(root, lang, level), `${examId}.json`);
}

function readLocalCatalog(root, lang, level) {
  const p = localCatalogPath(root, lang, level);
  if (!fs.existsSync(p)) return { version: 0, lang, level, exams: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readLocalPublishedExam(root, lang, level, examId) {
  const p = localPublishedPath(root, lang, level, examId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadPoolFile(poolFile) {
  if (!fs.existsSync(poolFile)) return { records: [], _source: 'missing' };
  const raw = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  if (Array.isArray(raw)) return { records: raw };
  if (Array.isArray(raw.records)) return raw;
  return { records: [] };
}

function writePoolFile(poolFile, pool) {
  fs.mkdirSync(path.dirname(poolFile), { recursive: true });
  pool._count = pool.records.length;
  pool._updatedAt = new Date().toISOString();
  fs.writeFileSync(poolFile, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
}

/**
 * Resolve stable partId(s) for a correction sourceFile without inventing IDs.
 * @returns {{ partId: string|null, seedRecord: object|null, candidates: string[], reason: string }}
 */
export function resolvePartIdForSourceFile(sourceFile, opts = {}) {
  const base = basenameSource(sourceFile);
  const lang = String(opts.lang || 'de').toLowerCase();
  const level = String(opts.level || 'B1').toUpperCase();
  const root = opts.projectRoot || ROOT;
  const poolFile = opts.poolFile || defaultPoolFile(root, lang, level);
  const pool = loadPoolFile(poolFile);
  const candidates = [];
  const reasons = [];

  if (opts.explicitPartId) {
    const id = String(opts.explicitPartId).trim();
    if (id) {
      candidates.push(id);
      reasons.push('explicit_partId');
    }
  }

  let seedRecord = null;
  for (const rec of pool.records || []) {
    if (!rec || !rec.id) continue;
    const sf = basenameSource(rec.sourceFile);
    if (sf && sf === base) {
      seedRecord = rec;
      if (!candidates.includes(rec.id)) candidates.push(rec.id);
      reasons.push('seed_sourceFile');
      break;
    }
  }

  // Published exams often use batch basename as partId
  if (!candidates.includes(base)) {
    candidates.push(base);
    reasons.push('sourceFile_basename_candidate');
  }

  return {
    partId: seedRecord?.id || null,
    seedRecord,
    basename: base,
    candidates: [...new Set(candidates)],
    reason: reasons.join('+') || 'unresolved',
    poolFile,
    lang,
    level,
  };
}

function applyPatchToPart(part, correction) {
  const leaf = resolveFieldKey(correction.fieldPath);
  if (!leaf) return { ok: false, error: 'invalid_fieldPath' };
  const target = findTargetObject(part, correction.targetId, correction.targetType);
  if (!target) return { ok: false, error: 'targetId_not_found' };
  writeField(target.obj, leaf, correction.newValue);
  return { ok: true, leaf, targetId: correction.targetId };
}

function batchToSnapshot(batch, partId, meta = {}) {
  const payload = {
    id: partId,
    lang: String(meta.lang || batch.lang || 'de').toLowerCase(),
    level: String(meta.level || batch.level || 'B1').toUpperCase(),
    module: String(meta.module || batch.module || '').toLowerCase(),
    teil: meta.teil ?? batch.teil ?? null,
    instruction: batch.instruction || '',
    passage: batch.passage || null,
    questions: Array.isArray(batch.questions) ? batch.questions : [],
    complete: batch.complete !== false,
    verified: batch.verified !== false,
  };
  if (Array.isArray(batch.ads)) payload.ads = batch.ads;
  else if (Array.isArray(batch.passage?.ads)) payload.ads = batch.passage.ads;
  if (Array.isArray(batch.passages)) payload.passages = batch.passages;
  if (Array.isArray(batch.segments)) payload.segments = batch.segments;
  if (batch.task != null) payload.task = batch.task;
  if (batch.minWords != null) payload.minWords = batch.minWords;
  if (batch.maxWords != null) payload.maxWords = batch.maxWords;
  if (batch.fieldId != null) payload.fieldId = batch.fieldId;
  if (batch.taskFormat != null) payload.taskFormat = batch.taskFormat;
  if (Array.isArray(batch.criteria)) payload.criteria = batch.criteria;
  if (batch.example) payload.example = batch.example;
  if (batch.topicTag != null) payload.topicTag = batch.topicTag;
  return normalizePartSnapshot(payload);
}

async function findPublishedHits({ root, store, lang, level, basename, partIds, localOnly }) {
  const cat = localOnly
    ? readLocalCatalog(root, lang, level)
    : await readPublishedCatalog({ store, lang, level, preferLocal: !store });
  const hits = [];
  const idSet = new Set([basename, ...(partIds || [])].filter(Boolean).map(String));

  for (const row of cat.exams || []) {
    const examId = row.examId;
    if (!examId) continue;
    const doc = localOnly
      ? readLocalPublishedExam(root, lang, level, examId)
      : await readPublishedExam({
          store,
          lang,
          level,
          examId,
          preferLocal: !store,
        });
    if (!doc) continue;
    for (const part of doc.parts || []) {
      if (part?.partId && idSet.has(String(part.partId))) {
        hits.push({
          examId,
          slot: doc.slot ?? row.slot,
          cell: part.cell,
          partId: part.partId,
          module: part.module,
          teil: part.teil,
          title: doc.title,
        });
      }
    }
  }
  return hits;
}

/**
 * Core sync. Dry-run by default.
 *
 * @param {object} correction — applied (or about-to-sync) correction record
 * @param {{
 *   projectRoot?: string,
 *   dryRun?: boolean,
 *   confirm?: boolean,
 *   confirmPublish?: boolean,
 *   store?: object,
 *   lang?: string,
 *   level?: string,
 *   localOnly?: boolean,
 *   skipBlob?: boolean,
 *   skipSeed?: boolean,
 *   skipPublished?: boolean,
 *   persistSyncStatus?: boolean,
 *   correctionsStore?: object,
 *   email?: string,
 * }} [opts]
 */
export async function syncCorrectionToRuntime(correction, opts = {}) {
  const dryRun = opts.confirm !== true || opts.dryRun === true;
  const confirmPublish = opts.confirmPublish === true && !dryRun;
  const root = opts.projectRoot || ROOT;
  const lang = String(opts.lang || correction.lang || 'de').toLowerCase();
  const level = String(opts.level || correction.level || 'B1').toUpperCase();
  const localOnly = !!opts.localOnly;

  const sourceFile = basenameSource(correction.sourceFile);
  const report = {
    sourceFile,
    partId: null,
    correctionId: correction.id || null,
    dryRun,
    targets: [],
    publishedExams: [],
    backups: [],
    errors: [],
    syncStatus: 'sync_pending',
  };

  if (!sourceFile) {
    report.errors.push('missing_sourceFile');
    report.syncStatus = 'sync_failed';
    return { ok: false, report };
  }

  const disk = tryLoadSourceBatch(sourceFile, root);
  if (!disk.ok || !disk.batch) {
    report.errors.push(disk.error || 'sourceFile_not_found');
    report.syncStatus = 'sync_failed';
    report.targets.push({ type: 'pool-verified', status: 'missing' });
    return { ok: false, report };
  }
  report.targets.push({
    type: 'pool-verified',
    status: 'updated',
    path: disk.path,
  });

  const resolved = resolvePartIdForSourceFile(sourceFile, {
    lang,
    level,
    projectRoot: root,
    explicitPartId: correction.partId || correction.runtimePartId,
  });
  report.partId = resolved.partId;
  report.resolveReason = resolved.reason;
  report.candidateIds = resolved.candidates;

  // ── Seed ──────────────────────────────────────────────────────────────────
  let seedTarget = {
    type: 'seed',
    status: 'missing',
    partId: null,
    path: resolved.poolFile,
  };

  if (!opts.skipSeed) {
    if (resolved.seedRecord) {
      seedTarget.partId = resolved.seedRecord.id;
      report.partId = resolved.seedRecord.id;
      const patched = JSON.parse(JSON.stringify(resolved.seedRecord));
      const patch = applyPatchToPart(patched, correction);
      if (!patch.ok) {
        seedTarget.status = 'sync_pending';
        seedTarget.error = patch.error;
        report.errors.push(`seed:${patch.error}`);
      } else if (dryRun) {
        seedTarget.status = 'updated';
        seedTarget.dryRun = true;
        seedTarget.fieldPath = patch.leaf;
      } else {
        try {
          const backupPath = writeBackup(root, resolved.poolFile, loadPoolFile(resolved.poolFile), [
            correction.id || sourceFile,
          ]);
          report.backups.push(backupPath);
          const pool = loadPoolFile(resolved.poolFile);
          const idx = (pool.records || []).findIndex((r) => r && r.id === resolved.seedRecord.id);
          if (idx < 0) {
            seedTarget.status = 'sync_pending';
            seedTarget.error = 'seed_record_vanished';
          } else {
            pool.records[idx] = patched;
            writePoolFile(resolved.poolFile, pool);
            seedTarget.status = 'updated';
            seedTarget.fieldPath = patch.leaf;
            resolved.seedRecord = patched;
          }
        } catch (err) {
          seedTarget.status = 'sync_pending';
          seedTarget.error = err.message;
          report.errors.push(`seed_write:${err.message}`);
        }
      }
    } else {
      seedTarget.status = 'sync_pending';
      seedTarget.note = 'no_reliable_sourceFile_match';
    }
  }
  report.targets.push(seedTarget);

  // ── Blob ──────────────────────────────────────────────────────────────────
  let blobTarget = {
    type: 'blob',
    status: 'missing',
    partId: null,
  };

  if (!opts.skipBlob && !localOnly) {
    let store = opts.store;
    if (!store) {
      try {
        store = await getBlobStore();
      } catch (_) {
        store = null;
      }
    }

    if (!store) {
      blobTarget.status = 'sync_pending';
      blobTarget.note = 'blob_store_unavailable';
    } else {
      const module = String(correction.module || disk.batch.module || 'lesen').toLowerCase();
      const tryIds = [];
      if (resolved.seedRecord?.id) tryIds.push(resolved.seedRecord.id);
      for (const c of resolved.candidates) {
        if (c && !tryIds.includes(c)) tryIds.push(c);
      }

      let blobPart = null;
      let matchedId = null;
      for (const id of tryIds) {
        try {
          const got = await getReusablePart(store, lang, level, module, id);
          if (got && got.disabled !== true) {
            blobPart = got;
            matchedId = id;
            break;
          }
        } catch (_) {
          /* try next */
        }
      }

      if (!blobPart || !matchedId) {
        blobTarget.status = 'sync_pending';
        blobTarget.note = 'no_reliable_blob_match';
        blobTarget.triedIds = tryIds;
      } else {
        blobTarget.partId = matchedId;
        if (!report.partId) report.partId = matchedId;

        // Prefer merge from updated seed; else patch blob in place
        let nextPayload = null;
        try {
          if (resolved.seedRecord && seedTarget.status === 'updated') {
            nextPayload = buildUpdatedPayload(blobPart, resolved.seedRecord);
          } else {
            nextPayload = JSON.parse(JSON.stringify(blobPart));
            const patch = applyPatchToPart(nextPayload, correction);
            if (!patch.ok) throw new Error(patch.error);
          }
          applyPartIndex(nextPayload, {
            lang: nextPayload.lang || lang,
            level: nextPayload.level || level,
            topicTag: nextPayload.topicTag || null,
            force: true,
          });
        } catch (err) {
          blobTarget.status = 'sync_pending';
          blobTarget.error = err.message;
          report.errors.push(`blob_merge:${err.message}`);
          nextPayload = null;
        }

        if (nextPayload) {
          if (dryRun) {
            blobTarget.status = 'updated';
            blobTarget.dryRun = true;
          } else {
            try {
              const pKey = partPayloadKey(lang, level, module, matchedId);
              await store.set(pKey, JSON.stringify(nextPayload));
              blobTarget.status = 'updated';
            } catch (err) {
              blobTarget.status = 'sync_pending';
              blobTarget.error = err.message;
              report.errors.push(`blob_write:${err.message}`);
            }
          }
        }
      }
    }
  } else if (opts.skipBlob) {
    blobTarget.status = 'missing';
    blobTarget.note = 'skipped';
  } else if (localOnly) {
    blobTarget.status = 'sync_pending';
    blobTarget.note = 'localOnly';
  }
  report.targets.push(blobTarget);

  // ── Published ─────────────────────────────────────────────────────────────
  let publishedTarget = {
    type: 'published',
    status: 'missing',
    exams: [],
  };

  if (!opts.skipPublished) {
    let store = opts.store;
    if (!store && !localOnly) {
      try {
        store = await getBlobStore();
      } catch (_) {
        store = null;
      }
    }

    const hits = await findPublishedHits({
      root,
      store,
      lang,
      level,
      basename: sourceFile,
      partIds: resolved.candidates,
      localOnly,
    });
    report.publishedExams = hits;
    publishedTarget.exams = hits.map((h) => ({
      examId: h.examId,
      slot: h.slot,
      cell: h.cell,
      partId: h.partId,
    }));
    if (!report.partId && hits[0]?.partId) report.partId = hits[0].partId;

    if (!hits.length) {
      publishedTarget.status = 'missing';
      publishedTarget.note = 'no_published_link';
    } else if (!confirmPublish) {
      publishedTarget.status = 'stale';
      publishedTarget.note = dryRun
        ? 'dry_run_requires_confirmPublish'
        : 'needs_confirmPublish';
    } else {
      // Controlled re-publish: patch snapshots from pool-verified batch
      const updatedExams = [];
      for (const hit of hits) {
        try {
          const doc = localOnly
            ? readLocalPublishedExam(root, lang, level, hit.examId)
            : await readPublishedExam({
                store,
                lang,
                level,
                examId: hit.examId,
                preferLocal: !store,
              });
          if (!doc) {
            updatedExams.push({ examId: hit.examId, status: 'missing' });
            continue;
          }
          const before = JSON.parse(JSON.stringify(doc));
          const part = (doc.parts || []).find((p) => p.partId === hit.partId);
          if (!part) {
            updatedExams.push({ examId: hit.examId, status: 'missing' });
            continue;
          }
          const snap = batchToSnapshot(disk.batch, hit.partId, {
            lang,
            level,
            module: hit.module || correction.module,
            teil: hit.teil ?? correction.teil,
          });
          // Keep published partId stable; overlay content from pool-verified
          part.snapshot = { ...snap, id: hit.partId };
          part.contentHash = canonicalPartHash(part.snapshot);
          doc.previousManifestVersion = doc.manifestVersion;
          doc.manifestVersion = Number(doc.manifestVersion || 0) + 1;
          doc.publishedAt = new Date().toISOString();

          const backupPath = writeBackup(
            root,
            localPublishedPath(root, lang, level, hit.examId),
            before,
            [correction.id || sourceFile],
          );
          report.backups.push(backupPath);

          if (localOnly) {
            fs.mkdirSync(localPublishedDir(root, lang, level), { recursive: true });
            fs.writeFileSync(
              localPublishedPath(root, lang, level, hit.examId),
              `${JSON.stringify(doc, null, 2)}\n`,
              'utf8',
            );
            const cat = readLocalCatalog(root, lang, level);
            const exams = (cat.exams || []).filter((e) => e.examId !== doc.examId);
            exams.push({
              examId: doc.examId,
              slot: doc.slot,
              title: doc.title,
              status: doc.status,
              manifestVersion: doc.manifestVersion,
              publishedAt: doc.publishedAt,
            });
            exams.sort((a, b) => Number(a.slot) - Number(b.slot));
            fs.writeFileSync(
              localCatalogPath(root, lang, level),
              `${JSON.stringify({ ...cat, exams, version: new Date().toISOString() }, null, 2)}\n`,
              'utf8',
            );
          } else {
            await writePublishedExam({
              store,
              lang,
              level,
              doc,
              applyLocal: true,
              applyBlob: !!store,
            });
            await upsertPublishedCatalog({
              store,
              lang,
              level,
              examEntry: {
                examId: doc.examId,
                slot: doc.slot,
                title: doc.title,
                status: doc.status,
                manifestVersion: doc.manifestVersion,
                publishedAt: doc.publishedAt,
              },
              applyLocal: true,
              applyBlob: !!store,
            });
          }
          updatedExams.push({
            examId: hit.examId,
            status: 'updated',
            cell: hit.cell,
            partId: hit.partId,
            manifestVersion: doc.manifestVersion,
          });
        } catch (err) {
          updatedExams.push({ examId: hit.examId, status: 'sync_pending', error: err.message });
          report.errors.push(`published:${hit.examId}:${err.message}`);
        }
      }
      const anyFail = updatedExams.some((e) => e.status !== 'updated');
      const anyOk = updatedExams.some((e) => e.status === 'updated');
      publishedTarget.status = anyFail && !anyOk ? 'sync_pending' : anyFail ? 'stale' : 'updated';
      publishedTarget.results = updatedExams;
    }
  }
  report.targets.push(publishedTarget);

  // ── Aggregate syncStatus ──────────────────────────────────────────────────
  const seedUpdated = seedTarget.status === 'updated';
  const blobUpdated = blobTarget.status === 'updated';
  const pubUpdated = publishedTarget.status === 'updated';
  const pubStale = publishedTarget.status === 'stale';
  const hardFail = report.errors.some(
    (e) =>
      String(e).startsWith('seed_write') ||
      String(e).startsWith('blob_write') ||
      String(e).startsWith('published:'),
  );

  if (hardFail && !seedUpdated && !blobUpdated && !pubUpdated) {
    report.syncStatus = 'sync_failed';
  } else if (pubStale && (seedUpdated || blobUpdated || dryRun)) {
    report.syncStatus = 'published_stale';
  } else if (seedUpdated || blobUpdated || pubUpdated) {
    report.syncStatus = pubStale ? 'published_stale' : 'synced';
  } else if (pubStale) {
    report.syncStatus = 'published_stale';
  } else {
    report.syncStatus = 'sync_pending';
  }

  if (opts.persistSyncStatus && opts.correctionsStore && correction.id && !dryRun) {
    try {
      const existing = (await loadCorrection(opts.correctionsStore, correction.id)) || correction;
      const hist = Array.isArray(existing.history) ? [...existing.history] : [];
      hist.push(
        historyEntry('sync', opts.email || 'system', {
          syncStatus: report.syncStatus,
          targets: report.targets.map((t) => ({ type: t.type, status: t.status })),
        }),
      );
      const next = {
        ...existing,
        syncStatus: report.syncStatus,
        syncReport: {
          at: new Date().toISOString(),
          sourceFile: report.sourceFile,
          partId: report.partId,
          targets: report.targets,
          publishedExams: report.publishedExams,
        },
        history: hist,
      };
      await saveCorrection(opts.correctionsStore, next);
      report.correction = next;
    } catch (err) {
      report.errors.push(`persist_syncStatus:${err.message}`);
    }
  }

  const ok =
    report.syncStatus === 'synced' ||
    report.syncStatus === 'published_stale' ||
    (dryRun && report.targets.some((t) => t.type === 'pool-verified'));

  return { ok, dryRun, report };
}

export { SYNC_STATUSES, basenameSource, applyPatchToPart, batchToSnapshot };
