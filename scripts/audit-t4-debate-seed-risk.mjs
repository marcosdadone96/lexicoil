#!/usr/bin/env node
/**
 * audit-t4-debate-seed-risk.mjs — Preflight de semillas T4 por tema (intro topic drift).
 *
 *   node scripts/audit-t4-debate-seed-risk.mjs
 *   node scripts/audit-t4-debate-seed-risk.mjs --json --out batches/ready/gate-logs/t4-debate-seed-risk.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { B1_TOPICS } from './lib/b1Topics.mjs';
import {
  T4_DEBATE_SEEDS,
  checkT4DebateSeedPreflight,
  countSeedTopicKeywordHits,
} from './lib/t4DebateSeeds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { json: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--out') out.out = String(argv[++i] || '').trim();
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = {
    scannedAt: new Date().toISOString(),
    topics: {},
    failing: [],
    warnings: [],
    okCount: 0,
    totalSeeds: 0,
  };

  for (const topic of B1_TOPICS) {
    const seeds = T4_DEBATE_SEEDS[topic] || [];
    const rows = [];
    for (const seed of seeds) {
      report.totalSeeds += 1;
      const pf = checkT4DebateSeedPreflight(seed, topic);
      const tagHits = countSeedTopicKeywordHits(seed, topic);
      const row = {
        seed,
        ok: pf.ok,
        reason: pf.reason || null,
        detected: pf.detected || null,
        tagHits,
        detail: pf.detail || null,
      };
      rows.push(row);
      if (pf.ok) {
        report.okCount += 1;
      } else {
        report.failing.push({ topic, ...row });
      }
      if (tagHits < 2) {
        report.warnings.push({ topic, seed, warning: 'low_topic_keyword_hits', tagHits });
      }
    }
    report.topics[topic] = { count: seeds.length, seeds: rows };
  }

  if (args.json) {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (args.out) {
      fs.mkdirSync(path.dirname(path.resolve(ROOT, args.out)), { recursive: true });
      fs.writeFileSync(path.resolve(ROOT, args.out), text);
      console.log(`Escrito ${args.out}`);
    } else {
      process.stdout.write(text);
    }
    return;
  }

  console.log(`T4 debate seed risk audit · ${report.okCount}/${report.totalSeeds} OK`);
  if (report.failing.length) {
    console.log('\nFALLAN preflight:');
    for (const f of report.failing) {
      console.log(`  [${f.topic}] ${f.reason} → ${f.detected || '?'}: ${f.seed.slice(0, 70)}…`);
    }
  } else {
    console.log('\nSin semillas que fallen preflight.');
  }
  if (report.warnings.length) {
    console.log(`\nAvisos (${report.warnings.length}): pocas keywords de tema en semilla`);
  }

  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, args.out), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nJSON: ${args.out}`);
  }

  if (report.failing.length) process.exitCode = 1;
}

main();
