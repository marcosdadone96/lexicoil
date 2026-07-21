#!/usr/bin/env node
/**
 * Post-fix L2 pilot: generate 5× Technik L2 + publish; measure first-try rate.
 *   node scripts/pilot-sem-fix-l2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { verifyPoolRecordServable } from './lib/publishToPool.mjs';

loadEnvFile();

const COUNT = 5;
const TOPIC = 'Technik';

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
  return { ok: res.status === 0, stdout: res.stdout || '', out };
}

async function main() {
  console.log(`\n══ Post-fix L2 pilot × ${COUNT} (${TOPIC}) ══\n`);

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

  for (let i = 0; i < COUNT; i++) {
    console.log(`\n── L2 parte ${i + 1}/${COUNT} ──`);
    let genAttempts = 0;
    let published = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      genAttempts++;
      const gen = await generateLesenPart({
        teil: 2,
        topic: TOPIC,
        writeFile: true,
        session: sessionWrap,
        fixRetries: 2,
      });
      if (!gen.ok || !gen.file) {
        console.log(`  gen ${genAttempts}: FAIL (${gen.reason || '?'})`);
        continue;
      }
      console.log(`  gen OK: ${gen.file}`);
      const pub = runPublish(gen.file);
      if (!pub.ok) {
        console.log(`  publish FAIL`);
        const sem = pub.out.match(/SEM-[A-Z-]+[^\n]*/)?.[0];
        if (sem) console.log(`  ${sem.slice(0, 140)}`);
        continue;
      }
      const poolId = pub.stdout.match(/Pool local: (pub-[^\s]+)/)?.[1];
      const serv = poolId ? verifyPoolRecordServable(poolId) : { servable: false };
      if (!serv.servable) {
        console.log(`  ⚠ not servible: ${serv.reason}`);
        continue;
      }
      const audit = await isPartPoolReady(serv.record, { semantic: true });
      published = {
        poolId: serv.record.id,
        sourceFile: gen.file,
        genAttempts,
        firstTry: genAttempts === 1,
        sem1Ok: audit.ok,
        titles: (serv.record.passages || serv.record.passage?.passages || [])
          .map((p) => p.title || p.textTitle)
          .filter(Boolean),
      };
      console.log(`  ✅ ${serv.record.id} (gen ${genAttempts}, 1ª: ${genAttempts === 1 ? 'sí' : 'no'})`);
      break;
    }
    if (published) results.push(published);
    else {
      console.error(`  ❌ parte ${i + 1} no publicada`);
      process.exit(1);
    }
  }

  const firstTry = results.filter((r) => r.firstTry).length;
  const report = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    teil: 2,
    target: COUNT,
    published: results.length,
    firstTryPublish: firstTry,
    firstTryRate: firstTry / results.length,
    totalGenAttempts: results.reduce((s, r) => s + r.genAttempts, 0),
    parts: results,
  };
  const reportPath = path.join(ROOT, 'scripts/pilot-sem-fix-l2-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n════════════════════════════════════════');
  console.log(`1ª publish: ${firstTry}/${COUNT} (${Math.round(report.firstTryRate * 100)}%)`);
  console.log(`Gen attempts: ${report.totalGenAttempts} (ideal ${COUNT})`);
  console.log(`Informe: ${path.relative(ROOT, reportPath)}`);
  console.log('════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
