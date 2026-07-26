/**
 * Publish assembled verified exams locally (pool-verified overlay → catalog).
 * Used by publish-verified-exams-local.mjs and autoPublishExamsLib.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './loadEnv.mjs';
import { buildExamSeedRecordFromBatch, buildLesenSeedRecordFromBatch } from './publishToPool.mjs';
import { normalizeBatch } from './normalizeBatch.mjs';
import { localCatalogPath, readPublishedCatalog } from './publishedExamLib.mjs';
import { poolVerifiedDir, POOL_VERIFIED_DIR, normalizeLevel } from './batchPaths.mjs';
import { isExamPublishable } from '../audit-pass-2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const POOL_VERIFIED = path.join(ROOT, 'batches/ready/pool-verified');
export const ASM_DIR = path.join(ROOT, 'batches/ready/assembled-from-verified');
export const GATE_LOGS = path.join(ROOT, 'batches/ready/gate-logs');

export function assembledExamPath(slot, level = 'B1') {
  const lv = String(level).toUpperCase();
  if (lv === 'B1') {
    return path.join(ASM_DIR, `assembled-exam-b1-verified-e${slot}.json`);
  }
  return path.join(ASM_DIR, `assembled-exam-${String(level).toLowerCase()}-verified-e${slot}.json`);
}

export function officialExamId(lang, level, slot) {
  return `official-${String(lang).toLowerCase()}-${String(level).toUpperCase()}-e${slot}`;
}

function extractTopic(batch) {
  return (
    batch?.topicTag ||
    batch?.passages?.[0]?.topicTag ||
    (batch?.questions || []).flatMap((q) => q.topicTags || [])[0] ||
    null
  );
}

function batchToRecord(batch, file, module, teil, level = 'B1') {
  const lv = normalizeLevel(level || batch?.level || 'B1');
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level: lv,
      teil: t,
      idPrefix: 'pv',
    });
    rec.id = file.replace(/\.json$/i, '');
    rec.complete = true;
    rec.verified = true;
    return rec;
  }
  if (mod === 'horen') {
    const rec = buildExamSeedRecordFromBatch(batch, {
      lang: 'de',
      level: lv,
      module: 'horen',
      teil: t,
      idPrefix: 'pv',
      topicTag: extractTopic(batch),
    });
    rec.id = file.replace(/\.json$/i, '');
    rec.complete = true;
    rec.verified = true;
    return rec;
  }
  const rec = {
    id: file.replace(/\.json$/i, ''),
    module: mod,
    teil: t,
    lang: 'de',
    level: lv,
    questions: batch.questions || [],
    topicTag: extractTopic(batch),
    complete: true,
    verified: true,
  };
  return rec;
}

function oralPartRecord(batch, file, module, teil, level = 'B1') {
  const lv = normalizeLevel(level || batch?.level || 'B1');
  const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
  const base = file.replace(/\.json$/i, '');
  const schreibenWords =
    lv === 'A2'
      ? { 1: { min: 20, max: 30 }, 2: { min: 30, max: 40 } }
      : { 1: { min: 80, max: 120 }, 2: { min: 80, max: 120 }, 3: { min: 40, max: 60 } };
  const words = schreibenWords[teil] || { min: 80, max: 120 };
  return {
    id: `${base}-t${teil}`,
    module,
    teil,
    lang: 'de',
    level: lv,
    questions: qs,
    instruction: qs[0]?.question || '',
    task: qs[0]?.question || '',
    topicTag: extractTopic(batch) || qs[0]?.topicTags?.[0],
    complete: true,
    verified: true,
    ...(module === 'schreiben' ? { minWords: words.min, maxWords: words.max } : {}),
  };
}

export function resolvePoolFile(partId, level = 'B1') {
  const oral = partId.match(/^(schreiben|sprechen)-(.+)-t([123])$/i);
  const file = oral ? `${oral[1]}-${oral[2]}.json` : `${partId}.json`;
  const candidates = [
    path.join(poolVerifiedDir(level), file),
    path.join(POOL_VERIFIED_DIR, file),
  ];
  const abs = candidates.find((p) => fs.existsSync(p));
  if (!abs) return null;
  if (oral) {
    return { file, abs, module: oral[1].toLowerCase(), teil: Number(oral[3]), oral: true };
  }
  const m = partId.match(/^(lesen|horen)-t(\d+)/i);
  return {
    file,
    abs,
    module: m ? m[1].toLowerCase() : null,
    teil: m ? Number(m[2]) : null,
    oral: false,
  };
}

export function buildOverlayForAssembledFiles(assembledPaths, level = 'B1') {
  const byId = new Map();
  const missing = [];
  for (const examPath of assembledPaths) {
    const raw = JSON.parse(fs.readFileSync(examPath, 'utf8'));
    for (const [cell, partId] of Object.entries(raw._meta?.partIds || {})) {
      if (byId.has(partId)) continue;
      const resolved = resolvePoolFile(partId, level);
      if (!resolved) {
        missing.push(`${path.basename(examPath)}:${cell}:${partId}`);
        continue;
      }
      let batch = JSON.parse(fs.readFileSync(resolved.abs, 'utf8'));
      let rec;
      if (resolved.oral) {
        rec = oralPartRecord(batch, resolved.file, resolved.module, resolved.teil, level);
        if (rec.id !== partId) rec.id = partId;
      } else {
        const [mod, teilStr] = cell.split('_');
        batch = normalizeBatch(batch, {
          module: mod,
          teil: Number(teilStr),
          lang: 'de',
          level: normalizeLevel(level),
        });
        rec = batchToRecord(batch, resolved.file, mod, Number(teilStr), level);
        if (rec.id !== partId) rec.id = partId;
      }
      byId.set(partId, rec);
    }
  }
  return { records: [...byId.values()], missing };
}

export async function countLivePublishedExams(lang = 'de', level = 'B1') {
  const catalog = await readPublishedCatalog({ store: null, lang, level, preferLocal: true });
  return (catalog.exams || []).filter((e) => e.status === 'live').length;
}

export function listLivePublishedSlots(lang = 'de', level = 'B1') {
  const catalogPath = localCatalogPath(lang, level);
  if (!fs.existsSync(catalogPath)) return [];
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return (catalog.exams || [])
    .filter((e) => e.status === 'live')
    .map((e) => Number(e.slot))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function listAssembledSlots(level = 'B1') {
  if (!fs.existsSync(ASM_DIR)) return [];
  const re =
    level === 'B1'
      ? /^assembled-exam-b1-verified-e(\d+)\.json$/i
      : new RegExp(`^assembled-exam-${String(level).toLowerCase()}-verified-e(\\d+)\\.json$`, 'i');
  const slots = [];
  for (const f of fs.readdirSync(ASM_DIR)) {
    const m = f.match(re);
    if (m) slots.push(Number(m[1]));
  }
  return slots.sort((a, b) => a - b);
}

/**
 * Pure planner: which exam slots should be published given capacity and current state.
 */
