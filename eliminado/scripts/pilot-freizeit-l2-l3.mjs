#!/usr/bin/env node
/**
 * pilot-freizeit-l2-l3.mjs — Complete Freizeit L2 (×2) + L3 (×3) → pool publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { verifyPoolRecordServable } from './lib/publishToPool.mjs';

loadEnvFile();

const TOPIC = 'Freizeit';
const L2_TARGET = 2;
const L3_TARGET = 3;

function runPublish(relFile) {
  const res = spawnSync(
    process.execPath,
    [
      'scripts/publish-lesen-generated.mjs',
      '--file', relFile,
      '--publish',
      '--allow-bank-dup',
      '--lang', 'de',
      '--level', 'B1',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  );
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  return {
    ok: res.status === 0,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    poolDedup: /POOL-DEDUP|pool_dedup/i.test(out),
  };
}

function countFreizeit(records) {
  const out = {};
  for (let t = 1; t <= 5; t++) {
    out[t] = (records || []).filter(
      (r) =>
        r.verified &&
        r.module === 'lesen' &&
        r.teil === t &&
        r.topicTag === TOPIC &&
        (r.sem1VerifiedAt || r.sem1Skipped),
    ).length;
  }
  return out;
}

function l2PassageSummary(record) {
  const passages = record.passages || [];
  if (passages.length >= 2) {
    return passages.map((p) => ({
      title: p.title || '',
      preview: String(p.text || '').slice(0, 120),
    }));
  }
  // seed format may flatten — try batch-style from questions passageIds
  return [{ title: record.passage?.title || '(single)', preview: String(record.passage?.text || '').slice(0, 120) }];
}

function t3ScenarioSummary(batch, record) {
  const slug = batch?._blueprintSlug || record?._blueprintSlug || null;
  const qs = batch?.questions || record?.questions || [];
  const situations = qs.slice(0, 3).map((q) => String(q.question || '').slice(0, 80));
  const ads = (qs[0]?.options || []).slice(0, 3).map((o) => String(o).replace(/^[A-J]\)\s*/, '').slice(0, 50));
  return { slug, situations, adsSample: ads };
}

async function auditRecord(record) {
  const pool2 = await isPartPoolReady(record, { semantic: false });
  const sem1 = await isPartPoolReady(record, { semantic: true });
  return { pool2Ok: pool2.ok, sem1Ok: sem1.ok, publishGateOk: pool2.ok && sem1.ok };
}

async function publishPart(teil, sessionWrap, label) {
  let genAttempts = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    genAttempts++;
    const gen = await generateLesenPart({
      teil,
      topic: TOPIC,
      writeFile: true,
      session: sessionWrap,
      fixRetries: 2,
    });
    if (!gen.ok || !gen.file) {
      console.log(`  ${label} gen ${genAttempts}: FAIL (${gen.reason || '?'})`);
      continue;
    }
    console.log(`  Gen OK: ${gen.file} (intento ${genAttempts})`);
    const pub = runPublish(gen.file);
    if (!pub.ok) {
      console.log(`  Publish FAIL${pub.poolDedup ? ' [DEDUP]' : ''}`);
      if (pub.stderr) console.log(pub.stderr.slice(-400));
      continue;
    }
    const poolId = pub.stdout.match(/Pool local: (pub-[^\s]+)/)?.[1];
    const serv = poolId ? verifyPoolRecordServable(poolId) : { servable: false };
    if (!servableCheck(serv)) continue;
    const audit = await auditRecord(serv.record);
    return {
      ok: true,
      teil,
      poolId: serv.record.id,
      sourceFile: gen.file,
      genAttempts,
      publishFirstTry: genAttempts === 1,
      poolDedup: false,
      batch: gen.batch,
      record: serv.record,
      audit,
    };
  }
  return { ok: false, teil, label, error: 'max_attempts' };
}

function servableCheck(serv) {
  if (!serv.servable) {
    console.log(`  ⚠ No servible: ${serv.reason}`);
    return false;
  }
  console.log(`  ✅ Pool: ${serv.record.id}`);
  return true;
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  Freizeit L2×${L2_TARGET} + L3×${L3_TARGET} → pool publish                         ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const countsBefore = countFreizeit(before.records);
  console.log('Antes:', countsBefore);

  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    maxApiCalls: 50,
    fixRetries: 2,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;
  sessionArgs.topic = TOPIC;
  sessionArgs._resolvedTopic = TOPIC;
  sessionArgs._t3ExcludeSlugs = new Set();
  const sessionWrap = { session, args: sessionArgs };

  const results = [];

  console.log(`\n── L2 × ${L2_TARGET} ──`);
  for (let i = 0; i < L2_TARGET; i++) {
    console.log(`\nL2 parte ${i + 1}/${L2_TARGET}`);
    const r = await publishPart(2, sessionWrap, `L2-${i + 1}`);
    if (r.ok) {
      r.passages = l2PassageSummary(r.record);
      results.push(r);
    }
  }

  console.log(`\n── L3 × ${L3_TARGET} (make-t3) ──`);
  for (let i = 0; i < L3_TARGET; i++) {
    console.log(`\nL3 parte ${i + 1}/${L3_TARGET}`);
    const r = await publishPart(3, sessionWrap, `L3-${i + 1}`);
    if (r.ok) {
      r.t3 = t3ScenarioSummary(r.batch, r.record);
      results.push(r);
    }
  }

  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const countsAfter = countFreizeit(after.records);

  const l2 = results.filter((r) => r.teil === 2);
  const l3 = results.filter((r) => r.teil === 3);
  const l2Titles = l2.flatMap((r) => r.passages?.map((p) => p.title) || []);
  const l3Slugs = l3.map((r) => r.t3?.slug).filter(Boolean);

  const report = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    countsBefore,
    countsAfter,
    l2Published: l2.length,
    l3Published: l3.length,
    l2DistinctTitles: [...new Set(l2Titles)],
    l3BlueprintSlugs: l3Slugs,
    l3SlugsUnique: [...new Set(l3Slugs)].length === l3Slugs.length,
    allFirstTry: results.every((r) => r.publishFirstTry && r.audit?.publishGateOk),
    parts: results.map(({ record, batch, ...rest }) => rest),
  };

  const reportPath = path.join(ROOT, 'scripts/pilot-freizeit-l2-l3-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('INFORME L2+L3');
  console.log('═'.repeat(60));
  console.log('Después:', countsAfter);
  console.log(`L2 publicadas: ${l2.length}/${L2_TARGET} | títulos: ${report.l2DistinctTitles.join(' | ')}`);
  console.log(`L3 publicadas: ${l3.length}/${L3_TARGET} | blueprints: ${l3Slugs.join(', ')}`);
  console.log(`POOL-2+SEM-1 re-audit OK: ${results.filter((r) => r.audit?.publishGateOk).length}/${results.length}`);
  console.log(`Informe: ${path.relative(ROOT, reportPath)}`);

  const allTeilsFull = [1, 2, 3, 4, 5].every((t) => countsAfter[t] >= 1);
  if (allTeilsFull) {
    console.log('\n🎉 Freizeit 5/5 Teile con stock servible');
    const man = spawnSync(process.execPath, ['scripts/build-pool-stock-manifest.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (man.status !== 0) process.exit(man.status || 1);
  }

  process.exit(
    l2.length >= L2_TARGET && l3.length >= L3_TARGET && allTeilsFull ? 0 : 1,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
