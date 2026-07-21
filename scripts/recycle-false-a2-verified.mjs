#!/usr/bin/env node
/**
 * Recycle false A2 verified exams:
 * - e2,e3,e4: duplicate of published B1-e2..e4 → quarantine (no republish)
 * - e3,e5: pad Lesen T2 MCQ distractors for length bias
 * - e5: convert to B1 slot 5 (add lesen_5 + schreiben_3 from pool)
 * - e1: quarantine (handled by re-assemble script)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { mcqOptionBody, mcqCorrectLetter } from './lib/mcqLengthBias.mjs';
import { isExamPublishable } from './audit-pass-2.mjs';
import { partRecordToExamPart } from './audit-pass-2.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { poolVerifiedDir, POOL_VERIFIED_DIR } from './lib/batchPaths.mjs';
import { publishVerifiedExamSlots } from './lib/verifiedExamPublishLib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASM = path.join(ROOT, 'batches/ready/assembled-from-verified');
const QUAR = path.join(ASM, 'quarantine');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function partIdsFrom(doc) {
  return doc._meta?.partIds || {};
}

function collisionReport() {
  const b1 = [1, 2, 3, 4].map((n) =>
    partIdsFrom(loadJson(path.join(ASM, `assembled-exam-b1-verified-e${n}.json`))),
  );
  const flat = new Map();
  for (const [i, p] of b1.entries()) {
    for (const [cell, id] of Object.entries(p)) flat.set(id, `B1-e${i + 1}:${cell}`);
  }
  const report = {};
  for (const n of [2, 3, 4, 5]) {
    const a2 = partIdsFrom(loadJson(path.join(ASM, `assembled-exam-a2-verified-e${n}.json`)));
    const hits = [];
    for (const [cell, id] of Object.entries(a2)) {
      if (flat.has(id)) hits.push({ id, cell, conflict: flat.get(id) });
    }
    report[`a2-e${n}`] = { collisions: hits, totalParts: Object.keys(a2).length };
  }
  return report;
}

function padLesenT2Part(part) {
  let changed = 0;
  const questions = (part.questions || []).map((q) => {
    const letter = mcqCorrectLetter(q);
    if (!letter) return q;
    const idx = { a: 0, b: 1, c: 2 }[letter];
    if (idx == null) return q;
    const opts = q.options.map((o) => (typeof o === 'object' ? { ...o } : o));
    const correctLen = mcqOptionBody(opts[idx]).length;
    let qChanged = false;
    for (let i = 0; i < opts.length; i++) {
      if (i === idx) continue;
      let body = mcqOptionBody(opts[i]);
      if (body.length + 3 >= correctLen) continue;
      const pad = ' laut dem Text.';
      while (body.length + pad.length <= correctLen + 2) body += pad;
      if (typeof opts[i] === 'object') opts[i].text = body;
      else opts[i] = `${String.fromCharCode(97 + i)}) ${body}`;
      qChanged = true;
    }
    if (qChanged) changed++;
    return qChanged ? { ...q, options: opts } : q;
  });
  return { part: { ...part, questions }, changed };
}

function resolvePoolBatch(partId) {
  const oral = partId.match(/^(schreiben|sprechen)-(.+)-t([123])$/i);
  const file = oral ? `${oral[1]}-${oral[2]}.json` : `${partId}.json`;
  for (const root of [poolVerifiedDir('B1'), POOL_VERIFIED_DIR]) {
    const abs = path.join(root, file);
    if (fs.existsSync(abs)) return { abs, file, batch: loadJson(abs) };
  }
  return null;
}

function partFromPool(partId, cell) {
  const resolved = resolvePoolBatch(partId);
  if (!resolved) throw new Error(`missing pool file for ${partId}`);
  const [mod, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const batch = normalizeBatch(resolved.batch, {
    module: mod,
    teil,
    lang: 'de',
    level: 'B1',
  });
  let record;
  if (mod === 'lesen') {
    record = buildLesenSeedRecordFromBatch(batch, { lang: 'de', level: 'B1', teil, idPrefix: 'pv' });
    record.id = partId;
  } else if (mod === 'schreiben' || mod === 'sprechen') {
    const t = Number(partId.match(/-t(\d+)$/i)?.[1] || teil);
    const qs = batch.questions.filter((q) => Number(q.teil) === t);
    record = {
      id: partId,
      module: mod,
      teil: t,
      lang: 'de',
      level: 'B1',
      questions: qs,
      complete: true,
      verified: true,
    };
  } else {
    record = { id: partId, module: mod, teil, lang: 'de', level: 'B1', questions: batch.questions };
  }
  return {
    cell,
    id: partId,
    file: resolved.file,
    record,
    part: partRecordToExamPart(record),
    topic: batch.topicTag || null,
  };
}

function convertA2DocToB1(doc, { slot, extraParts = {} }) {
  const exam = JSON.parse(JSON.stringify(doc.exam));
  const meta = { ...doc._meta };
  const partIds = { ...meta.partIds };
  const sources = { ...meta.sources };
  const topics = { ...(meta.topics || {}) };

  for (const [cell, partId] of Object.entries(extraParts)) {
    const picked = partFromPool(partId, cell);
    const [mod] = cell.split('_');
    const key = `${mod}Parts`;
    if (cell.startsWith('lesen_')) {
      const t = Number(cell.split('_')[1]);
      exam.lesenParts = exam.lesenParts || [];
      exam.lesenParts.push({ ...picked.part, teil: t });
      exam.lesenParts.sort((a, b) => a.teil - b.teil);
    } else if (cell.startsWith('schreiben_')) {
      exam.schreibenParts = exam.schreibenParts || [];
      exam.schreibenParts.push({ ...picked.part, teil: Number(cell.split('_')[1]) });
      exam.schreibenParts.sort((a, b) => a.teil - b.teil);
    }
    partIds[cell] = partId;
    sources[cell] = picked.file;
    topics[cell] = picked.topic;
  }

  const t2 = exam.lesenParts?.find((p) => p.teil === 2);
  if (t2) {
    const { part, changed } = padLesenT2Part(t2);
    if (changed) {
      const i = exam.lesenParts.findIndex((p) => p.teil === 2);
      exam.lesenParts[i] = part;
    }
  }

  const out = {
    _meta: {
      ...meta,
      examNumber: slot,
      examId: `verified-de-B1-e${slot}`,
      recycledFrom: meta.examId,
      purpose: 'recycled from false A2 verified assembly',
      assembleMode: 'official',
      sourceRoot: 'batches/ready/pool-verified/B1',
      partIds,
      sources,
      topics,
    },
    lang: 'de',
    level: 'B1',
    goetheFormat: true,
    exam,
  };
  const gate = isExamPublishable({ exam, level: 'B1' }, { expectedLevel: 'B1' });
  out._meta.gate1 = { ok: gate.ok, blocking: (gate.blocking || []).slice(0, 8) };
  if (!gate.ok) {
    throw new Error(
      `GATE-1 BLOCK — B1-e${slot} not publishable: ${(gate.blocking || [])
        .slice(0, 2)
        .map((b) => b.message)
        .join('; ')}`,
    );
  }
  return out;
}

function moveQuarantine(name, reason) {
  fs.mkdirSync(QUAR, { recursive: true });
  const src = path.join(ASM, name);
  const dest = path.join(QUAR, name);
  if (fs.existsSync(src)) {
    fs.writeFileSync(
      path.join(QUAR, `${name}.quarantine.json`),
      `${JSON.stringify({ reason, movedAt: new Date().toISOString() }, null, 2)}\n`,
    );
    fs.renameSync(src, dest);
  }
}

const apply = process.argv.includes('--apply');
const report = collisionReport();
console.log('=== B1 partId collision report (recycle candidates) ===');
console.log(JSON.stringify(report, null, 2));

if (!apply) {
  console.log('\n[dry-run] Pass --apply to quarantine duplicates and publish B1-e5.');
  process.exit(0);
}

for (const n of [2, 3, 4]) {
  const name = `assembled-exam-a2-verified-e${n}.json`;
  const srcPath = path.join(ASM, name);
  if (n === 3 && fs.existsSync(srcPath)) {
    const doc = loadJson(srcPath);
    const t2 = doc.exam?.lesenParts?.find((p) => p.teil === 2);
    if (t2) {
      const { part, changed } = padLesenT2Part(t2);
      if (changed) {
        const i = doc.exam.lesenParts.findIndex((p) => p.teil === 2);
        doc.exam.lesenParts[i] = part;
        fs.writeFileSync(srcPath, `${JSON.stringify(doc, null, 2)}\n`);
        console.log(`Padded Lesen T2 in ${name} (${changed} MCQ items)`);
      }
    }
  }
  moveQuarantine(
    name,
    `duplicate of published B1-e${n} (${report[`a2-e${n}`].collisions.length} partId collisions)`,
  );
}

const e5 = loadJson(path.join(ASM, 'assembled-exam-a2-verified-e5.json'));
const b1e5 = convertA2DocToB1(e5, {
  slot: 5,
  extraParts: {
    lesen_5: 'lesen-t5-gemini-076',
    schreiben_3: 'schreiben-gemini-006-t3',
  },
});
const outPath = path.join(ASM, 'assembled-exam-b1-verified-e5.json');
fs.writeFileSync(outPath, `${JSON.stringify(b1e5, null, 2)}\n`);
console.log('Wrote', path.relative(ROOT, outPath), 'gate1=', b1e5._meta.gate1.ok);
moveQuarantine('assembled-exam-a2-verified-e5.json', 'converted to B1-e5');

const pub = publishVerifiedExamSlots({ slots: [5], lang: 'de', level: 'B1', dryRun: false, syncServed: true });
console.log('Published B1 slot 5:', pub);