export function planAutoPublishSlots({ capacity, liveSlots, assembledSlots }) {
  const live = new Set(liveSlots || []);
  const assembled = new Set(assembledSlots || []);
  const cap = Number(capacity) || 0;
  const out = [];
  for (let slot = 1; slot <= cap; slot++) {
    if (live.has(slot)) continue;
    if (!assembled.has(slot)) continue;
    out.push(slot);
  }
  return out;
}

function runNode(scriptRel, args) {
  const script = path.join(ROOT, scriptRel);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`${scriptRel} failed (${r.status})`);
  }
  return r;
}

export function refreshAssembleCapacity(level = 'B1', mode = 'official') {
  runNode('scripts/assemble-from-pool-verified.mjs', ['--dry-run', '--level', level, '--mode', mode]);
  const reportPath = path.join(ASM_DIR, 'capacity-report.json');
  if (!fs.existsSync(reportPath)) {
    throw new Error('capacity-report.json missing after dry-run assemble');
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

export function ensureAssembledExams(maxSlots, level = 'B1', mode = 'official') {
  runNode('scripts/assemble-from-pool-verified.mjs', [
    '--max',
    String(maxSlots),
    '--level',
    level,
    '--mode',
    mode,
  ]);
}

/**
 * Publish one or more assembled verified exam slots to local catalog.
 */
export function publishVerifiedExamSlots({
  slots,
  lang = 'de',
  level = 'B1',
  dryRun = false,
  syncServed = true,
  overlayPath = null,
}) {
  const assembledPaths = slots.map((n) => assembledExamPath(n, level));
  for (const p of assembledPaths) {
    if (!fs.existsSync(p)) {
      throw new Error(`assembled exam missing: ${path.relative(ROOT, p)}`);
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const gate = isExamPublishable(
      { exam: raw.exam, level: normalizeLevel(level) },
      { expectedLevel: normalizeLevel(level) },
    );
    if (!gate.ok) {
      const sample = (gate.blocking || [])
        .slice(0, 3)
        .map((b) => `[${b.id}] ${b.message}`)
        .join('; ');
      throw new Error(
        `GATE-1 BLOCK — ${path.basename(p)}: ${(gate.blocking || []).length} finding(s) — ${sample}`,
      );
    }
  }

  const { records, missing } = buildOverlayForAssembledFiles(assembledPaths, level);
  if (missing.length) {
    throw new Error(`missing pool-verified parts: ${missing.join(', ')}`);
  }

  const overlay = overlayPath || path.join(GATE_LOGS, `verified-publish-overlay-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(overlay), { recursive: true });
  fs.writeFileSync(
    overlay,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        purpose: `publish verified slots ${slots.join(',')}`,
        recordCount: records.length,
        records,
      },
      null,
      2,
    )}\n`,
  );

  if (dryRun) {
    return { dryRun: true, slots, overlay, recordCount: records.length };
  }

  const publish = path.join(ROOT, 'scripts/publish-exam.mjs');
  for (const slot of slots) {
    const from = assembledExamPath(slot, level);
    runNode(path.relative(ROOT, publish), [
      '--from',
      path.relative(ROOT, from),
      '--exam-id',
      officialExamId(lang, level, slot),
      '--slot',
      String(slot),
      '--title',
      `Official ${level} Exam ${slot}`,
      '--seed-overlay',
      path.relative(ROOT, overlay),
      '--local-only',
      '--apply',
      '--yes',
    ]);
  }

  if (syncServed) {
    runNode('scripts/sync-published-to-served.mjs', ['--lang', lang, '--level', level, '--apply']);
  }

  const catalog = JSON.parse(fs.readFileSync(localCatalogPath(lang, level), 'utf8'));
  const live = (catalog.exams || []).filter((e) => e.status === 'live');
  return {
    published: slots,
    overlay,
    liveCount: live.length,
    liveExams: live.map((e) => `${e.examId} (slot ${e.slot})`),
  };
}
