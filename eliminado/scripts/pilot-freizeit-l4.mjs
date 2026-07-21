#!/usr/bin/env node
/**
 * pilot-freizeit-l4.mjs — Generate 3× Freizeit Lesen T4, publish to pool, quality report.
 *
 *   node scripts/pilot-freizeit-l4.mjs
 *   node scripts/pilot-freizeit-l4.mjs --count 3
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { verifyPoolRecordServable } from './lib/publishToPool.mjs';
import { detectT4DebateTopic, getDebateById } from './lib/lesenSubtypeRotation.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

loadEnvFile();

const TOPIC = 'Freizeit';
const TEIL = 4;
const TARGET = Number(process.argv.find((_, i, a) => a[i - 1] === '--count') || 3) || 3;

const FILLER_PATTERNS = [
  /abschließend lässt sich sagen/i,
  /zusammenfassend lässt sich/i,
  /insgesamt lässt sich feststellen/i,
  /alles in allem kann man sagen/i,
  /abschließend möchte ich/i,
];

const FREIZEIT_HINTS = [
  'freizeit', 'hobby', 'sport', 'verein', 'schwimmbad', 'park', 'kurs',
  'freizeitpark', 'erholung', 'ausflug', 'training', 'fitness',
];

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
    status: res.status,
    poolDedup: /POOL-DEDUP|pool_dedup/i.test(out),
    dedupMsg: out.match(/POOL-DEDUP[^\n]*/)?.[0] || null,
  };
}

function partText(record) {
  const chunks = [];
  if (record.passage?.title) chunks.push(record.passage.title);
  if (record.passage?.text) chunks.push(record.passage.text);
  for (const q of record.questions || []) {
    if (q.signText) chunks.push(q.signText);
    if (q.question) chunks.push(q.question);
  }
  return chunks.join('\n');
}

function debateInfo(record) {
  const id = record.debateTopic || detectT4DebateTopic(record);
  const def = id ? getDebateById(id) : null;
  return { debateTopic: id, debateLabel: def?.label || id || null, vorschlag: def?.vorschlag || null };
}

function analyzeLinguistics(record) {
  const text = partText(record);
  const fillers = FILLER_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
  const low = text.toLowerCase();
  const freizeitHits = FREIZEIT_HINTS.filter((w) => low.includes(w));
  const detected = detectTopic(text);
  return { fillers, freizeitHits, detectedTopic: detected || null, textLen: text.length };
}

async function auditRecord(record) {
  const pool2 = await isPartPoolReady(record, { semantic: false });
  const sem1 = await isPartPoolReady(record, { semantic: true });
  return {
    pool2Ok: pool2.ok,
    pool2Blocking: pool2.blocking?.length || 0,
    sem1Ok: sem1.ok,
    sem1Blocking: (sem1.blocking || []).filter((f) => String(f.id || '').startsWith('SEM-')).length,
  };
}

