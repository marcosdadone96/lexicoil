#!/usr/bin/env node
/**
 * Replace lesen_4 in official B1 assembled e13/e13 after quarantine of 060/069.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { auditExam, isExamPublishable, partRecordToExamPart } from './audit-pass-2.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { publishVerifiedExamSlots } from './lib/verifiedExamPublishLib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASM_DIR = path.join(ROOT, 'batches/ready/assembled-from-verified');

function extractTopic(rec, batch) {
  const fromQ = (batch?.questions || rec?.questions || [])
    .flatMap((q) => q.topicTags || [])
    .map((t) => normalizeB1Topic(t) || t)
    .find(Boolean);
  return (
    fromQ ||
    normalizeB1Topic(batch?.topicTag || rec?.topicTag || batch?.passages?.[0]?.topicTag) ||
    null
  );
}

function alignLesenT4Title(batch) {
  const seed = batch._debateSeed || batch.debateSeed;
  if (!seed || !batch.passages?.[0]) return batch;
  const core = String(seed).trim().replace(/[.!?…]+$/u, '').trim();
  batch.passages[0].title = `Stadtforum: ${core}`;
  return batch;
}

function loadLesen4Part(partId) {
  const file = `${partId}.json`;
  const abs = path.join(poolVerifiedDir('B1'), file);
  if (!fs.existsSync(abs)) throw new Error(`missing pool part: ${abs}`);
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  batch = alignLesenT4Title(batch);
  fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  batch = normalizeBatch(batch, { module: 'lesen', teil: 4, lang: 'de', level: 'B1' });
  const record = buildLesenSeedRecordFromBatch(batch, {
    lang: 'de',
    level: 'B1',
    teil: 4,
    idPrefix: 'pv',
  });
  record.id = partId;
  record.complete = true;
  record.verified = true;
  return {
    partId,
    file,
    topic: extractTopic(record, batch),
    part: partRecordToExamPart(record),
  };
}

function patchAssembled(slot, picked) {
  const asmPath = path.join(ASM_DIR, `assembled-exam-b1-verified-e${slot}.json`);
  const doc = JSON.parse(fs.readFileSync(asmPath, 'utf8'));
  doc.exam.lesenParts[3] = picked.part;
  doc._meta.partIds.lesen_4 = picked.partId;
  doc._meta.topics.lesen_4 = picked.topic;
  doc._meta.sources.lesen_4 = picked.file;
  doc._meta.poolCells.lesen_4 = {
    poolLevel: 'B1',
    poolFile: `batches/ready/pool-verified/B1/${picked.file}`,
    partId: picked.partId,
    declaredLevel: 'B1',
  };
  doc._meta.lesenT4ReplacedAt = new Date().toISOString();
  doc._meta.lesenT4ReplaceNote = `060/069 quarantine → ${picked.partId}`;
  const gate = isExamPublishable({ exam: doc.exam, level: 'B1' }, { expectedLevel: 'B1' });
  doc._meta.gate1 = { ok: gate.ok, blocking: (gate.blocking || []).slice(0, 12) };
  fs.writeFileSync(asmPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  const audit = auditExam({ exam: doc.exam }, `e${slot}`);
  return { asmPath, gate, audit };
}

const REPLACEMENTS = [
  { slot: 13, partId: 'lesen-t4-gemini-076', was: 'lesen-t4-gemini-060', wantTopic: 'Wohnen' },
  { slot: 16, partId: 'lesen-t4-gemini-072', was: 'lesen-t4-gemini-069', wantTopic: 'Bildung→Kultur' },
];

const reports = [];
for (const spec of REPLACEMENTS) {
  const picked = loadLesen4Part(spec.partId);
  console.log(`e${spec.slot}: ${spec.was} → ${spec.partId} (topic ${picked.topic}, target ${spec.wantTopic})`);
  const { gate, audit } = patchAssembled(spec.slot, picked);
  console.log(`  GATE-1: ${gate.ok ? 'PASS' : 'FAIL'} blocking=${(gate.blocking || []).length}`);
  console.log(`  auditExam: CRITICAL=${audit.critical} IMPORTANT=${audit.important}`);
  if (!gate.ok) {
    console.error(gate.blocking);
    process.exit(1);
  }
  reports.push({ slot: spec.slot, partId: spec.partId, gate, audit });
}

console.log('\nPublishing e13 + e16…');
const pub = publishVerifiedExamSlots({ slots: [13, 16], lang: 'de', level: 'B1', dryRun: false, syncServed: true });
console.log(JSON.stringify(pub, null, 2));

fs.writeFileSync(
  path.join(ROOT, 'gate-logs/b1-e13-e16-lesen-t4-replace-report.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), replacements: REPLACEMENTS, reports, publish: pub }, null, 2)}\n`,
);
