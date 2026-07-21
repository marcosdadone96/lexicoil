#!/usr/bin/env node
/**
 * T5 weak-topic remediation — cause-specific (NOT Konsum package).
 * Verkehr → length-bias repair; Reisen/Stadtleben/Ernährung → pool-fill regen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { createRequire } from 'node:module';

loadEnvFile();

const require = createRequire(import.meta.url);
const { batchHasOfficialQuarantine } = require(
  path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'),
);
const causes = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/t5-topic-failure-causes.json'), 'utf8'),
);

const TOPICS = ['Verkehr', 'Reisen', 'Stadtleben', 'Ernährung'];
const OUT = path.join(ROOT, 'batches/ready/gate-logs/t5-weak-topic-remediation.json');

function topicOf(batch) {
  return (
    batch.topicTag ||
    batch._requestedTopic ||
    batch.questions?.[0]?.topicTags?.[0] ||
    batch.passages?.[0]?.topicTag ||
    null
  );
}

function listT5ByTopic() {
  const byTopic = Object.fromEntries(TOPICS.map((t) => [t, []]));
  for (const abs of listPoolVerifiedJson('B1')) {
    if (!/lesen-t5/i.test(path.basename(abs))) continue;
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const t = topicOf(batch);
    if (TOPICS.includes(t)) {
      byTopic[t].push({
        file: path.basename(abs),
        quarantine: batchHasOfficialQuarantine(batch),
        topic: t,
      });
    }
  }
  return byTopic;
}

function run(cmd, args) {
  const r = spawnSync(process.execPath, [cmd, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--use-system-ca' },
    maxBuffer: 20 * 1024 * 1024,
  });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr, status: r.status };
}

const dryRun = process.argv.includes('--dry-run');
const byTopic = listT5ByTopic();
const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  causes: TOPICS.map((t) => ({ topic: t, ...causes.candidates[t] })),
  inventory: byTopic,
  actions: [],
};

console.log('\n══ T5 weak-topic remediation ══\n');

for (const topic of TOPICS) {
  const c = causes.candidates[topic];
  console.log(`${topic}: dominant=${c.dominantCause} ok=${c.ok} fail=${c.fail}`);

  if (topic === 'Verkehr' && c.dominantCause === 'length_bias') {
    const quarantined = byTopic.Verkehr.filter((x) => x.quarantine);
    console.log(`  Verkehr pool T5 files: ${byTopic.Verkehr.length}, quarantined: ${quarantined.length}`);
    if (!quarantined.length) {
      report.actions.push({
        topic,
        treatment: 'length_bias_llm',
        note: 'no quarantined Verkehr T5 in pool-verified — run pool-fill lesen t5 --topic Verkehr',
      });
      if (!dryRun) {
        const pf = run('scripts/pool-fill-teil.mjs', [
          '--module', 'lesen', '--teil', '5', '--target', '1', '--level', 'B1',
          '--publish', '--max-api-calls', '25',
        ]);
        report.actions.push({ topic, treatment: 'pool-fill Verkehr T5', ok: pf.ok, tail: (pf.stdout || pf.stderr || '').slice(-800) });
      }
    } else if (!dryRun) {
      const r = run('scripts/remediate-length-bias-cell.mjs', [
        '--module', 'lesen', '--teil', '5', '--max', String(quarantined.length),
      ]);
      report.actions.push({ topic, treatment: 'length_bias_llm', files: quarantined.map((x) => x.file), ok: r.ok });
    }
  } else {
    // Reisen / Stadtleben / Ernährung — dominant "other" → fresh regen via pool-fill
    const action = {
      topic,
      treatment: 'pool-fill_regen_not_konsum_package',
      dominantCause: c.dominantCause,
    };
    if (!dryRun) {
      const pf = run('scripts/pool-fill-teil.mjs', [
        '--module', 'lesen', '--teil', '5', '--target', '1', '--level', 'B1',
        '--publish', '--max-api-calls', '25',
      ]);
      action.ok = pf.ok;
      action.tail = (pf.stdout || pf.stderr || '').slice(-600);
    }
    report.actions.push(action);
    console.log(`  → pool-fill regen (cause: ${c.dominantCause})`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nReport: ${path.relative(ROOT, OUT)}`);
