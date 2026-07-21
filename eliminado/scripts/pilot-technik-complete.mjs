#!/usr/bin/env node
/**
 * pilot-technik-complete.mjs — Fill Technik to 5/5 (≥3 per Teil) via strict publish pipeline.
 *
 *   node scripts/pilot-technik-complete.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { verifyPoolRecordServable } from './lib/publishToPool.mjs';
import {
  detectT4DebateTopic,
  detectT5Subtype,
  getDebateById,
  getSubtypeById,
} from './lib/lesenSubtypeRotation.mjs';

const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

loadEnvFile();

const TOPIC = 'Technik';
const TARGET_PER_TEIL = 3;

function countTopic(records) {
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

function needed(counts) {
  const plan = {};
  for (let t = 1; t <= 5; t++) {
    plan[t] = Math.max(0, TARGET_PER_TEIL - (counts[t] || 0));
  }
  return plan;
}

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

function partSummary(teil, record, batch) {
  if (teil === 2) {
    const ps = record.passages?.length
      ? record.passages
      : record.passage?.passages || [];
    if (ps.length >= 2) {
      return { titles: ps.map((p) => p.title || p.textTitle || '').filter(Boolean) };
    }
    return { titles: [record.passage?.title || ''].filter(Boolean) };
  }
  if (teil === 4) {
    const id = record.debateTopic || detectT4DebateTopic(record);
    const def = id ? getDebateById(id) : null;
    return { debateTopic: id, debateLabel: def?.label || id, title: record.passage?.title || '' };
  }
  if (teil === 5) {
    const id = record.textSubtype || detectT5Subtype(record);
    const def = id ? getSubtypeById(id) : null;
    return { textSubtype: id, subtypeLabel: def?.label || id, title: record.passage?.title || '' };
  }
  if (teil === 3) {
    const slug = batch?._blueprintSlug || record?._blueprintSlug || null;
    const qs = batch?.questions || record?.questions || [];
    return {
      slug,
      situations: qs.slice(0, 2).map((q) => String(q.question || '').slice(0, 70)),
    };
  }
  return { title: record.passage?.title || record.passages?.[0]?.title || '' };
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
      if (pub.stderr) console.log(pub.stderr.slice(-350));
      continue;
    }
    const poolId = pub.stdout.match(/Pool local: (pub-[^\s]+)/)?.[1];
    const serv = poolId ? verifyPoolRecordServable(poolId) : { servable: false };
    if (!serv.servable) {
      console.log(`  ⚠ No servible: ${serv.reason}`);
      continue;
    }
    console.log(`  ✅ Pool: ${serv.record.id}`);
    const audit = await auditRecord(serv.record);
    const detected = detectTopic(serv.record);
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
      topicDetected: detected?.topic || null,
      summary: partSummary(teil, serv.record, gen.batch),
    };
  }
  return { ok: false, teil, label, error: 'max_attempts' };
}

async function main() {
  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const countsBefore = countTopic(before.records);
  const plan = needed(countsBefore);
  const totalToGen = Object.values(plan).reduce((a, b) => a + b, 0);

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  Technik completo → pool (objetivo ≥3/teil)              ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log('Antes:', countsBefore);
  console.log('Plan:', plan, `(generar ${totalToGen} partes)\n`);

  if (totalToGen === 0) {
    console.log('Technik ya completo — solo manifest.');
  }

  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    maxApiCalls: 120,
    fixRetries: 2,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;
  sessionArgs.topic = TOPIC;
  sessionArgs._resolvedTopic = TOPIC;
  sessionArgs._t3ExcludeSlugs = new Set();
  const sessionWrap = { session, args: sessionArgs };

  const results = [];
  const order = [1, 2, 4, 5, 3]; // L3 last / skip if plan[3]=0

  for (const teil of order) {
    const n = plan[teil];
    if (n <= 0) continue;
    console.log(`\n── L${teil} × ${n} ──`);
    for (let i = 0; i < n; i++) {
      console.log(`\nL${teil} parte ${i + 1}/${n}`);
      const r = await publishPart(teil, sessionWrap, `L${teil}-${i + 1}`);
      if (r.ok) results.push(r);
      else {
        console.error(`  ❌ ${r.label} failed`);
        process.exit(1);
      }
    }
  }

  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const countsAfter = countTopic(after.records);

  const firstTry = results.filter((r) => r.publishFirstTry).length;
  const report = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    countsBefore,
    countsAfter,
    plan,
    generated: results.length,
    firstTryPublish: firstTry,
    firstTryRate: results.length ? firstTry / results.length : null,
    totalGenAttempts: results.reduce((s, r) => s + r.genAttempts, 0),
    l4Debates: results.filter((r) => r.teil === 4).map((r) => r.summary),
    l5Subtypes: results.filter((r) => r.teil === 5).map((r) => r.summary),
    l2Titles: results.filter((r) => r.teil === 2).flatMap((r) => r.summary?.titles || []),
    parts: results.map(({ record, batch, ...rest }) => rest),
  };

  const reportPath = path.join(ROOT, 'scripts/pilot-technik-complete-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('INFORME Technik');
  console.log('═'.repeat(60));
  console.log('Después:', countsAfter);
  console.log(`Generadas esta corrida: ${results.length}`);
  console.log(`1ª publish: ${firstTry}/${results.length} (${Math.round((report.firstTryRate || 0) * 100)}%)`);
  console.log(`Gen attempts: ${report.totalGenAttempts}`);
  if (report.l4Debates.length) {
    console.log('L4 debates:', report.l4Debates.map((d) => d.debateLabel || d.debateTopic).join(' | '));
  }
  if (report.l5Subtypes.length) {
    console.log('L5 subtipos:', report.l5Subtypes.map((s) => s.subtypeLabel || s.textSubtype).join(' | '));
  }
  console.log(`Informe: ${path.relative(ROOT, reportPath)}`);

  const allFull = [1, 2, 3, 4, 5].every((t) => countsAfter[t] >= TARGET_PER_TEIL);
  if (allFull) {
    console.log('\n🎉 Technik 5/5 Teile (≥3 cada uno)');
    const man = spawnSync(process.execPath, ['scripts/build-pool-stock-manifest.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (man.status !== 0) process.exit(man.status || 1);

    // cache bust selector
    const idxPath = path.join(ROOT, 'index.html');
    let idx = fs.readFileSync(idxPath, 'utf8');
    const m = idx.match(/personalLesenTopicStock\.js\?v=(\d+)/);
    if (m) {
      const v = Number(m[1]) + 1;
      idx = idx.replace(/personalLesenTopicStock\.js\?v=\d+/, `personalLesenTopicStock.js?v=${v}`);
      fs.writeFileSync(idxPath, idx);
      console.log(`Selector cache → v=${v}`);
    }
  }

  process.exit(allFull ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