function countCell(records) {
  return (records || []).filter(
    (r) => r.verified && r.module === 'lesen' && r.teil === TEIL && r.topicTag === TOPIC,
  ).length;
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  PILOTO: ${TARGET}× Lesen T${TEIL} · tema «${TOPIC}» → pool publish  ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const l4Before = countCell(before.records);

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
  const sessionWrap = { session, args: sessionArgs };
  const results = [];
  let publishAttempts = 0;

  for (let i = 0; i < TARGET; i++) {
    console.log(`\n── Parte ${i + 1}/${TARGET} ──`);
    let genAttempts = 0;
    let published = false;

    while (!published && genAttempts < 8) {
      genAttempts++;
      const gen = await generateLesenPart({
        teil: TEIL,
        topic: TOPIC,
        writeFile: true,
        session: sessionWrap,
        fixRetries: 2,
      });

      if (!gen.ok || !gen.file) {
        console.log(`  Gen intento ${genAttempts}: FAIL (${gen.reason || 'unknown'})`);
        continue;
      }

      const relFile = gen.file;
      console.log(`  Gen OK: ${relFile} (gen ${genAttempts}, API tries ${gen.attempts || 1})`);
      if (gen.batch?._debateTopic) {
        const d = getDebateById(gen.batch._debateTopic);
        console.log(`  Debate pedido: ${d?.label || gen.batch._debateTopic}`);
      }

      publishAttempts++;
      const pub = runPublish(relFile);
      if (!pub.ok) {
        console.log(`  Publish FAIL (exit ${pub.status})${pub.poolDedup ? ' [POOL-DEDUP]' : ''}`);
        if (pub.stderr) console.log(pub.stderr.slice(-600));
        if (pub.poolDedup) {
          sessionArgs._excludeSubtypes = sessionArgs._excludeSubtypes || [];
          const ex = gen.batch?._debateTopic || detectT4DebateTopic(gen.batch);
          if (ex) sessionArgs._excludeSubtypes.push(ex);
        }
        continue;
      }

      const poolIdMatch = pub.stdout.match(/Pool local: (pub-[^\s]+)/);
      const poolId = poolIdMatch?.[1];
      const serv = poolId ? verifyPoolRecordServable(poolId) : { servable: false };

      if (!serv.servable) {
        console.log(`  ⚠ Publicado pero no servible: ${serv.reason}`);
        continue;
      }

      const debate = debateInfo(serv.record);
      const ling = analyzeLinguistics(serv.record);
      const audit = await auditRecord(serv.record);
      const publishFirstTry = genAttempts === 1;

      results.push({
        index: i + 1,
        poolId: serv.record.id,
        sourceFile: relFile,
        genAttempts,
        publishFirstTry,
        poolDedupBlocked: false,
        servable: true,
        sem1VerifiedAt: serv.record.sem1VerifiedAt,
        topicTag: serv.record.topicTag,
        ...debate,
        title: serv.record.passage?.title || '',
        introPreview: String(serv.record.passage?.text || '').slice(0, 200),
        signPreview: (serv.record.questions || [])[0]?.signText?.slice(0, 120) || '',
        questions: (serv.record.questions || []).map((q) => ({
          name: q.question,
          correct: q.correctAnswer || q.correct,
        })),
        linguistics: ling,
        audit,
      });

      console.log(`  ✅ Pool: ${serv.record.id} · debate: ${debate.debateLabel}`);
      published = true;
    }

    if (!published) {
      results.push({ index: i + 1, ok: false, genAttempts, error: 'max_attempts' });
    }
  }

  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const l4After = countCell(after.records);
  const ok = results.filter((r) => r.servable);
  const debateIds = ok.map((r) => r.debateTopic).filter(Boolean);
  const uniqueDebates = [...new Set(debateIds)];

  const report = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    teil: TEIL,
    target: TARGET,
    success: ok.length,
    freizeitL4Before: l4Before,
    freizeitL4After: l4After,
    publishAttempts,
    uniqueDebates,
    debateVarietyOk: uniqueDebates.length === ok.length,
    firstTryPublish: ok.filter((r) => r.publishFirstTry).length,
    pool2First: ok.filter((r) => r.audit?.pool2Ok).length,
    sem1First: ok.filter((r) => r.audit?.sem1Ok).length,
    parts: results,
  };

  const reportPath = path.join(ROOT, 'scripts/pilot-freizeit-l4-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('INFORME PILOTO T4');
  console.log('═'.repeat(60));
  console.log(`Éxito: ${ok.length}/${TARGET}`);
  console.log(`Freizeit L4 en pool: ${l4Before} → ${l4After}`);
  console.log(`Debates distintos: ${uniqueDebates.length}/${ok.length} → ${uniqueDebates.join(', ')}`);
  console.log(`Publish 1ª gen: ${report.firstTryPublish}/${ok.length} | POOL-2 re-audit OK: ${report.pool2First}/${ok.length} | SEM-1 re-audit OK: ${report.sem1First}/${ok.length}`);
  console.log(`Informe: ${path.relative(ROOT, reportPath)}`);

  for (const p of ok) {
    console.log(`\n--- ${p.poolId} ---`);
    console.log(`Debate: ${p.debateLabel} (${p.debateTopic})`);
    console.log(`Título: ${p.title}`);
    console.log(`Vorschlag: ${(p.vorschlag || '').slice(0, 100)}…`);
    console.log(`Gen intentos: ${p.genAttempts} | Publish 1ª: ${p.publishFirstTry ? 'sí' : 'no'} | Dedup: pasó`);
    console.log(`Tema detectado: ${p.linguistics.detectedTopic || '?'} | Freizeit hits: ${p.linguistics.freizeitHits.slice(0, 4).join(', ') || '—'}`);
    console.log(`POOL-2 re-audit: ${p.audit.pool2Ok ? 'OK' : 'FAIL'} | SEM-1 re-audit: ${p.audit.sem1Ok ? 'OK' : 'FAIL'}`);
  }

  process.exit(ok.length >= TARGET && uniqueDebates.length >= Math.min(TARGET, ok.length) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
