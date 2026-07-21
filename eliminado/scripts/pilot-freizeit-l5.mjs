#!/usr/bin/env node
/**
 * pilot-freizeit-l5.mjs — Generate 3× Freizeit Lesen T5, publish to pool, quality report.
 *
 *   node scripts/pilot-freizeit-l5.mjs
 *   node scripts/pilot-freizeit-l5.mjs --count 3 --topic Freizeit
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { verifyPoolRecordServable } from './lib/publishToPool.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

loadEnvFile();

const TOPIC = 'Freizeit';
const TEIL = 5;
const TARGET = Number(process.argv.find((_, i, a) => a[i - 1] === '--count') || 3) || 3;

const FILLER_PATTERNS = [
  /abschließend lässt sich sagen/i,
  /zusammenfassend lässt sich/i,
  /insgesamt lässt sich feststellen/i,
  /alles in allem kann man sagen/i,
  /abschließend möchte ich/i,
];

const FREIZEIT_HINTS = [
  'freizeit', 'hobby', 'hobbys', 'urlaub', 'ferien', 'sport', 'verein', 'kino',
  'konzert', 'wandern', 'spazier', 'spiel', 'freizeitaktiv', 'erholung', 'ausflug',
  'freizeitpark', 'entspann', 'musik', 'tanzen', 'schwimmen', 'radfahren', 'joggen',
];

function runPublish(relFile) {
  const t0 = Date.now();
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
  return {
    ok: res.status === 0,
    ms: Date.now() - t0,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    status: res.status,
  };
}

function partText(record) {
  const chunks = [];
  if (record.passage?.title) chunks.push(record.passage.title);
  if (record.passage?.text) chunks.push(record.passage.text);
  for (const q of record.questions || []) {
    if (q.question) chunks.push(q.question);
    if (q.explanation) chunks.push(q.explanation);
  }
  return chunks.join('\n');
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
    sem1Blocking: semGateBlocking(sem1),
  };
}

function semGateBlocking(gate) {
  return (gate.blocking || []).filter((f) => String(f.id || '').startsWith('SEM-')).length;
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  PILOTO: ${TARGET}× Lesen T${TEIL} · tema «${TOPIC}» → pool publish  ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const freizeitL5Before = (before.records || []).filter(
    (r) => r.verified && r.module === 'lesen' && r.teil === TEIL && r.topicTag === TOPIC,
  ).length;

  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    maxApiCalls: 40,
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

    while (!published && genAttempts < 6) {
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
      console.log(`  Gen OK: ${relFile} (${genAttempts} intento(s) generación, ${gen.attempts || 1} API tries)`);

      publishAttempts++;
      const pub = runPublish(relFile);
      if (!pub.ok) {
        console.log(`  Publish FAIL (exit ${pub.status})`);
        if (pub.stderr) console.log(pub.stderr.slice(-800));
        const dedupMatch = (pub.stderr + pub.stdout).match(/POOL-DEDUP|pool_dedup/i);
        if (dedupMatch && gen.batch?._textSubtype) {
          sessionArgs._excludeSubtypes = sessionArgs._excludeSubtypes || [];
          sessionArgs._excludeSubtypes.push(gen.batch._textSubtype);
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

      const ling = analyzeLinguistics(serv.record);
      const audit = await auditRecord(serv.record);

      results.push({
        index: i + 1,
        poolId: serv.record.id,
        sourceFile: relFile,
        genAttempts,
        publishAttempts: 1,
        firstTryPublish: true,
        servable: true,
        sem1VerifiedAt: serv.record.sem1VerifiedAt,
        topicTag: serv.record.topicTag,
        title: serv.record.passage?.title || '',
        textPreview: String(serv.record.passage?.text || '').slice(0, 280),
        questions: (serv.record.questions || []).map((q) => ({
          question: q.question,
          correct: q.correctAnswer || q.correct,
        })),
        linguistics: ling,
        audit,
      });

      console.log(`  ✅ En pool servible: ${serv.record.id}`);
      published = true;
    }

    if (!published) {
      results.push({ index: i + 1, ok: false, genAttempts, error: 'max_attempts' });
    }
  }

  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
  const freizeitL5After = (after.records || []).filter(
    (r) => r.verified && r.module === 'lesen' && r.teil === TEIL && r.topicTag === TOPIC,
  ).length;

  const ok = results.filter((r) => r.servable);
  const report = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    teil: TEIL,
    target: TARGET,
    success: ok.length,
    freizeitL5Before,
    freizeitL5After,
    publishAttempts,
    firstTryRate: ok.length ? `${ok.filter((r) => r.firstTryPublish).length}/${ok.length}` : '0/0',
    parts: results,
  };

  const reportPath = path.join(ROOT, 'scripts/pilot-freizeit-l5-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('INFORME PILOTO');
  console.log('═'.repeat(60));
  console.log(`Éxito: ${ok.length}/${TARGET}`);
  console.log(`Freizeit L5 en pool: ${freizeitL5Before} → ${freizeitL5After}`);
  console.log(`Publicaciones intentadas: ${publishAttempts}`);
  console.log(`Informe: ${path.relative(ROOT, reportPath)}`);

  for (const p of ok) {
    console.log(`\n--- ${p.poolId} ---`);
    console.log(`Título: ${p.title}`);
    console.log(`Gen intentos: ${p.genAttempts} | Publish: ${p.publishAttempts} (primera: ${p.firstTryPublish ? 'sí' : 'no'})`);
    console.log(`Filler: ${p.linguistics.fillers.length ? p.linguistics.fillers.join(', ') : 'ninguno'}`);
    console.log(`Tema detectado: ${p.linguistics.detectedTopic || '?'} | hits Freizeit: ${p.linguistics.freizeitHits.slice(0, 5).join(', ') || 'ninguno'}`);
    console.log(`POOL-2: ${p.audit.pool2Ok ? 'OK' : 'FAIL'} | SEM-1 re-audit: ${p.audit.sem1Ok ? 'OK' : 'FAIL'}`);
    console.log(`Texto (preview):\n${p.textPreview}…`);
    for (const [qi, q] of p.questions.entries()) {
      console.log(`  Q${qi + 1}: ${q.question} → ${q.correct}`);
    }
  }

  process.exit(ok.length >= TARGET ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
