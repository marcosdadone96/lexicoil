#!/usr/bin/env node
/**
 * Post-fix pilot: generate N× T3 (make-t3) + publish; measure first-try rate.
 *   node scripts/pilot-sem-fix-t3.mjs --count 5
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { verifyPoolRecordServable } from './lib/publishToPool.mjs';

loadEnvFile();

const COUNT = Number(process.argv.find((_, i, a) => a[i - 1] === '--count') || 5) || 5;
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
  return { ok: res.status === 0, stderr: res.stderr || '', stdout: res.stdout || '', out };
}

async function main() {
  console.log(`\n══ Post-fix T3 pilot × ${COUNT} (topic=${TOPIC}) ══\n`);

  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    maxApiCalls: 20,
    fixRetries: 2,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;
  sessionArgs.topic = TOPIC;
  sessionArgs._resolvedTopic = TOPIC;
  sessionArgs._t3ExcludeSlugs = new Set();
  const sessionWrap = { session, args: sessionArgs };

  const results = [];

  for (let i = 0; i < COUNT; i++) {
    console.log(`\n── T3 parte ${i + 1}/${COUNT} ──`);
    let genAttempts = 0;
    let published = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      genAttempts++;
      const gen = await generateLesenPart({
        teil: 3,
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
        const semLine = pub.out.match(/SEM-[A-Z]+[^\n]*/)?.[0];
        if (semLine) console.log(`  ${semLine.slice(0, 140)}`);
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
      };
      console.log(`  ✅ ${serv.record.id} (gen ${genAttempts}, 1ª: ${genAttempts === 1 ? 'sí' : 'no'})`);
      break;
    }
    if (published) results.push(published);
    else console.log(`  ❌ parte ${i + 1} no publicada tras 8 intentos`);
  }

  const firstTry = results.filter((r) => r.firstTry).length;
  const totalGen = results.reduce((s, r) => s + r.genAttempts, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    target: COUNT,
    published: results.length,
    firstTryPublish: firstTry,
    firstTryRate: results.length ? firstTry / results.length : 0,
    totalGenAttempts: totalGen,
    parts: results,
  };
  const reportPath = path.join(ROOT, 'scripts/pilot-sem-fix-t3-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n════════════════════════════════════════');
  console.log(`Publicadas: ${results.length}/${COUNT}`);
  console.log(`1ª publish: ${firstTry}/${results.length} (${Math.round(report.firstTryRate * 100)}%)`);
  console.log(`Gen attempts total: ${totalGen} (ideal ${results.length})`);
  console.log(`Informe: ${path.relative(ROOT, reportPath)}`);
  console.log('════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
