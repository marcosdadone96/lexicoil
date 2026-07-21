#!/usr/bin/env node
/**
 * @deprecated Use scripts/publish-verified-exams-local.mjs --slots 1,2,3,4
 * Publish assembled verified e1–e4 locally so npm run dev can serve exams.
 */
 * Builds a seed overlay from batches/ready/pool-verified (parts are not in
 * reusable-seed yet), runs publish-exam --local-only for slots 1–3, then
 * sync-published-to-served.
 *
 *   node scripts/publish-verified-e1-e3-local.mjs
 *   node scripts/publish-verified-e1-e3-local.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const dryRun = process.argv.includes('--dry-run');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const ASM = path.join(ROOT, 'batches/ready/assembled-from-verified');
const OVERLAY = path.join(ROOT, 'batches/ready/gate-logs/verified-e1-e3-seed-overlay.json');

const EXAMS = [1, 2, 3].map((n) => ({
  n,
  from: path.join(ASM, `assembled-exam-b1-verified-e${n}.json`),
  examId: `official-de-B1-e${n}`,
  title: `Official B1 Exam ${n}`,
}));

function extractTopic(batch) {
  return (
    batch?.topicTag ||
    batch?.passages?.[0]?.topicTag ||
    (batch?.questions || []).flatMap((q) => q.topicTags || [])[0] ||
    null
  );
}

function batchToRecord(batch, file, module, teil) {
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level: 'B1',
      teil: t,
      idPrefix: 'pv',
    });
    rec.id = file.replace(/\.json$/i, '');
    return rec;
  }
  const passages = batch.passages || [];
  const rec = {
    id: file.replace(/\.json$/i, ''),
    module: mod,
    teil: t,
    lang: 'de',
    level: 'B1',
    questions: batch.questions || [],
    topicTag: extractTopic(batch),
    complete: true,
    verified: true,
  };
  if (mod === 'horen') {
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
  }
  return rec;
}

function oralPartRecord(batch, file, module, teil) {
  const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
  const base = file.replace(/\.json$/i, '');
  return {
    id: `${base}-t${teil}`,
    module,
    teil,
    lang: 'de',
    level: 'B1',
    questions: qs,
    instruction: qs[0]?.question || '',
    task: qs[0]?.question || '',
    topicTag: extractTopic(batch) || qs[0]?.topicTags?.[0],
    complete: true,
    verified: true,
    ...(module === 'schreiben'
      ? { minWords: teil === 3 ? 40 : 80, maxWords: teil === 3 ? 60 : 120 }
      : {}),
  };
}

function resolvePoolFile(partId) {
  // schreiben-gemini-005-t1 → schreiben-gemini-005.json
  const oral = partId.match(/^(schreiben|sprechen)-(.+)-t([123])$/i);
  if (oral) {
    const file = `${oral[1]}-${oral[2]}.json`;
    const abs = path.join(POOL, file);
    if (!fs.existsSync(abs)) return null;
    return { file, abs, module: oral[1].toLowerCase(), teil: Number(oral[3]), oral: true };
  }
  const file = `${partId}.json`;
  const abs = path.join(POOL, file);
  if (!fs.existsSync(abs)) return null;
  const m = partId.match(/^(lesen|horen)-t(\d+)/i);
  return {
    file,
    abs,
    module: m ? m[1].toLowerCase() : null,
    teil: m ? Number(m[2]) : null,
    oral: false,
  };
}

function buildOverlay() {
  const byId = new Map();
  const missing = [];
  for (const exam of EXAMS) {
    const raw = JSON.parse(fs.readFileSync(exam.from, 'utf8'));
    for (const [cell, partId] of Object.entries(raw._meta?.partIds || {})) {
      if (byId.has(partId)) continue;
      const resolved = resolvePoolFile(partId);
      if (!resolved) {
        missing.push(`${exam.n}:${cell}:${partId}`);
        continue;
      }
      let batch = JSON.parse(fs.readFileSync(resolved.abs, 'utf8'));
      let rec;
      if (resolved.oral) {
        rec = oralPartRecord(batch, resolved.file, resolved.module, resolved.teil);
        if (rec.id !== partId) rec.id = partId;
      } else {
        const [mod, teilStr] = cell.split('_');
        batch = normalizeBatch(batch, {
          module: mod,
          teil: Number(teilStr),
          lang: 'de',
          level: 'B1',
        });
        rec = batchToRecord(batch, resolved.file, mod, Number(teilStr));
        if (rec.id !== partId) rec.id = partId;
      }
      byId.set(partId, rec);
    }
  }
  return { records: [...byId.values()], missing };
}

function run(cmd, args) {
  console.log(`\n$ node ${path.relative(ROOT, cmd)} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [cmd, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${path.basename(cmd)}`);
  }
}

const { records, missing } = buildOverlay();
if (missing.length) {
  console.error('Missing pool-verified parts:');
  for (const m of missing) console.error(' ', m);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OVERLAY), { recursive: true });
fs.writeFileSync(
  OVERLAY,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      purpose: 'local publish of verified assembled e1–e3 for app testing',
      recordCount: records.length,
      records,
    },
    null,
    2,
  )}\n`,
);
console.log(`Overlay: ${records.length} records → ${path.relative(ROOT, OVERLAY)}`);

if (dryRun) {
  console.log('[DRY-RUN] Skipping publish/sync. Re-run without --dry-run to apply.');
  process.exit(0);
}

const publish = path.join(ROOT, 'scripts/publish-exam.mjs');
for (const exam of EXAMS) {
  run(publish, [
    '--from',
    path.relative(ROOT, exam.from),
    '--exam-id',
    exam.examId,
    '--slot',
    String(exam.n),
    '--title',
    exam.title,
    '--seed-overlay',
    path.relative(ROOT, OVERLAY),
    '--local-only',
    '--apply',
    '--yes',
  ]);
}

run(path.join(ROOT, 'scripts/sync-published-to-served.mjs'), [
  '--lang',
  'de',
  '--level',
  'B1',
  '--apply',
]);

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/published-exams/de/B1/_catalog.json'), 'utf8'),
);
const served = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/de_B1.json'), 'utf8'));
console.log('\n✅ Ready for npm run dev');
console.log(
  '  catalog live:',
  (catalog.exams || []).map((e) => `${e.examId} (slot ${e.slot})`).join(', '),
);
console.log(
  '  served:',
  served.map((e) => e.id || e.examId).join(', '),
);
console.log('  Hard-refresh the app (cache may hold the old single exam).');
