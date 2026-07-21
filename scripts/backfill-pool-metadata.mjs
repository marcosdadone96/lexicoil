#!/usr/bin/env node
/**
 * Backfill topic + grammar/vocab metadata on pool backlog (needs-regeneration + content-ok).
 *
 *   node scripts/backfill-pool-metadata.mjs --dry-run
 *   node scripts/backfill-pool-metadata.mjs --apply
 *   node scripts/backfill-pool-metadata.mjs --apply --topic-only
 *   node scripts/backfill-pool-metadata.mjs --apply --tags-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  enrichBatchMetadata,
  needsTopicBackfill,
} from './lib/enrichBatchMetadata.mjs';

const NEEDS = path.join(ROOT, 'batches/needs-regeneration');
const CONTENT_OK = path.join(ROOT, 'batches/ready/pool-content-ok');

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    dryRun: !argv.includes('--apply'),
    topicOnly: argv.includes('--topic-only'),
    tagsOnly: argv.includes('--tags-only'),
    limit: argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : null,
  };
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
}

function stripPoolMeta(batch) {
  const {
    _poolRejectReason,
    _poolRejectAt,
    _poolRejectDetails,
    _poolContentOkAt,
    _poolContentOkNote,
    ...rest
  } = batch;
  return rest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = [
    ...listJson(NEEDS).map((f) => ({ dir: NEEDS, file: f })),
    // content-ok are copies — update needs-regen as source of truth; sync content-ok after
  ];

  // Prefer unique by basename from needs-regen (has all 467)
  const seen = new Set();
  const unique = [];
  for (const e of files) {
    if (seen.has(e.file)) continue;
    seen.add(e.file);
    unique.push(e);
  }

  let list = unique;
  if (args.limit) list = list.slice(0, args.limit);

  const summary = {
    scanned: 0,
    topicBackfilled: 0,
    vocabBackfilled: 0,
    grammarBackfilled: 0,
    skipped: 0,
    written: 0,
  };

  for (const { dir, file } of list) {
    summary.scanned++;
    const abs = path.join(dir, file);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      summary.skipped++;
      continue;
    }

    const clean = stripPoolMeta(batch);
    const needTopic = !args.tagsOnly && needsTopicBackfill(clean);
    const needTags = !args.topicOnly;

    if (!needTopic && !needTags) {
      summary.skipped++;
      continue;
    }

    // If tags-only, still enrich tags; if topic-only, only topic
    const { batch: enriched, stats } = enrichBatchMetadata(clean, {
      topic: needTopic,
      vocab: needTags,
      grammar: needTags,
    });

    if (stats.topic) summary.topicBackfilled++;
    summary.vocabBackfilled += stats.vocab > 0 ? 1 : 0;
    summary.grammarBackfilled += stats.grammar > 0 ? 1 : 0;

    if (!args.dryRun) {
      fs.writeFileSync(abs, `${JSON.stringify(enriched, null, 2)}\n`);
      // Mirror into content-ok if present
      const okPath = path.join(CONTENT_OK, file);
      if (fs.existsSync(okPath)) {
        fs.writeFileSync(okPath, `${JSON.stringify(enriched, null, 2)}\n`);
      }
      summary.written++;
    }
  }

  console.log(JSON.stringify({ dryRun: args.dryRun, ...summary }, null, 2));
  if (args.dryRun) console.log('(dry-run — usa --apply para escribir)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
