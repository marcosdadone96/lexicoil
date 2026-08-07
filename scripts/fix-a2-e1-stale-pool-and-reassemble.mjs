#!/usr/bin/env node
/**
 * Fix 3 stale A2 e1 source issues in pool-verified (not cache), reassemble e1, verify, publish.
 *   node scripts/fix-a2-e1-stale-pool-and-reassemble.mjs           # dry-run
 *   node scripts/fix-a2-e1-stale-pool-and-reassemble.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { buildExamPartsFromPicked, oralTeilsForLevel } from './lib/examLevelCells.mjs';
import { isExamPublishable, partRecordToExamPart } from './audit-pass-2.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { publishVerifiedExamSlots } from './lib/verifiedExamPublishLib.mjs';

loadEnvFile();

const apply = process.argv.includes('--apply');
const LEVEL = 'A2';
const SLOT = 1;
const POOL = poolVerifiedDir(LEVEL);
const ASM = path.join(ROOT, 'batches/ready/assembled-from-verified/assembled-exam-a2-verified-e1.json');

const SCHREIBEN_T1_Q =
  'Dein Freund/Deine Freundin sucht eine neue Wohnung. Du hast einen tollen Wohnungstipp für ihn/sie. Schreib eine kurze E-Mail (20–30 Wörter) mit 3 Informationen: Wo ist die Wohnung? Wie viele Zimmer? Warum ist sie gut?';

const SCHREIBEN_T2_Q =
  'Ihr Chef lädt Sie zu einer Informationsveranstaltung ein. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n' +
  '• Bedanken Sie sich für die Einladung\n' +
  '• Sagen Sie, dass Sie kommen und eine Kollegin mitbringen\n' +
  '• Fragen Sie nach der genauen Adresse';

function batchToRecord(batch, file, module, teil) {
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, { lang: 'de', level: LEVEL, teil: t, idPrefix: 'pv' });
    rec.id = file.replace(/\.json$/i, '');
    return rec;
  }
  const passages = batch.passages || [];
  const rec = {
    id: file.replace(/\.json$/i, ''),
    module: mod,
    teil: t,
    lang: 'de',
    level: LEVEL,
    questions: batch.questions || [],
    topicTag: batch.topicTag || passages[0]?.topicTag,
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

function oralBundleToParts(batch, file, module) {
  const base = file.replace(/\.json$/i, '');
  const schreibenWords = { 1: { min: 20, max: 30 }, 2: { min: 30, max: 40 } };
  const parts = [];
  for (const teil of oralTeilsForLevel(module, LEVEL)) {
    const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
    if (!qs.length) continue;
    const rec = {
      id: `${base}-t${teil}`,
      module,
      teil,
      lang: 'de',
      level: LEVEL,
      questions: qs,
      instruction: qs[0]?.question || '',
      task: qs[0]?.question || '',
      topicTag: batch.topicTag || qs[0]?.topicTags?.[0],
      complete: true,
      verified: true,
      ...(module === 'schreiben'
        ? {
            minWords: schreibenWords[teil].min,
            maxWords: schreibenWords[teil].max,
          }
        : {}),
    };
    parts.push({
      cell: `${module}_${teil}`,
      id: rec.id,
      file,
      record: rec,
      part: partRecordToExamPart(rec),
    });
  }
  return parts;
}

function fixLesenT4Education() {
  const fp = path.join(POOL, 'lesen-t4-cur-education.json');
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const before = batch.questions?.find((q) => String(q.id).startsWith('20'))?.correct;
  const q20 = (batch.questions || []).find(
    (q) => /Museum mit Restaurant/i.test(String(q.question || '')),
  );
  if (!q20) throw new Error('Q20 not found in lesen-t4-cur-education.json');
  q20.correct = 'f';
  q20.correctAnswer = 'f';
  q20.explanation =
    'Anzeige f (Kunsthalle – mit Restaurant) passt: Im Restaurant können Sie nach dem Museumsbesuch zu Mittag essen.';
  if (apply) fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`);
  return { file: 'lesen-t4-cur-education.json', before, after: q20.correct, location: fp };
}

function fixSchreibenEducation() {
  const fp = path.join(POOL, 'schreiben-cur-education.json');
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const t1 = batch.questions?.find((q) => Number(q.teil) === 1);
  const t2 = batch.questions?.find((q) => Number(q.teil) === 2);
  const before = {
    t1Words: t1?.question?.match(/80|20–30|20-30/)?.[0] || '?',
    t2Topic: /Lärm|Forum/i.test(String(t2?.question || '')) ? 'forum-lärm' : 'other',
    t2Words: t2?.question?.match(/80|30–40|30-40/)?.[0] || '?',
  };
  if (t1) t1.question = SCHREIBEN_T1_Q;
  if (t2) {
    t2.id = 'de-a2-s-t2-bildung-feier-01-q1';
    t2.question = SCHREIBEN_T2_Q;
    t2.topicTags = ['education', 'Bildung'];
  }
  if (apply) fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`);
  return { file: 'schreiben-cur-education.json', before, after: { t1Words: '20–30', t2Topic: 'chef-email', t2Words: '30–40' }, location: fp };
}

function loadPartFromPool(cell, partId, sources) {
  const srcFile = sources[cell];
  if (!srcFile) throw new Error(`No source file for ${cell}`);
  const fp = path.join(POOL, srcFile);
  let batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  if (module === 'schreiben' || module === 'sprechen') {
    const parts = oralBundleToParts(batch, srcFile, module);
    const hit = parts.find((p) => p.id === partId);
    if (!hit) throw new Error(`Oral part ${partId} not in ${srcFile}`);
    return hit;
  }
  batch = normalizeBatch(batch, { module, teil, lang: 'de', level: LEVEL });
  const rec = batchToRecord(batch, srcFile.replace(/\.json$/i, ''), module, teil);
  if (rec.id !== partId) rec.id = partId;
  return {
    cell,
    id: partId,
    file: srcFile,
    record: rec,
    part: partRecordToExamPart(rec),
  };
}

function reassembleE1() {
  const prev = JSON.parse(fs.readFileSync(ASM, 'utf8'));
  const { partIds, sources, topics, poolCells } = prev._meta;
  const picked = {};
  for (const [cell, partId] of Object.entries(partIds)) {
    picked[cell] = loadPartFromPool(cell, partId, sources);
  }
  const exam = buildExamPartsFromPicked(picked, LEVEL);
  const gate = isExamPublishable({ exam, level: LEVEL }, { expectedLevel: LEVEL });
  const doc = {
    _meta: {
      ...prev._meta,
      generatedAt: new Date().toISOString(),
      purpose: 're-assembled from updated pool-verified (same partIds, fresh pool content)',
      reassembledFromPoolAt: new Date().toISOString(),
      gate1: { ok: gate.ok, blocking: (gate.blocking || []).slice(0, 8) },
      partIds,
      sources,
      topics,
      poolCells,
    },
    lang: 'de',
    level: LEVEL,
    goetheFormat: true,
    exam,
  };
  if (apply) fs.writeFileSync(ASM, `${JSON.stringify(doc, null, 2)}\n`);
  return { gate, exam, partIds };
}

function verifyChecks(exam) {
  const lesenT4 = (exam.lesenParts || []).find((p) => Number(p.teil) === 4);
  const q20 = (lesenT4?.items || lesenT4?.questions || []).find((q) =>
    /Museum mit Restaurant/i.test(String(q.question || '')),
  );
  const sch1 = (exam.schreibenParts || []).find((p) => Number(p.teil) === 1);
  const sch2 = (exam.schreibenParts || []).find((p) => Number(p.teil) === 2);
  return {
    q20Correct: q20?.correct ?? q20?.correctAnswer,
    schreibenT2HasForum: /Lärm|Forum/i.test(String(sch2?.task || sch2?.instruction || '')),
    schreibenT2HasChef: /Chef|Informationsveranstaltung/i.test(String(sch2?.task || '')),
    schreibenT1Words: {
      instruction: sch1?.instruction || sch1?.task || '',
      minWords: sch1?.minWords,
      maxWords: sch1?.maxWords,
    },
    schreibenT2Words: {
      instruction: sch2?.instruction || sch2?.task || '',
      minWords: sch2?.minWords,
      maxWords: sch2?.maxWords,
    },
  };
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    diagnosis: {
      q20: 'STALE IN POOL SOURCE lesen-t4-cur-education.json (not cache-only)',
      schreibenT2: 'STALE IN POOL SOURCE schreiben-cur-education.json (bank had fix, pool never updated)',
      schreibenWords: 'STALE IN POOL SOURCE schreiben-cur-education.json (B1 template "80 Wörter" never adapted)',
      assembledExam: 'assembled-exam-a2-verified-e1.json mirrored stale pool at assemble time',
    },
    fixes: [],
    verify: null,
    publish: null,
  };

  console.log(`\n=== A2 e1 stale pool fix + reassemble (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  report.fixes.push(fixLesenT4Education());
  report.fixes.push(fixSchreibenEducation());
  console.log('Pool fixes planned/applied:');
  for (const f of report.fixes) {
    console.log(`  ${f.file}: ${JSON.stringify(f.before)} → ${JSON.stringify(f.after)}`);
  }

  if (apply) {
    const schFp = path.join(POOL, 'schreiben-cur-education.json');
    const schBatch = JSON.parse(fs.readFileSync(schFp, 'utf8'));
    await syncPoolVerifiedBatch({
      file: schFp,
      batch: schBatch,
      level: LEVEL,
      opts: { lang: 'de', module: 'schreiben', syncBlobs: false },
    });
    const l4Fp = path.join(POOL, 'lesen-t4-cur-education.json');
    const l4Batch = JSON.parse(fs.readFileSync(l4Fp, 'utf8'));
    await syncPoolVerifiedBatch({
      file: l4Fp,
      batch: l4Batch,
      level: LEVEL,
      opts: { lang: 'de', module: 'lesen', teil: 4, syncBlobs: false },
    });
  }

  const { gate, exam } = reassembleE1();
  report.verify = verifyChecks(exam);
  report.verify.gate1Ok = gate.ok;

  console.log('\n--- dry-run verification ---');
  console.log(`  Q20 correct: ${report.verify.q20Correct} (expect f)`);
  console.log(`  Schreiben T2 forum: ${report.verify.schreibenT2HasForum} (expect false)`);
  console.log(`  Schreiben T2 chef email: ${report.verify.schreibenT2HasChef} (expect true)`);
  console.log(
    `  Schreiben T1: min=${report.verify.schreibenT1Words.minWords} max=${report.verify.schreibenT1Words.maxWords} text has 20–30=${/20.?30/.test(report.verify.schreibenT1Words.instruction)}`,
  );
  console.log(
    `  Schreiben T2: min=${report.verify.schreibenT2Words.minWords} max=${report.verify.schreibenT2Words.maxWords} text has 30–40=${/30.?40/.test(report.verify.schreibenT2Words.instruction)}`,
  );
  console.log(`  GATE-1: ${gate.ok ? 'PASS' : 'FAIL'}`);

  const ok =
    report.verify.q20Correct === 'f' &&
    !report.verify.schreibenT2HasForum &&
    report.verify.schreibenT2HasChef &&
    /20.?30/.test(report.verify.schreibenT1Words.instruction) &&
    /30.?40/.test(report.verify.schreibenT2Words.instruction) &&
    report.verify.schreibenT1Words.minWords === 20 &&
    report.verify.schreibenT1Words.maxWords === 30 &&
    report.verify.schreibenT2Words.minWords === 30 &&
    report.verify.schreibenT2Words.maxWords === 40 &&
    gate.ok;

  if (apply && ok) {
    report.publish = await publishVerifiedExamSlots({
      slots: [SLOT],
      lang: 'de',
      level: LEVEL,
      dryRun: false,
      syncServed: true,
    });
    console.log('\nPublished:', report.publish.published.join(', '));
    console.log('Live exams:', report.publish.liveExams.join(', '));
  }

  const out = path.join(ROOT, 'batches/ready/gate-logs/a2-e1-stale-pool-fix-2026-07-21.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: ${path.relative(ROOT, out)}`);
  console.log(ok ? '\n✓ All checks pass\n' : '\n✗ Verification failed\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
