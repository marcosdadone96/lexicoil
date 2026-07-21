#!/usr/bin/env node
/**
 * SP-2.5 — Migrar type canónico + topicTags B1 + difficulty=5 en pool Sprechen.
 *
 *   node scripts/migrate-sprechen-taxonomy.mjs --dry-run
 *   node scripts/migrate-sprechen-taxonomy.mjs
 *
 * Escribe CSV de backfill topicTags en batches/ready/SPRECHEN-TOPICTAGS-BACKFILL-*.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { mapSprechenTopicTag, isValidB1Topic } from './lib/sprechenTaxonomy.mjs';

const require = createRequire(import.meta.url);
const { detectTopic } = require('../js/engine/partTopicDetect.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const DIRS = ['batches/generated', 'batches/merged', 'batches/rejected'];

const csvRows = [
  [
    'file',
    'questionId',
    'teil',
    'oldTopicTags',
    'newTopicTags',
    'oldType',
    'newType',
    'oldDifficulty',
    'newDifficulty',
    'topicSource',
  ],
];

function listFiles(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => /^sprechen/i.test(f) && f.endsWith('.json'))
    .map((f) => path.join(dirRel, f));
}

function resolveTopicHint(raw) {
  const qTagRaw = raw.questions?.[0]?.topicTags?.[0];
  const enRaw = String(qTagRaw || '').toLowerCase();
  const EN = { culture:1, food:1, travel:1, sport:1, shopping:1, work:1, free_time:1, society:1 };

  // 1) Explicit English merged tags
  if (enRaw && EN[enRaw]) {
    return { topic: mapSprechenTopicTag(qTagRaw), source: 'en_map' };
  }

  // 2) Already a valid B1 topic (incl. Freizeit) — keep; never overwrite with detect
  const fromQ = mapSprechenTopicTag(qTagRaw);
  if (fromQ && enRaw !== 'daily_life') {
    return { topic: fromQ, source: 'keep_b1' };
  }
  const fromRoot = mapSprechenTopicTag(raw.topicTag || raw._requestedTopic);
  if (fromRoot && String(raw.topicTag || '').toLowerCase() !== 'daily_life') {
    return { topic: fromRoot, source: 'root' };
  }

  // 3) daily_life / missing → detect from T2/T1
  const t2 = raw.questions?.find((q) => Number(q.teil) === 2)?.question || '';
  const detected = detectTopic(t2);
  if (detected && isValidB1Topic(detected)) return { topic: detected, source: 'detect_t2' };

  const t1 = raw.questions?.find((q) => Number(q.teil) === 1)?.question || '';
  const d1 = detectTopic(t1);
  if (d1 && isValidB1Topic(d1)) return { topic: d1, source: 'detect_t1' };

  return { topic: 'Freizeit', source: 'fallback_freizeit' };
}

let filesTouched = 0;

for (const dir of DIRS) {
  for (const rel of listFiles(dir)) {
    const abs = path.join(ROOT, rel);
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const before = structuredClone(raw);
    const { topic: rootHint, source } = resolveTopicHint(raw);

    const normalized = normalizeBatch(raw, {
      module: 'sprechen',
      lang: 'de',
      level: 'B1',
      topicTag: rootHint,
      rootTopicTag: rootHint,
    });
    normalized.topicTag = rootHint;
    normalized._requestedTopic = normalized._requestedTopic || rootHint;
    for (const q of normalized.questions || []) {
      q.topicTags = [rootHint];
    }

    for (let i = 0; i < (normalized.questions || []).length; i++) {
      const bq = before.questions?.[i] || {};
      const nq = normalized.questions[i];
      csvRows.push([
        rel.replace(/\\/g, '/'),
        nq.id || '',
        String(nq.teil ?? ''),
        JSON.stringify(bq.topicTags || []),
        JSON.stringify(nq.topicTags || []),
        bq.type || '',
        nq.type || '',
        String(bq.difficulty ?? ''),
        String(nq.difficulty ?? ''),
        source,
      ]);
    }

    const changed = force || JSON.stringify(before) !== JSON.stringify(normalized);
    if (changed) {
      filesTouched++;
      console.log(`${dryRun ? '[dry-run] ' : ''}${rel} → ${rootHint} (${source})`);
      if (!dryRun) {
        fs.writeFileSync(abs, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      }
    }
  }
}

const stamp = new Date().toISOString().slice(0, 10);
const csvPath = path.join(
  ROOT,
  'batches/ready',
  `SPRECHEN-TOPICTAGS-BACKFILL-${stamp}${dryRun ? '-dryrun' : ''}.csv`,
);
const esc = (c) => `"${String(c).replace(/"/g, '""')}"`;
fs.writeFileSync(csvPath, `${csvRows.map((r) => r.map(esc).join(',')).join('\n')}\n`, 'utf8');
console.log(`CSV: ${path.relative(ROOT, csvPath)}`);
console.log(`filesTouched: ${filesTouched} dryRun=${dryRun}`);
